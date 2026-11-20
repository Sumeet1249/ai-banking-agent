# TigerBeetle Node.js Integration & Dual-Backend Architecture (Phase 6.2)

**Status:** IMPLEMENTED & VERIFIED  
**Package:** `packages/ledger-adapter` (Port 4001)  
**Governing Architectural Decisions:** [Decision D15](DECISION-LOG.md#d15-deterministic-uuidv4-to-128-bit-integer-mapping-for-tigerbeetle), [Decision D19](DECISION-LOG.md#d19-tigerbeetle-cluster-consensus-fail-closed-backend-architecture), [Decision D20](DECISION-LOG.md#d20-deterministic-resolution-ids-for-two-phase-commit-crash-recovery)  
**Test Suite:** `packages/ledger-adapter/src/__tests__/ledger-adapter.test.ts` (81/81 Passing Tests)

---

## 1. Executive Summary

Phase 6.2 completes the official Node.js client integration (`tigerbeetle-node@0.17.9`) into AgentGuard AI's double-entry financial ledger service (`packages/ledger-adapter`).

In accordance with **Rule E4**, all native TigerBeetle dependencies, binary drivers, and 128-bit unsigned integer conversions remain strictly encapsulated within `packages/ledger-adapter`. Upstream banking services (`packages/bank-gate` and `apps/control-plane`) interact with the ledger exclusively via authenticated HTTP REST protocols on Port 4001.

Furthermore, under **Decision D19**, the service implements an explicit dual-backend architecture governed by the `ILedgerBackend` interface, with strict **Fail-Closed** guarantees: when configured in `TIGERBEETLE` mode, the service will never silently fall back to local SQLite if the cluster encounters downtime.

---

## 2. Architectural Boundary & Isolation (Rule E4)

```
┌────────────────────────────────────────────────────────┐
│                      Bank Gate                         │
│                     (Port 4000)                        │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP REST (JSON)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Ledger Adapter                       │
│                     (Port 4001)                        │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │             ILedgerBackend Interface             │  │
│  └──────────┬───────────────────────────┬───────────┘  │
│             │                           │              │
│             ▼                           ▼              │
│    SqliteLedgerBackend      TigerBeetleLedgerBackend   │
│   (LEDGER_BACKEND=SQLITE_DEV) (LEDGER_BACKEND=TIGERBEETLE)
│             │                           │              │
│             ▼                           ▼              │
│       better-sqlite3             tigerbeetle-node      │
└─────────────┼───────────────────────────┼──────────────┘
              │                           │
              │                           │ TCP (Binary Protocol)
              │                           ▼
              │              ┌───────────────────────────┐
              │              │   TigerBeetle Cluster     │
              │              │  (Replicas 0, 1, 2)       │
              │              │  VSR View 1 (Consensus)   │
              │              └───────────────────────────┘
              ▼
    /data/ledger.db (Dev only)
```

---

## 3. Explicit Backend Selection Contract

The `ILedgerBackend` interface decouples storage drivers from the HTTP routing tier:

```typescript
export interface ILedgerBackend {
  readonly backendType: 'SQLITE_DEV' | 'TIGERBEETLE';
  init(): Promise<void>;
  getAccount(accountRef: string): Promise<LedgerAccountRow | null>;
  getBalance(accountRef: string): Promise<BalanceResult | null>;
  createPendingTransfer(params: {
    requestId: string;
    debitAccountRef: string;
    creditAccountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
  }): Promise<PendingTransferResult>;
  postTransfer(transferIdOrUuid: string): Promise<PostTransferResult>;
  voidTransfer(transferIdOrUuid: string, reason: string): Promise<VoidTransferResult>;
  getTransfer(transferIdOrUuid: string): Promise<LedgerTransferRow | null>;
  close(): Promise<void>;
}
```

### Backend Modes:
1. **`SQLITE_DEV`**: In-memory or file-backed SQLite database providing high-fidelity double-entry emulation for offline development and local unit testing.
2. **`TIGERBEETLE`**: Native distributed consensus driver connecting to the 3-replica Viewstamped Replication cluster (`tigerbeetle-0:3001`, `tigerbeetle-1:3001`, `tigerbeetle-2:3001`).

---

## 4. Native TigerBeetle Two-Phase Commit Lifecycle

### 4.1 Native 128-bit ID Determinism (Decision D15 & D20)

TigerBeetle requires all account and transfer identifiers to be 128-bit unsigned integers (`u128`).

- **Account Mapping:** Alphanumeric account references (e.g., `ACC_101`) are hashed via SHA-256 with the lower 128 bits extracted:
  $$\text{u128} = \text{BigInt}(\text{0x} + \text{SHA256}(\text{account\_ref})[0..32])$$
- **Pending Transfer Mapping:** Incoming UUIDv4 transaction request IDs are stripped of hyphens and parsed directly as big-endian hex strings:
  $$\text{u128} = \text{BigInt}(\text{0x} + \text{UUIDv4}.\text{replace}(/-/g, ''))$$
- **Resolution Transfer Mapping (Decision D20):** Two-phase settlements (`POST` or `VOID`) generate deterministic resolution transfer IDs:
  $$\text{res\_id} = \text{BigInt}(\text{0x} + \text{SHA256}(\text{pending\_id} + ":" + \text{POST/VOID})[0..32])$$
  *Benefit:* Guarantees idempotency and permits lossless distributed recovery even if the local adapter process crashes during resolution.

### 4.2 Two-Phase Settlement Flow

1. **Baseline Seeding:**
   - Account `BANK_TREASURY` (`1n`) created with `AccountFlags.none`.
   - Customer `ACC_101` created with `AccountFlags.debits_must_not_exceed_credits` (Strict zero-overdraft enforcement).
   - Payee accounts (`PAYEE_CESC_001`, `PAYEE_TATA_POWER_001`) created with zero initial balance.
   - Initial funding transfer seeds ₹1,00,000 (10,000,000 paise) from `BANK_TREASURY` to `ACC_101`.

2. **Stage 1 (Pending Transfer):**
   - Flag: `TransferFlags.pending = 2`
   - Timeout: `120s`
   - TigerBeetle increments `debits_pending` on the debit account.
   - `liquid_balance = credits_posted - (debits_posted + debits_pending)`.
   - Payee account balances remain unchanged.

3. **Stage 2A (Post Settlement):**
   - Flag: `TransferFlags.post_pending_transfer = 4`
   - Linked to `pending_id`.
   - TigerBeetle decrements `debits_pending`, increments `debits_posted` on the customer account, and increments `credits_posted` on the payee account atomically.

4. **Stage 2B (Void Cancellation):**
   - Flag: `TransferFlags.void_pending_transfer = 8`
   - Linked to `pending_id`.
   - TigerBeetle clears `debits_pending`, restoring liquid funds to the customer account with zero transfer to the payee.

---

## 5. Fail-Closed Invariant (Decision D19)

When `LEDGER_BACKEND=TIGERBEETLE` is set:
- If the cluster cannot be reached or throws a consensus error, `LedgerAdapterApp` responds with:
  - HTTP `503 Service Unavailable`
  - Body: `{"error": "Ledger cluster error", "reason_code": "CLUSTER_UNAVAILABLE"}`
- Under no circumstance does the service silently divert transactions to SQLite.

---

## 6. Verification & Test Metrics

```
Test Suites: 6 passed, 6 total
Tests:       81 passed, 81 total (100% passing)
Snapshots:   0 total
Time:        5.284 s
Ran all test suites in 4 projects:
  - packages/core-schema
  - packages/bank-gate
  - packages/ledger-adapter
  - packages/witness
```
