# Phase 3.3 — TigerBeetle Ledger Integration & Status Review

**Document:** `docs/LEDGER-INTEGRATION-REVIEW.md`  
**Target Branch:** `feat/agentguard-banking`  
**Package:** `packages/ledger-adapter` (Port 4001)  
**Status:** IMPLEMENTED & AUDITED  

---

## 1. Actual TigerBeetle Runtime Status: Transparent Audit

### Current Deployment State
1. **TigerBeetle Native Client (`tigerbeetle-node`):**
   - The repository's root environment does not currently execute an external C-binding native binary (`tigerbeetle-node`) on the local Windows host.
   - Per **Rule E4**, packages `bank-gate`, `gateway-mcp`, and `compliance-cockpit` are strictly forbidden from importing `tigerbeetle-node` directly.
2. **Current Implementation (`packages/ledger-adapter/src/services/ledger-engine.ts`):**
   - Implements the complete **TigerBeetle protocol state machine** via SQLite persistence and double-entry accounting.
   - Provides exact two-phase pending transfer hold semantics (`PENDING` with 120s TTL $\rightarrow$ `POSTED` / `VOIDED`).
   - Exposes the OpenAPI 3.1 contract (`docs/api/openapi-ledger.yaml`) on HTTP port 4001.
3. **Classification:**
   - **Protocol-Accurate Local Persistent Adapter (Emulated TigerBeetle Engine).**
   - **NOT** a live multi-node TigerBeetle cluster.
   - Deterministic test fake (`FakeLedgerClient`) is maintained in `packages/bank-gate` for offline unit testing without socket dependencies.

---

## 2. 128-bit Unsigned Integer (u128) Transfer ID Verification

- **TigerBeetle Transfer ID Requirement:** Strictly 128-bit unsigned integer (`u128`).
- **Algorithm (Decision D15):** Big-Endian parsing of raw 16-byte UUIDv4:
  ```typescript
  const hex = uuid.replace(/-/g, '');
  const u128String = BigInt('0x' + hex).toString();
  ```
- **Verified Test Vectors:**
  - `00000000-0000-0000-0000-000000000000` $\rightarrow$ `0`
  - `ffffffff-ffff-ffff-ffff-ffffffffffff` $\rightarrow$ `340282366920938463463374607431768211455` ($2^{128} - 1$)
  - `11111111-2222-3333-4444-555555555555` $\rightarrow$ `BigInt('0x11111111222233334444555555555555').toString()`
- **Idempotency Guarantee:** Re-submitting an identical UUIDv4 produces the exact same `u128` transfer ID, triggering `transfer_exists` / HTTP 409 `EXISTS` on the Ledger.

---

## 3. Production TigerBeetle Cluster Prerequisites

To transition from the local persistent adapter to a live distributed TigerBeetle cluster:
- **Cluster ID:** `0` (or 128-bit integer)
- **Replica Addresses:** `3000`, `3001`, `3002` (standard 3-node cluster)
- **Client Configuration:** Single `createClient({ cluster_id: 0n, replica_addresses: ['127.0.0.1:3000'] })` inside `packages/ledger-adapter` only.
- **Connection Lifecycle:** Process-wide singleton client with batching and retry queue.
