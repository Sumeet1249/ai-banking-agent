# Phase 7.4.1: Enterprise KMS & Cryptographic Security Architecture Review

## 1. Executive Summary & Security Posture

Phase 7.4.1 represents a cryptographic and key lifecycle security hardening review for AgentGuard AI. It addresses the critical findings identified in the senior security audit of Phase 7.4, ensuring that:
1. **Retired Keys Cannot Authorize New Permits**: Fixed the grace period vulnerability where an attacker possessing a retired key could sign fresh permits. Bank Gate now binds the permit's signed `issued_at` against the key's exact retirement time (`retired_at`).
2. **Emergency Key Revocation Across Instances**: Implemented authoritative Key Revocation Lists (`KeyRevocationList`), immediate Bank Gate instance revocation sync (`syncRevocations`), cache invalidation, and fail-closed evaluation during network anomalies.
3. **Hardware Security Module (HSM) vs. Software Delineation**: Removed ambiguous claims of hardware certification. Enforced a production lockout on `MockHsmProvider` (`NODE_ENV === 'production'`), defined explicit fail-closed requirements for PKCS#11 hardware providers, and forbade silent software fallback.
4. **Key Lifecycle FSM & Auditable Destruction**: Added complete `PENDING_DESTRUCTION -> DESTROYED` state transitions, enforcing legal hold checks (`legal_hold`), retention period verification (`retention_until`), grace period expiration, memory zeroization, and cryptographic destruction digests.
5. **Regulatory & Compliance Alignment**: Formally clarified technical control alignment without claiming premature PCI-DSS or RBI certification.

---

## 2. Cryptographic Architecture & Lifecycle FSM

```
                     ┌───────────────────────────────────────────────┐
                     │              KMS / HSM Engine                 │
                     │  (SoftwareKmsProvider / Pkcs11HsmProvider)    │
                     └───────────────────────┬───────────────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             [1. Provision Active Key]                    [2. Key Rotation]
                       │                                           │
                       ▼                                           ▼
              ┌─────────────────┐                        ┌─────────────────┐
              │     ACTIVE      │──────(Rotate Key)─────>│     RETIRED     │
              │ (Sign & Verify) │                        │ (Verify In-Flight│
              └────────┬────────┘                        │  Only: issued_at│
                       │                                 │  <= retired_at) │
                       │                                 └────────┬────────┘
                       │ (Emergency Revocation)                   │ (Retention Expired)
                       ▼                                          ▼
              ┌────────────────────────────────────────────────────────────┐
              │                          REVOKED                           │
              │  (Immediate Global Block: Signing & Verification Denied)   │
              └────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ (Scheduled Destruction)
                                       ▼
              ┌────────────────────────────────────────────────────────────┐
              │                    PENDING_DESTRUCTION                     │
              │  (Subject to Legal Hold & Mandatory Retention Compliance)  │
              └────────────────────────┬───────────────────────────────────┘
                                       │
                                       │ (Legal Hold Verified = False & Retention Satisfied)
                                       ▼
              ┌────────────────────────────────────────────────────────────┐
              │                         DESTROYED                          │
              │ (Zeroized Memory Buffers, Hardware Handles Purged, Digest) │
              └────────────────────────────────────────────────────────────┘
```

---

## 3. Resolution of Critical Security Findings

### A. Resolution: Retired-Key Post-Retirement Signing Vulnerability

#### The Vulnerability
Previously, the verification condition for a retired key checked only:
$$\text{now} \le \text{retired\_at} + \text{grace\_period\_ms}$$
This allowed a window where an attacker who obtained the private key of a retired key could sign brand-new permits within the 180s grace window.

#### The Hardening
In [`permit-verifier.ts`](file:///S:/trail/AGENTGUARD-AI/packages/bank-gate/src/services/permit-verifier.ts) and [`trusted-keyring.ts`](file:///S:/trail/AGENTGUARD-AI/packages/bank-gate/src/services/trusted-keyring.ts), the verification logic was re-architected:
1. **Signed Timestamp Binding**: Bank Gate parses the signed canonical permit payload and extracts `validatedPayload.issued_at`.
2. **Pre-Retirement Invariant**:
   $$\text{validatedPayload.issued\_at} \le \text{entry.retiredAt}$$
   If `issued_at > entry.retiredAt`, the permit is rejected immediately with:
   `PERMIT_ISSUED_AFTER_KEY_RETIREMENT`.
3. **Grace Period Invariant**:
   $$\text{now} \le \text{entry.retiredAt} + \text{entry.gracePeriodMs}$$
   If expired, rejected with `RETIRED_KEY_GRACE_EXPIRED`.
4. **Permit TTL Invariant**:
   $$\text{validatedPayload.expires\_at} \le \text{now}$$
   If expired, rejected with `PERMIT_EXPIRED`.
5. **Clock Skew Invariant**:
   $$\text{validatedPayload.issued\_at} \le \text{now} + 5000\text{ ms}$$
   Future-dated permits are rejected with `PERMIT_ISSUED_IN_FUTURE`.
6. **Maximum Permit Lifetime**:
   $$(\text{validatedPayload.expires\_at} - \text{validatedPayload.issued\_at}) \le 90000 + 5000\text{ ms}$$
   Inflated TTL permits are rejected with `PERMIT_TTL_EXCEEDS_MAXIMUM`.

---

### B. Resolution: Multi-Instance Emergency Revocation Synchronization

#### The Problem
Gateway revoking a key does not protect against a Bank Gate cluster if Bank Gate instances retain stale in-memory cached key states.

#### The Hardening
1. **Authoritative Revocation List (`KeyRevocationList`)**:
   Gateway exposes `GET /api/v1/keys/revocations` serving an authoritative list of all revoked key IDs, revocation timestamps, reasons, and operators.
   Header: `Cache-Control: no-cache, no-store, must-revalidate`.
2. **Multi-Instance Sync (`syncRevocations`)**:
   Bank Gate instances ingest authoritative revocation events via `keyring.syncRevocations(revocations)`.
   Upon ingestion, any matching key is transitioned to `REVOKED`, and `activeKeyId` is dropped if it matched.
3. **Restart Persistence**:
   Bank Gate persists revoked key entries to durable storage (`bank_gate_store`). Upon process restart, revoked keys are loaded first into the trust store, preventing stale recovery.
4. **Fail-Closed on Unverified State**:
   If an incoming permit envelope references an unknown or unverified key ID, Bank Gate rejects execution with `UNKNOWN_SIGNING_KEY_ID`.

---

### C. Resolution: Hardware Security Module (HSM) vs. Mock Boundaries

#### The Problem
Using `MockHsmProvider` in development created a false impression of hardware-backed protection.

#### The Hardening
1. **Production Lockout**:
   ```typescript
   if (process.env.NODE_ENV === 'production') {
     throw new Error('CRITICAL_SECURITY_VIOLATION: MockHsmProvider is strictly test-only and cannot be instantiated in production.');
   }
   ```
2. **Fail-Closed PKCS#11 Integration**:
   `Pkcs11HsmProvider` enforces that module paths, slot IDs, and PIN credentials must be present. If hardware communication fails or sessions disconnect, it throws `HSM_SIGNING_FAILURE` and **fails closed**. Silent fallback to software keys is explicitly prevented.
3. **Capability Classification**:
   - `SoftwareKmsProvider`: **Implemented & Tested (Development / Controlled Staging)**
   - `MockHsmProvider`: **Mocked / Simulated (Test Harness Only)**
   - `Pkcs11HsmProvider`: **Integration-Ready Interface (Awaiting Hardware Staging Environment)**

---

### D. Resolution: Cryptographic Key Destruction & Legal Hold Safeguards

#### The Problem
Keys marked `PENDING_DESTRUCTION` did not have verifiable destruction guards or legal hold protections.

#### The Hardening
1. **Active Key Protection**:
   Attempting to destroy an `ACTIVE` key throws `Cannot destroy an ACTIVE key; key must be RETIRED or REVOKED`.
2. **Legal Hold Enforcement**:
   Keys flagged with `legal_hold: true` cannot be destroyed. Throws:
   `Cannot destroy key: key is placed under an active legal hold.`
3. **Mandatory Retention Period**:
   Keys with `retention_until` cannot be destroyed until wall-clock time exceeds `retention_until`.
4. **Grace Period Invariant**:
   Retired keys cannot be destroyed until their 180s grace period has expired.
5. **Memory Zeroization & Destruction Digest**:
   Private key references in memory are cleared (`entry.privateKey = undefined`). Status transitions to `DESTROYED`. A SHA-256 cryptographic destruction digest is generated and recorded in an immutable `KeyDestructionEvent`.

---

### E. Resolution: RFC 7517 JWKS Policy & Key Discovery

1. **Compliant Key Parameters**:
   - `kid`: Stable UUID-based key identifier.
   - `kty`: `'OKP'`
   - `crv`: `'Ed25519'`
   - `use`: `'sig'`
   - `key_ops`: `['verify']`
   - `alg`: `'EdDSA'`
2. **Exclusion of Sensitive States**:
   `exportJwks()` strictly excludes `REVOKED` and `DESTROYED` keys.
3. **No Private Key Material**:
   JWKS responses contain only public coordinates (`x`).

---

## 4. Compliance & Regulatory Claim Correction

### Formal Position
> **AgentGuard implements technical controls designed to support cryptographic key-management and cybersecurity requirements. Formal PCI DSS (Requirements 3.5, 3.6, 3.7) or RBI (2026 Commercial Banks Cybersecurity, Technology, Risk, Resilience and Assurance Directions, updated Oct 1, 2026) compliance has not been established; applicability mapping, operational evidence, independent assessment, and institutional approval remain necessary.**

Reference Standards:
- **PCI DSS v4.0**: Requirements 3.5 (Key Protection), 3.6 (Key Management Lifecycle), 3.7 (Operational Procedures).
- **RBI Master Directions**: *2026 Commercial Banks Cybersecurity, Technology, Risk, Resilience and Assurance Directions* (Updated Oct 1, 2026).
