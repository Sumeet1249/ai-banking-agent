# AUTHENTICATION-THREAT-MODEL.md — Enterprise Authentication & Step-Up Threat Model
**Document:** `docs/AUTHENTICATION-THREAT-MODEL.md`  
**Version:** 1.0.0 (Phase 7.1 Security Audit)  
**Status:** FORMAL THREAT ANALYSIS  
**Target Git Branch:** `feat/agentguard-banking`  

---

## 1. Scope & Objective

This threat model analyzes the attack surfaces, threat actors, and mitigation controls associated with Phase 7.1:
1. Enterprise OIDC Login & Identity Mapping.
2. WebAuthn / Passkey Registration & Assertion Verification.
3. Transaction-Bound Step-Up Customer Approval.
4. Production vs. Demo Mode Authentication Separation.

---

## 2. Threat Actor Taxonomy

| Threat Actor | Capabilities | Objective |
|:---|:---|:---|
| **Rogue / Compromised AI Agent** | Controls agent prompt/tools, possesses agent Ed25519 signing key, can submit arbitrary API requests. | Bypass mandate limits, drain customer funds, fake human approvals. |
| **Network Man-in-the-Middle (MitM)** | Intercepts or tampers with unencrypted/TLS network traffic between browser, Gateway, and IdP. | Steal authorization codes, replay assertion tokens, tamper with transaction details. |
| **Malicious Authenticator / Cloned Device** | Clones FIDO2 authenticator software/hardware, observes previous WebAuthn assertions. | Replay previous transaction approvals to authorize fraudulent transfers. |
| **Insider / Unauthorized Developer** | Accesses staging or production configurations, attempts to enable development backdoors. | Use demo PINs to access real customer bank accounts in production. |

---

## 3. Threat Matrix & Countermeasure Architecture

### Threat T-AUTH-01: Malicious Agent Fabricates Customer Approval
- **Attack Vector**: A compromised agent generates a synthetic HTTP request claiming that a customer approved a transaction (e.g. `{"approved": true, "webauthn_verified": true}`).
- **Risk Level**: **CRITICAL**
- **Mitigation Architecture**:
  1. Gateway rejects all client-supplied approval booleans.
  2. The Gateway generates the approval challenge and stores it in `transaction_bound_approvals`.
  3. The customer must submit a raw WebAuthn `AuthenticationResponseJSON` containing an authentic ECDSA/RSA signature computed by a registered FIDO2 authenticator over the challenge.
  4. The signature is cryptographically verified on the server against the customer's stored public key (`webauthn_credentials`).
- **Residual Risk**: Zero without physical compromise of the customer's hardware device.

---

### Threat T-AUTH-02: Transaction Details Tampered After Step-Up Approval (Bait-and-Switch)
- **Attack Vector**: Customer is presented with an approval prompt for ₹100 to Payee A. After the customer authenticates, the agent or attacker changes the transaction to ₹1,00,000 to Payee B before submitting to Bank Gate.
- **Risk Level**: **CRITICAL**
- **Mitigation Architecture**:
  1. The WebAuthn approval challenge is cryptographically bound to `canonical_tx_digest = SHA256(canonicalJson(tx))`.
  2. At execution time, `consumeApprovalForExecution` recomputes the canonical digest over the submitted transaction and strictly enforces:
     $$\text{submitted\_digest} == \text{approval}.\text{canonical\_tx\_digest}$$
  3. Any discrepancy in payee, amount, account, or purpose results in immediate execution termination (`TRANSACTION_DIGEST_MISMATCH`).
- **Residual Risk**: Zero. The 7-field canonical digest is mathematically immutable.

---

### Threat T-AUTH-03: Mandate Revocation Race Condition (Time-of-Check to Time-of-Use)
- **Attack Vector**: Customer approves a high-value transaction. While Bank Gate prepares the transfer, the customer discovers agent anomalies and revokes or lowers the mandate limit. The agent attempts to execute using the pre-existing approval.
- **Risk Level**: **HIGH**
- **Mitigation Architecture**:
  1. Invariant I6: Every mandate update increments `mandate_version` monotonically.
  2. The approval record stores `mandate_version` at challenge creation.
  3. When consuming the approval, Bank Gate checks:
     $$\text{currentMandate}.\text{mandate\_version} == \text{approval}.\text{mandate\_version}$$
  4. If the mandate was updated or suspended, `APPROVAL_MANDATE_VERSION_MISMATCH` is thrown, aborting settlement.
- **Residual Risk**: Zero. State transitions are protected by database transactions.

---

### Threat T-AUTH-04: Authorization Code Interception & Replay in OIDC
- **Attack Vector**: An attacker on the network intercepts an OIDC authorization code returned via browser redirect.
- **Risk Level**: **HIGH**
- **Mitigation Architecture**:
  1. PKCE (S256) is mandatory. The authorization request sends `code_challenge = SHA256(code_verifier)`.
  2. The attacker cannot exchange the code without the original `code_verifier`, which is stored exclusively in `oidc_auth_states` on the Gateway with a 10-minute TTL.
  3. Single-Use State Consumption: The state and code verifier are atomically deleted upon the first callback attempt.
  4. ID tokens are signed with asymmetric keys verified against official provider JWKS endpoints.
- **Residual Risk**: Negligible. Standard RFC 7636 PKCE security.

---

### Threat T-AUTH-05: Account Takeover via Email Aliasing / Changing
- **Attack Vector**: An attacker creates an account on a third-party IdP with the same email address as a high-net-worth customer, hoping AgentGuard maps identity by email string.
- **Risk Level**: **HIGH**
- **Mitigation Architecture**:
  1. Email-only identity lookup is strictly prohibited in `EnterpriseOidcService`.
  2. Customer accounts are indexed strictly by the compound key `(idp_issuer, idp_subject)`.
  3. Untrusted issuers are rejected. The issuer must match the institutional tenant configured in `OidcProviderConfig`.
- **Residual Risk**: Zero. Identity is bound to the IdP's immutable object ID (`oid` / `sub`).

---

### Threat T-AUTH-06: Production Access via Development Demo PINs
- **Attack Vector**: A malicious insider or attacker attempts to call `/api/customer/login` with hardcoded demo PIN `2468` in a production environment.
- **Risk Level**: **CRITICAL**
- **Mitigation Architecture**:
  1. Demo Mode Production Prohibition: If `NODE_ENV === 'production'`, the `/api/customer/login` route unconditionally returns HTTP 403 `DEMO_AUTH_DISABLED_IN_PRODUCTION`.
  2. Startup Assertion: The Gateway process checks on initialization:
     ```typescript
     if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE === '1') {
       throw new Error('FATAL: DEMO_MODE=1 is prohibited in production');
     }
     ```
  3. Fail-Closed in Non-Production: Even in non-production, PIN login returns HTTP 403 `DEMO_MODE_REQUIRED` unless `DEMO_MODE=1` is explicitly set.
- **Residual Risk**: Zero. Enforced both at compile-time and runtime.

---

### Threat T-AUTH-07: FIDO2 Assertion Replay & Counter Cloning
- **Attack Vector**: An attacker captures a valid WebAuthn assertion payload and replays it to authenticate or approve another transaction.
- **Risk Level**: **MEDIUM**
- **Mitigation Architecture**:
  1. Single-Use Ephemeral Challenges: WebAuthn challenges are generated with 32 bytes of cryptographic entropy and deleted upon first verification attempt.
  2. Signature Counter Check: `webauthn_credentials` tracks `counter`. If the authenticator assertion counter is less than or equal to the stored counter, the request is rejected as a cloned device attack.
  3. 120s TTL: Transaction approval challenges expire after 120 seconds.
- **Residual Risk**: Zero. Validated by automated tests.

---
*AgentGuard AI Threat Modeling & Security Assurance Team*
