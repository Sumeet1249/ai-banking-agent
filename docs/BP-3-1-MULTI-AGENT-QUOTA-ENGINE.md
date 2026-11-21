# BP-3.1 — Multi-Agent Quota and Delegation Engine

**Module**: Bank Gate Authoritative Quota Engine (`:4000`)  
**Package**: `@agentguard/bank-gate`  
**Status**: Completed & Formally Verified  

---

## 1. Objective & Mathematical Specification

The Multi-Agent Quota Engine allows a customer to safely delegate fractional spending authority from a primary category budget pool to multiple autonomous AI agents without risk of overspending.

### Invariants:
1. **Subordination Constraint**:
   $$\forall \text{Agent } A_i \in \text{Pool } P, \quad \text{AllocatedPaise}(A_i) \le \text{MonthlyLimitPaise}(P)$$
2. **Shared Capacity Constraint**:
   At any instant $t$, for all concurrent agent reservations $R_{A_i}$:
   $$\sum_{A_i} \left(\text{SettledPaise}(A_i) + \text{ReservedPaise}(A_i)\right) \le \text{MonthlyLimitPaise}(P)$$
3. **Deny-First Precedence**:
   If $\text{category} \in \text{BlockedCategories}(A_i)$, transaction is immediately `DENY` even if present in `AllowedCategories`.

---

## 2. Database Schema & State Machine

```sql
CREATE TABLE IF NOT EXISTS agent_budget_allocations (
  allocation_id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  customer_ref TEXT NOT NULL,
  agent_limit_paise INTEGER NOT NULL,
  monthly_limit_paise INTEGER,
  weekly_limit_paise INTEGER,
  daily_limit_paise INTEGER NOT NULL,
  per_transaction_limit_paise INTEGER NOT NULL,
  allowed_categories TEXT NOT NULL,
  blocked_categories TEXT NOT NULL DEFAULT '[]',
  spent_amount_paise INTEGER NOT NULL DEFAULT 0,
  reserved_amount_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  valid_from INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (pool_id) REFERENCES category_budget_pools(pool_id),
  UNIQUE(tenant_id, customer_ref, agent_id, pool_id)
);
```

### Reservation Lifecycle Transitions:
```
           ┌──────────────┐
           │   RESERVED   │ (Atomic SQLite .immediate() write lock)
           └──────┬───────┘
                  │
      ┌───────────┴───────────┐
      ▼                       ▼
┌───────────┐           ┌───────────┐
│  SETTLED  │           │ RELEASED  │ (Compensated / Expired)
└─────┬─────┘           └───────────┘
      │
      ▼
┌───────────┐
│ REVERSED  │ (Capacity returned to pool & agent quota)
└───────────┘
```

---

## 3. Enforcement Logic in `reserveBudgetAtomic`

Inside `packages/bank-gate/src/db/category-budget-store.ts`:
1. **Active Status Check**: `agentAlloc.status === 'ACTIVE'`. If `SUSPENDED` or `REVOKED`, returns `DENY` (`AGENT_SUSPENDED` / `AGENT_REVOKED`).
2. **Temporal Window**: `now >= agentAlloc.valid_from && now <= agentAlloc.valid_until`. If outside window, returns `DENY` (`AGENT_DELEGATION_EXPIRED`).
3. **Blocked Categories Check**: If `blocked_categories.includes(category_id)`, returns `DENY` (`CATEGORY_BLOCKED_FOR_AGENT`).
4. **Allowed Categories Check**: If `allowed_categories.length > 0 && !allowed_categories.includes(category_id)`, returns `DENY` (`CATEGORY_NOT_PERMITTED_FOR_AGENT`).
5. **Per-Transaction Ceiling**: If `amount_paise > agentAlloc.per_transaction_limit_paise`, returns `DENY` (`EXCEEDS_AGENT_PER_TRANSACTION_LIMIT`).
6. **Total Quota Ceiling**: If `spent + reserved + amount_paise > agentAlloc.agent_limit_paise`, returns `DENY` (`EXCEEDS_AGENT_TOTAL_LIMIT`).
7. **Atomic Increment**: `UPDATE agent_budget_allocations SET reserved_amount_paise = reserved_amount_paise + amount_paise`.

---

## 4. Test Verification Summary

From `packages/bank-gate/src/__tests__/multi-agent-merchant-merkle.test.ts`:
- `BP-3.1.1: Prevents child agent allocation from exceeding parent customer pool capacity` — **PASSED**
- `BP-3.1.2: Two autonomous agents share parent pool and enforce combined quota exhaustion` — **PASSED**
- `BP-3.1.3: Rejects revoked and suspended agents immediately` — **PASSED**
- `BP-3.1.4: Blocks agent payment in explicitly blocked categories` — **PASSED**
