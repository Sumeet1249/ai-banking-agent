# Phase 7.4: Enterprise Key Management, KMS/HSM Integration & Key Lifecycle

## Executive Summary

Phase 7.4 elevates AgentGuard AI from static local signing keypairs to an institutional-grade **Enterprise Key Management System (KMS)** and **Hardware Security Module (HSM)** architecture. It satisfies PCI-DSS v4.0 Requirement 3.5/3.6, RBI Cyber Security Framework Annex-1, and banking application security requirements by establishing:

1. **Provider-Neutral KMS Abstraction (`KmsProvider`)**: Abstract interface supporting Software KMS, AWS KMS, Azure Key Vault, Google Cloud KMS, and PKCS#11 Hardware Security Modules.
2. **Non-Exportable Key Custody**: Private cryptographic handles are strictly encapsulated within `KeyObject` memory structures or hardware modules; no private key material is ever leaked to API responses, logs, or databases.
3. **Zero-Downtime Key Rotation FSM**: Keys transition through `ACTIVE -> RETIRED -> REVOKED`. An active key rotation generates a new Ed25519 keypair while preserving a 180-second (3-minute) grace window for in-flight permits signed just prior to rotation.
4. **Emergency Revocation Barrier**: Compromised keys are immediately transitioned to `REVOKED`, instantly blocking all subsequent permit minting and causing Bank Gate to reject any permit signed with the compromised key.
5. **Multi-Key Verification Keyring (`TrustedKeyring`) in Bank Gate**: Bank Gate verifies incoming permits across active and retired keys (within the grace window), strictly enforcing expiration cutoffs and rejection of revoked keys.
6. **RFC 7517 Public JWKS Distribution**: Gateway serves `GET /api/v1/keys/jwks`, enabling dynamic, standards-compliant key discovery and automated trust store synchronization.
7. **Independent Witness Key Rotation**: Witness maintains autonomous Ed25519 co-signing keypairs and historical audit records, strictly obeying Rule E4 process separation.

---

## 1. Architectural Architecture & Key Lifecycle FSM

```
                  ┌────────────────────────────────────────┐
                  │                 KMS                    │
                  │  (Software / AWS KMS / PKCS#11 HSM)   │
                  └──────────────────┬─────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
            [1. Provision New]              [2. Rotate Key]
                     │                               │
                     ▼                               ▼
            ┌─────────────────┐             ┌─────────────────┐
            │     ACTIVE      │──(Rotate)──>│     RETIRED     │
            │ (Signs & Verifs)│             │ (Verify in Grace│
            └────────┬────────┘             │  Window: 180s)  │
                     │                      └────────┬────────┘
                     │ (Emergency)                   │ (Grace Expired /
                     ▼                               ▼  Compromise)
            ┌─────────────────────────────────────────────────┐
            │                     REVOKED                     │
            │   (Immediately Blocked: No Signing, No Verify)  │
            └─────────────────────────────────────────────────┘
```

### Key Lifecycle States

| State | Allowed Operations | Description |
|---|---|---|
| `ACTIVE` | Signing & Verification | The primary key used to mint new Transaction-Bound Permits (TBP). Exactly one active key exists per purpose. |
| `RETIRED` | Verification Only | Key transitioned during rotation. Valid for verification during a 180s grace window (2x permit TTL) to settle in-flight permits. |
| `REVOKED` | None | Emergency containment status. Immediately blocked from both signing and verification. |

---

## 2. Core Implementation Components

### A. Core Schema (`packages/core-schema/src/banking/kms-schema.ts`)
- `KeyStatusSchema`: `'ACTIVE' | 'RETIRED' | 'REVOKED' | 'PENDING_DESTRUCTION'`
- `KeyPurposeSchema`: `'PERMIT_SIGNING' | 'WITNESS_CHECKPOINT' | 'AGENT_IDENTITY' | 'SESSION_ENCRYPTION'`
- `KeyMetadataSchema`: Public key metadata (algorithm: Ed25519, `public_key_pem`, timestamps, grace period, provider type).
- `KeyRotationEventSchema`: Cryptographic rotation audit log (`previous_key_id`, `new_key_id`, `rotated_at`, `grace_period_expires_at`, `operator`, `reason`).
- `KeyRevocationEventSchema`: Immutable emergency containment event record.
- `JwksResponseSchema`: RFC 7517 compliant JWKS payload with `kty: "OKP"`, `crv: "Ed25519"`, and public coordinate `x`.

### B. Gateway KMS Provider (`packages/gateway-mcp/src/crypto/kms-provider.ts`)
- `KmsProvider` Interface:
  - `sign(keyId, data)` & `signSync(keyId, data)`
  - `verify(keyId, data, signature)`
  - `getActiveKey(purpose)`
  - `rotateKey(purpose, reason, operator)`
  - `revokeKey(keyId, reason, operator)`
  - `exportJwks(purpose)`
- `SoftwareKmsProvider`: In-memory and persisted non-exportable `KeyObject` encapsulation.
- `MockHsmProvider`: Hardware security module simulation with PIN slot authentication and hardware-enforced non-exportability.

### C. Bank Gate Multi-Key Keyring (`packages/bank-gate/src/services/trusted-keyring.ts`)
- Manages trusted Gateway public keys without importing Gateway private keys (Rule E4).
- `resolveKeyForVerification(keyId, timestamp)`:
  - Returns `isUsable: true` if `ACTIVE`.
  - Returns `isUsable: true` if `RETIRED` and `now <= retiredAt + gracePeriodMs`.
  - Returns `isUsable: false` with reason `RETIRED_KEY_GRACE_EXPIRED` if grace period elapsed.
  - Returns `isUsable: false` with reason `REVOKED_SIGNING_KEY_ID` if revoked.
- `importFromJwks(jwks)`: Dynamically ingests public keys from Gateway JWKS endpoint.

### D. Gateway Key Management REST API (`packages/gateway-mcp/src/api/keys.ts`)
Mounted at `/api/v1/keys`:
- `GET /api/v1/keys/jwks`: RFC 7517 public JWKS endpoint (cacheable, excludes revoked keys).
- `GET /api/v1/keys/active`: Returns metadata of the currently active signing key.
- `GET /api/v1/keys/list`: Lists all keys with lifecycle states (public metadata only).
- `POST /api/v1/keys/rotate`: Admin endpoint triggering zero-downtime rotation.
- `POST /api/v1/keys/revoke`: Security officer endpoint for emergency revocation.

### E. Independent Witness Key Lifecycle (`packages/witness/src/services/witness-service.ts`)
- `rotateWitnessKey(reason)`: Rotates Witness Ed25519 co-signing key.
- Retains prior public keys in durable `witness_key_history` configuration for historic checkpoint validation.

---

## 3. Security Invariants Enforced

1. **Non-Exportability of Private Keys**: Private key objects are never serialized or exported over public APIs. Public endpoints return only `public_key_pem` and RFC 7517 JWK `x` coordinates.
2. **In-Flight Grace Window (180s)**: Banking permits have a strict 90s TTL. Key rotation provides a 180s grace window ($2 \times \text{TTL}$), guaranteeing in-flight permits issued immediately prior to rotation settle cleanly without transient failures.
3. **Immediate Containment on Revocation**: Revoking a key immediately drops it from active signing and invalidates any permit signed by that key, even if its permit TTL has not expired.
4. **Isolated Witness Custody (Rule E4)**: Bank Gate and Witness maintain independent keychains and never access Gateway private keys.

---

## 4. Test Verification Suite

| Test Suite | File | Tests | Coverage |
|---|---|---|---|
| Bank Gate Keyring & Rotation | `packages/bank-gate/src/__tests__/keyring-rotation.test.ts` | 6 tests | Active key validation, zero-downtime grace window, grace expiry rejection, emergency revocation, JWKS dynamic import, unknown key rejection |
| Gateway KMS & API Integration | `packages/gateway-mcp/src/__tests__/key-management-rotation.test.ts` | 15 tests | Non-exportable custody, Mock HSM PIN auth, rotation FSM, revocation barrier, JWKS export, PermitEngine integration, REST API endpoints |
| Witness Key Rotation | `packages/witness/src/__tests__/witness.test.ts` | 6 tests | Autonomous key generation, rotation, and audit history preservation |
| Banking Test Suite | `npm run test:banking` | 88 tests | End-to-end regression across all banking packages |
| Gateway Banking Suite | `npm --workspace @agentguard/gateway-mcp test` | 66 tests | Key management, tenant isolation, enterprise auth, customer mandates, permit security |

**Total Verified Tests**: 154 passing tests, 0 TypeScript errors.
