# Financial Reconciliation Architecture & Design

**Document:** `docs/RECONCILIATION-DESIGN.md`  
**Target Branch:** `feat/agentguard-banking`  
**Package:** `packages/bank-gate` (Port 4000)  

---

## 1. Overview & Problem Statement

In distributed banking systems, network sockets can drop or time out after a request has been accepted by the financial ledger. A blind retry would cause an catastrophic double-debit.

The **Financial Reconciliation Engine** (`packages/bank-gate/src/services/reconciliation.ts`) guarantees that any transaction left in an uncertain state (`PENDING_RECONCILIATION` or unposted `PENDING_TRANSFER`) is safely resolved by querying ledger ground truth.

---

## 2. Finite State Machine (FSM) Transitions

```
[PERMIT_VALIDATED]
        │
        ▼ (Stage 1 Pending Hold: 120s TTL)
[PENDING_TRANSFER] ─────────────► [VOIDED] (Insufficient funds or hold expired)
        │
        ├──► [PENDING_RECONCILIATION] (Socket timeout / crash)
        │            │
        │            ▼ (Ledger Ground Truth Query)
        │     ┌──────┴──────┐
        │     ▼             ▼
        ▼ (Stage 2 Post)
    [SETTLED]           [VOIDED]
```

### Invariants:
1. `SETTLED` is final. A settled transfer can never be voided.
2. `VOIDED` is final. A voided transfer can never be posted.
3. A transfer can never settle twice.
4. Reconciliation is strictly idempotent.
5. Injected deterministic clocks govern 120s TTL expiry.

---

## 3. Ground Truth Resolution Matrix

| Bank Gate State | Ledger State | Action Taken | Final Status |
| :--- | :--- | :--- | :--- |
| `PENDING_RECONCILIATION` | `NOT_FOUND` | Mark voided; transfer was never registered | `VOIDED` |
| `PENDING_RECONCILIATION` | `POSTED` | Record confirmed settlement | `SETTLED` |
| `PENDING_RECONCILIATION` | `VOIDED` | Record confirmed void | `VOIDED` |
| `PENDING_RECONCILIATION` | `PENDING` (Hold Expired) | Void expired hold on ledger | `VOIDED` |
| `PENDING_RECONCILIATION` | `PENDING` (Hold Active) | Post stage-2 settlement | `SETTLED` |
| `PENDING_TRANSFER` (Crash) | `NOT_FOUND` | Void unstarted transaction | `VOIDED` |
