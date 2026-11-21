# BP-3.0 — Repository Readiness Report: Multi-Agent Budget Governance, Merchant Intelligence, Gateway Enforcement & Merkle Audit Verification

**Repository**: `https://github.com/Sumeet1249/ai-banking-agent.git`  
**Project**: AgentGuard AI  
**Author**: Principal FinTech & Security Architect  
**Date**: November 2026  
**Status**: Formal Readiness Assessment Complete  

---

## 1. Executive Assessment

A comprehensive source-code and repository audit was conducted across the monorepo packages (`@agentguard/core-schema`, `@agentguard/bank-gate`, `@agentguard/gateway-mcp`, `@agentguard/witness`, and `apps/compliance-cockpit`).

### Baseline Status:
- **BP-1 Canonical Contracts**: Implemented in `packages/core-schema/src/budget-pools.ts`. Strict integer paise (Rule E1), 3 canonical autonomy modes (`AUTO_APPROVE_WITHIN_LIMITS`, `ASK_BEFORE_EVERY_PAYMENT`, `MANUAL_ONLY`), 5-tier evidence hierarchy, and UTC epoch ms (Rule E2).
- **BP-2 Authoritative Persistence**: Implemented in `packages/bank-gate/src/db/category-budget-store.ts` and `category-budget-service.ts`. Explicit SQLite `.immediate()` write lock serialization, multi-period reservation accounting (`reservation_period_allocations`), recoverable saga coordination with Ledger Adapter (`:4001`), and SHA-256 hash chaining.
- **Test Baseline**: 36/36 tests passing in Bank Gate, 60/60 tests passing in Core Schema, 6/6 tests passing in Gateway permit security.

---

## 2. Component Inventory & Architectural Mapping

| Subsystem | Exact Path | Existing Capabilities | BP-3 Additions Required |
|---|---|---|---|
| **Core Schema** | `packages/core-schema/src/budget-pools.ts` | Autonomy modes, pool schema, multi-period model, basic reservation & decision contracts. | Extend `AgentBudgetAllocationSchema` with `blocked_categories` and quotas; add `MerchantRegistryEntrySchema`, `MerkleAuditBatchSchema`, `MerkleInclusionProofSchema`. |
| **Bank Gate DB** | `packages/bank-gate/src/db/category-budget-store.ts` | `category_budget_pools`, `budget_periods`, `category_budget_reservations`, `reservation_period_allocations`, `budget_audit_events`. | Schema updates for `agent_budget_allocations` (quotas, spent/reserved tracking), `customer_merchant_overrides`, `merkle_audit_batches`. Sub-agent quota & idempotency enforcement in `reserveBudgetAtomic`. |
| **Bank Gate Service** | `packages/bank-gate/src/services/category-budget-service.ts` | Period boundary computation, saga orchestration, dual-hold coordination. | Wire `MerchantIntelligenceService`, fail-closed unverified merchant handling, agent allocation CRUD, server-side biometric passkey assertion check, and post-transfer recovery reconciliation. |
| **Merchant Engine** | `packages/bank-gate/src/services/merchant-intelligence-service.ts` | *New Component* | ISO 18245 MCC normalization, 5-tier evidence hierarchy evaluation, brand/location multi-MCC, mismatch detection, customer override registry. |
| **Merkle Engine** | `packages/bank-gate/src/services/merkle-audit-service.ts` | *New Component* | Canonical event serialization, RFC 6962 domain-separated hashing (`0x00`/`0x01`), odd-leaf self-pairing, inclusion proof generation, Witness checkpoint anchoring, independent server verification. |
| **Gateway MCP** | `packages/gateway-mcp/src/api/agent-banking.ts` | Ed25519 agent auth, 22-field TBP permit minting, delegation verification. | Connect to Bank Gate category reservation endpoint via `BankGateClient`, enforcing `DENY`, `ASK`, and fail-closed `DEFER` without creating a duplicate financial ledger. |
| **Compliance Cockpit** | `apps/compliance-cockpit/src/components/banking/anonymous-budget-pools-view.tsx` | Category pools view, basic limit edit dialog. | Professional 4-tab dashboard: Category Pools, Multi-Agent Quotas, Merchant Intelligence Registry, and Merkle Verifier. Removal of production dependence on static fixtures. |
| **Independent Witness** | `packages/witness/src/services/witness-service.ts` | Checkpoint co-signing, Ed25519 keypair isolation. | Verify Merkle roots and anchor batches via `/api/v1/checkpoints`. |

---

## 3. Database Migration Specification

The following SQLite tables and index migrations are required in `packages/bank-gate/src/db/category-budget-store.ts`:

1. **Agent Budget Allocations Table Expansion**:
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

2. **Customer Merchant Overrides Table**:
   ```sql
   CREATE TABLE IF NOT EXISTS customer_merchant_overrides (
     override_id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL,
     customer_ref TEXT NOT NULL,
     merchant_id TEXT NOT NULL,
     merchant_name TEXT NOT NULL,
     assigned_category TEXT NOT NULL,
     reason TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE(tenant_id, customer_ref, merchant_id)
   );
   ```

3. **Witness-Anchored Merkle Batches Table**:
   ```sql
   CREATE TABLE IF NOT EXISTS merkle_audit_batches (
     batch_id TEXT PRIMARY KEY,
     merkle_root TEXT NOT NULL UNIQUE,
     start_sequence INTEGER NOT NULL,
     end_sequence INTEGER NOT NULL,
     leaf_count INTEGER NOT NULL,
     algorithm_version TEXT NOT NULL DEFAULT 'MERKLE_RFC6962_SHA256_V1',
     witness_checkpoint_id TEXT,
     witness_signature TEXT,
     witness_epoch INTEGER,
     created_at INTEGER NOT NULL
   );
   ```

---

## 4. Threat Model & Security Invariants

- **Invariant I1 (No Gateway Bypass)**: Gateway MCP must delegate financial reservation authority to Bank Gate before permit minting. No permit may be issued on DENY, ASK, or DEFER.
- **Invariant I2 (Hard Rules First & Final DENY)**: Hard violations (parent cap, agent quota, blocked category, merchant blacklist) immediately DENY. AI advisory confidence scores can NEVER overturn a hard violation or authorize spend.
- **Invariant I5 (Exact vs. Uncertain Duplicates)**: Reusing an idempotency key with a modified `transaction_digest` must immediately return DENY (`IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD`).
- **Invariant I7 (Strict Sub-Agent Delegation)**: Child agent allocations are subordinate restrictions; total active child quotas cannot exceed parent pool authority. Suspending or revoking an agent allocation stops all future reservations.
- **Invariant I8 (Fail-Closed DEFER)**: Network timeouts or unreachable dependencies between Gateway and Bank Gate fail closed into DEFER.
- **Domain Separation (RFC 6962)**: Merkle leaves must be prefixed with `0x00` and internal nodes with `0x01` to prevent length-extension and second-preimage collision attacks.

---

## 5. Verification & Test Plan

1. **Multi-Agent Tests**:
   - Prevention of child allocation exceeding parent limit.
   - Combined quota exhaustion across 2+ agents sharing a customer pool.
   - Immediate rejection of revoked/suspended agents.
   - Enforcement of agent `blocked_categories` with deny-first precedence.
2. **Merchant Intelligence Tests**:
   - Authenticated rail MCC (`AUTHORITATIVE_RAIL`) establishes `VERIFIED` status.
   - Category/MCC mismatch detection forcing `ASK` passkey approval.
   - Customer override precedence with full provenance.
   - AI advisory inference prevented from claiming `VERIFIED` or auto-authorizing spend.
3. **Merkle Verification Tests**:
   - Deterministic odd-leaf self-pairing across 1, 2, 3, and 16 leaves.
   - End-to-end audit batch construction, inclusion proof generation, and Witness anchoring.
   - Tamper detection for modified event payload and altered root hash.
4. **Integration & Concurrency Tests**:
   - Concurrent agent reservations serialized via SQLite `tx.immediate()`.
   - Gateway MCP forwarding requests to Bank Gate and respecting verdicts.
   - Cockpit TypeScript compilation (`tsc --noEmit`) and UI rendering.

---

## 6. Implementation Sequence

1. **BP-3.0**: Formal repository readiness report (This Document).
2. **BP-3.1**: Multi-Agent Quota Engine (Core schema, Bank Gate Store, Unit tests).
3. **BP-3.2**: Merchant Intelligence Engine (Evidence hierarchy, MCC normalization, Tests).
4. **BP-3.3**: Gateway MCP Integration (`BankGateClient`, Route delegation, Decision propagation).
5. **BP-3.4**: Professional Compliance Cockpit Upgrade (4-tab interface, live data, loading/empty states).
6. **BP-3.5**: RFC 6962 Merkle Tree Audit Verification (Canonical serialization, inclusion proofs, server-side API).
7. **BP-3.6**: End-to-End Scenarios, Regression Checks, and Final Completion Documentation.
