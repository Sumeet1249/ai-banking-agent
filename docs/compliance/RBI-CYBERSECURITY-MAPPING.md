# Reserve Bank of India (RBI) Cyber Resilience & Digital Payment Security Mapping
**System:** AgentGuard AI Banking Security Platform  
**Target Directives:** RBI Master Direction on Cyber Resilience and Payment Security Controls for Regulated Entities (Commercial Banks, NBFCs, and Payment Aggregators)  
**Scope:** AI-Agent Banking Intermediation, Autonomous Execution Guardrails, Key Infrastructure, and Audit Provenance.  
**Status:** Architectural and Technical Control Implementation Verified.  
*Disclaimer: This document establishes architectural and code-level alignment with RBI Cyber Resilience directives. Formal deployment into an RBI-regulated bank requires internal audit, VAPT certification, and compliance sign-off by the Chief Information Security Officer (CISO).*

---

## 1. Executive Summary

Autonomous AI agents introduce unprecedented operational risks to digital payment networks: velocity manipulation, mandate exhaustion, rapid overdraft attacks, and hallucinated instructions. AgentGuard AI acts as the institutional **Security Control Layer** specified under RBI Cyber Resilience standards, preventing autonomous agents from initiating unauthorized fund transfers across NEFT, RTGS, IMPS, or UPI backends.

---

## 2. RBI Control Requirements & Technical Mapping

### Section A: Governance & Architecture Segregation

| RBI Directive | Regulatory Mandate | AgentGuard Technical Implementation | Verification Source |
|---|---|---|---|
| **Para 4.1: Segregation of Duties & DMZ Separation** | Financial execution systems must maintain strict architectural separation from customer-facing or automated processing layers. | **Gateway vs. Bank Gate Separation:** The Gateway handles mandate checks, anomaly detection, and permit issuance. The Bank Gate handles cryptographic verification, nonce locking, and ledger settlement. The Bank Gate maintains a zero-trust posture toward the Gateway. | `packages/bank-gate/src/services/bank-gate.ts`<br>`packages/gateway-mcp/src/services/permit-engine.ts` |
| **Para 4.3: Real-Time Nonce & Anti-Replay Guard** | Payment instructions must incorporate non-repeatable identifiers to prevent replay attacks across distributed networks. | **Single-Use UUIDv4 Nonces:** Every permit issued contains a cryptographically unique nonce. Bank Gate atomically consumes nonces in an execution ledger; replaying a previously executed or in-flight nonce yields immediate rejection (`NONCE_ALREADY_USED`). | `packages/bank-gate/src/services/permit-verifier.ts`<br>`packages/bank-gate/src/__tests__/bank-gate.test.ts` |
| **Para 4.5: Fail-Closed Default Posture** | Any anomalous event, cryptographic error, or subsystem failure must terminate the transaction without balance mutation. | **Fail-Closed Execution:** All errors in signature verification, tenant mismatch, ledger connectivity, or clock drift immediately abort settlement and record an audit event. | `packages/bank-gate/src/services/bank-gate.ts`<br>`packages/ledger-adapter/src/services/ledger-adapter.ts` |

---

### Section B: Customer Mandate Management & Instant Revocation

| RBI Directive | Regulatory Mandate | AgentGuard Technical Implementation | Verification Source |
|---|---|---|---|
| **Para 7.2: E-Mandate Limit Enforcement** | Standing mandates and automated payment permissions must enforce granular single-transaction and cumulative velocity caps. | **Integer-Paise Limits:** Mandates specify `single_transfer_max_paise` and `daily_limit_paise`. All internal financial math strictly uses integers (paise) to prevent IEEE 754 floating-point inaccuracies. | `packages/core-schema/src/banking/index.ts`<br>`packages/gateway-mcp/src/__tests__/customer-mandates.test.ts` |
| **Para 7.4: Immediate Mandate Revocation** | Customers must possess real-time capability to revoke automated mandates, with zero propagation delay to downstream engines. | **Real-Time Revocation:** Revoking a mandate updates the database state immediately (`REVOKED`). Subsequent agent requests against the mandate are denied at the Gateway policy boundary before permit issuance. | `packages/gateway-mcp/src/services/permit-engine.ts`<br>`packages/gateway-mcp/src/__tests__/customer-mandates.test.ts` |
| **Para 7.6: Payee Category Whitelisting** | Automated agents must be constrained to explicit authorized beneficiary categories or accounts. | **Beneficiary Restrictions:** Mandates enforce `allowed_payee_categories` and optional exact account whitelisting. Transfers to non-whitelisted entities trigger hard rejection. | `packages/core-schema/src/banking/index.ts`<br>`packages/gateway-mcp/src/__tests__/customer-mandates.test.ts` |

---

### Section C: Human-in-the-Loop & Multi-Factor Authentication (MFA)

| RBI Directive | Regulatory Mandate | AgentGuard Technical Implementation | Verification Source |
|---|---|---|---|
| **Para 8.1: Additional Factor of Authentication (AFA)** | High-value or anomalous transactions must require dynamic, out-of-band customer authentication. | **ASK Escalation Decision:** Transactions exceeding standard thresholds or exhibiting behavioral anomalies trigger an `ASK` decision, requiring human step-up authorization. | `packages/gateway-mcp/src/services/permit-engine.ts`<br>`packages/gateway-mcp/src/__tests__/permit-security.test.ts` |
| **Para 8.3: Dynamic Transaction Linking (What You See Is What You Sign)** | MFA challenges must be cryptographically bound to the specific amount, payee, and transaction purpose. | **Transaction-Bound WebAuthn:** WebAuthn assertion challenge is computed as the SHA-256 digest of the canonical transaction payload: `SHA-256(tenant_id \| mandate_id \| amount_paise \| payee \| nonce)`. Altering any field invalidates the assertion. | `packages/gateway-mcp/src/services/permit-engine.ts`<br>`docs/TRANSACTION-BOUND-APPROVAL.md` |

---

### Section D: Key Management, Cryptographic Standards & HSMs

| RBI Directive | Regulatory Mandate | AgentGuard Technical Implementation | Verification Source |
|---|---|---|---|
| **Para 11.2: Hardware Security Module (HSM) Enclosure** | Production cryptographic signing keys must reside within FIPS 140-2 Level 3 or CC EAL4+ certified HSMs. | **KMS Abstraction & Production Lockout:** `KmsProvider` interface cleanly decouples cryptographic operations. Production deployments mandate `Pkcs11HsmProvider`. Test-only `MockHsmProvider` is rejected in `NODE_ENV=production`. | `packages/gateway-mcp/src/crypto/kms-provider.ts`<br>`docs/HSM-PRODUCTION-READINESS.md` |
| **Para 11.4: Key Rotation Without Service Interruption** | Cryptoperiod transitions must avoid service interruption while rejecting unauthorized signatures from retired keys. | **Grace Period Protection:** Rotation provides a 180-second transition window. Permits issued after the key's retirement timestamp are rejected (`permit.issued_at <= key.retired_at`). | `packages/bank-gate/src/services/trusted-keyring.ts`<br>`packages/bank-gate/src/__tests__/keyring-rotation.test.ts` |
| **Para 11.5: Emergency Key Revocation** | Compromised signing keys must be instantly revokable across all verification nodes. | **Zero-Delay Revocation Sync:** Authoritative `GET /api/v1/keys/revocations` endpoint with `no-cache, no-store` headers enables Bank Gate nodes to synchronize and invalidate verification key caches immediately. | `packages/gateway-mcp/src/api/keys.ts`<br>`packages/bank-gate/src/services/trusted-keyring.ts` |

---

### Section E: Tamper-Evident Audit Trails & Fraud Monitoring

| RBI Directive | Regulatory Mandate | AgentGuard Technical Implementation | Verification Source |
|---|---|---|---|
| **Para 13.1: Immutable Audit Trail** | All payment decisions, modifications, and settlements must be preserved in a tamper-evident audit store. | **Independent Witness Service:** Standalone service maintains append-only hash chains using Ed25519 signatures. Emits periodic Merkle checkpoints for external verification. | `packages/witness/src/services/witness-service.ts`<br>`packages/witness/src/__tests__/witness.test.ts` |
| **Para 13.4: Behavioral Anomaly Detection** | Real-time monitoring must flag velocity spikes, unusual hours (IST), and rapid micro-transfers. | **Banking Anomaly Detector:** Built-in heuristics evaluate transaction velocity, transfer amounts against baseline, and off-hour transaction patterns (e.g., late-night IST anomaly triggers). | `packages/gateway-mcp/src/detectors/banking-anomaly-detector.ts` |
| **Para 13.7: Cryptographic Proof of Settlement** | Settlement transactions must produce cryptographic receipts verifiable by external auditors. | **Dual-Signed Ledger Receipts:** Every executed transaction links the Gateway permit signature with the TigerBeetle / PostgreSQL ledger transfer receipt. | `packages/bank-gate/src/services/bank-gate.ts`<br>`packages/ledger-adapter/src/services/ledger-adapter.ts` |

---

## 3. Operational Deployment Checklist for Indian Banks

1. **Deployment Architecture:** Deploy Bank Gate and Witness in isolated VPCs or internal banking subnets. Expose only the Gateway to AI agent orchestration environments.
2. **HSM Integration:** Bind `Pkcs11HsmProvider` to an on-premise Thales Luna, Entrust nShield, or AWS CloudHSM instance.
3. **Database Security:** Enable PostgreSQL Row-Level Security and strict TLS 1.3 connectivity with mutual authentication (mTLS).
4. **Clock Synchronization:** Bind all host instances to an authoritative NTP stratum-1 time source to maintain clock drift well within the 5,000ms validation tolerance.
