# BP-3.2 — Layered Merchant Intelligence & Evidence-Based Classification

**Module**: Bank Gate Merchant Intelligence Engine (`:4000`)  
**Package**: `@agentguard/bank-gate`  
**Status**: Completed & Formally Verified  

---

## 1. Evidence Hierarchy & Policy Invariants

To eliminate false positives and prevent prompt injection from spoofing financial categories, merchant classification adheres to an authoritative 5-tier evidence hierarchy:

```
Tier 1: AUTHORITATIVE_RAIL     (Authenticated payment network ISO 18245 MCC)
                 │
Tier 2: CUSTOMER_OVERRIDE      (Explicit customer preferences and rules)
                 │
Tier 3: REGULATORY_REGISTRY    (RBI / Banking merchant directory)
                 │
Tier 4: DETERMINISTIC_HEURISTIC(Deterministic prefix / rule lookup)
                 │
Tier 5: ADVISORY_HEURISTIC     (AI / LLM inference - Strictly Advisory)
```

### Invariant Rules:
1. **Rule E2 / Invariant I2 (AI Advisory Boundary)**: An AI advisory score can **never** independently grant `VERIFIED` status (`status: 'PROVISIONAL'`).
2. **Fail-Closed Unknown Merchants**: When a merchant cannot be corroborated with authenticated rail evidence or a customer override, the transaction fails closed into `ASK` (biometric passkey approval) or `DENY`.
3. **Category Mismatch Escalation**: If the claimed transaction category differs from the authenticated payment rail MCC category, a `CATEGORY_MCC_MISMATCH` is flagged, escalating to human approval.

---

## 2. ISO 18245 MCC Dictionary Mapping

Implemented in `packages/bank-gate/src/services/merchant-intelligence-service.ts`:

| MCC Code | Description | Canonical Category | Evidence Tier |
|---|---|---|---|
| `5311` | Department Stores | `SHOPPING` | `AUTHORITATIVE_RAIL` |
| `5411` | Grocery Stores / Supermarkets | `SHOPPING` | `AUTHORITATIVE_RAIL` |
| `5999` | Miscellaneous Retail | `SHOPPING` | `AUTHORITATIVE_RAIL` |
| `5812` | Restaurants & Eating Places | `FOOD_DINING` | `AUTHORITATIVE_RAIL` |
| `5814` | Fast Food Restaurants | `FOOD_DINING` | `AUTHORITATIVE_RAIL` |
| `4121` | Taxicabs & Rideshare | `TRANSPORT` | `AUTHORITATIVE_RAIL` |
| `5541` | Service Stations (Fuel) | `TRANSPORT` | `AUTHORITATIVE_RAIL` |
| `5542` | Automated Fuel Dispensers | `TRANSPORT` | `AUTHORITATIVE_RAIL` |
| `4900` | Utilities (Electric, Gas, Water) | `UTILITIES` | `AUTHORITATIVE_RAIL` |
| `8011` | Doctors & Physicians | `HEALTHCARE` | `AUTHORITATIVE_RAIL` |
| `7011` | Hotels, Motels & Resorts | `ENTERTAINMENT` | `AUTHORITATIVE_RAIL` |
| `6211` | Securities Brokers & Dealers | `INVESTMENT_STOCK` | `AUTHORITATIVE_RAIL` |

---

## 3. Customer Override Registry

Customers can explicitly assign custom merchant mappings via `POST /api/v1/merchants/override`. Overrides are scoped to `(tenant_id, customer_ref, merchant_id)` and audited inside `customer_merchant_overrides`.

---

## 4. Test Verification Summary

From `packages/bank-gate/src/__tests__/multi-agent-merchant-merkle.test.ts`:
- `BP-3.2.1: Payment-rail MCC establishes authoritative VERIFIED status` — **PASSED**
- `BP-3.2.2: Flags category/MCC mismatch and forces ASK approval` — **PASSED**
- `BP-3.2.3: Customer override supersedes default classification with VERIFIED standing` — **PASSED**
- `BP-3.2.4: AI Advisory inference alone cannot establish VERIFIED status (Rule E2)` — **PASSED**
