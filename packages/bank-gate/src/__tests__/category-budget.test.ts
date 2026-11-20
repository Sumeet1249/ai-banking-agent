import Database from 'better-sqlite3';
import { CategoryBudgetStore } from '../db/category-budget-store';
import { CategoryBudgetService } from '../services/category-budget-service';
import { FakeLedgerClient } from '../adapters/ledger-client';

describe('BP-2: Authoritative Category Budget Service & Database Persistence', () => {
  let db: Database.Database;
  let store: CategoryBudgetStore;
  let ledgerClient: FakeLedgerClient;
  let service: CategoryBudgetService;

  const TENANT_A = 'tenant_fintech_alpha';
  const TENANT_B = 'tenant_fintech_beta';
  const CUSTOMER_1 = 'cust_1001';
  const CUSTOMER_2 = 'cust_1002';
  const POOL_SHOPPING = 'pool_shopping_01';

  beforeEach(() => {
    db = new Database(':memory:');
    store = new CategoryBudgetStore(db);
    ledgerClient = new FakeLedgerClient();
    service = new CategoryBudgetService(store, ledgerClient);
  });

  afterEach(() => {
    db.close();
  });

  // 1. Pool Persistence & Retrieval
  test('1. creates and retrieves category budget pools with tenant isolation', () => {
    const pool = service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 5000000, // ₹50,000
      weekly_limit_paise: 2000000,  // ₹20,000
      daily_limit_paise: 500000,    // ₹5,000
      per_transaction_limit_paise: 100000, // ₹1,000
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
      timezone: 'Asia/Kolkata',
    });

    expect(pool.pool_id).toBe(POOL_SHOPPING);
    expect(pool.policy_version).toBe(1);
    expect(pool.status).toBe('ACTIVE');

    // Retrieval by authorized owner
    const retrieved = service.getPool(TENANT_A, CUSTOMER_1, POOL_SHOPPING);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.monthly_limit_paise).toBe(5000000);

    // Cross-tenant access attempt must return null
    const crossTenant = service.getPool(TENANT_B, CUSTOMER_1, POOL_SHOPPING);
    expect(crossTenant).toBeNull();

    // Cross-customer access attempt must return null
    const crossCustomer = service.getPool(TENANT_A, CUSTOMER_2, POOL_SHOPPING);
    expect(crossCustomer).toBeNull();
  });

  // 2. Pool Limits Update & Policy Versioning
  test('2. updates pool limits and atomically bumps policy_version', () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 5000000,
      daily_limit_paise: 500000,
      per_transaction_limit_paise: 100000,
      autonomy_mode: 'ASK_BEFORE_EVERY_PAYMENT',
    });

    const updated = service.updatePool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      monthly_limit_paise: 7500000, // Increased to ₹75,000
      daily_limit_paise: 1000000,
      per_transaction_limit_paise: 250000,
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    expect(updated.policy_version).toBe(2);
    expect(updated.monthly_limit_paise).toBe(7500000);
    expect(updated.autonomy_mode).toBe('AUTO_APPROVE_WITHIN_LIMITS');
  });

  // 3. Multi-Period Reservation Accounting (Correction 2)
  test('3. reserves against daily, weekly, and monthly periods simultaneously', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 1000000, // ₹10,000 monthly
      weekly_limit_paise: 500000,   // ₹5,000 weekly
      daily_limit_paise: 200000,    // ₹2,000 daily
      per_transaction_limit_paise: 100000, // ₹1,000 per_tx
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    const result = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_procurement_99',
      workflow_id: 'wf_office_01',
      request_id: 'req_tx_001',
      idempotency_key: 'idem_key_001',
      transaction_digest: 'a'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 80000, // ₹800
    });

    expect(result.decision).toBe('ALLOW');
    expect(result.reservation_id).toBeDefined();
    expect(result.allocations?.length).toBe(3); // Daily, Weekly, Monthly

    // Verify all 3 allocations are in RESERVED state with ₹800
    for (const alloc of result.allocations || []) {
      expect(alloc.amount_paise).toBe(80000);
      expect(alloc.status).toBe('RESERVED');
    }

    // Verify period reserved amounts in database
    const periods = db.prepare('SELECT * FROM budget_periods WHERE pool_id = ?').all(POOL_SHOPPING) as any[];
    expect(periods.length).toBe(3);
    for (const p of periods) {
      expect(p.reserved_amount_paise).toBe(80000);
      expect(p.settled_amount_paise).toBe(0);
    }
  });

  // 4. Concurrency Protection & Strict Cap Enforcement (Correction 1)
  test('4. prevents concurrent overspending using SQLite .immediate() write locks', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 100000, // Total ₹1,000
      daily_limit_paise: 100000,
      per_transaction_limit_paise: 60000, // ₹600 per_tx
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    // Agent 1 attempts ₹600 (within ₹1,000 cap)
    const p1 = service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_01',
      workflow_id: 'wf_01',
      request_id: 'req_01',
      idempotency_key: 'idem_01',
      transaction_digest: '1'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 60000,
    });

    // Agent 2 simultaneously attempts ₹600 (total would be ₹1,200 > ₹1,000 cap)
    const p2 = service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_02',
      workflow_id: 'wf_02',
      request_id: 'req_02',
      idempotency_key: 'idem_02',
      transaction_digest: '2'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 60000,
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    // Exactly one must succeed, and the other must be DENIED due to period capacity
    const decisions = [res1.decision, res2.decision];
    expect(decisions).toContain('ALLOW');
    expect(decisions).toContain('DENY');

    const denied = res1.decision === 'DENY' ? res1 : res2;
    expect(denied.reason).toMatch(/EXCEEDS_.*_LIMIT/);

    // Verify database total never exceeded ₹1,000
    const period = db.prepare("SELECT * FROM budget_periods WHERE pool_id = ? AND period_type = 'MONTHLY'").get(POOL_SHOPPING) as any;
    expect(period.reserved_amount_paise).toBe(60000);
    expect(period.reserved_amount_paise).toBeLessThanOrEqual(period.limit_paise);
  });

  // 5. Idempotent Duplicate Requests
  test('5. duplicate idempotency keys return existing reservation without double-spending', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 500000,
      daily_limit_paise: 500000,
      per_transaction_limit_paise: 200000,
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    const req = {
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_procurement_99',
      workflow_id: 'wf_01',
      request_id: 'req_first',
      idempotency_key: 'idempotent_key_777',
      transaction_digest: 'a'.repeat(64),
      category_id: 'SHOPPING' as const,
      amount_paise: 100000, // ₹1,000
    };

    const first = await service.evaluateAndReserve(req);
    expect(first.decision).toBe('ALLOW');

    // Duplicate call with same idempotency key
    const second = await service.evaluateAndReserve(req);
    expect(second.decision).toBe('ALLOW');
    expect(second.reservation_id).toBe(first.reservation_id);

    // Verify budget reserved is strictly ₹1,000 (not double counted to ₹2,000)
    const period = db.prepare("SELECT * FROM budget_periods WHERE pool_id = ? AND period_type = 'MONTHLY'").get(POOL_SHOPPING) as any;
    expect(period.reserved_amount_paise).toBe(100000);
  });

  // 6. Settlement & Release Lifecycle
  test('6. moves reserved amounts to settled on settlement, and restores capacity on release', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 1000000,
      daily_limit_paise: 500000,
      per_transaction_limit_paise: 500000,
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    const res = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_procurement_99',
      workflow_id: 'wf_01',
      request_id: 'req_01',
      idempotency_key: 'idem_settle_01',
      transaction_digest: 'b'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 300000, // ₹3,000
    });

    const reservationId = res.reservation_id!;

    // Settle payment
    const settled = await service.settlePayment(reservationId, res.transfer_id);
    expect(settled).toBe(true);

    const periodAfterSettle = db.prepare("SELECT * FROM budget_periods WHERE pool_id = ? AND period_type = 'MONTHLY'").get(POOL_SHOPPING) as any;
    expect(periodAfterSettle.reserved_amount_paise).toBe(0);
    expect(periodAfterSettle.settled_amount_paise).toBe(300000);

    // Second reservation and release
    const res2 = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_procurement_99',
      workflow_id: 'wf_02',
      request_id: 'req_02',
      idempotency_key: 'idem_release_02',
      transaction_digest: 'c'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 200000, // ₹2,000
    });

    const released = service.releaseReservation(res2.reservation_id!, 'ORDER_CANCELLED');
    expect(released).toBe(true);

    const periodAfterRelease = db.prepare("SELECT * FROM budget_periods WHERE pool_id = ? AND period_type = 'MONTHLY'").get(POOL_SHOPPING) as any;
    expect(periodAfterRelease.reserved_amount_paise).toBe(0);
    expect(periodAfterRelease.settled_amount_paise).toBe(300000); // Only first settlement remains
  });

  // 7. Reversal Restores Period Capacity
  test('7. reverses settled payment and returns capacity to pool', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 1000000,
      per_transaction_limit_paise: 500000,
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    const res = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_01',
      workflow_id: 'wf_01',
      request_id: 'req_rev',
      idempotency_key: 'idem_rev',
      transaction_digest: 'd'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 400000, // ₹4,000
    });

    await service.settlePayment(res.reservation_id!, res.transfer_id);

    // Reverse transaction
    const reversed = service.reversePayment(res.reservation_id!, 'REV_REF_999', 'CHARGEBACK_REFUND');
    expect(reversed).toBe(true);

    const reservation = service.getReservation(res.reservation_id!);
    expect(reservation?.status).toBe('REVERSED');
    expect(reservation?.reversal_ref).toBe('REV_REF_999');

    const period = db.prepare("SELECT * FROM budget_periods WHERE pool_id = ? AND period_type = 'MONTHLY'").get(POOL_SHOPPING) as any;
    expect(period.settled_amount_paise).toBe(0); // Restored!
  });

  // 8. Hash-Chained Audit Trail Integrity (Correction 4)
  test('8. verifies tamper-evident hash chaining across sequence of operations', () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Retail Shopping',
      monthly_limit_paise: 5000000,
      per_transaction_limit_paise: 100000,
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });

    service.updatePool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      monthly_limit_paise: 6000000,
      per_transaction_limit_paise: 150000,
    });

    service.setPoolStatus(TENANT_A, CUSTOMER_1, POOL_SHOPPING, 'FROZEN');

    const events = db.prepare('SELECT * FROM budget_audit_events ORDER BY sequence_number ASC').all() as any[];
    expect(events.length).toBe(3);

    // Verify Genesis event
    expect(events[0].sequence_number).toBe(1);
    expect(events[0].prev_event_hash).toBe('0'.repeat(64));

    // Verify hash chaining: event[i].prev_event_hash === event[i-1].event_hash
    for (let i = 1; i < events.length; i++) {
      expect(events[i].sequence_number).toBe(events[i - 1].sequence_number + 1);
      expect(events[i].prev_event_hash).toBe(events[i - 1].event_hash);
    }
  });

  // 9. MANUAL_ONLY Mode Restrictions
  test('9. strictly rejects autonomous payments when mode is MANUAL_ONLY', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: 'pool_manual_01',
      category_id: 'INVESTMENT_STOCK',
      category_name: 'Investments',
      monthly_limit_paise: 5000000,
      per_transaction_limit_paise: 100000,
      autonomy_mode: 'MANUAL_ONLY',
    });

    const result = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: 'pool_manual_01',
      agent_id: 'agent_01',
      workflow_id: 'wf_01',
      request_id: 'req_manual',
      idempotency_key: 'idem_manual',
      transaction_digest: 'e'.repeat(64),
      category_id: 'INVESTMENT_STOCK',
      amount_paise: 50000,
    });

    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('MANUAL_ONLY_RESTRICTION');
  });

  // 10. ASK_BEFORE_EVERY_PAYMENT Mode
  test('10. produces ASK verdict requiring biometric passkey on ASK_BEFORE_EVERY_PAYMENT', async () => {
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: 'pool_ask_01',
      category_id: 'TRANSPORT',
      category_name: 'Transport',
      monthly_limit_paise: 2000000,
      per_transaction_limit_paise: 50000,
      autonomy_mode: 'ASK_BEFORE_EVERY_PAYMENT',
    });

    const result = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: 'pool_ask_01',
      agent_id: 'agent_01',
      workflow_id: 'wf_01',
      request_id: 'req_ask',
      idempotency_key: 'idem_ask',
      transaction_digest: 'f'.repeat(64),
      category_id: 'TRANSPORT',
      amount_paise: 30000,
    });

    expect(result.decision).toBe('ASK');
    expect(result.requires_human_approval).toBe(true);
    expect(result.reservation_id).toBeDefined();
  });
});
