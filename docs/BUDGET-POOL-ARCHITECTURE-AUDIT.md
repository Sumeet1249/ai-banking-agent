# AgentShield — Advanced Autonomous Category Budget Engine Audit (BP-0)

**Audit Completion Date**: November 21, 2026  
**Audited Target**: `http://localhost:13003/budget-pools`  
**Repository**: `Sumeet1249/ai-banking-agent`  
**Scope**: Full architectural, database, security, and data-flow audit across Gateway MCP (`:8081`), Bank Gate (`:4000`), Ledger Adapter, SQLite databases (`bank_gate.db`, `agentguard.db`), and Cockpit Frontend (`:13003`).

---

## A. Current Architecture and Data Flow

```mermaid
flowchart TD
    User([Customer / Account Holder]) -->|WebAuthn / Passkey| UI[Cockpit UI :13003 /budget-pools]
    Agent([AI Banking Agent / Child Agent]) -->|Unscheduled Payment Request| Gateway[Gateway MCP :8081]
    
    subgraph Gateway Core Authority
        Gateway --> IntentExtract[1. Intent Extractor (NLP/Zod)]
        Gateway --> MandateService[2. Mandate & Scope Service (MND_ELEC_101)]
        Gateway --> AnomalyService[3. PaySim & Structuring Detector]
        Gateway --> BudgetGuard[BudgetGuardService (LLM Token/Cost USD only)]
        Gateway --> RuleEngine[4. Deterministic Rule Invariants (I1-I9)]
    end

    subgraph Bank Gate Isolation :4000
        BankGate[Bank Gate HTTP Server]
        BankStore[(bank_gate.db SQLite)]
        LedgerAdapter[Ledger Adapter (Liquid & Reserved Balances)]
        ReconService[Financial Reconciliation Service]
    end

    subgraph Independent Witness :5000
        Witness[Witness Co-Signing Service (wit_key_9fb2ceab)]
        WitnessStore[(witness.db Merkle Tree)]
    end

    RuleEngine -->|Issue Ed25519 TBP Permit| BankGate
    BankGate --> BankStore
    BankGate --> LedgerAdapter
    BankGate --> ReconService
    BankGate -->|Co-Sign Merkle Root| Witness
```

---

## B. Exact Frontend and Backend File Inventory

### Frontend UI (`apps/compliance-cockpit`):
- `apps/compliance-cockpit/src/app/budget-pools/page.tsx`: Route entry point rendering the Budget Pools page.
- `apps/compliance-cockpit/src/components/banking/anonymous-budget-pools-view.tsx`: The primary budget pools component.
- `apps/compliance-cockpit/src/components/dashboard/layout.tsx`: Navigation bar definition linking `/budget-pools`.
- `apps/compliance-cockpit/src/components/banking/autonomous-workflow-studio.tsx`: Multi-agent pipeline view displaying budget consumption.

### Shared Contracts (`packages/core-schema`):
- `packages/core-schema/src/budget-pools.ts`: TypeScript/Zod interfaces for `SpendingCategory`, `AutonomousPoolPolicy`, and `CategoryBudgetPool`.
- `packages/core-schema/src/banking.ts`: Canonical transaction, mandate, and permit schemas.
- `packages/core-schema/src/workflow-orchestration.ts`: 8-step pipeline schemas.

### Gateway Core (`packages/gateway-mcp`):
- `packages/gateway-mcp/src/services/budget-guard.ts`: Compute-only cost guard tracking model token spend (`cost_usd`).
- `packages/gateway-mcp/src/db/gateway-store.ts`: SQLite interactions for `agentguard.db`.
- `packages/gateway-mcp/src/policies/dsl-packs/paysim-benchmark.ts`: PaySim transaction pattern evaluator.

### Bank Gate (`packages/bank-gate`):
- `packages/bank-gate/src/server.ts`: Express listener on port `:4000`.
- `packages/bank-gate/src/db/bank-gate-store.ts`: SQLite schema and queries for `bank_gate.db`.
- `packages/bank-gate/src/adapters/ledger-client.ts`: Liquid vs. Reserved balance tracker.
- `packages/bank-gate/src/services/transaction-executor.ts`: Ed25519 permit and nonce validator.
- `packages/bank-gate/src/services/reconciliation.ts`: Two-phase balance settlement engine.

---

## C. Existing Database Tables and Ownership

A live inspection of SQLite database files (`bank_gate.db` and `agentguard.db`) reveals:

### `bank_gate.db` (Authoritative Bank Engine - Port `:4000`):
1. `bank_transactions`: Tracks `request_id`, `permit_id`, `nonce`, `amount_paise`, `status` (`PERMIT_VALIDATED`, `PENDING_TRANSFER`, `SETTLED`, `VOIDED`, `PENDING_RECONCILIATION`). *(0 rows currently)*
2. `consumed_nonces`: Tracks atomic single-use nonce consumption. *(0 rows currently)*
3. `cached_mandates`: Tracks `mandate_id`, `mandate_version`, `allowed_payees`, `per_tx_limit_paise`, `daily_limit_paise`, `status`. *(0 rows currently)*
*Finding: There is **no table** in `bank_gate.db` representing category budget pools.*

### `agentguard.db` (Gateway MCP - Port `:8081`):
Contains 45 tables including:
- `mandates`: Holds `MND_ELEC_101` (Cap ₹5,000 per tx, ₹8,000 daily limit, active payees `["PAYEE_CESC_001","PAYEE_TATA_POWER_001"]`). *(1 live row)*
- `accounts`: Holds customer account `balance_paise`. *(1 live row)*
- `customers`: Holds customer reference. *(1 live row)*
- `transaction_bound_approvals`: Holds human passkey approval challenges. *(0 rows)*
- `issued_permits`: Holds minted Ed25519 permits with `reservation_id`. *(0 rows)*
*Finding: There is **no category budget table** in `agentguard.db`.*

---

## D. API Endpoint Inventory

| Endpoint | Method | Service & Port | Status | Real vs Mock |
| :--- | :--- | :--- | :--- | :--- |
| `/health` | `GET` | Gateway `:8081` | Online (`200 OK`) | Real |
| `/health` | `GET` | Bank Gate `:4000` | Online (`200 OK`) | Real |
| `/health` | `GET` | Witness `:5000` | Online (`200 OK`) | Real |
| `/api/v1/public-key` | `GET` | Witness `:5000` | Online (`200 OK`, returns `wit_key_9fb2ceab`) | Real |
| `/api/v1/transactions/authorize` | `POST` | Bank Gate `:4000` | Online (Consumes Ed25519 permit) | Real |
| `/api/v1/mandates/:id/revoke` | `POST` | Bank Gate `:4000` | Online (Atomic mandate invalidation) | Real |
| `/api/customer/approvals/verify` | `POST` | Gateway `:8081` | Online (Validates WebAuthn passkeys) | Real |
| `/api/v1/budget-pools/*` | Any | **None** | **NON-EXISTENT** | **Missing** |

---

## E. Current Feature Implementation Matrix

| Requirement | Implementation State | Severity / Gap |
| :--- | :--- | :--- |
| **Integer Paise Precision (Rule E1)** | **IMPLEMENTED** | All banking numbers in schemas, DB columns, and ledgers use integer paise. Zero float math. |
| **Category Budget Pools (5 Pools)** | **FRONTEND ONLY** | Hardcoded in `anonymous-budget-pools-view.tsx` React state. |
| **Autonomy Modes** | **PARTIALLY IMPLEMENTED** | Typed in `@agentguard/core-schema`, but only 2 modes exist (`ALWAYS_ASK`, `PAY_WITHOUT_RESTRICTION`). Mode 3 (`MANUAL_ONLY`) is absent. |
| **Merchant Category Code (MCC) Resolution** | **MISSING** | No ISO 18245 or UPI merchant lookup engine. Payees are matched by name string only. |
| **Category-Level Reservation Lock** | **MISSING** | Two-phase commitment exists for the bank account as a whole, but not partitioned by spending category. |
| **Multi-Agent Shared Pool Allocation** | **MISSING** | Multiple agents do not share a synchronized SQLite category pool row. |

---

## F. Real versus Mock Data Inventory

| Dashboard Metric / Element | Classification | Source & Truth Assessment |
| :--- | :--- | :--- |
| **Shopping Pool (₹8,400 / ₹25,000)** | `HARDCODED_FRONTEND` | Static React state array (`INITIAL_POOLS`). Does not reflect live DB transactions. |
| **Transport Pool (₹4,200 / ₹15,000)** | `HARDCODED_FRONTEND` | Static React state array (`INITIAL_POOLS`). |
| **Utilities Pool (₹2,450 / ₹10,000)** | `HARDCODED_FRONTEND` | Static React state array (`INITIAL_POOLS`). |
| **Food & Dining Pool (₹3,100 / ₹12,000)**| `HARDCODED_FRONTEND` | Static React state array (`INITIAL_POOLS`). |
| **Stock Market Pool (₹0 / ₹50,000)** | `HARDCODED_FRONTEND` | Static React state array (`INITIAL_POOLS`). |
| **Bank Gate Health (`UP :4000`)** | `REAL_BACKEND` | Live Express server listening and responding on port `:4000`. |
| **Witness Key (`wit_key_9fb2ceab`)** | `REAL_BACKEND` | Real Ed25519 public key returned from `GET http://localhost:5000/api/v1/public-key`. |
| **Mandate `MND_ELEC_101`** | `REAL_BACKEND` | Real persisted SQLite record in `agentguard.db` table `mandates`. |
| **516 Traces / 1870 Blocked** | `SEEDED_DEMO` | Driven by deterministic generation in `mock-traces.ts`. |

---

## G. Budget Reservation and Settlement Analysis

### Current Financial Lifecycle:
- In `packages/bank-gate/src/adapters/ledger-client.ts`, an atomic two-phase commit lifecycle is already functional for general accounts:
  $$\text{AVAILABLE} \longrightarrow \text{RESERVED} \longrightarrow \text{COMMITTED}$$
  - `holdFunds()` checks: $\text{liquid} - \text{amountPaise} \ge 0$, then sets:
    $$\text{liquid} \leftarrow \text{liquid} - \text{amountPaise}, \quad \text{reserved} \leftarrow \text{reserved} + \text{amountPaise}$$
  - `commitTransfer()` sets:
    $$\text{reserved} \leftarrow \text{reserved} - \text{amountPaise}$$
  - `releaseFunds()` restores funds back to liquid if an error occurs.
- **Architectural Flaw for Category Budgets**:
  - This reservation lifecycle is applied to the **bank account balance**, but **not to the category budget pool**.
  - If a customer allocates a ₹25,000 Shopping limit, there is no reservation lock checking:
    $$\text{settled\_category} + \text{active\_reserved\_category} + \text{request} \le \text{monthly\_limit\_paise}$$

---

## H. Multi-Agent Concurrency Analysis

- **The Race Condition Vulnerability**:
  - If Agent A (Shopping Assistant) and Agent B (Procurement Assistant) simultaneously issue unscheduled requests for ₹15,000 against a shared ₹25,000 monthly limit:
  - Because category limits are not guarded inside a SQLite `BEGIN IMMEDIATE` database transaction with row locks, both agents read `settled = 0`, both conclude ₹15,000 is within the ₹25,000 limit, and both issue permits.
  - Total spend reaches ₹30,000, **violating the customer's authorized limit by ₹5,000**.
- **Required Mitigation**: Category budget check and reservation must occur inside an atomic database lock before any permit is minted.

---

## I. Security Vulnerabilities and Severity

| ID | Vulnerability Description | Severity | Threat Impact |
| :--- | :--- | :--- | :--- |
| **SEC-01** | **Prompt Injection Category Tampering** | **CRITICAL** | If an LLM is allowed to classify transactions without external payment rail verification, a prompt injection can reclassify luxury goods or offshore transfers as "Fuel" or "Transport" to evade human approval. |
| **SEC-02** | **Lack of Authoritative Category Persistence** | **HIGH** | Restarting the Next.js Cockpit resets all edited caps and autonomy mode switches back to initial React defaults. |
| **SEC-03** | **Concurrent Agent Overspending** | **HIGH** | Simultaneous requests from multiple sub-agents can exceed shared pool limits without atomic SQLite reservations. |
| **SEC-04** | **Unauthenticated Mode Toggling** | **MEDIUM** | Frontend buttons switch between `Ask Before Pay` and `Pay Without Restriction` without customer PIN / session validation. |

---

## J. Missing Functionality (Gap Analysis for Startup Readiness)

1. **Category Budget SQLite Tables**: Need `category_budget_pools`, `pool_active_reservations`, and `verified_merchants` in `bank_gate.db`.
2. **Authoritative REST Endpoints**: Need `/api/v1/budget-pools` on the backend.
3. **Third Autonomy Mode (`MANUAL_ONLY`)**: Need strict blocking of all agent autonomy for sensitive categories.
4. **Verified Merchant & MCC Engine**: Need ISO 18245 code mapping (e.g. MCC 4900 = Utilities, MCC 4121 = Transport, MCC 5411 = Grocery).
5. **Timezone & Month Boundary Reset**: Need automatic monthly reset on `Asia/Kolkata` 1st of the month at 00:00:00 IST.

---

## K. Recommended BP-1 to BP-10 Implementation Plan

1. **BP-1: Advanced Category Model**: Expand `@agentguard/core-schema` with versioned `CategoryBudgetPool` (weekly, monthly, single-tx limits, timestamps).
2. **BP-2: Three Autonomy Modes**: Implement `AUTO_APPROVE_WITHIN_LIMITS`, `ASK_BEFORE_EVERY_PAYMENT`, `MANUAL_ONLY`.
3. **BP-3: Category & Merchant Classification**: Build deterministic MCC resolver prioritizing payment rails over LLM advisory.
4. **BP-4: Atomic Budget Reservation Engine**: Extend `BankGateStore` with SQLite `BEGIN IMMEDIATE` reservations (`AVAILABLE -> RESERVED -> SETTLED`).
5. **BP-5: Shared Multi-Agent Budgets**: Enforce shared category pools across multiple registered agents with subordinate limits.
6. **BP-6: Risk & Approval Engine**: Bind human Passkey approvals to exact pool version and category digest.
7. **BP-7: Professional Dashboard Upgrade**: Connect `/budget-pools` to live backend APIs, adding Policy Builder and Audit tabs.
8. **BP-8: Workflow Studio Integration**: Wire Category Pool pre-check into Step 02/04 of the 8-agent pipeline.
9. **BP-9: Automated Testing**: Add comprehensive test suites for limit overruns, race conditions, and category spoofing.
10. **BP-10: Startup Readiness Pack**: Deliver architecture diagrams, API specs, and investor pitch deck summaries.

---

## L. Exact Files Proposed for Future Modification

1. `packages/core-schema/src/budget-pools.ts` (Model expansion)
2. `packages/bank-gate/src/db/bank-gate-store.ts` (SQLite migration & atomic queries)
3. `packages/bank-gate/src/server.ts` (Expose `/api/v1/budget-pools` endpoints)
4. `packages/gateway-mcp/src/services/merchant-classifier.ts` (NEW: MCC resolver)
5. `apps/compliance-cockpit/src/components/banking/anonymous-budget-pools-view.tsx` (Wire to live API)
6. `apps/compliance-cockpit/src/components/banking/autonomous-workflow-studio.tsx` (Pool deduction check)

---

## M. Tests That Currently Exist vs. Tests That Are Missing

### Currently Existing Tests (Passing):
- `packages/bank-gate/src/__tests__/bank-gate.test.ts`: Mandate limits, Ed25519 signatures, single-use nonces.
- `packages/bank-gate/src/__tests__/reconciliation.test.ts`: Ledger commit and voiding.
- `packages/gateway-mcp/src/__tests__/attack-lab-scenarios.test.ts`: 7 OWASP attack vectors.
- `packages/gateway-mcp/src/__tests__/budget-guard.test.ts`: Token compute cost caps ($USD).

### Missing Tests (Required for BP-9):
- Category monthly cap exhaustion test.
- Concurrent multi-agent shared pool race condition test.
- Prompt injection attempting MCC category manipulation test.
- `MANUAL_ONLY` mode complete rejection test.
- Month-end reset at Asia/Kolkata midnight test.

---

**AUDIT CONCLUSION**:  
Audit phase **BP-0** is complete. The system has a robust cryptographic foundation in Bank Gate and Ledger Client, but category spending authority currently exists only as frontend React state. All architectural gaps and database schemas have been fully mapped. 

**Antigravity has stopped here without modifying any code.** We await your confirmation to proceed to Phase BP-1.
