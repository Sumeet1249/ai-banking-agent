/**
 * Category Budget Durable Database Store (Phase BP-2)
 *
 * Implements:
 *   - Category Budget Pools (tenant/customer isolated, versioned)
 *   - Budget Period Model (Asia/Kolkata boundary retention)
 *   - Atomic Concurrency Protection: explicit SQLite `.immediate()` write locks
 *   - Multi-Period Reservation Accounting (Daily, Weekly, Monthly simultaneously)
 *   - Idempotency deduplication on (tenant_id, customer_ref, idempotency_key)
 *   - Tamper-Evident Hash-Chained Audit Trail (ordered sequence, prev_hash -> event_hash)
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import type { Logger } from 'pino';
import {
  CanonicalCategoryBudgetPool,
  CanonicalAutonomyMode,
  SpendingCategory,
  ReservationStatus,
  BudgetPeriod,
  EvidenceTier,
} from '@agentguard/core-schema';

export interface CategoryPoolRow {
  pool_id: string;
  tenant_id: string;
  customer_ref: string;
  category_id: SpendingCategory;
  category_name: string;
  currency: string;
  monthly_limit_paise: number;
  weekly_limit_paise: number | null;
  daily_limit_paise: number | null;
  per_transaction_limit_paise: number;
  autonomy_mode: CanonicalAutonomyMode;
  status: string;
  policy_version: number;
  valid_from: number;
  valid_until: number;
  timezone: string;
  created_at: number;
  updated_at: number;
}

export interface BudgetPeriodRow {
  period_id: string;
  pool_id: string;
  tenant_id: string;
  customer_ref: string;
  period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  period_start: number;
  period_end: number;
  timezone: string;
  limit_paise: number;
  settled_amount_paise: number;
  reserved_amount_paise: number;
  version: number;
}

export interface CategoryReservationRow {
  reservation_id: string;
  pool_id: string;
  tenant_id: string;
  customer_ref: string;
  agent_id: string;
  workflow_id: string;
  request_id: string;
  idempotency_key: string;
  transaction_digest: string;
  category_id: SpendingCategory;
  amount_paise: number;
  currency: string;
  pool_policy_version: number;
  status: ReservationStatus;
  saga_state: string;
  created_at: number;
  expires_at: number;
  settled_at: number | null;
  released_at: number | null;
  reversal_ref: string | null;
}

export interface ReservationPeriodAllocationRow {
  allocation_id: string;
  reservation_id: string;
  period_id: string;
  amount_paise: number;
  status: ReservationStatus;
  created_at: number;
  updated_at: number;
}

export interface BudgetAuditEventRow {
  event_id: string;
  sequence_number: number;
  prev_event_hash: string;
  event_hash: string;
  tenant_id: string;
  customer_ref: string;
  actor: string;
  operation: string;
  entity_id: string;
  policy_version: number;
  timestamp: number;
  event_payload: string;
}

export class CategoryBudgetStore {
  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.init();
  }

  public init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS category_budget_pools (
        pool_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        category_id TEXT NOT NULL,
        category_name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        monthly_limit_paise INTEGER NOT NULL,
        weekly_limit_paise INTEGER,
        daily_limit_paise INTEGER,
        per_transaction_limit_paise INTEGER NOT NULL,
        autonomy_mode TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        policy_version INTEGER NOT NULL DEFAULT 1,
        valid_from INTEGER NOT NULL,
        valid_until INTEGER NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(tenant_id, customer_ref, category_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cbp_tenant_cust ON category_budget_pools(tenant_id, customer_ref);
      CREATE INDEX IF NOT EXISTS idx_cbp_status ON category_budget_pools(status);

      CREATE TABLE IF NOT EXISTS budget_periods (
        period_id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        period_type TEXT NOT NULL,
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        limit_paise INTEGER NOT NULL,
        settled_amount_paise INTEGER NOT NULL DEFAULT 0,
        reserved_amount_paise INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (pool_id) REFERENCES category_budget_pools(pool_id),
        UNIQUE(pool_id, period_type, period_start)
      );

      CREATE INDEX IF NOT EXISTS idx_bp_pool_lookup ON budget_periods(pool_id, period_type, period_start);
      CREATE INDEX IF NOT EXISTS idx_bp_tenant_cust ON budget_periods(tenant_id, customer_ref);

      CREATE TABLE IF NOT EXISTS category_budget_reservations (
        reservation_id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        transaction_digest TEXT NOT NULL,
        category_id TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        pool_policy_version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'RESERVED',
        saga_state TEXT NOT NULL DEFAULT 'CATEGORY_RESERVED',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        settled_at INTEGER,
        released_at INTEGER,
        reversal_ref TEXT,
        FOREIGN KEY (pool_id) REFERENCES category_budget_pools(pool_id),
        UNIQUE(tenant_id, customer_ref, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_cbr_lookup ON category_budget_reservations(tenant_id, customer_ref, pool_id, status);
      CREATE INDEX IF NOT EXISTS idx_cbr_request ON category_budget_reservations(request_id);

      CREATE TABLE IF NOT EXISTS reservation_period_allocations (
        allocation_id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        period_id TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'RESERVED',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (reservation_id) REFERENCES category_budget_reservations(reservation_id),
        FOREIGN KEY (period_id) REFERENCES budget_periods(period_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rpa_res ON reservation_period_allocations(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_rpa_period ON reservation_period_allocations(period_id);

      CREATE TABLE IF NOT EXISTS agent_budget_allocations (
        allocation_id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        agent_limit_paise INTEGER NOT NULL,
        daily_limit_paise INTEGER NOT NULL,
        per_transaction_limit_paise INTEGER NOT NULL,
        allowed_categories TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        valid_from INTEGER NOT NULL,
        valid_until INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (pool_id) REFERENCES category_budget_pools(pool_id),
        UNIQUE(tenant_id, customer_ref, agent_id, pool_id)
      );

      CREATE TABLE IF NOT EXISTS merchant_classifications (
        merchant_id TEXT PRIMARY KEY,
        merchant_name TEXT NOT NULL,
        mcc_code TEXT NOT NULL,
        category_id TEXT NOT NULL,
        verification_source TEXT NOT NULL,
        verification_reference TEXT,
        classification_method TEXT NOT NULL,
        evidence_tier TEXT NOT NULL,
        confidence_basis TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'VERIFIED',
        provenance_metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS budget_audit_events (
        event_id TEXT PRIMARY KEY,
        sequence_number INTEGER NOT NULL UNIQUE,
        prev_event_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        actor TEXT NOT NULL,
        operation TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        policy_version INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        event_payload TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bae_tenant_cust ON budget_audit_events(tenant_id, customer_ref);
      CREATE INDEX IF NOT EXISTS idx_bae_seq ON budget_audit_events(sequence_number);
    `);
  }

  // ── AUDIT HASH CHAINING ──────────────────────────────────────────────────

  public appendAuditEventInternal(
    tenantId: string,
    customerRef: string,
    actor: string,
    operation: string,
    entityId: string,
    policyVersion: number,
    payload: Record<string, any>,
    now: number,
  ): BudgetAuditEventRow {
    const lastEvent = this.db
      .prepare('SELECT sequence_number, event_hash FROM budget_audit_events ORDER BY sequence_number DESC LIMIT 1')
      .get() as { sequence_number: number; event_hash: string } | undefined;

    const sequenceNumber = (lastEvent?.sequence_number ?? 0) + 1;
    const prevHash = lastEvent?.event_hash ?? '0'.repeat(64);
    const eventId = `audit_${sequenceNumber}_${now}`;
    const payloadStr = JSON.stringify(payload);

    const hashInput = `${sequenceNumber}|${prevHash}|${tenantId}|${customerRef}|${actor}|${operation}|${entityId}|${policyVersion}|${now}|${payloadStr}`;
    const eventHash = createHash('sha256').update(hashInput).digest('hex');

    this.db
      .prepare(`
        INSERT INTO budget_audit_events (
          event_id, sequence_number, prev_event_hash, event_hash,
          tenant_id, customer_ref, actor, operation, entity_id, policy_version, timestamp, event_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        eventId,
        sequenceNumber,
        prevHash,
        eventHash,
        tenantId,
        customerRef,
        actor,
        operation,
        entityId,
        policyVersion,
        now,
        payloadStr,
      );

    return {
      event_id: eventId,
      sequence_number: sequenceNumber,
      prev_event_hash: prevHash,
      event_hash: eventHash,
      tenant_id: tenantId,
      customer_ref: customerRef,
      actor,
      operation,
      entity_id: entityId,
      policy_version: policyVersion,
      timestamp: now,
      event_payload: payloadStr,
    };
  }

  // ── POOL OPERATIONS ──────────────────────────────────────────────────────

  public createPool(pool: {
    pool_id: string;
    tenant_id: string;
    customer_ref: string;
    category_id: SpendingCategory;
    category_name: string;
    currency: 'INR';
    monthly_limit_paise: number;
    weekly_limit_paise?: number;
    daily_limit_paise?: number;
    per_transaction_limit_paise: number;
    autonomy_mode: CanonicalAutonomyMode;
    valid_from: number;
    valid_until: number;
    timezone?: string;
    actor?: string;
  }): CategoryPoolRow {
    const now = Date.now();
    const tz = pool.timezone || 'Asia/Kolkata';

    const insertTx = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO category_budget_pools (
            pool_id, tenant_id, customer_ref, category_id, category_name, currency,
            monthly_limit_paise, weekly_limit_paise, daily_limit_paise, per_transaction_limit_paise,
            autonomy_mode, status, policy_version, valid_from, valid_until, timezone, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, ?, ?, ?)
        `)
        .run(
          pool.pool_id,
          pool.tenant_id,
          pool.customer_ref,
          pool.category_id,
          pool.category_name,
          pool.currency,
          pool.monthly_limit_paise,
          pool.weekly_limit_paise ?? null,
          pool.daily_limit_paise ?? null,
          pool.per_transaction_limit_paise,
          pool.autonomy_mode,
          pool.valid_from,
          pool.valid_until,
          tz,
          now,
          now,
        );

      this.appendAuditEventInternal(
        pool.tenant_id,
        pool.customer_ref,
        pool.actor || 'CUSTOMER',
        'POOL_CREATED',
        pool.pool_id,
        1,
        {
          category_id: pool.category_id,
          monthly_limit_paise: pool.monthly_limit_paise,
          autonomy_mode: pool.autonomy_mode,
        },
        now,
      );
    });

    insertTx.immediate();
    return this.getPool(pool.tenant_id, pool.customer_ref, pool.pool_id)!;
  }

  public getPool(tenantId: string, customerRef: string, poolId: string): CategoryPoolRow | null {
    const row = this.db
      .prepare('SELECT * FROM category_budget_pools WHERE tenant_id = ? AND customer_ref = ? AND pool_id = ?')
      .get(tenantId, customerRef, poolId) as CategoryPoolRow | undefined;
    return row ?? null;
  }

  public listPools(tenantId: string, customerRef: string): CategoryPoolRow[] {
    return this.db
      .prepare('SELECT * FROM category_budget_pools WHERE tenant_id = ? AND customer_ref = ? ORDER BY category_name ASC')
      .all(tenantId, customerRef) as CategoryPoolRow[];
  }

  public updatePoolLimits(params: {
    tenant_id: string;
    customer_ref: string;
    pool_id: string;
    monthly_limit_paise: number;
    weekly_limit_paise?: number;
    daily_limit_paise?: number;
    per_transaction_limit_paise: number;
    autonomy_mode?: CanonicalAutonomyMode;
    actor?: string;
  }): CategoryPoolRow {
    const now = Date.now();

    const updateTx = this.db.transaction(() => {
      const existing = this.getPool(params.tenant_id, params.customer_ref, params.pool_id);
      if (!existing) {
        throw new Error(`Pool not found or tenant access denied: ${params.pool_id}`);
      }

      const newVersion = existing.policy_version + 1;
      const newAutonomy = params.autonomy_mode || existing.autonomy_mode;

      this.db
        .prepare(`
          UPDATE category_budget_pools SET
            monthly_limit_paise = ?,
            weekly_limit_paise = ?,
            daily_limit_paise = ?,
            per_transaction_limit_paise = ?,
            autonomy_mode = ?,
            policy_version = ?,
            updated_at = ?
          WHERE tenant_id = ? AND customer_ref = ? AND pool_id = ?
        `)
        .run(
          params.monthly_limit_paise,
          params.weekly_limit_paise ?? null,
          params.daily_limit_paise ?? null,
          params.per_transaction_limit_paise,
          newAutonomy,
          newVersion,
          now,
          params.tenant_id,
          params.customer_ref,
          params.pool_id,
        );

      this.appendAuditEventInternal(
        params.tenant_id,
        params.customer_ref,
        params.actor || 'CUSTOMER',
        'LIMITS_AMENDED',
        params.pool_id,
        newVersion,
        {
          monthly_limit_paise: params.monthly_limit_paise,
          per_transaction_limit_paise: params.per_transaction_limit_paise,
          autonomy_mode: newAutonomy,
        },
        now,
      );
    });

    updateTx.immediate();
    return this.getPool(params.tenant_id, params.customer_ref, params.pool_id)!;
  }

  public setPoolStatus(
    tenantId: string,
    customerRef: string,
    poolId: string,
    status: 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'REVOKED',
    actor: string = 'CUSTOMER',
  ): CategoryPoolRow {
    const now = Date.now();
    const statusTx = this.db.transaction(() => {
      const existing = this.getPool(tenantId, customerRef, poolId);
      if (!existing) {
        throw new Error(`Pool not found: ${poolId}`);
      }
      this.db
        .prepare(`
          UPDATE category_budget_pools SET status = ?, updated_at = ?
          WHERE tenant_id = ? AND customer_ref = ? AND pool_id = ?
        `)
        .run(status, now, tenantId, customerRef, poolId);

      this.appendAuditEventInternal(
        tenantId,
        customerRef,
        actor,
        'POOL_STATUS_CHANGED',
        poolId,
        existing.policy_version,
        { status },
        now,
      );
    });

    statusTx.immediate();
    return this.getPool(tenantId, customerRef, poolId)!;
  }

  // ── PERIOD MANAGEMENT ────────────────────────────────────────────────────

  public getOrCreatePeriod(
    tenantId: string,
    customerRef: string,
    poolId: string,
    periodType: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    periodStart: number,
    periodEnd: number,
    limitPaise: number,
    timezone: string = 'Asia/Kolkata',
  ): BudgetPeriodRow {
    const periodId = `period_${poolId}_${periodType}_${periodStart}`;

    const tx = this.db.transaction(() => {
      let existing = this.db
        .prepare('SELECT * FROM budget_periods WHERE period_id = ?')
        .get(periodId) as BudgetPeriodRow | undefined;

      if (!existing) {
        this.db
          .prepare(`
            INSERT INTO budget_periods (
              period_id, pool_id, tenant_id, customer_ref, period_type,
              period_start, period_end, timezone, limit_paise,
              settled_amount_paise, reserved_amount_paise, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)
          `)
          .run(
            periodId,
            poolId,
            tenantId,
            customerRef,
            periodType,
            periodStart,
            periodEnd,
            timezone,
            limitPaise,
          );

        existing = this.db.prepare('SELECT * FROM budget_periods WHERE period_id = ?').get(periodId) as BudgetPeriodRow;
      }

      return existing;
    });

    return tx.immediate();
  }

  // ── MULTI-PERIOD ATOMIC RESERVATION (CORRECTION 1 & 2) ───────────────────

  /**
   * Authoritative atomic reservation with SQLite .immediate() write lock.
   * Multi-period allocation accounting: reserves against all applicable
   * configured periods (Daily, Weekly, Monthly) in a single atomic transaction.
   */
  public reserveBudgetAtomic(params: {
    tenant_id: string;
    customer_ref: string;
    pool_id: string;
    agent_id: string;
    workflow_id: string;
    request_id: string;
    idempotency_key: string;
    transaction_digest: string;
    category_id: SpendingCategory;
    amount_paise: number;
    ttl_seconds: number;
    periods: Array<{
      period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
      period_start: number;
      period_end: number;
      limit_paise: number;
      timezone?: string;
    }>;
    now: number;
  }): {
    success: boolean;
    reservation?: CategoryReservationRow;
    allocations?: ReservationPeriodAllocationRow[];
    is_idempotent_replay?: boolean;
    reason?: string;
    violations?: string[];
  } {
    const { tenant_id, customer_ref, pool_id, idempotency_key, amount_paise, now, ttl_seconds } = params;

    const reserveTx = this.db.transaction(() => {
      // 1. Idempotency Check
      const existingRes = this.db
        .prepare(`
          SELECT * FROM category_budget_reservations
          WHERE tenant_id = ? AND customer_ref = ? AND idempotency_key = ?
        `)
        .get(tenant_id, customer_ref, idempotency_key) as CategoryReservationRow | undefined;

      if (existingRes) {
        const allocations = this.db
          .prepare('SELECT * FROM reservation_period_allocations WHERE reservation_id = ?')
          .all(existingRes.reservation_id) as ReservationPeriodAllocationRow[];

        return {
          success: true,
          reservation: existingRes,
          allocations,
          is_idempotent_replay: true,
        };
      }

      // 2. Validate Pool Standing & Ownership
      const pool = this.getPool(tenant_id, customer_ref, pool_id);
      if (!pool) {
        return { success: false, reason: 'POOL_NOT_FOUND_OR_TENANT_MISMATCH' };
      }
      if (pool.status !== 'ACTIVE') {
        return { success: false, reason: `POOL_STATUS_${pool.status}` };
      }
      if (now < pool.valid_from || now > pool.valid_until) {
        return { success: false, reason: 'POOL_TEMPORALLY_INVALID' };
      }

      // 3. Single-Transaction Ceiling Check
      if (amount_paise > pool.per_transaction_limit_paise) {
        return {
          success: false,
          reason: 'EXCEEDS_PER_TRANSACTION_LIMIT',
          violations: [`Transaction amount ₹${amount_paise / 100} exceeds per-transaction cap ₹${pool.per_transaction_limit_paise / 100}`],
        };
      }

      // 4. Multi-Period Capacity Verification
      const periodRows: BudgetPeriodRow[] = [];
      for (const p of params.periods) {
        const period = this.getOrCreatePeriod(
          tenant_id,
          customer_ref,
          pool_id,
          p.period_type,
          p.period_start,
          p.period_end,
          p.limit_paise,
          p.timezone || pool.timezone,
        );

        const projected = period.settled_amount_paise + period.reserved_amount_paise + amount_paise;
        if (projected > period.limit_paise) {
          return {
            success: false,
            reason: `EXCEEDS_${p.period_type}_LIMIT`,
            violations: [
              `Projected ${p.period_type} total ₹${projected / 100} exceeds period limit ₹${period.limit_paise / 100} (Available: ₹${(period.limit_paise - (period.settled_amount_paise + period.reserved_amount_paise)) / 100})`,
            ],
          };
        }
        periodRows.push(period);
      }

      // 5. Insert Reservation Record
      const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const expiresAt = now + ttl_seconds * 1000;

      this.db
        .prepare(`
          INSERT INTO category_budget_reservations (
            reservation_id, pool_id, tenant_id, customer_ref, agent_id, workflow_id,
            request_id, idempotency_key, transaction_digest, category_id, amount_paise,
            currency, pool_policy_version, status, saga_state, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, 'RESERVED', 'CATEGORY_RESERVED', ?, ?)
        `)
        .run(
          reservationId,
          pool_id,
          tenant_id,
          customer_ref,
          params.agent_id,
          params.workflow_id,
          params.request_id,
          idempotency_key,
          params.transaction_digest,
          params.category_id,
          amount_paise,
          pool.policy_version,
          now,
          expiresAt,
        );

      // 6. Multi-Period Allocation Accounting (Correction 2)
      const allocations: ReservationPeriodAllocationRow[] = [];
      for (const period of periodRows) {
        const allocId = `rpa_${reservationId}_${period.period_type}`;

        this.db
          .prepare(`
            INSERT INTO reservation_period_allocations (
              allocation_id, reservation_id, period_id, amount_paise, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'RESERVED', ?, ?)
          `)
          .run(allocId, reservationId, period.period_id, amount_paise, now, now);

        // Atomically increment period reserved capacity
        this.db
          .prepare(`
            UPDATE budget_periods SET
              reserved_amount_paise = reserved_amount_paise + ?,
              version = version + 1
            WHERE period_id = ?
          `)
          .run(amount_paise, period.period_id);

        allocations.push({
          allocation_id: allocId,
          reservation_id: reservationId,
          period_id: period.period_id,
          amount_paise,
          status: 'RESERVED',
          created_at: now,
          updated_at: now,
        });
      }

      // 7. Audit Event
      this.appendAuditEventInternal(
        tenant_id,
        customer_ref,
        params.agent_id,
        'RESERVATION_CREATED',
        reservationId,
        pool.policy_version,
        {
          amount_paise,
          pool_id,
          period_types: params.periods.map((p) => p.period_type),
          expires_at: expiresAt,
        },
        now,
      );

      const reservation = this.db
        .prepare('SELECT * FROM category_budget_reservations WHERE reservation_id = ?')
        .get(reservationId) as CategoryReservationRow;

      return {
        success: true,
        reservation,
        allocations,
        is_idempotent_replay: false,
      };
    });

    return reserveTx.immediate();
  }

  // ── SETTLEMENT, RELEASE & REVERSAL (CORRECTION 2 MULTI-PERIOD) ─────────────

  public settleReservationAtomic(reservationId: string, now: number = Date.now()): boolean {
    const settleTx = this.db.transaction(() => {
      const res = this.db
        .prepare('SELECT * FROM category_budget_reservations WHERE reservation_id = ?')
        .get(reservationId) as CategoryReservationRow | undefined;

      if (!res) return false;
      if (res.status === 'SETTLED') return true; // Idempotent
      if (res.status !== 'RESERVED') {
        throw new Error(`Cannot settle reservation in state ${res.status}`);
      }

      // 1. Update reservation status
      this.db
        .prepare(`
          UPDATE category_budget_reservations SET
            status = 'SETTLED',
            saga_state = 'CATEGORY_SETTLED',
            settled_at = ?
          WHERE reservation_id = ?
        `)
        .run(now, reservationId);

      // 2. Update multi-period allocations
      const allocations = this.db
        .prepare('SELECT * FROM reservation_period_allocations WHERE reservation_id = ?')
        .all(reservationId) as ReservationPeriodAllocationRow[];

      for (const alloc of allocations) {
        this.db
          .prepare(`
            UPDATE reservation_period_allocations SET
              status = 'SETTLED',
              updated_at = ?
            WHERE allocation_id = ?
          `)
          .run(now, alloc.allocation_id);

        // Move amount from reserved -> settled
        this.db
          .prepare(`
            UPDATE budget_periods SET
              reserved_amount_paise = MAX(0, reserved_amount_paise - ?),
              settled_amount_paise = settled_amount_paise + ?,
              version = version + 1
            WHERE period_id = ?
          `)
          .run(alloc.amount_paise, alloc.amount_paise, alloc.period_id);
      }

      this.appendAuditEventInternal(
        res.tenant_id,
        res.customer_ref,
        res.agent_id,
        'RESERVATION_SETTLED',
        reservationId,
        res.pool_policy_version,
        { amount_paise: res.amount_paise, settled_at: now },
        now,
      );

      return true;
    });

    return settleTx.immediate();
  }

  public releaseReservationAtomic(
    reservationId: string,
    reason: string = 'CLIENT_RELEASED',
    now: number = Date.now(),
  ): boolean {
    const releaseTx = this.db.transaction(() => {
      const res = this.db
        .prepare('SELECT * FROM category_budget_reservations WHERE reservation_id = ?')
        .get(reservationId) as CategoryReservationRow | undefined;

      if (!res) return false;
      if (res.status === 'RELEASED') return true; // Idempotent
      if (res.status !== 'RESERVED') {
        throw new Error(`Cannot release reservation in state ${res.status}`);
      }

      // 1. Update reservation status
      this.db
        .prepare(`
          UPDATE category_budget_reservations SET
            status = 'RELEASED',
            saga_state = 'COMPENSATED',
            released_at = ?
          WHERE reservation_id = ?
        `)
        .run(now, reservationId);

      // 2. Release from all period allocations
      const allocations = this.db
        .prepare('SELECT * FROM reservation_period_allocations WHERE reservation_id = ?')
        .all(reservationId) as ReservationPeriodAllocationRow[];

      for (const alloc of allocations) {
        this.db
          .prepare(`
            UPDATE reservation_period_allocations SET
              status = 'RELEASED',
              updated_at = ?
            WHERE allocation_id = ?
          `)
          .run(now, alloc.allocation_id);

        // Return reserved capacity back to available
        this.db
          .prepare(`
            UPDATE budget_periods SET
              reserved_amount_paise = MAX(0, reserved_amount_paise - ?),
              version = version + 1
            WHERE period_id = ?
          `)
          .run(alloc.amount_paise, alloc.period_id);
      }

      this.appendAuditEventInternal(
        res.tenant_id,
        res.customer_ref,
        res.agent_id,
        'RESERVATION_RELEASED',
        reservationId,
        res.pool_policy_version,
        { amount_paise: res.amount_paise, reason, released_at: now },
        now,
      );

      return true;
    });

    return releaseTx.immediate();
  }

  public reverseSettlementAtomic(
    reservationId: string,
    reversalRef: string,
    reason: string = 'REVERSAL',
    now: number = Date.now(),
  ): boolean {
    const reverseTx = this.db.transaction(() => {
      const res = this.db
        .prepare('SELECT * FROM category_budget_reservations WHERE reservation_id = ?')
        .get(reservationId) as CategoryReservationRow | undefined;

      if (!res) return false;
      if (res.status === 'REVERSED') return true; // Idempotent
      if (res.status !== 'SETTLED') {
        throw new Error(`Cannot reverse transaction in state ${res.status}`);
      }

      this.db
        .prepare(`
          UPDATE category_budget_reservations SET
            status = 'REVERSED',
            saga_state = 'REVERSED',
            reversal_ref = ?
          WHERE reservation_id = ?
        `)
        .run(reversalRef, reservationId);

      const allocations = this.db
        .prepare('SELECT * FROM reservation_period_allocations WHERE reservation_id = ?')
        .all(reservationId) as ReservationPeriodAllocationRow[];

      for (const alloc of allocations) {
        this.db
          .prepare(`
            UPDATE reservation_period_allocations SET
              status = 'REVERSED',
              updated_at = ?
            WHERE allocation_id = ?
          `)
          .run(now, alloc.allocation_id);

        this.db
          .prepare(`
            UPDATE budget_periods SET
              settled_amount_paise = MAX(0, settled_amount_paise - ?),
              version = version + 1
            WHERE period_id = ?
          `)
          .run(alloc.amount_paise, alloc.period_id);
      }

      this.appendAuditEventInternal(
        res.tenant_id,
        res.customer_ref,
        res.agent_id,
        'RESERVATION_REVERSED',
        reservationId,
        res.pool_policy_version,
        { amount_paise: res.amount_paise, reversalRef, reason, reversed_at: now },
        now,
      );

      return true;
    });

    return reverseTx.immediate();
  }

  public getReservation(reservationId: string): CategoryReservationRow | null {
    const row = this.db
      .prepare('SELECT * FROM category_budget_reservations WHERE reservation_id = ?')
      .get(reservationId) as CategoryReservationRow | undefined;
    return row ?? null;
  }

  public listAuditEvents(tenantId: string, customerRef: string, limit: number = 50): BudgetAuditEventRow[] {
    return this.db
      .prepare(`
        SELECT * FROM budget_audit_events
        WHERE tenant_id = ? AND customer_ref = ?
        ORDER BY sequence_number DESC
        LIMIT ?
      `)
      .all(tenantId, customerRef, limit) as BudgetAuditEventRow[];
  }
}
