# Phase 7.4.1: Key Lifecycle & Hardening Test Evidence

## 1. Test Reconciliation & Methodology

In earlier reports, summary totals varied slightly between aggregated package runs and individual suite counts due to overlapping workspace test selections. Below is the **exact, deduplicated, and verified reconciliation** across all testing targets in the monorepo.

### Test Execution Matrix

| Test Category | Exact Command | Suites | Unique Tests | Status |
|---|---|---|---|---|
| **Banking Substrate Regression** | `npm run test:banking` | 7 | 93 | **100% PASS** |
| **Gateway Banking Test Suites** | `npm --workspace @agentguard/gateway-mcp test src/__tests__/key-management-rotation.test.ts src/__tests__/tenant-isolation-rls.test.ts src/__tests__/enterprise-auth.test.ts src/__tests__/customer-mandates.test.ts src/__tests__/permit-security.test.ts` | 5 | 72 | **100% PASS** |
| **Full Monorepo Unique Total** | Deduplicated across packages | **12** | **165** | **100% PASS** |
| **TypeScript Compilation** | `npm --workspace @agentguard/core-schema run build` && `npm --workspace @agentguard/bank-gate run build` && `npm --workspace @agentguard/witness run build` && `npm --workspace @agentguard/ledger-adapter run build` && `npm --workspace @agentguard/gateway-mcp run build` | 5 workspaces | 0 errors | **100% PASS** |

---

## 2. Granular Breakdown by Test Suite

### A. Banking Substrate Regression (`npm run test:banking`) — 93 Tests

Command:
```bash
jest --projects packages/core-schema packages/bank-gate packages/ledger-adapter packages/witness
```

1. **`packages/core-schema/src/provenance.test.ts` (3 tests)**:
   - Merkle audit log schema validation
   - Cryptographic signature format enforcement
   - Schema round-trip parsing
2. **`packages/core-schema/src/banking/banking.test.ts` (10 tests)**:
   - 7-field canonical transaction digest computation (RFC 8785)
   - 22-field Transaction-Bound Permit (TBP) envelope schema
   - Mandatory integer paise boundaries (Rule E1)
   - KMS schema validation (KeyMetadata, KeyRotationEvent, KeyDestructionEvent, JwksResponse)
3. **`packages/witness/src/__tests__/witness.test.ts` (7 tests)**:
   - Autonomous Ed25519 keypair generation and isolation (Decision D17)
   - Monotonic epoch & sequence regression rejection
   - RFC 6962 Merkle tree consistency & inclusion proofs
   - Gateway checkpoint co-signing
   - Independent Witness key rotation (`rotateWitnessKey`) and audit history retention
4. **`packages/ledger-adapter/src/__tests__/ledger-adapter.test.ts` (24 tests)**:
   - u128 Big-Endian ID conversion for TigerBeetle accounts and transfers
   - Fail-Closed ledger backend selection (`TIGERBEETLE` vs `SQLITE_DEV`)
   - Two-phase commit transfer lifecycle (Pending 120s hold -> Post / Void)
   - Concurrency, overdraft protection, and balance reconciliation
5. **`packages/bank-gate/src/__tests__/keyring-rotation.test.ts` (10 tests)**:
   - Active key permit verification
   - Pre-retirement permit accepted during grace window
   - **CRITICAL**: Post-retirement permit strictly rejected with `PERMIT_ISSUED_AFTER_KEY_RETIREMENT`
   - Pre-activation permit rejected with `PERMIT_ISSUED_BEFORE_KEY_ACTIVATION`
   - Expired permit rejected with `PERMIT_EXPIRED`
   - Expired grace period rejected with `RETIRED_KEY_GRACE_EXPIRED`
   - Future-dated timestamps rejected with `PERMIT_ISSUED_IN_FUTURE`
   - Inflated permit TTL rejected with `PERMIT_TTL_EXCEEDS_MAXIMUM`
   - Multi-instance emergency revocation synchronization (`syncRevocations`)
   - RFC 7517 JWKS dynamic import
6. **`packages/bank-gate/src/__tests__/bank-gate.test.ts` (19 tests)**:
   - Single-use atomic nonce consumption and race condition prevention
   - Mandate version matching (Invariant I6)
   - 2-stage transfer execution against Ledger Adapter
   - Health and readiness endpoints
7. **`packages/bank-gate/src/__tests__/reconciliation.test.ts` (20 tests)**:
   - End-to-end financial reconciliation under network failures
   - Pending transfer expiration and automated voiding
   - Atomic state transitions to `SETTLED`

Subtotal: **93 passing tests**.

---

### B. Gateway Banking Test Suites (`packages/gateway-mcp`) — 72 Tests

Command:
```bash
npm --workspace @agentguard/gateway-mcp test \
  src/__tests__/key-management-rotation.test.ts \
  src/__tests__/tenant-isolation-rls.test.ts \
  src/__tests__/enterprise-auth.test.ts \
  src/__tests__/customer-mandates.test.ts \
  src/__tests__/permit-security.test.ts
```

1. **`key-management-rotation.test.ts` (20 tests)**:
   - Non-exportable private key custody
   - Active signing & tampering rejection
   - `MockHsmProvider` slot authentication in testing
   - **CRITICAL**: `MockHsmProvider` strictly forbidden in `NODE_ENV=production`
   - `Pkcs11HsmProvider` configuration validation & fail-closed error handling
   - Zero-downtime key rotation FSM (ACTIVE -> RETIRED -> REVOKED)
   - **CRITICAL**: Rejection of post-retirement permit verification in KMS
   - Emergency key revocation barrier
   - Active key destruction prevention
   - Legal hold key destruction barrier
   - Retention compliance window enforcement
   - Cryptographic zeroization and destruction digest generation
   - RFC 7517 JWKS export with `key_ops` and lifecycle state exclusion
   - Concurrent key rotation mutex prevention
   - REST API: `GET /api/v1/keys/jwks`
   - REST API: `GET /api/v1/keys/revocations` (Authoritative Revocation List with `no-cache`)
   - REST API: `GET /api/v1/keys/active`
   - REST API: `POST /api/v1/keys/rotate`
   - REST API: `POST /api/v1/keys/legal-hold`
   - REST API: `POST /api/v1/keys/destroy`
2. **`tenant-isolation-rls.test.ts` (16 tests)**:
   - Dual-backend contract parity (SQLite & PostgreSQL via `pg-mem`)
   - Strict tenant partitioning across customers, accounts, mandates, sessions, WebAuthn, approvals
   - Cross-tenant tampering and session hijacking prevention
   - Inbound tenant resolution and anti-spoofing middleware (`TENANT_MISMATCH`)
   - PostgreSQL RLS policy verification (`FORCE ROW LEVEL SECURITY`)
3. **`enterprise-auth.test.ts` (19 tests)**:
   - PKCE S256 OIDC authorization code flow
   - Cryptographic ID token signature verification
   - Issuer, audience, and nonce replay validation
   - WebAuthn passkey registration and multi-device management
   - Transaction-bound step-up customer approval (7-field canonical digest)
   - Demo mode fail-closed security (fails in production)
   - Session cookie security and namespace isolation
4. **`customer-mandates.test.ts` (11 tests)**:
   - Customer profile & account balance queries in integer paise
   - Mandate creation, version bumping, suspension, reactivation, and revocation
   - CSRF protection and session invalidation on logout
5. **`permit-security.test.ts` (6 tests)**:
   - 22-field signed permit minting
   - Ed25519 signature verification and payload tampering detection
   - Sub-agent delegation validation and cascading revocation
   - Single-use nonce minting and duplicate tracking

Subtotal: **72 passing tests**.

---

## 3. Total Monorepo Reconciliation

$$\text{Unique Tests} = 93 \text{ (Banking Substrate)} + 72 \text{ (Gateway Banking Suites)} = \mathbf{165 \text{ Unique Passing Tests}}$$
- **Passing Rate**: 100% (165/165)
- **Failing Tests**: 0
- **TypeScript Errors**: 0
