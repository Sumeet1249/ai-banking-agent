/**
 * Authoritative Category Budget Service & Recoverable Saga Orchestrator (Phase BP-2)
 *
 * Implements:
 *   - Category Pool Lifecycle (Create, Read, Update, Suspend, Reactivate)
 *   - IANA Timezone Period Boundary Computations (Asia/Kolkata midnight & month-end)
 *   - Concurrency & Multi-Period Allocation (Daily, Weekly, Monthly simultaneous reservation)
 *   - Recoverable Saga Coordination between Bank Gate and Ledger Adapter (:4001)
 *   - Idempotency & Tenant Isolation Enforcement
 */

import type { Logger } from 'pino';
import {
  CanonicalCategoryBudgetPool,
  CanonicalCategoryBudgetPoolSchema,
  CanonicalAutonomyMode,
  SpendingCategory,
  Clock,
  SystemClock,
} from '@agentguard/core-schema';
import {
  CategoryBudgetStore,
  CategoryPoolRow,
  CategoryReservationRow,
  ReservationPeriodAllocationRow,
  BudgetPeriodRow,
  BudgetAuditEventRow,
} from '../db/category-budget-store';
import { ILedgerClient } from '../adapters/ledger-client';

export interface EvaluateBudgetParams {
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
  ttl_seconds?: number;
}

export interface BudgetEvaluationResult {
  decision: 'ALLOW' | 'ASK' | 'DENY' | 'DEFER';
  reason: string;
  reservation_id?: string;
  transfer_id?: string;
  saga_state: string;
  requires_human_approval: boolean;
  violations: string[];
  pool?: CategoryPoolRow;
  reservation?: CategoryReservationRow;
  allocations?: ReservationPeriodAllocationRow[];
}

export class CategoryBudgetService {
  constructor(
    private store: CategoryBudgetStore,
    private ledgerClient?: ILedgerClient,
    private clock: Clock = new SystemClock(),
    private logger?: Logger,
  ) {}

  // ── PERIOD BOUNDARY CALCULATION (ASIA/KOLKATA TIMEZONE STANDARD) ────────

  /**
   * Computes epoch millisecond boundaries for the current Daily, Weekly, and
   * Monthly periods strictly matching the given IANA timezone (e.g. 'Asia/Kolkata').
   */
  public computePeriodBoundaries(
    now: number,
    timezone: string = 'Asia/Kolkata',
  ): {
    daily: { start: number; end: number };
    weekly: { start: number; end: number };
    monthly: { start: number; end: number };
  } {
    const d = new Date(now);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    let year = 1970, month = 1, day = 1;
    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'day') day = parseInt(p.value, 10);
    }

    // Helper to get UTC epoch ms for a local YYYY-MM-DD HH:mm:ss in target timezone
    const getEpoch = (y: number, m: number, dayVal: number, h = 0, min = 0, sec = 0): number => {
      // Approximate UTC timestamp then adjust offset precisely
      const approx = Date.UTC(y, m - 1, dayVal, h, min, sec);
      const approxParts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false,
      }).formatToParts(new Date(approx));

      let py = 0, pm = 0, pd = 0, ph = 0, pmin = 0, ps = 0;
      for (const p of approxParts) {
        if (p.type === 'year') py = parseInt(p.value, 10);
        if (p.type === 'month') pm = parseInt(p.value, 10);
        if (p.type === 'day') pd = parseInt(p.value, 10);
        if (p.type === 'hour') ph = parseInt(p.value, 10);
        if (p.type === 'minute') pmin = parseInt(p.value, 10);
        if (p.type === 'second') ps = parseInt(p.value, 10);
      }
      const diff = approx - Date.UTC(py, pm - 1, pd, ph, pmin, ps);
      return approx + diff;
    };

    // 1. Daily: midnight to midnight
    const dailyStart = getEpoch(year, month, day, 0, 0, 0);
    const dailyEnd = getEpoch(year, month, day + 1, 0, 0, 0);

    // 2. Monthly: 1st of current month to 1st of next month
    const monthlyStart = getEpoch(year, month, 1, 0, 0, 0);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const monthlyEnd = getEpoch(nextMonthYear, nextMonth, 1, 0, 0, 0);

    // 3. Weekly: Current Monday to next Monday
    const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weeklyStart = getEpoch(year, month, day - diffToMonday, 0, 0, 0);
    const weeklyEnd = weeklyStart + 7 * 24 * 60 * 60 * 1000;

    return {
      daily: { start: dailyStart, end: dailyEnd },
      weekly: { start: weeklyStart, end: weeklyEnd },
      monthly: { start: monthlyStart, end: monthlyEnd },
    };
  }

  // ── POOL MANAGEMENT APIS ─────────────────────────────────────────────────

  public createPool(params: {
    tenant_id: string;
    customer_ref: string;
    pool_id: string;
    category_id: SpendingCategory;
    category_name: string;
    monthly_limit_paise: number;
    weekly_limit_paise?: number;
    daily_limit_paise?: number;
    per_transaction_limit_paise: number;
    autonomy_mode: CanonicalAutonomyMode;
    valid_from?: number;
    valid_until?: number;
    timezone?: string;
    actor?: string;
  }): CategoryPoolRow {
    const now = this.clock.now();
    const validFrom = params.valid_from ?? now;
    const validUntil = params.valid_until ?? now + 365 * 24 * 60 * 60 * 1000; // 1 year
    const tz = params.timezone || 'Asia/Kolkata';

    // Validate using canonical BP-1 schema
    const validated = CanonicalCategoryBudgetPoolSchema.parse({
      pool_id: params.pool_id,
      tenant_id: params.tenant_id,
      customer_ref: params.customer_ref,
      category_id: params.category_id,
      category_name: params.category_name,
      currency: 'INR',
      monthly_limit_paise: params.monthly_limit_paise,
      weekly_limit_paise: params.weekly_limit_paise,
      daily_limit_paise: params.daily_limit_paise,
      per_transaction_limit_paise: params.per_transaction_limit_paise,
      autonomy_mode: params.autonomy_mode,
      policy_version: 1,
      status: 'ACTIVE',
      valid_from: validFrom,
      valid_until: validUntil,
      timezone: tz,
      created_at: now,
      updated_at: now,
    });

    return this.store.createPool({
      ...validated,
      actor: params.actor || 'CUSTOMER',
    });
  }

  public getPool(tenantId: string, customerRef: string, poolId: string): CategoryPoolRow | null {
    return this.store.getPool(tenantId, customerRef, poolId);
  }

  public listPools(tenantId: string, customerRef: string): CategoryPoolRow[] {
    return this.store.listPools(tenantId, customerRef);
  }

  public updatePool(params: {
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
    return this.store.updatePoolLimits(params);
  }

  public setPoolStatus(
    tenantId: string,
    customerRef: string,
    poolId: string,
    status: 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'REVOKED',
    actor: string = 'CUSTOMER',
  ): CategoryPoolRow {
    return this.store.setPoolStatus(tenantId, customerRef, poolId, status, actor);
  }

  // ── SAGA ORCHESTRATOR & ATOMIC RESERVATION (CORRECTION 3) ─────────────────

  /**
   * Evaluates category budget, executes multi-period reservation with SQLite .immediate() lock,
   * coordinates account hold with Ledger Adapter, and returns the authoritative decision.
   */
  public async evaluateAndReserve(params: EvaluateBudgetParams): Promise<BudgetEvaluationResult> {
    const now = this.clock.now();
    const ttlSeconds = params.ttl_seconds ?? 90; // 90s permit TTL (Rule I6)

    // 1. Verify Pool Standing
    const pool = this.store.getPool(params.tenant_id, params.customer_ref, params.pool_id);
    if (!pool) {
      return {
        decision: 'DENY',
        reason: 'POOL_NOT_FOUND_OR_TENANT_ISOLATION_VIOLATION',
        saga_state: 'REQUEST_RECEIVED',
        requires_human_approval: false,
        violations: [`No authorized pool ${params.pool_id} for tenant ${params.tenant_id}`],
      };
    }

    if (pool.status !== 'ACTIVE') {
      return {
        decision: 'DENY',
        reason: `POOL_STATUS_${pool.status}`,
        saga_state: 'REQUEST_RECEIVED',
        requires_human_approval: false,
        violations: [`Category pool is currently in ${pool.status} standing`],
        pool,
      };
    }

    // 2. Check Autonomy Mode
    if (pool.autonomy_mode === 'MANUAL_ONLY') {
      return {
        decision: 'DENY',
        reason: 'MANUAL_ONLY_RESTRICTION',
        saga_state: 'REQUEST_RECEIVED',
        requires_human_approval: false,
        violations: ['Autonomous payments are strictly prohibited for this category pool (MANUAL_ONLY)'],
        pool,
      };
    }

    // 3. Compute applicable periods for Multi-Period Allocation (Correction 2)
    const boundaries = this.computePeriodBoundaries(now, pool.timezone);
    const applicablePeriods: Array<{
      period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
      period_start: number;
      period_end: number;
      limit_paise: number;
      timezone?: string;
    }> = [
      {
        period_type: 'MONTHLY',
        period_start: boundaries.monthly.start,
        period_end: boundaries.monthly.end,
        limit_paise: pool.monthly_limit_paise,
        timezone: pool.timezone,
      },
    ];

    if (pool.weekly_limit_paise !== null && pool.weekly_limit_paise !== undefined) {
      applicablePeriods.push({
        period_type: 'WEEKLY',
        period_start: boundaries.weekly.start,
        period_end: boundaries.weekly.end,
        limit_paise: pool.weekly_limit_paise,
        timezone: pool.timezone,
      });
    }

    if (pool.daily_limit_paise !== null && pool.daily_limit_paise !== undefined) {
      applicablePeriods.push({
        period_type: 'DAILY',
        period_start: boundaries.daily.start,
        period_end: boundaries.daily.end,
        limit_paise: pool.daily_limit_paise,
        timezone: pool.timezone,
      });
    }

    // 4. Atomic Multi-Period Category Reservation (SQLite .immediate() lock)
    const reserveResult = this.store.reserveBudgetAtomic({
      tenant_id: params.tenant_id,
      customer_ref: params.customer_ref,
      pool_id: params.pool_id,
      agent_id: params.agent_id,
      workflow_id: params.workflow_id,
      request_id: params.request_id,
      idempotency_key: params.idempotency_key,
      transaction_digest: params.transaction_digest,
      category_id: params.category_id,
      amount_paise: params.amount_paise,
      ttl_seconds: ttlSeconds,
      periods: applicablePeriods,
      now,
    });

    if (!reserveResult.success || !reserveResult.reservation) {
      return {
        decision: 'DENY',
        reason: reserveResult.reason || 'BUDGET_RESERVATION_FAILED',
        saga_state: 'REQUEST_RECEIVED',
        requires_human_approval: false,
        violations: reserveResult.violations || [reserveResult.reason || 'Reservation rejected'],
        pool,
      };
    }

    const reservation = reserveResult.reservation;
    const allocations = reserveResult.allocations;

    // 5. Account Coordination with Ledger Adapter (if wired)
    let transferId: string | undefined;
    if (this.ledgerClient) {
      try {
        const holdResult = await this.ledgerClient.createPendingTransfer({
          requestId: params.request_id,
          accountRef: params.customer_ref, // or designated account
          amountPaise: params.amount_paise,
          ttlSeconds: ttlSeconds + 30, // 120s buffer
        });

        if (holdResult.status !== 'PENDING') {
          // Compensation: Release category reservation immediately
          this.store.releaseReservationAtomic(reservation.reservation_id, 'ACCOUNT_HOLD_REJECTED', now);
          return {
            decision: 'DENY',
            reason: holdResult.reason || 'ACCOUNT_INSUFFICIENT_FUNDS',
            saga_state: 'COMPENSATED',
            requires_human_approval: false,
            violations: [`Account-level liquid balance insufficient: ${holdResult.reason}`],
            pool,
          };
        }

        transferId = holdResult.transfer_id;
      } catch (err: any) {
        // Network timeout / connection error: DO NOT release reservation, keep PENDING_RECONCILIATION
        return {
          decision: 'DEFER',
          reason: 'LEDGER_SOCKET_TIMEOUT_PENDING_RECONCILIATION',
          saga_state: 'PENDING_RECONCILIATION',
          requires_human_approval: false,
          violations: [`Ledger connection failure: ${err.message}`],
          reservation_id: reservation.reservation_id,
          pool,
        };
      }
    }

    // 6. Autonomy Mode & Human Approval Gate (Rule I3)
    const isAskMode = pool.autonomy_mode === 'ASK_BEFORE_EVERY_PAYMENT';
    const decision: 'ALLOW' | 'ASK' = isAskMode ? 'ASK' : 'ALLOW';

    return {
      decision,
      reason: isAskMode
        ? 'Customer biometric confirmation required (ASK_BEFORE_EVERY_PAYMENT)'
        : 'Budget reservation confirmed and authorized within category limits',
      reservation_id: reservation.reservation_id,
      transfer_id: transferId,
      saga_state: 'BOTH_RESERVATIONS_CONFIRMED',
      requires_human_approval: isAskMode,
      violations: [],
      pool,
      reservation,
      allocations,
    };
  }

  // ── FINAL SETTLEMENT / POSTING (SAGA COMPLETION) ─────────────────────────

  public async settlePayment(reservationId: string, transferId?: string): Promise<boolean> {
    const now = this.clock.now();

    // 1. Post ledger transfer if transferId provided
    if (this.ledgerClient && transferId) {
      const settlement = await this.ledgerClient.postTransfer(transferId);
      if (settlement.status !== 'SETTLED') {
        throw new Error(`Ledger settlement failed: ${settlement.reason}`);
      }
    }

    // 2. Authoritatively settle category reservation in Bank Gate SQLite
    return this.store.settleReservationAtomic(reservationId, now);
  }

  public releaseReservation(reservationId: string, reason: string): boolean {
    return this.store.releaseReservationAtomic(reservationId, reason, this.clock.now());
  }

  public reversePayment(reservationId: string, reversalRef: string, reason: string): boolean {
    return this.store.reverseSettlementAtomic(reservationId, reversalRef, reason, this.clock.now());
  }

  public getReservation(reservationId: string): CategoryReservationRow | null {
    return this.store.getReservation(reservationId);
  }

  public listAuditEvents(tenantId: string, customerRef: string): BudgetAuditEventRow[] {
    return this.store.listAuditEvents(tenantId, customerRef);
  }
}
