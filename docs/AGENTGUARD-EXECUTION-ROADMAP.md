# AgentGuard AI — Enterprise Execution Roadmap (BP-0 to BP-10)

**Project**: AgentGuard AI  
**Repository**: `Sumeet1249/ai-banking-agent`  
**Current Status**: Phase BP-3 Completed & Formally Verified  
**Date**: November 2026  

---

## 1. Executive Roadmap Matrix

| Phase | Title | Focus & Core Deliverables | Status |
|---|---|---|---|
| **BP-0** | Architecture Audit | Full system audit of Gateway, Bank Gate, Ledger Adapter, Witness, and Cockpit. | **COMPLETED** |
| **BP-1** | Canonical Contracts | Zod schemas for integer-paise models, 3 autonomy modes, reservations, merchant classification. | **COMPLETED** |
| **BP-2** | Authoritative Service & Persistence | Bank Gate SQLite persistence, `.immediate()` write locks, multi-period allocations, recoverable saga. | **COMPLETED** |
| **BP-3** | Multi-Agent Quotas & Merchant Intelligence | Subordinated agent allocations, layered MCC evidence, Gateway MCP integration, Merkle tree audit proofs. | **COMPLETED** |
| **BP-4** | Atomic Reservation Hardening | Multi-node distributed lock serialization, TigerBeetle two-phase commit reservation bridges. | Planned |
| **BP-5** | Shared Multi-Agent Budgets | Dynamic quota rebalancing, cross-agent borrowing policies, hierarchical tenant departments. | Planned |
| **BP-6** | Risk & Approval Engine | WebAuthn passkey step-up biometric verification, behavioral drift anomaly escalation. | Planned |
| **BP-7** | Professional Dashboard | Real-time WebSockets, transaction topology 3D scene, enterprise audit export. | Planned |
| **BP-8** | Workflow Integration | LangChain, CrewAI, AutoGen, and MCP tool runtime bindings with zero bypass guarantees. | Planned |
| **BP-9** | Security & Regression Testing | Chaos testing, network partition recovery, prompt injection penetration testing suite. | Planned |
| **BP-10** | Startup & Production Readiness | High-availability failover, SOC2 Type II compliance evidence packs, investor pitch kit. | Planned |

---

## 2. Phase BP-3 Detailed Completion Status

- [x] **BP-3.1 — Shared Multi-Agent Quota Engine**
  - [x] Parent customer budget and child agent allocations
  - [x] Per-agent, per-category, per-transaction, daily/weekly/monthly limits
  - [x] Shared pool enforcement across multiple agents (combined exhaustion)
  - [x] Agent-specific allowed and blocked categories
  - [x] Delegation expiry and revocation
  - [x] Atomic quota consumption and release in SQLite `.immediate()` transactions
  - [x] Protection against multiple agents bypassing customer limits

- [x] **BP-3.2 — Layered Merchant Intelligence**
  - [x] ISO 18245 MCC normalization and dictionary mapping
  - [x] 5-tier evidence hierarchy (`AUTHORITATIVE_RAIL` > `REGULATORY_REGISTRY` > `CUSTOMER_OVERRIDE` > `DETERMINISTIC_HEURISTIC` > `ADVISORY_HEURISTIC`)
  - [x] Non-negotiable Rule: AI output strictly advisory (cannot grant `VERIFIED` status or auto-authorize spend)
  - [x] Category/MCC mismatch detection
  - [x] Fail-closed unknown merchant handling (escalation to `ASK` or `DENY`)
  - [x] Customer correction & override workflow

- [x] **BP-3.3 — Gateway MCP Integration**
  - [x] Authenticate calling agent via Ed25519 identity
  - [x] Validate request schema and delegation context
  - [x] Bind request to idempotency key and canonical transaction digest
  - [x] Forward budget requests to Bank Gate (`POST /api/v1/category-reservations`)
  - [x] Receive authoritative decision and respect `DENY`, `ASK`, and `DEFER`
  - [x] Coordinate 22-field TBP permit minting only on `ALLOW`

- [x] **BP-3.4 — Compliance Cockpit Frontend Upgrade**
  - [x] Multi-agent allocation inspector and status toggles
  - [x] Merchant intelligence dashboard with evidence tier badges
  - [x] Unknown merchant review queue and override controls
  - [x] Interactive Merkle audit verification tool with real status feedback
  - [x] 0 TypeScript compilation errors (`tsc --noEmit`)

- [x] **BP-3.5 — Merkle Tree Audit Verification**
  - [x] Canonical audit event serialization
  - [x] Domain-separated hashing (RFC 6962: `0x00` leaf, `0x01` internal node)
  - [x] Deterministic odd-leaf self-pairing
  - [x] Inclusion proof generation and verification
  - [x] Batch persistence and Witness (:5000) checkpoint anchoring
  - [x] Tamper detection for altered payloads and invalid proofs

---

## 3. Test & Verification Summary

| Test Suite | Tests Passed | Status |
|---|---|---|
| Bank Gate (`@agentguard/bank-gate`) | **49 / 49** | All Passed |
| Core Schema (`@agentguard/core-schema`) | **60 / 60** | All Passed |
| Gateway MCP (`@agentguard/gateway-mcp`) | **6 / 6** | All Passed |
| Cockpit UI (`apps/compliance-cockpit`) | **0 Errors** | Passed |
| Git Index / Working Tree | **Clean, no auto-commits** | Verified |
