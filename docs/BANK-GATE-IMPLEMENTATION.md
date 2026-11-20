# Bank Gate Runtime Service Implementation

**Document:** `docs/BANK-GATE-IMPLEMENTATION.md`  
**Target Branch:** `feat/agentguard-banking`  
**Package:** `packages/bank-gate`  
**Port:** 4000  
**Status:** IMPLEMENTED & TESTED  

---

## 1. Overview & Service Boundary

Bank Gate (`packages/bank-gate`) is the authoritative financial security boundary for AgentGuard AI. It receives Gateway-minted 22-field permits and executes two-phase financial transfers against the Ledger Adapter (`:4001`).

Bank Gate adheres to **Rule E4**:
- Holds the Gateway Ed25519 public key **only** (never imports private keys).
- Communicates with Ledger Adapter via typed interface `ILedgerClient` (never imports `tigerbeetle-node` directly).

---

## 2. Implemented Modules

| File | Purpose |
| :--- | :--- |
| `src/config.ts` | Validated configuration (port 4000, Gateway public key, Ledger URL) |
| `src/db/bank-gate-store.ts` | Durable SQLite storage for atomic nonces, transaction state machine, and mandate cache |
| `src/adapters/ledger-client.ts` | `ILedgerClient` interface & `FakeLedgerClient` with integer paise two-phase transfers |
| `src/services/permit-verifier.ts` | Ed25519 signature & 7-field RFC 8785 canonical transaction digest verifier |
| `src/services/transaction-executor.ts`| Transaction state machine (`PERMIT_VALIDATED` $\rightarrow$ `PENDING_TRANSFER` $\rightarrow$ `SETTLED` / `VOIDED`) |
| `src/server.ts` | Express HTTP server (`GET /health`, `GET /ready`, `POST /execute`, `POST /api/v1/transactions/execute`) |
| `src/__tests__/bank-gate.test.ts` | Concurrency and security test suite |

---

## 3. Endpoints Implemented

1. `GET /health`: Process liveness check.
2. `GET /ready`: Readiness check validating SQLite read/write and Ledger connectivity. Returns HTTP 503 if dependencies fail.
3. `POST /api/v1/permits/verify`: Verification of 22-field permit envelope without executing financial transfer.
4. `POST /api/v1/transactions/execute` & `POST /execute`: Atomically verifies permit, consumes nonce, locks pending transfer, and posts final settlement.
5. `GET /api/v1/transactions/:request_id`: Audit query returning transaction state machine records.
6. `POST /api/v1/mandates/:mandate_id/revoke`: Immediate eviction/invalidation of cached customer mandates.
