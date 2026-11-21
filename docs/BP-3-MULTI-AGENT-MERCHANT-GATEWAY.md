# BP-3 — Multi-Agent Quotas, Merchant Intelligence & Gateway Integration

**Product**: AgentGuard AI  
**Module**: Authoritative Category Budget Engine (Port 4000) & Gateway MCP (Port 8081)  
**Status**: Completed & Formally Verified  
**Date**: November 2026  

---

## 1. Architecture Overview

Phase BP-3 establishes the enterprise multi-agent hierarchy, layered merchant intelligence engine, Gateway MCP delegation coordination, and Witness-anchored Merkle audit verifications.

```
       Customer / Compliance Cockpit (:13003)
      [Policies, Limits, Approvals, Merkle Verifier]
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
  Multiple AI Agents                   Gateway MCP (:8081)
 [Shopping, Travel, Utilities]   [Ed25519 Auth, TBP Minting, Delegation]
                                               │
                                               ▼
                                      Bank Gate (:4000)
                              [Authoritative Category Budget &
                               Shared Multi-Agent Quotas &
                               Merchant Intelligence & Merkle Batches]
                                               │
                                               ▼
                                      Ledger Adapter (:4001)
                                      + Independent Witness (:5000)
```

---

## 2. BP-3.1 — Multi-Agent Quota Enforcement

### Parent Pool vs. Child Allocations
- **Parent Customer Pool**: Authoritative spending boundary for the customer (e.g. ₹25,000 monthly for Shopping).
- **Subordinate Agent Allocations**: Individual allocations granted to specific autonomous bots (e.g., Procurement Bot: ₹15,000, Office Supplies Bot: ₹10,000).
- **Subordinate Constraint**: `agent_limit_paise <= parent_pool.monthly_limit_paise`. Total allocation attempts exceeding parent authority are rejected.

### Enforcement Rules:
1. **Shared Quota Exhaustion**: Multiple agents spend against both their child allocation AND the shared parent pool. If the parent pool is exhausted, all subordinate agents are denied further reservations.
2. **Category Permissions**: Each agent allocation enforces `allowed_categories` and `blocked_categories`. Deny rules take precedence over allow rules.
3. **Agent Suspension & Revocation**: Revoked or suspended agents are immediately rejected with `AGENT_SUSPENDED` or `AGENT_REVOKED`.
4. **Atomic Tracking**: Agent quota reservations and settlements update `reserved_amount_paise` and `spent_amount_paise` inside SQLite `.immediate()` write locks.

---

## 3. BP-3.2 — Layered Merchant Intelligence

Implements an ISO 18245-compliant classification engine with a strict 5-tier evidence hierarchy:

| Evidence Tier | Authority | Description |
|---|---|---|
| `AUTHORITATIVE_RAIL` | **Authoritative** | Authenticated ISO 18245 MCC code from payment rail settlement feed (NPCI UPI / Card auth message). |
| `CUSTOMER_OVERRIDE` | **Authoritative** | Explicit customer preference mapping a specific merchant identifier to an approved category. |
| `REGULATORY_REGISTRY` | **High Trust** | Pre-verified merchant registry from regulatory or banking registries. |
| `DETERMINISTIC_HEURISTIC` | **Provisional** | Deterministic prefix or pattern rule (requires corroboration). |
| `ADVISORY_HEURISTIC` | **Non-Authoritative** | AI / LLM inference. Cannot independently establish `VERIFIED` status or authorize spend. |

### Security Invariants:
- **Rule E2 / Invariant I2**: An AI advisory score can never override payment rail evidence, change a DENY into ALLOW, or bypass customer limits.
- **Fail-Closed Unknown Merchants**: Unmapped or unknown merchants fail closed into `ASK` (biometric approval) or `DENY`.
- **Mismatch Detection**: Discrepancies between claimed categories and authenticated MCCs trigger `CATEGORY_MCC_MISMATCH` and force customer review.

---

## 4. BP-3.3 — Gateway MCP Integration

1. Gateway MCP authenticates calling agents via Ed25519 signatures and verifies active delegation contexts.
2. Requests are bound to an idempotency key and canonical transaction digest.
3. Gateway MCP delegates budget checks to Bank Gate (`POST /api/v1/category-reservations`):
   - If Bank Gate returns `DENY` $\to$ Gateway returns HTTP 403 `DENY`.
   - If Bank Gate returns `DEFER` $\to$ Gateway returns HTTP 503 `DEFER` (fail-closed, no permit minted).
   - If Bank Gate returns `ASK` $\to$ Gateway returns HTTP 202 `ASK` (customer biometric step-up required).
   - If Bank Gate returns `ALLOW` $\to$ Gateway mints 22-field TBP permit envelope with the authoritative `reservation_id`.

---

## 5. Verification Results

- Bank Gate test suite: **49 / 49 tests passed** (5/5 suites)
- Core Schema test suite: **60 / 60 tests passed** (3/3 suites)
- Gateway MCP test suite: **6 / 6 tests passed** (Permit security & delegation)
- Cockpit TypeScript compilation: **0 compilation errors**
