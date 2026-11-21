# AGENTGUARD AI — FINAL ARCHITECTURE SPECIFICATION

**System**: AgentGuard AI Autonomous Banking & Security Engine  
**Release**: Enterprise Ready (BP-1, BP-2, BP-3 & Product Hardening)  
**Date**: November 21, 2026  

---

## 1. System Overview & Core Philosophy

AgentGuard AI is an authoritative financial governance and spending authorization engine designed specifically for autonomous AI agents. Unlike standard AI wrappers or static policy dashboards, AgentGuard AI enforces a **fail-closed, cryptographically bound transaction model** that guarantees AI agents cannot execute transactions outside customer-authorized category limits, merchant evidence thresholds, and sub-delegation bounds.

### Non-Negotiable Axiom:
> *"AgentGuard AI limits the financial damage of a successful prompt injection to what the customer authorized."*

---

## 2. Multi-Tier Distributed Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │           Compliance Cockpit UI              │
                                  │      (Next.js 14 :13003 - Port-based Admin)  │
                                  └───────┬──────────────────────────────┬───────┘
                                          │                              │
                           Customer Auth  │                              │ Real-time API
                           (Session/CSRF) │                              │ (Summary, Pools, Agents)
                                          ▼                              ▼
┌─────────────────────────┐          ┌──────────────────────┐         ┌───────────────────────────────┐
│     Autonomous Agent    │  mTLS/   │     Gateway MCP      │  HTTP   │           Bank Gate           │
│   (Procurement / Travel)├─────────►│ (:8081 - Auth Proxy, ├────────►│    (:4000 - Financial Guard    │
└─────────────────────────┘  Ed25519 │  Permit Signing)     │ Reserve │   & Category Authorizer)      │
                                     └──────────┬───────────┘         └───────────────┬───────────────┘
                                                │ Signed TBP                          │
                                                │ (Invariant I1)                      │ Atomic Settle
                                                ▼                                     ▼
                                     ┌────────────────────────────────────────────────────────┐
                                     │                 Ledger Adapter :4001                   │
                                     │         (Double-Entry TigerBeetle Cluster)             │
                                     └──────────────────────────┬─────────────────────────────┘
                                                                │
                                                                │ Batch Root Checkpoint
                                                                ▼
                                     ┌────────────────────────────────────────────────────────┐
                                     │                   Witness Server :5000                 │
                                     │               (Independent Merkle Notary)              │
                                     └────────────────────────────────────────────────────────┘
```

---

## 3. Core Component Responsibilities & Boundaries

### 3.1 Bank Gate (`packages/bank-gate` — Port 4000)
- **Role**: The **single authoritative financial authority** for category budget pools.
- **Responsibilities**:
  - Maintains SQLite category budget ledger using immediate write locks (`db.transaction(...).immediate()`).
  - Evaluates multi-period capacity (Daily, Weekly, Monthly) simultaneously.
  - Enforces sub-agent quota limits and checks `blocked_categories` with deny-first precedence.
  - Normalizes payees against the ISO 18245 MCC dictionary and classifies merchant evidence across 5 tiers.
  - Enforces non-authoritative AI boundaries (AI confidence score can never independently grant `VERIFIED`).
  - Batches sequential audit records into deterministic Merkle trees (`AGENTGUARD_MERKLE_V1` and `RFC6962_MTH_V1`).
- **Isolation Constraint**: Never holds private permit signing keys; never acts as Gateway proxy.

### 3.2 Gateway MCP (`packages/gateway-mcp` — Port 8081)
- **Role**: Agent authentication, tool routing, and cryptographic permit minting.
- **Responsibilities**:
  - Authenticates autonomous agents via detached Ed25519 signatures.
  - Integrates `BankGateClient`: calls `POST /api/v1/category-reservations` prior to issuing permits.
  - Enforces Invariant I1: Mints 22-field Transaction-Bound Permits (TBP) **only when Bank Gate returns ALLOW**.
  - Refuses permit issuance on `ASK`, `DENY`, or `DEFER`.
- **Isolation Constraint**: Never maintains an independent financial reservation ledger; never directly modifies bank balances.

### 3.3 Ledger Adapter (`packages/ledger-adapter` — Port 4001)
- **Role**: Low-latency double-entry ledger integration (TigerBeetle & SQLite fallback).
- **Responsibilities**:
  - Executes two-phase transfers: Stage 1 (Pending) and Stage 2 (Post or Void).
  - Guarantees integer-paise conservation ($Assets = Liabilities + Equity$).
  - Enforces deterministic 128-bit unsigned integer account and transfer IDs.

### 3.4 Witness Server (`packages/witness` — Port 5000)
- **Role**: Independent third-party audit notary.
- **Responsibilities**:
  - Collects Merkle batch roots from Bank Gate.
  - Maintains append-only transparency log.
  - Cosigns Merkle batch roots with independent Ed25519 key.

### 3.5 Compliance Cockpit (`apps/compliance-cockpit` — Port 13003)
- **Role**: Enterprise governance and administrative control interface.
- **Responsibilities**:
  - 6-tab unified interface: Executive Overview, Category Pools, Multi-Agent Quotas, Merchant Intelligence, Approvals & Exceptions, Merkle Explorer.
  - Connects strictly to live backend APIs (`/api/v1/dashboard/summary`, `/api/v1/category-pools`, etc.). Zero hardcoded mock numbers.
  - Transaction-bound passkey/WebAuthn customer approvals.

---

## 4. End-to-End Transaction Flow

```
1. Autonomous Agent -> Gateway MCP: POST /api/agent/payments (Request with payee, amount, category)
2. Gateway MCP -> Bank Gate :4000: POST /api/v1/category-reservations
3. Bank Gate :4000:
   a. SQLite Immediate Lock acquired
   b. Verify parent pool is ACTIVE
   c. Verify sub-agent status (ACTIVE vs SUSPENDED/REVOKED)
   d. Deny-first check on blocked_categories
   e. Merchant intelligence: Evaluate MCC & 5-tier evidence hierarchy
   f. Check available balance across Daily, Weekly, Monthly periods
   g. Reserve capacity atomically (RESERVED) & Append audit event
4. Bank Gate -> Gateway MCP: Returns ALLOW with reservation_id
5. Gateway MCP: Signs 22-field Ed25519 Transaction-Bound Permit (TBP)
6. Gateway MCP -> Agent: Returns signed permit
7. Agent -> Bank Gate :4000: POST /api/v1/transactions/execute (Submits permit + tx)
8. Bank Gate :4000: Verifies signature, digests, and single-use nonce
9. Bank Gate -> Ledger Adapter :4001: Posts settlement to TigerBeetle
10. Bank Gate :4000: Transitions reservation from RESERVED -> SETTLED
```

---

## 5. Security & Concurrency Guarantees

1. **Deterministic Odd-Leaf Merkle Formulation (`AGENTGUARD_MERKLE_V1`)**: Pairwise hashing with self-pairing for odd nodes at each level guarantees determinism without padding ambiguity.
2. **Strict RFC 6962 Merkle Formulation (`RFC6962_MTH_V1`)**: Recursive tree hashing splitting at the largest power of 2 less than $n$ ($k < n \le 2k$).
3. **Fail-Closed DEFER (Invariant I8)**: Any unhandled database exception or network partition results in DEFER; no permit is ever minted.
4. **Idempotency Protection (Invariant I5)**: Reuse of idempotency keys with mismatched transaction digests is rejected with `IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD`.
