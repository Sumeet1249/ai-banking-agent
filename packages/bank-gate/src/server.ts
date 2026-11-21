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
import { CategoryBudgetStore } from './db/category-budget-store';
import { CategoryBudgetService } from './services/category-budget-service';
import { MerchantIntelligenceService } from './services/merchant-intelligence-service';
import { MerkleAuditService } from './services/merkle-audit-service';
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
  public categoryStore: CategoryBudgetStore;
  public categoryBudget: CategoryBudgetService;
  public merchantService: MerchantIntelligenceService;
  public merkleAudit: MerkleAuditService;
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
    this.categoryStore = new CategoryBudgetStore(this.db, this.logger);
    this.merchantService = new MerchantIntelligenceService(this.db, this.logger);
    this.merkleAudit = new MerkleAuditService(this.db, process.env.WITNESS_URL || 'http://localhost:5000', this.logger);
    this.categoryBudget = new CategoryBudgetService(
      this.categoryStore,
      this.ledgerClient,
      this.merchantService,
      this.clock,
      this.logger,
    );
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

    // ── Category Budget Engine Endpoints (Phase BP-2) ─────────────────────────

    // 1. Create Category Pool
    this.app.post('/api/v1/category-pools', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        if (!tenantId || !customerRef) {
          res.status(400).json({ error: 'Missing tenant_id or customer_ref header/body' });
          return;
        }
        const pool = this.categoryBudget.createPool({
          ...req.body,
          tenant_id: tenantId,
          customer_ref: customerRef,
        });
        res.status(201).json(pool);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // 2. List Category Pools
    this.app.get('/api/v1/category-pools', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const pools = this.categoryBudget.listPools(tenantId, customerRef);
      res.status(200).json({ pools });
    });

    // 3. Get Category Pool
    this.app.get('/api/v1/category-pools/:poolId', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const pool = this.categoryBudget.getPool(tenantId, customerRef, req.params.poolId);
      if (!pool) {
        res.status(404).json({ error: 'Pool not found or tenant access denied' });
        return;
      }
      res.status(200).json(pool);
    });

    // 4. Update Category Pool Limits
    this.app.put('/api/v1/category-pools/:poolId', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        if (!tenantId || !customerRef) {
          res.status(400).json({ error: 'Missing tenant_id or customer_ref' });
          return;
        }
        const updated = this.categoryBudget.updatePool({
          ...req.body,
          tenant_id: tenantId,
          customer_ref: customerRef,
          pool_id: req.params.poolId,
        });
        res.status(200).json(updated);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // 5. Suspend or Reactivate Category Pool
    this.app.post('/api/v1/category-pools/:poolId/status', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        const status = req.body.status;
        if (!tenantId || !customerRef || !status) {
          res.status(400).json({ error: 'Missing tenant_id, customer_ref, or status' });
          return;
        }
        const updated = this.categoryBudget.setPoolStatus(tenantId, customerRef, req.params.poolId, status);
        res.status(200).json(updated);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // 6. Authoritative Multi-Period Category Reservation
    this.app.post('/api/v1/category-reservations', async (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        if (!tenantId || !customerRef) {
          res.status(400).json({ decision: 'DENY', reason: 'MISSING_TENANT_OR_CUSTOMER' });
          return;
        }
        const result = await this.categoryBudget.evaluateAndReserve({
          ...req.body,
          tenant_id: tenantId,
          customer_ref: customerRef,
        });
        const statusCode = result.decision === 'ALLOW' ? 200 : result.decision === 'ASK' ? 200 : result.decision === 'DEFER' ? 503 : 403;
        res.status(statusCode).json(result);
      } catch (err: any) {
        res.status(500).json({ decision: 'DEFER', reason: err.message, saga_state: 'REQUEST_RECEIVED' });
      }
    });

    // 7. Settle Category Reservation
    this.app.post('/api/v1/category-reservations/:reservationId/settle', async (req: Request, res: Response) => {
      try {
        const success = await this.categoryBudget.settlePayment(req.params.reservationId, req.body.transfer_id);
        res.status(200).json({ reservation_id: req.params.reservationId, settled: success, status: 'SETTLED' });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // 8. Release Category Reservation
    this.app.post('/api/v1/category-reservations/:reservationId/release', (req: Request, res: Response) => {
      try {
        const success = this.categoryBudget.releaseReservation(req.params.reservationId, req.body.reason || 'MANUAL_RELEASE');
        res.status(200).json({ reservation_id: req.params.reservationId, released: success, status: 'RELEASED' });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // 9. Reverse Settlement
    this.app.post('/api/v1/category-reservations/:reservationId/reverse', (req: Request, res: Response) => {
      try {
        const success = this.categoryBudget.reversePayment(req.params.reservationId, req.body.reversal_ref, req.body.reason || 'REVERSAL');
        res.status(200).json({ reservation_id: req.params.reservationId, reversed: success, status: 'REVERSED' });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // 10. Audit Events
    this.app.get('/api/v1/category-pools/:poolId/audit', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const events = this.categoryBudget.listAuditEvents(tenantId, customerRef);
      res.status(200).json({ events });
    });

    // 11. Biometric Passkey Approval (Verification Gate 6)
    this.app.post('/api/v1/category-reservations/:reservationId/approve', (req: Request, res: Response) => {
      const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
      const { transaction_digest, biometric_signature } = req.body;
      if (!customerRef || !transaction_digest || !biometric_signature) {
        res.status(400).json({ error: 'Missing customer_ref, transaction_digest, or biometric_signature' });
        return;
      }

      const valid = this.categoryBudget.verifyBiometricApproval({
        reservationId: req.params.reservationId,
        customerRef,
        transactionDigest: transaction_digest,
        biometricApprovalToken: biometric_signature,
      });

      if (!valid) {
        res.status(403).json({ error: 'Biometric passkey signature verification failed or digest mismatch' });
        return;
      }

      res.status(200).json({ approved: true, reservation_id: req.params.reservationId });
    });

    // ── DASHBOARD AGGREGATE SUMMARY (REAL API - ZERO MOCK) ─────────────────
    this.app.get('/api/v1/dashboard/summary', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const summary = this.categoryBudget.getDashboardSummary(tenantId, customerRef);
      res.status(200).json(summary);
    });

    // ── MULTI-AGENT ALLOCATION ROUTES (BP-3.1) ──────────────────────────────
    this.app.get('/api/v1/agents/allocations', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const allocations = this.categoryBudget.listAgentAllocations(tenantId, customerRef);
      res.status(200).json({ allocations });
    });

    this.app.post('/api/v1/category-pools/:poolId/agents', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        if (!tenantId || !customerRef) {
          res.status(400).json({ error: 'Missing tenant_id or customer_ref' });
          return;
        }

        const alloc = this.categoryBudget.setAgentAllocation({
          ...req.body,
          pool_id: req.params.poolId,
          tenant_id: tenantId,
          customer_ref: customerRef,
        });
        res.status(201).json(alloc);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    this.app.put('/api/v1/category-pools/:poolId/agents/:agentId', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        if (!tenantId || !customerRef) {
          res.status(400).json({ error: 'Missing tenant_id or customer_ref' });
          return;
        }

        const updated = this.categoryBudget.updateAgentAllocation({
          ...req.body,
          pool_id: req.params.poolId,
          agent_id: req.params.agentId,
          tenant_id: tenantId,
          customer_ref: customerRef,
        });
        res.status(200).json(updated);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    this.app.get('/api/v1/category-pools/:poolId/agents', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const allocations = this.categoryBudget.listAgentAllocations(tenantId, customerRef, req.params.poolId);
      res.status(200).json({ allocations });
    });

    this.app.post('/api/v1/category-pools/:poolId/agents/:agentId/status', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        const status = req.body.status;
        if (!tenantId || !customerRef || !status) {
          res.status(400).json({ error: 'Missing tenant_id, customer_ref, or status' });
          return;
        }

        const alloc = this.categoryBudget.setAgentAllocationStatus(tenantId, customerRef, req.params.agentId, req.params.poolId, status);
        res.status(200).json(alloc);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // ── MERCHANT INTELLIGENCE ROUTES (BP-3.2) ───────────────────────────────
    this.app.get('/api/v1/merchants', (req: Request, res: Response) => {
      const query = req.query.q as string | undefined;
      const category = req.query.category as string | undefined;
      const status = req.query.status as string | undefined;
      const merchants = this.merchantService.searchMerchants({ query, category, status });
      res.status(200).json({ merchants });
    });

    this.app.get('/api/v1/merchants/conflicts', (_req: Request, res: Response) => {
      const conflicts = this.merchantService.listConflicts();
      res.status(200).json({ conflicts });
    });

    this.app.get('/api/v1/merchants/review-queue', (_req: Request, res: Response) => {
      const queue = this.merchantService.listReviewQueue();
      res.status(200).json({ queue });
    });

    this.app.post('/api/v1/merchants/evaluate', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref || 'cust-101';
      const result = this.merchantService.evaluateMerchant(req.body, tenantId, customerRef);
      res.status(200).json(result);
    });

    this.app.post('/api/v1/merchants/override', (req: Request, res: Response) => {
      try {
        const tenantId = (req.headers['x-tenant-id'] as string) || req.body.tenant_id;
        const customerRef = (req.headers['x-customer-ref'] as string) || req.body.customer_ref;
        if (!tenantId || !customerRef) {
          res.status(400).json({ error: 'Missing tenant_id or customer_ref' });
          return;
        }
        this.merchantService.setCustomerOverride({
          ...req.body,
          tenant_id: tenantId,
          customer_ref: customerRef,
        });
        res.status(200).json({ success: true, message: 'Customer merchant override stored' });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    // ── APPROVALS & EXCEPTIONS ROUTES (PART 4 SPEC) ─────────────────────────
    this.app.get('/api/v1/approvals/pending', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const approvals = this.categoryBudget.listPendingApprovals(tenantId, customerRef);
      res.status(200).json({ approvals });
    });

    this.app.get('/api/v1/exceptions', (req: Request, res: Response) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenant_id as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customer_ref as string) || 'cust-101';
      const exceptions = this.categoryBudget.listExceptions(tenantId, customerRef);
      res.status(200).json({ exceptions });
    });

    // ── MERKLE AUDIT VERIFICATION ROUTES (BP-3.5) ───────────────────────────
    this.app.post('/api/v1/audit/merkle/batches', (req: Request, res: Response) => {
      try {
        const { batch_id, start_sequence, end_sequence } = req.body;
        if (!batch_id || start_sequence === undefined || end_sequence === undefined) {
          res.status(400).json({ error: 'Missing batch_id, start_sequence, or end_sequence' });
          return;
        }
        const batch = this.merkleAudit.createBatch({
          batchId: batch_id,
          startSequence: Number(start_sequence),
          endSequence: Number(end_sequence),
        });
        res.status(201).json(batch);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    this.app.get('/api/v1/audit/merkle/batches', (_req: Request, res: Response) => {
      const batches = this.merkleAudit.listBatches();
      res.status(200).json({ batches });
    });

    this.app.get('/api/v1/audit/merkle/proofs/:eventId', (req: Request, res: Response) => {
      try {
        const batchId = req.query.batch_id as string;
        if (!batchId) {
          res.status(400).json({ error: 'Missing batch_id query parameter' });
          return;
        }
        const proof = this.merkleAudit.getEventProof(batchId, req.params.eventId);
        res.status(200).json(proof);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    this.app.post('/api/v1/audit/merkle/verify', (req: Request, res: Response) => {
      const result = this.merkleAudit.verifyEventInclusion(req.body);
      const statusCode = result.valid ? 200 : 400;
      res.status(statusCode).json(result);
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
