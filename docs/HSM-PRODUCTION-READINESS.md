# Hardware Security Module (HSM) Production Readiness & Integration Guide

## 1. Classification of Cryptographic Providers

AgentGuard AI maintains a clear boundary between development abstractions, test fixtures, and production cryptographic engines.

| Component | Status | Target Environment | Description |
|---|---|---|---|
| `SoftwareKmsProvider` | **Implemented & Tested** | Development / Staging / Controlled Environments | In-memory and SQLite-backed asymmetric key management using Node.js `crypto.KeyObject`. Private keys are encapsulated and not exported via APIs, but reside in process memory. |
| `MockHsmProvider` | **Mocked / Simulated** | Automated Testing Only | Simulates PKCS#11 slot authentication and hardware-enforced non-exportability. **Hard-locked against execution in production (`NODE_ENV === 'production'`)**. |
| `Pkcs11HsmProvider` | **Integration-Ready Interface** | Enterprise Production | Provider interface for PKCS#11 hardware cryptographic tokens (AWS CloudHSM, Thales Luna, Nitrokey HSM). Fails closed if hardware slot or PIN is unavailable; forbids silent software fallback. |
| Cloud KMS Adapters (AWS/GCP/Azure) | **Architectural Specification** | Cloud-Native Enterprise | Interfaces defined in `KmsProviderTypeSchema` (`AWS_KMS`, `GCP_KMS`, `AZURE_KEYVAULT`). |

---

## 2. Invariants & Guardrails

### A. Strict Production Lockout on Mock HSM
`MockHsmProvider` contains an immutable constructor barrier:
```typescript
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'CRITICAL_SECURITY_VIOLATION: MockHsmProvider is strictly test-only and cannot be instantiated in production.'
  );
}
```
Any deployment attempting to run with `MockHsmProvider` under `NODE_ENV=production` immediately crashes the process on startup.

### B. No Silent Software Fallback
If a production deployment configures `KMS_BACKEND=PKCS11_HSM` or `AWS_KMS`:
- If the hardware slot is unreachable,
- If the PIN authentication fails,
- If the session token expires or disconnects,
The system **FAILS CLOSED**. It throws an unrecoverable `HSM_SIGNING_FAILURE` error and refuses to mint permits. Under no circumstance does the gateway silently revert to generating or using software keys.

### C. Non-Exportable Private Keys
Neither `SoftwareKmsProvider` nor `Pkcs11HsmProvider` expose private key material:
- `getPublicKey()` returns only public SPKI PEM and metadata.
- `exportJwks()` returns only RFC 7517 public coordinates (`x`).
- Private keys cannot be extracted via REST endpoints.

---

## 3. Production Deployment Checklist for HSM

Before declaring production operational readiness with a physical HSM or CloudHSM:

1. **Hardware & Driver Provisioning**:
   - Install vendor-certified PKCS#11 dynamic library (`/usr/lib/libsofthsm2.so`, `/opt/cloudhsm/lib/libcloudhsm_pkcs11.so`, or Thales Luna equivalent).
   - Ensure the operating system user running the Gateway process has access permissions to the cryptographic device path (`/dev/hsm*` or UNIX socket).

2. **Credential Management**:
   - Store PKCS#11 User PIN in secure memory or inject via Kubernetes secret (`KMS_HSM_PIN`).
   - Restrict slot admin PIN to institutional key custodians.

3. **Key Generation in Hardware**:
   - Generate root Ed25519 signing keypair directly on the token with `CKA_PRIVATE = TRUE` and `CKA_EXTRACTABLE = FALSE`.
   - Ensure key handles are referenced by persistent label (`hsm_label`).

4. **Multi-Instance Quorum & Dual Control**:
   - Key generation and emergency revocation procedures must follow dual-custodian authorization (M-of-N operational policy).

5. **Disaster Recovery & Backup**:
   - Ensure token cloning / M-of-N backup cards are synchronized according to institutional backup schedules.
