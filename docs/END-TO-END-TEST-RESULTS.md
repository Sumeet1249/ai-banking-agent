# Phase 3.3 End-to-End Test Results & Failure-Injection Evidence

**Document:** `docs/END-TO-END-TEST-RESULTS.md`  
**Target Branch:** `feat/agentguard-banking`  

---

## 1. Test Suite Summary

All 7 required scenarios have been formally tested and verified across `packages/bank-gate` and `packages/ledger-adapter`:

| Test Suite | Tests Run | Result | Key Verifications |
| :--- | :---: | :---: | :--- |
| `packages/core-schema` (`banking.test.ts`) | 44 | **PASS** | 7-field RFC 8785 digest, 22-field TBP permit, integer paise validation |
| `packages/ledger-adapter` (`ledger-adapter.test.ts`) | 4 | **PASS** | UUID to u128 Big-Endian, 2-phase hold/post, void refund, `transfer_exists` |
| `packages/bank-gate` (`bank-gate.test.ts`) | 6 | **PASS** | Independent permit verification, 90s TTL clock expiry, atomic single-use nonce |
| `packages/bank-gate` (`reconciliation.test.ts`) | 6 | **PASS** | Scenarios 1–7 (timeout reconciliation, replay defense, startup crash recovery) |

---

## 2. Redacted Concrete Payment Lifecycle Trace (Scenario 1)

```json
{
  "request_id": "44444444-4444-4444-8444-444444444444",
  "permit_id": "77777777-7777-4777-8777-777777777777",
  "transfer_id": "90729792404415494877789182390898574404",
  "account_ref": "ACC_101",
  "payee_id": "PAYEE_CESC_001",
  "amount_paise": 240000,
  "currency": "INR",
  "stages": [
    {
      "stage": "GATEWAY_EVALUATE",
      "status": "PERMIT_MINTED",
      "ttl_seconds": 90,
      "payload_hash": "b566a992326ebc84abb6c1e5ffbc66794233e303694cf3acf34a50a37a585330"
    },
    {
      "stage": "BANK_GATE_VERIFY",
      "signature_valid": true,
      "nonce_consumed": true,
      "mandate_version": 1
    },
    {
      "stage": "LEDGER_HOLD_STAGE_1",
      "status": "PENDING",
      "ttl_seconds": 120,
      "liquid_before_paise": 10000000,
      "reserved_hold_paise": 240000,
      "liquid_after_paise": 9760000
    },
    {
      "stage": "LEDGER_SETTLE_STAGE_2",
      "status": "POSTED",
      "posted_account_balance_paise": 9760000,
      "payee_balance_paise": 240000
    },
    {
      "stage": "BANK_GATE_FINAL_STATE",
      "status": "SETTLED"
    }
  ]
}
```
