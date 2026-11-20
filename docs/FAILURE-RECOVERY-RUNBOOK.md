# Failure Recovery & Operational Runbook

**Document:** `docs/FAILURE-RECOVERY-RUNBOOK.md`  
**Target Branch:** `feat/agentguard-banking`  

---

## 1. Failure Modes & Automated Recovery Procedures

### Incident 1: Bank Gate Crash During Two-Phase Transfer
- **Symptom:** Bank Gate crashes or restarts while a transfer is in `PENDING_TRANSFER` or `PENDING_RECONCILIATION`.
- **Automated Recovery:**
  - Upon process startup, `FinancialReconciliationService.recoverUncertainTransactions()` queries all SQLite records with status `PENDING_TRANSFER` or `PENDING_RECONCILIATION`.
  - For each transaction, Bank Gate queries the Ledger Adapter (`GET /api/v1/transfers/:id`).
  - If the ledger shows `POSTED`, Bank Gate advances status to `SETTLED`.
  - If the ledger shows `PENDING` and the 120s TTL is expired, Bank Gate voids the hold.
  - If the ledger transfer was never registered, Bank Gate safely marks the transaction `VOIDED`.
  - **Zero manual intervention required for recovery.**

### Incident 2: Ledger Adapter Network Partition / Timeout
- **Symptom:** Network failure between Bank Gate (:4000) and Ledger Adapter (:4001).
- **Behavior:**
  - Transaction immediately transitions to `PENDING_RECONCILIATION`.
  - Bank Gate returns HTTP 503 `DEFER` with `reason: LEDGER_TIMEOUT_PENDING_RECONCILIATION`.
  - Client SDKs are forbidden from retrying with a new `request_id`.
  - Once connectivity is restored, operator or cron triggers `POST /api/v1/transactions/:request_id/reconcile`.

### Incident 3: Customer Mandate Revoked Mid-Flight
- **Symptom:** Customer revokes mandate while agent holds a signed permit.
- **Behavior:**
  - When agent attempts execution, Bank Gate checks live mandate cache.
  - Since status is `REVOKED` or `mandate_version` was bumped, Bank Gate returns HTTP 403 `MANDATE_VERSION_MISMATCH` / `MANDATE_REVOKED`.
  - Nonce is never consumed and no ledger hold is established.
