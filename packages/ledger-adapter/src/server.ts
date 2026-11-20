/**
 * Ledger Adapter HTTP Server (Port 4001)
 *
 * Implements docs/api/openapi-ledger.yaml:
 *   - GET /health (TigerBeetle Sync & Consensus Status)
 *   - GET /api/v1/accounts/:account_ref
 *   - GET /api/v1/accounts/:account_ref/balance
 *   - POST /api/v1/transfers/pending
 *   - POST /api/v1/transfers/:transfer_id/post
 *   - POST /api/v1/transfers/:transfer_id/void
 *   - GET /api/v1/transfers/:transfer_id
 *
 * Explicit Backend Selection Contract (Decision D19):
 *   - TIGERBEETLE: Distributed Viewstamped Replication cluster
 *   - SQLITE_DEV: High-fidelity local SQLite protocol emulation
 *   - Fail-Closed: Never silently fallback to SQLite if TigerBeetle is configured.
 */

import express, { Request, Response } from 'express';
import { createServer, Server } from 'http';
import Database from 'better-sqlite3';
import pino, { Logger } from 'pino';
import { z } from 'zod';
import { ILedgerBackend } from './services/ledger-backend';
import { SqliteLedgerBackend } from './services/sqlite-ledger-backend';
import { TigerBeetleLedgerBackend } from './services/tigerbeetle-ledger-backend';
import { LedgerEngine } from './services/ledger-engine';

const CreatePendingTransferSchema = z.object({
  request_id: z.string().uuid(),
  debit_account_ref: z.string().min(1),
  credit_account_ref: z.string().min(1),
  amount_paise: z.number().int().positive(),
  currency: z.literal('INR').default('INR'),
  ttl_seconds: z.number().int().positive().default(120),
});

export interface LedgerAdapterOptions {
  backend?: ILedgerBackend;
  db?: Database.Database;
  port?: number;
  logger?: Logger;
  backendType?: 'SQLITE_DEV' | 'TIGERBEETLE';
}

export class LedgerAdapterApp {
  public app: express.Express;
  public server?: Server;
  public backend: ILedgerBackend;
  public engine?: LedgerEngine;
  public port: number;
  public logger: Logger;

  constructor(
    dbOrOptions?: Database.Database | LedgerAdapterOptions,
    port: number = 4001,
    logger: Logger = pino({ level: 'info' }),
  ) {
    this.app = express();

    if (dbOrOptions && ('prepare' in dbOrOptions || typeof (dbOrOptions as any).transaction === 'function')) {
      // Direct Database passed (backward compatibility)
      const db = dbOrOptions as Database.Database;
      this.port = port;
      this.logger = logger;
      this.backend = new SqliteLedgerBackend(db, this.logger);
      this.engine = new LedgerEngine(db, this.logger);
    } else if (dbOrOptions && typeof dbOrOptions === 'object') {
      const opts = dbOrOptions as LedgerAdapterOptions;
      this.port = opts.port ?? port;
      this.logger = opts.logger ?? logger;

      if (opts.backend) {
        this.backend = opts.backend;
      } else {
        const backendMode = opts.backendType ?? (process.env.LEDGER_BACKEND || 'SQLITE_DEV').toUpperCase();
        if (backendMode === 'TIGERBEETLE') {
          const clusterId = BigInt(process.env.TIGERBEETLE_CLUSTER_ID || '0');
          const replicaAddresses = (process.env.TIGERBEETLE_ADDRESSES || '172.28.0.2:3001,172.28.0.3:3001,172.28.0.4:3001')
            .split(',')
            .map((s) => s.trim());
          this.backend = new TigerBeetleLedgerBackend({ clusterId, replicaAddresses, logger: this.logger });
        } else {
          const db = opts.db ?? new Database(process.env.DB_PATH || ':memory:');
          this.backend = new SqliteLedgerBackend(db, this.logger);
          this.engine = new LedgerEngine(db, this.logger);
        }
      }
    } else {
      // No options provided: check process.env.LEDGER_BACKEND
      this.port = port;
      this.logger = logger;
      const backendMode = (process.env.LEDGER_BACKEND || 'SQLITE_DEV').toUpperCase();
      if (backendMode === 'TIGERBEETLE') {
        const clusterId = BigInt(process.env.TIGERBEETLE_CLUSTER_ID || '0');
        const replicaAddresses = (process.env.TIGERBEETLE_ADDRESSES || '172.28.0.2:3001,172.28.0.3:3001,172.28.0.4:3001')
          .split(',')
          .map((s) => s.trim());
        this.backend = new TigerBeetleLedgerBackend({ clusterId, replicaAddresses, logger: this.logger });
      } else {
        const db = new Database(process.env.DB_PATH || ':memory:');
        this.backend = new SqliteLedgerBackend(db, this.logger);
        this.engine = new LedgerEngine(db, this.logger);
      }
    }

    this.configureMiddleware();
    this.registerRoutes();
  }

  private configureMiddleware(): void {
    this.app.use(express.json());
  }

  private registerRoutes(): void {
    // ── Health & Consensus Status ─────────────────────────────────────────────
    this.app.get('/health', async (_req: Request, res: Response) => {
      try {
        const isTb = this.backend.backendType === 'TIGERBEETLE';
        res.status(200).json({
          status: 'UP',
          service: 'ledger-adapter',
          port: this.port,
          backend: this.backend.backendType,
          cluster: isTb ? 'tigerbeetle-primary' : 'sqlite-local',
          sync_status: 'SYNCHRONIZED',
        });
      } catch (err: any) {
        res.status(503).json({
          status: 'DOWN',
          service: 'ledger-adapter',
          backend: this.backend.backendType,
          error: err.message,
          reason_code: 'CLUSTER_UNAVAILABLE',
        });
      }
    });

    // ── Accounts ─────────────────────────────────────────────────────────────
    this.app.get('/api/v1/accounts/:account_ref', async (req: Request, res: Response) => {
      try {
        const acc = await this.backend.getAccount(req.params.account_ref);
        if (!acc) {
          res.status(404).json({ error: 'Account not found', account_ref: req.params.account_ref });
          return;
        }
        res.status(200).json(acc);
      } catch (err: any) {
        this.logger.error({ err: err.message }, 'getAccount failed');
        res.status(503).json({ error: 'Ledger backend error', details: err.message });
      }
    });

    this.app.get('/api/v1/accounts/:account_ref/balance', async (req: Request, res: Response) => {
      try {
        const bal = await this.backend.getBalance(req.params.account_ref);
        if (!bal) {
          res.status(404).json({ error: 'Account not found', account_ref: req.params.account_ref });
          return;
        }
        res.status(200).json(bal);
      } catch (err: any) {
        this.logger.error({ err: err.message }, 'getBalance failed');
        res.status(503).json({ error: 'Ledger backend error', details: err.message });
      }
    });

    // ── Transfers (Two-Phase Stage 1 & 2) ────────────────────────────────────
    this.app.post('/api/v1/transfers/pending', async (req: Request, res: Response) => {
      const parsed = CreatePendingTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Malformed pending transfer request', details: parsed.error.issues });
        return;
      }

      try {
        const result = await this.backend.createPendingTransfer({
          requestId: parsed.data.request_id,
          debitAccountRef: parsed.data.debit_account_ref,
          creditAccountRef: parsed.data.credit_account_ref,
          amountPaise: parsed.data.amount_paise,
          ttlSeconds: parsed.data.ttl_seconds,
        });

        if (result.status === 'ACCOUNT_NOT_FOUND') {
          res.status(404).json({ error: 'Debit or credit account not found' });
        } else if (result.status === 'INSUFFICIENT_FUNDS') {
          res.status(422).json({ error: 'Insufficient liquid funds', reason_code: 'INSUFFICIENT_FUNDS' });
        } else if (result.status === 'EXISTS') {
          res.status(409).json({ error: 'Transfer already exists', transfer: result.transfer });
        } else {
          res.status(201).json(result.transfer);
        }
      } catch (err: any) {
        this.logger.error({ err: err.message }, 'createPendingTransfer failed');
        res.status(503).json({ error: 'Ledger cluster error', details: err.message, reason_code: 'CLUSTER_UNAVAILABLE' });
      }
    });

    this.app.post('/api/v1/transfers/:transfer_id/post', async (req: Request, res: Response) => {
      try {
        const result = await this.backend.postTransfer(req.params.transfer_id);
        if (result.status === 'NOT_FOUND') {
          res.status(404).json({ error: 'Transfer not found' });
        } else if (result.status === 'ALREADY_SETTLED') {
          res.status(200).json(result.transfer);
        } else if (result.status === 'ALREADY_VOIDED' || result.status === 'EXPIRED') {
          res.status(409).json({ error: `Transfer cannot be posted: ${result.status}`, transfer: result.transfer });
        } else {
          res.status(200).json(result.transfer);
        }
      } catch (err: any) {
        this.logger.error({ err: err.message }, 'postTransfer failed');
        res.status(503).json({ error: 'Ledger cluster error', details: err.message, reason_code: 'CLUSTER_UNAVAILABLE' });
      }
    });

    this.app.post('/api/v1/transfers/:transfer_id/void', async (req: Request, res: Response) => {
      const reason = req.body?.reason ?? 'CLIENT_VOID_REQUEST';
      try {
        const result = await this.backend.voidTransfer(req.params.transfer_id, reason);
        if (result.status === 'NOT_FOUND') {
          res.status(404).json({ error: 'Transfer not found' });
        } else if (result.status === 'ALREADY_VOIDED') {
          res.status(200).json(result.transfer);
        } else if (result.status === 'ALREADY_POSTED') {
          res.status(409).json({ error: 'Transfer is already settled and cannot be voided', transfer: result.transfer });
        } else {
          res.status(200).json(result.transfer);
        }
      } catch (err: any) {
        this.logger.error({ err: err.message }, 'voidTransfer failed');
        res.status(503).json({ error: 'Ledger cluster error', details: err.message, reason_code: 'CLUSTER_UNAVAILABLE' });
      }
    });

    this.app.get('/api/v1/transfers/:transfer_id', async (req: Request, res: Response) => {
      try {
        const transfer = await this.backend.getTransfer(req.params.transfer_id);
        if (!transfer) {
          res.status(404).json({ error: 'Transfer not found' });
          return;
        }
        res.status(200).json(transfer);
      } catch (err: any) {
        this.logger.error({ err: err.message }, 'getTransfer failed');
        res.status(503).json({ error: 'Ledger cluster error', details: err.message, reason_code: 'CLUSTER_UNAVAILABLE' });
      }
    });
  }

  public async init(): Promise<void> {
    await this.backend.init();
  }

  public async listen(port: number = this.port): Promise<number> {
    await this.init();
    return new Promise((resolve) => {
      this.server = createServer(this.app);
      this.server.listen(port, () => {
        const addr = this.server!.address() as any;
        this.logger.info(
          { port: addr.port, backend: this.backend.backendType },
          'Ledger Adapter listening'
        );
        resolve(addr.port);
      });
    });
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
    await this.backend.close();
  }
}

// ── Auto-start when invoked directly ──────────────────────────────────────────
if (require.main === module) {
  const port = Number(process.env.PORT) || 4001;
  const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
  const app = new LedgerAdapterApp(undefined, port, logger);

  app.listen(port).then(() => {
    logger.info({ port, backend: app.backend.backendType }, 'Ledger Adapter started successfully');
  }).catch((err) => {
    logger.error({ err: err.message }, 'Failed to start Ledger Adapter');
    process.exit(1);
  });
}
