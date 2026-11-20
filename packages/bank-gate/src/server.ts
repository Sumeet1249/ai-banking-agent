/**
 * Bank Gate Express Server (Port 4000)
 *
 * Implements:
 *   - GET /health (Process Liveness)
 *   - GET /ready (Readiness Check)
 *   - POST /api/v1/permits/verify
 *   - POST /api/v1/transactions/authorize
 *   - POST /api/v1/transactions/execute & POST /execute (Legacy Alias)
 *   - GET /api/v1/transactions/:request_id
 *   - POST /api/v1/mandates/:mandate_id/revoke
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import Database from 'better-sqlite3';
import pino, { Logger } from 'pino';
import { z } from 'zod';
import {
  CanonicalTransactionSchema,
  PermitEnvelopeSchema,
  Clock,
  SystemClock,
} from '@agentguard/core-schema';
import { BankGateStore } from './db/bank-gate-store';
import { PermitVerifierService } from './services/permit-verifier';
import { TrustedKeyring } from './services/trusted-keyring';
import { TransactionExecutorService } from './services/transaction-executor';
import { FinancialReconciliationService } from './services/reconciliation';
import { ILedgerClient, FakeLedgerClient } from './adapters/ledger-client';
import { HttpLedgerClient } from './adapters/http-ledger-client';
import { bankGateConfig, BankGateConfig } from './config';

const ExecuteBodySchema = z.object({
  permit_envelope: PermitEnvelopeSchema,
  transaction: CanonicalTransactionSchema,
});

export class BankGateApp {
  public app: express.Express;
  public server?: Server;
  public store: BankGateStore;
  public permitVerifier: PermitVerifierService;
  public executor: TransactionExecutorService;
  public reconciliation: FinancialReconciliationService;

  constructor(
    private db: Database.Database,
    private ledgerClient: ILedgerClient,
    private config: BankGateConfig = bankGateConfig,
    private clock: Clock = new SystemClock(),
    private logger: Logger = pino({ level: 'info' }),
  ) {
    this.app = express();
    this.store = new BankGateStore(this.db, this.logger);
    const keyringOrPem = this.config.gatewayPublicKeyPem
      ? this.config.gatewayPublicKeyPem
      : new TrustedKeyring(this.logger, this.clock);
    this.permitVerifier = new PermitVerifierService(
      keyringOrPem,
      this.config.gatewayKeyId,
      this.clock,
      this.logger,
    );
    this.executor = new TransactionExecutorService(
      this.store,
      this.permitVerifier,
      this.ledgerClient,
      this.clock,
      this.logger,
    );
    this.reconciliation = new FinancialReconciliationService(
      this.store,
      this.ledgerClient,
      this.clock,
      this.logger,
    );

    this.configureMiddleware();
    this.registerRoutes();
  }

  private configureMiddleware(): void {
    this.app.use(express.json());

    // Correlation ID & Context Middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const corrId = (req.headers['x-correlation-id'] as string) || req.headers['x-request-id'] || 'corr_' + Date.now();
      res.setHeader('X-Correlation-ID', corrId);
      next();
    });
  }

  private registerRoutes(): void {
    // ── Health & Readiness ───────────────────────────────────────────────────

    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'UP', service: 'bank-gate', port: this.config.port });
    });

    this.app.get('/ready', async (_req: Request, res: Response) => {
      try {
        // 1. Verify SQLite is writable
        this.db.prepare('SELECT 1').get();
        // 2. Verify Ledger connectivity
        const bal = await this.ledgerClient.getAccountBalance('ACC_101');
        if (bal === null) {
          res.status(503).json({ ready: false, reason: 'LEDGER_UNAVAILABLE' });
          return;
        }
        res.status(200).json({ ready: true, status: 'READY' });
      } catch (err: any) {
        res.status(503).json({ ready: false, error: err.message });
      }
    });

    // ── Permit Verification Endpoint ─────────────────────────────────────────

    this.app.post('/api/v1/permits/verify', (req: Request, res: Response) => {
      const parsed = ExecuteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          valid: false,
          reason: 'MALFORMED_REQUEST',
          details: parsed.error.issues,
        });
        return;
      }

      const { permit_envelope, transaction } = parsed.data;
      const result = this.permitVerifier.verifyPermit(permit_envelope, transaction);
      if (!result.valid) {
        res.status(403).json(result);
        return;
      }

      res.status(200).json(result);
    });

    // ── Transaction Execution Handlers ───────────────────────────────────────

    const handleExecute = async (req: Request, res: Response): Promise<void> => {
      const parsed = ExecuteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          decision: 'DENY',
          reason: 'MALFORMED_REQUEST',
          details: parsed.error.issues,
        });
        return;
      }

      const { permit_envelope, transaction } = parsed.data;
      const result = await this.executor.executeTransaction({
        envelope: permit_envelope,
        transaction,
      });

      if (result.decision === 'ALLOW') {
        res.status(200).json(result);
      } else if (result.decision === 'DEFER') {
        res.status(503).json(result);
      } else {
        res.status(403).json(result);
      }
    };

    this.app.post('/api/v1/transactions/execute', handleExecute);
    this.app.post('/execute', handleExecute); // Legacy alias (CONTRACTS.md)

    // ── Inspection & Mandate Eviction ────────────────────────────────────────

    this.app.get('/api/v1/transactions/:requestId', (req: Request, res: Response) => {
      const requestId = req.params.requestId;
      const tx = this.executor.getTransaction(requestId);
      if (!tx) {
        res.status(404).json({ error: 'Transaction not found', request_id: requestId });
        return;
      }
      res.status(200).json({ transaction: tx });
    });

    // ── Reconciliation Endpoints ─────────────────────────────────────────────

    const handleReconcile = async (req: Request, res: Response): Promise<void> => {
      const requestId = req.params.requestId;
      try {
        const result = await this.reconciliation.reconcileTransaction(requestId);
        res.status(200).json(result);
      } catch (err: any) {
        res.status(404).json({ error: err.message, request_id: requestId });
      }
    };

    this.app.post('/api/v1/transactions/:requestId/reconcile', handleReconcile);
    this.app.post('/reconcile', handleReconcile); // Legacy alias (CONTRACTS.md)

    this.app.post('/api/v1/mandates/:mandateId/revoke', (req: Request, res: Response) => {
      const mandateId = req.params.mandateId;
      const success = this.store.evictMandate(mandateId);
      res.status(200).json({ mandate_id: mandateId, evicted: success, status: 'REVOKED' });
    });
  }

  public listen(port: number = this.config.port): Promise<number> {
    return new Promise((resolve) => {
      this.server = createServer(this.app);
      this.server.listen(port, () => {
        const addr = this.server!.address() as any;
        this.logger.info({ port: addr.port }, 'Bank Gate server listening');
        resolve(addr.port);
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

if (require.main === module) {
  const db = new Database(bankGateConfig.dbPath);
  const ledgerClient = process.env.LEDGER_CLIENT === 'http'
    ? new HttpLedgerClient(bankGateConfig.ledgerAdapterUrl)
    : new FakeLedgerClient();
  const app = new BankGateApp(db, ledgerClient, bankGateConfig);
  app.listen(bankGateConfig.port).catch((err) => {
    console.error('Failed to start Bank Gate', err);
    process.exit(1);
  });
}
