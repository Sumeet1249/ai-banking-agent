# DECISION-LOG.md — Architecture & Security Decision Addendum
**Document:** `docs/DECISION-LOG.md`  
**Version:** 1.0.0 (Phase 1.5 Governance Checkpoint)  
**Status:** APPROVED DECISIONS  
**Target Git Branch:** `feat/agentguard-banking`  

*This document supplements `DECISIONS.md` (D1–D13) with decisions formalized during Phase 1 architecture reconciliation, threat modeling, and schema contract design. It does not overwrite or duplicate existing decisions.*

---

## D14: RFC 8785 (JSON Canonicalization Scheme) for 7-Field Transaction Digest
- **Context:** The 7-field canonical transaction digest (`payload_hash`) binds customer intent to permit authorization and execution across multiple programming languages (TypeScript, Python SDK, Go SDK). Unambiguous canonicalization is required to avoid signature and digest verification failures caused by key sorting, whitespace, or Unicode escaping.
- **Decision:** Adopt strict RFC 8785 JSON Canonicalization Scheme (JCS) semantics for serializing the 7 canonical transaction fields:
  `["account_ref", "action", "amount_paise", "currency", "invoice_ref", "payee_id", "purpose"]`.
- **Formal Test Vector:**
  ```json
  {"account_ref":"ACC_101","action":"bill_payment","amount_paise":240000,"currency":"INR","invoice_ref":"INV-1001","payee_id":"PAYEE_CESC_001","purpose":"electricity_bill"}
  ```
  - UTF-8 Byte Length: `173 bytes`
  - SHA-256 Digest: `b566a992326ebc84abb6c1e5ffbc66794233e303694cf3acf34a50a37a585330`
- **Consequences:** All SDKs and services produce bit-for-bit identical digests. Verified identical in Node.js `crypto`, Python `hashlib`, and Go `crypto/sha256`.

---

## D15: UUIDv4 to TigerBeetle 128-Bit (`u128`) Transfer ID Mapping
- **Context:** AgentGuard transactions use standard RFC 4122 UUIDv4 strings for `request_id`, whereas TigerBeetle natively indexes transfers and accounts by unsigned 128-bit integers (`u128`).
- **Decision:** Deterministically map UUIDv4 to TigerBeetle `u128` by parsing the 16 raw binary bytes of the UUIDv4 into a Big-Endian 128-bit unsigned integer (or BigInt in JavaScript):
  ```typescript
  export function uuidToUint128(uuidStr: string): bigint {
    const hex = uuidStr.replace(/-/g, '');
    return BigInt('0x' + hex);
  }
  ```
- **Consequences:** Ensures a 1:1, collision-free, deterministic mapping between the Gateway `request_id` and the immutable TigerBeetle transfer ID. A repeated `request_id` mapped to the same `u128` will be rejected by TigerBeetle as an idempotent duplicate or `transfer_exists`, strictly preventing duplicate financial debits.

---

## D16: Separation of Health Liveness vs. Readiness Probes
- **Context:** Process health checks (`GET /health`) returning HTTP 200 may mask underlying database locks or downstream ledger disconnects.
- **Decision:** All services expose distinct liveness and readiness semantics:
  - `GET /health` (Liveness): Validates that the HTTP process event loop is active and listening.
  - `GET /health/ready` or `status: "degraded"` in payload (Readiness): Actively validates connectivity to SQLite (WAL mode read test) and TigerBeetle cluster consensus. If a dependency is offline, the readiness check returns HTTP 503, instructing load balancers and the Gateway to route traffic away or enter `DEFER` mode.
- **Consequences:** Prevents requests from entering a service that is alive as a process but incapable of committing state.

---

## D17: Standalone Witness Process & Storage Isolation
- **Context:** The Gateway previously contained an embedded witness skeleton (`services/witness.ts`). If the Gateway process or database (`agentguard.db`) is compromised, co-signing guarantees are nullified.
- **Decision:** The Witness service (`packages/witness`) runs on Port `5000` as an entirely autonomous OS process with its own dedicated SQLite database (`witness.db`) and its own independent Ed25519 keypair.
- **Consequences:** Physical and cryptographic isolation. Even complete administrative compromise of the Gateway host cannot fabricate Witness co-signatures over tampered audit records.

---

## D18: Separation of Signed Payload from Signature Envelope
- **Context:** Confusion between the 22 fields of the signed permit payload and the envelope metadata (signatures, key IDs) can lead to malleability vulnerabilities.
- **Decision:** The signed payload (`TransactionBoundPermitPayloadSchema`) contains strictly the 22 canonical fields defined in `CONTRACTS.md`. The transport envelope (`PermitEnvelopeSchema`) encapsulates:
  ```json
  {
    "permit": { /* exact 22 fields */ },
    "signature": "base64url-detached-eddsa-signature",
    "key_id": "sha256-prefix-of-gateway-pubkey",
    "algorithm": "Ed25519"
  }
  ```
- **Consequences:** Signature verification is performed strictly over `canonicalJson(envelope.permit)`, eliminating any risk of envelope field tampering or signature wrapping attacks.


---

## D19: Explicit Ledger Backend Selection Contract & TigerBeetle Cluster Infrastructure
- **Context:** AgentGuard AI is transitioning from a local SQLite double-entry protocol emulation to a native distributed TigerBeetle cluster. In financial systems, automatic or silent fallback between disjoint ledgers during an outage leads to permanent balance divergence, double-spend vulnerabilities, and audit trail fragmentation.
- **Decision:**
  1. **Strictly Explicit Configuration:** The Ledger Adapter selects its storage backend strictly through the environment variable `LEDGER_BACKEND: SQLITE_DEV | TIGERBEETLE`.
  2. **Fail-Closed Semantics in Production:** When `LEDGER_BACKEND=TIGERBEETLE`, the service must fail its readiness probe and reject transactions if TigerBeetle cluster quorum is unreachable. Under no circumstance will the service silently degrade or route transactions to SQLite.
  3. **Audit-Isolated Development Mode:** `SQLITE_DEV` is strictly a development and unit-testing mode. Production deployments must fail startup if `LEDGER_BACKEND=SQLITE_DEV`.
  4. **Native 3-Replica VSR Consensus:** In Docker Compose, TigerBeetle runs as a 3-replica Viewstamped Replication cluster (`tigerbeetle-0`, `tigerbeetle-1`, `tigerbeetle-2`) bound to static IPv4 addresses (`172.28.0.2`, `.3`, `.4`) on subnet `172.28.0.0/16` with `seccomp:unconfined` for Linux `io_uring` support.
  5. **Separate Persistent Storage:** Each replica possesses its own isolated persistent Docker volume (`tb-data-0`, `tb-data-1`, `tb-data-2`). Automatic file recreation on startup is prohibited; formatting is explicitly performed once via `scripts/tigerbeetle-init.ps1` or `.sh`.
- **Consequences:** Eliminates any risk of ledger split-brain or divergent financial histories. Guarantees deterministic Viewstamped Replication consensus before financial transactions are posted.


---

## D20: Deterministic Resolution IDs for Two-Phase Commit Crash Recovery
- **Context:** In TigerBeetle, two-phase commit resolution transfers (`post_pending_transfer` or `void_pending_transfer`) require their own unique 128-bit unsigned integer transfer IDs linked to `pending_id`. If resolution transfer IDs are generated randomly (e.g. from random UUIDs), a crash or network partition during resolution can cause the adapter to lose track of whether a resolution was posted, or attempt to post multiple conflicting resolution IDs upon restart.
- **Decision:** Resolution transfer IDs are deterministically derived from the pending transfer ID and resolution action:
  $$\text{resolution\_id} = \text{BigInt}(\text{0x} + \text{SHA256}(\text{pending\_id} + ":" + \text{ACTION})[0..32])$$
  where $\text{ACTION} \in \{\text{"POST"}, \text{"VOID"}\}$.
- **Consequences:**
  1. Complete idempotency: repeated resolution attempts submit identical IDs, which TigerBeetle safely handles via its `CreateTransferStatus.pending_transfer_already_posted` / `already_voided` status codes.
  2. Stateless recovery: upon process restart, the adapter checks TigerBeetle's immutable log directly for `post_res_id` and `void_res_id` without requiring an external recovery coordinator or metadata database.

---

## D21: Provider-Neutral Enterprise OIDC & Transaction-Bound WebAuthn Step-Up Approval Binding
- **Context:** Financial institutions and enterprise customers cannot rely on development-grade PIN logins for customer authentication, nor can high-value transactions execute based solely on autonomous agent permits without cryptographic human step-up authorization. Furthermore, standard WebAuthn assertion prompts do not prove transaction comprehension unless cryptographically bound to the canonical transaction intent.
- **Decision:**
  1. **Hybrid Identity Architecture:**
     - Enterprise authentication relies on provider-neutral OIDC (supporting Microsoft Entra ID, Okta, Keycloak) using Authorization Code Flow with PKCE (S256).
     - Cryptographic ID token verification is performed server-side via `jose` against live JWKS endpoints (with strict `iss`, `aud`, `exp`, `nbf`, and `nonce` checks).
     - Customer identity mapping is bound strictly to the immutable `(idp_issuer, idp_subject)` tuple. Email-only identity lookup is strictly prohibited to prevent account takeover via email re-assignment.
  2. **FIDO2 / WebAuthn Hardware Passkeys:**
     - Multi-device passkey registration and assertion using `@simplewebauthn/server` and `@simplewebauthn/browser`.
     - Raw client public keys and signature counters are persisted in SQLite/PostgreSQL with replay detection (`counter > stored_counter`).
     - Rejection of client-side assertion trust: client booleans (e.g. `webauthn_verified: true`) are rejected. All signatures are cryptographically verified by public key.
  3. **Strict Transaction-Bound Step-Up Approval:**
     - Step-up customer approval challenges are cryptographically bound to the exact 7-field RFC 8785 canonical transaction digest: `SHA256(canonicalJson(tx))`.
     - Invariant I6 Enforcement: If the customer mandate version bumps between challenge creation and execution, the approval is invalidated (`APPROVAL_MANDATE_VERSION_MISMATCH`).
     - Digest Invariant: If any transaction parameter (account_ref, action, amount_paise, currency, invoice_ref, payee_id, purpose) changes, execution is blocked (`TRANSACTION_DIGEST_MISMATCH`).
     - Atomic Single-Use Consumption: Transitioning `APPROVED` -> `CONSUMED` is atomic; replay attempts are rejected immediately.
  4. **Fail-Closed Demo Mode Guard:**
     - PIN login is completely prohibited in production (`NODE_ENV=production`).
     - In non-production, PIN login fails closed unless `DEMO_MODE=1` is explicitly set. Gateway startup throws a fatal error if `NODE_ENV=production` and `DEMO_MODE=1` co-exist.
- **Consequences:** Eliminates credentials leakage and session hijacking risks. Guarantees non-repudiable customer step-up authorization for high-risk autonomous transactions while preserving Invariants I1–I9 and Rules E1–E8.
