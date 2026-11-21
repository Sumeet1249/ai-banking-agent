# AGENTGUARD AI — DATABASE ARCHITECTURE & RECOVERY RUNBOOK

**Database**: SQLite 3 with WAL Mode & Immediate Transactions  
**Engine**: `better-sqlite3` on Node.js 22  
**Storage File**: `bank_gate.db` (Primary Authoritative Ledger)

---

## 1. Schema Specifications

### `category_budget_pools`
Maintains customer sovereign category spending pools.
- `pool_id` (TEXT PRIMARY KEY)
- `tenant_id` (TEXT NOT NULL)
- `customer_ref` (TEXT NOT NULL)
- `category_id` (TEXT NOT NULL)
- `category_name` (TEXT NOT NULL)
- `currency` (TEXT NOT NULL DEFAULT 'INR')
- `monthly_limit_paise` (INTEGER NOT NULL)
- `weekly_limit_paise` (INTEGER)
- `daily_limit_paise` (INTEGER)
- `per_transaction_limit_paise` (INTEGER NOT NULL)
- `autonomy_mode` (TEXT NOT NULL)
- `status` (TEXT NOT NULL DEFAULT 'ACTIVE')
- `policy_version` (INTEGER NOT NULL DEFAULT 1)
- `valid_from` (INTEGER NOT NULL)
- `valid_until` (INTEGER NOT NULL)
- `timezone` (TEXT NOT NULL DEFAULT 'Asia/Kolkata')
- `created_at` (INTEGER NOT NULL), `updated_at` (INTEGER NOT NULL)
- `UNIQUE(tenant_id, customer_ref, category_id)`

### `budget_periods`
Maintains IANA timezone-bound multi-period reservation and settlement buckets.
- `period_id` (TEXT PRIMARY KEY)
- `pool_id` (TEXT NOT NULL, FK -> `category_budget_pools`)
- `tenant_id`, `customer_ref` (TEXT NOT NULL)
- `period_type` (TEXT NOT NULL: `'DAILY' | 'WEEKLY' | 'MONTHLY'`)
- `period_start`, `period_end` (INTEGER NOT NULL)
- `timezone` (TEXT NOT NULL)
- `limit_paise` (INTEGER NOT NULL)
- `settled_amount_paise` (INTEGER NOT NULL DEFAULT 0)
- `reserved_amount_paise` (INTEGER NOT NULL DEFAULT 0)
- `version` (INTEGER NOT NULL DEFAULT 1)
- `UNIQUE(pool_id, period_type, period_start)`

### `category_budget_reservations`
Maintains atomic reservations, saga states, and idempotency digests.
- `reservation_id` (TEXT PRIMARY KEY)
- `pool_id`, `tenant_id`, `customer_ref` (TEXT NOT NULL)
- `agent_id`, `workflow_id`, `request_id`, `idempotency_key`, `transaction_digest` (TEXT NOT NULL)
- `category_id` (TEXT NOT NULL)
- `amount_paise` (INTEGER NOT NULL)
- `status` (TEXT NOT NULL: `'RESERVED' | 'SETTLED' | 'RELEASED' | 'REVERSED'`)
- `saga_state` (TEXT NOT NULL: `'CATEGORY_RESERVED' | 'TRANSFER_POSTED' | 'CATEGORY_SETTLED' | 'PENDING_RECONCILIATION' | 'REQUIRES_HUMAN_APPROVAL'`)
- `transfer_id`, `reversal_ref`, `release_reason`, `violations` (TEXT)
- `expires_at`, `settled_at`, `released_at`, `created_at` (INTEGER)
- `UNIQUE(tenant_id, customer_ref, idempotency_key)`

### `agent_budget_allocations`
Subordinate agent quota limits and category boundary filters.
- `allocation_id` (TEXT PRIMARY KEY)
- `pool_id`, `agent_id`, `tenant_id`, `customer_ref` (TEXT NOT NULL)
- `agent_limit_paise`, `daily_limit_paise`, `per_transaction_limit_paise` (INTEGER NOT NULL)
- `monthly_limit_paise`, `weekly_limit_paise` (INTEGER)
- `allowed_categories`, `blocked_categories` (TEXT NOT NULL JSON arrays)
- `spent_amount_paise`, `reserved_amount_paise` (INTEGER NOT NULL DEFAULT 0)
- `status` (TEXT NOT NULL: `'ACTIVE' | 'SUSPENDED' | 'REVOKED'`)
- `version`, `valid_from`, `valid_until` (INTEGER)
- `UNIQUE(tenant_id, customer_ref, agent_id, pool_id)`

### `merchant_classifications` & `customer_merchant_overrides`
Authoritative registry of ISO 18245 MCC classifications and customer overrides.

### `merkle_audit_batches`
Maintains cryptographic Merkle batch roots and Witness checkpoints.
- `batch_id` (TEXT PRIMARY KEY)
- `merkle_root` (TEXT NOT NULL UNIQUE)
- `start_sequence`, `end_sequence`, `leaf_count` (INTEGER NOT NULL)
- `algorithm_version` (TEXT NOT NULL: `'AGENTGUARD_MERKLE_V1' | 'RFC6962_MTH_V1'`)
- `witness_checkpoint_id`, `witness_signature`, `witness_epoch`
- `created_at` (INTEGER NOT NULL)

---

## 2. Concurrency & Transaction Serialization

All financial writes (pool creation, status changes, budget reservations, settlements, releases, reversals, and agent quota updates) are serialized through SQLite write locks using:
```typescript
const tx = db.transaction(() => {
  // 1. Read existing balance & state
  // 2. Validate multi-period constraints
  // 3. Check idempotency & payload digest
  // 4. Update reservation & period buckets
  // 5. Append hash-chained audit event
});
tx.immediate(); // Acquires exclusive write lock immediately
```
This eliminates concurrent dirty reads and TOCTOU (Time-of-Check to Time-of-Use) anomalies.

---

## 3. Financial Reconciliation & Recovery

In the event of a partial failure (e.g. transfer posted to ledger but category settlement interrupted by power failure):
1. **Detection**: Reservations remaining in `TRANSFER_POSTED` with expired TTL or unconfirmed state are marked `PENDING_RECONCILIATION`.
2. **Reconciliation Worker**:
   - Queries Ledger Adapter (`GET /api/v1/transfers/:transferId`).
   - If ledger transfer is committed: calls `settleReservationAtomic()` to finalize category spend.
   - If ledger transfer was voided/failed: calls `releaseReservationAtomic()` to release reserved capacity across daily, weekly, and monthly periods.
   - Zero double-settlement or orphaned balance leaks.
