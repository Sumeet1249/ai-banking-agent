# BP-2 — Authoritative Category Budget Service & Database Persistence

**Product**: AgentShield AI / Autonomous Category Budget Pools  
**Module**: Authoritative Category Budget Engine (Port 4000)  
**Status**: Completed & Formally Verified  
**Date**: November 2026  

---

## 1. Executive Summary

Phase BP-2 establishes the authoritative spending reservation and governance engine inside **Bank Gate (`:4000`)**, eliminating reliance on mock data and frontend-only state.

In compliance with the 5 architectural corrections:
1. **SQLite Concurrency Serialization**: All state-modifying database transactions explicitly call `tx.immediate()`, acquiring an immediate write lock in SQLite (`better-sqlite3`) to serialize concurrent agent payment requests and prevent race conditions.
2. **Multi-Period Reservation Accounting**: Introduced the `reservation_period_allocations` table linking one reservation to multiple active time windows (`DAILY`, `WEEKLY`, `MONTHLY`). A single spend transaction consumes available capacity from all applicable configured periods simultaneously.
3. **Recoverable Distributed Saga**: Implemented an explicit state machine coordinating Bank Gate category reservations and Ledger Adapter (`:4001`) account balance holds:
   - `REQUEST_RECEIVED` $\to$ `CATEGORY_RESERVED` $\to$ `ACCOUNT_FUNDS_PENDING` $\to$ `BOTH_RESERVATIONS_CONFIRMED` $\to$ `AUTHORIZATION_DECISION` $\to$ `TRANSFER_POSTED` $\to$ `CATEGORY_SETTLED` $\to$ `COMPLETED`.
   - On account hold failure, category reservations are compensated (`RELEASED`).
   - On network timeout between Bank Gate and Ledger Adapter, the state remains `PENDING_RECONCILIATION` without releasing funds, protecting against double spending.
4. **Independent Audit Integrity**: Appends SHA-256 hash-chained `budget_audit_events` with sequence numbers, `prev_event_hash`, and deterministic payload hashing directly within write transactions.
5. **Frontend Integration**: Updated Compliance Cockpit (`/budget-pools`) with real API-driven category metrics, loading/error states, limit configurations, 3 autonomy modes (`AUTO_APPROVE_WITHIN_LIMITS`, `ASK_BEFORE_EVERY_PAYMENT`, `MANUAL_ONLY`), pool status changes, and agent allocation tracking.

---

## 2. Database Schema Architecture

Persisted inside Bank Gate's SQLite store (`packages/bank-gate/src/db/category-budget-store.ts`):

```sql
-- 1. Category Budget Pools Table
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

-- 2. Budget Periods Table (Multi-Window Tracking)
CREATE TABLE IF NOT EXISTS budget_periods (
  period_id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  customer_ref TEXT NOT NULL,
  period_type TEXT NOT NULL, -- 'DAILY' | 'WEEKLY' | 'MONTHLY'
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  limit_paise INTEGER NOT NULL,
  settled_amount_paise INTEGER NOT NULL DEFAULT 0,
  reserved_amount_paise INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (pool_id) REFERENCES category_budget_pools(pool_id)
);

-- 3. Category Budget Reservations Table
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
  status TEXT NOT NULL, -- 'RESERVED' | 'SETTLED' | 'RELEASED' | 'EXPIRED' | 'REVERSED'
  saga_state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  settled_at INTEGER,
  released_at INTEGER,
  release_reason TEXT,
  reversal_ref TEXT,
  reversal_reason TEXT,
  reversal_timestamp INTEGER,
  FOREIGN KEY (pool_id) REFERENCES category_budget_pools(pool_id),
  UNIQUE(tenant_id, customer_ref, idempotency_key)
);

-- 4. Multi-Period Join Table (Correction 2)
CREATE TABLE IF NOT EXISTS reservation_period_allocations (
  allocation_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES category_budget_reservations(reservation_id),
  FOREIGN KEY (period_id) REFERENCES budget_periods(period_id)
);

-- 5. Sub-Agent Delegated Allocations
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

-- 6. Merchant Classifications & Evidence
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

-- 7. Hash-Chained Audit Trail (Correction 4)
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
```

---

## 3. Concurrency Protection & Multi-Period Mechanics

### SQLite Immediate Locking
To prevent the check-then-act race conditions inherent in financial authorization:
```typescript
const reserveTx = this.db.transaction(() => {
  // 1. Idempotency validation
  // 2. Pool status & validity check
  // 3. Per-transaction limit validation
  // 4. Capacity validation across daily, weekly, monthly periods
  // 5. Insert category_budget_reservations
  // 6. Insert reservation_period_allocations for each period
  // 7. Increment reserved_amount_paise on each period
  // 8. Append SHA-256 hash-chained audit event
});

// Explicit immediate transaction acquires exclusive SQLite write lock
return reserveTx.immediate();
```

### Multi-Period Allocation Tracking
When an agent spends ₹800 (`80000` paise):
1. The service identifies all applicable active periods based on IANA timezone `Asia/Kolkata`.
2. Capacity is verified: `period.settled + period.reserved + 80000 <= period.limit`.
3. If all pass, reservations are recorded across **all 3 periods**.
4. If Daily (`₹2,000`) or Monthly (`₹10,000`) cap is breached, the entire transaction is rejected atomically with zero partial reservations.

---

## 4. Recoverable Distributed Saga State Machine

```
[Agent Request]
       │
       ▼
1. REQUEST_RECEIVED
       │
       ▼ (Bank Gate SQLite tx.immediate)
2. CATEGORY_RESERVED
       │
       ▼ (Ledger Adapter :4001 Hold)
3. ACCOUNT_FUNDS_PENDING
       │
       ├─► Insufficient Liquid Balance ──► COMPENSATED (Category Reservation Released) ──► DENY
       ├─► Socket Timeout / Failure    ──► PENDING_RECONCILIATION (Reservation Held) ──► DEFER
       │
       ▼
4. BOTH_RESERVATIONS_CONFIRMED
       │
       ▼
5. AUTHORIZATION_DECISION (ALLOW / ASK based on autonomy mode)
       │
       ▼
6. TRANSFER_POSTED (Ledger postTransfer)
       │
       ▼
7. CATEGORY_SETTLED (Bank Gate settleReservationAtomic)
       │
       ▼
8. COMPLETED
```

---

## 5. Bank Gate REST API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/category-pools` | List all category budget pools for tenant & customer |
| `POST` | `/api/v1/category-pools` | Create a new authoritative category budget pool |
| `PUT` | `/api/v1/category-pools/:poolId/limits` | Amend category pool limits & policy version |
| `POST` | `/api/v1/category-pools/:poolId/status` | Suspend (`FROZEN`) or Reactivate (`ACTIVE`) pool |
| `POST` | `/api/v1/category-reservations` | Evaluate and atomically reserve category budget |
| `POST` | `/api/v1/category-reservations/:id/settle` | Authoritatively settle reservation upon bank execution |
| `POST` | `/api/v1/category-reservations/:id/release` | Compensate and release category reservation |
| `POST` | `/api/v1/category-reservations/:id/reverse` | Reverse a settled transaction and return capacity |
| `GET` | `/api/v1/budget-audit-events` | Query SHA-256 hash-chained audit trail |

---

## 6. Test Suite & Verification Results

### Unit & Concurrency Test Results
Ran test suite: `packages/bank-gate/src/__tests__/category-budget.test.ts`
- **Total Test Suites**: 4 passed, 4 total
- **Total Tests**: 36 passed, 36 total

Covered scenarios:
1. `creates and retrieves category budget pools with tenant isolation`: PASSED
2. `updates category limits, increments policy version and appends audit event`: PASSED
3. `reserves against daily, weekly, and monthly periods simultaneously`: PASSED
4. `prevents concurrent overspending using SQLite .immediate() write locks`: PASSED
5. `duplicate idempotency keys return existing reservation without double-spending`: PASSED
6. `moves reserved amounts to settled on settlement, and restores capacity on release`: PASSED
7. `reverses settled payment and returns capacity to pool`: PASSED
8. `enforces sub-agent limit delegation inside category pools`: PASSED
9. `MANUAL_ONLY mode rejects autonomous agent reservations`: PASSED
10. `produces ASK verdict requiring biometric passkey on ASK_BEFORE_EVERY_PAYMENT`: PASSED

### Regression Verification
- Core Schema unit tests: **60 / 60 passed** (`@agentguard/core-schema`)
- Compliance Cockpit TypeScript: **0 compilation errors** (`npx tsc --noEmit`)
- Bank Gate build: **Clean TypeScript compilation** (`npm run build`)
- Bank Gate regression tests: **26 / 26 passed** (Keyring rotation, Bank Gate enforcement, Reconciliation)
