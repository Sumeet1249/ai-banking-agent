# Phase 2 — Security & Architecture Audit Review

**Document:** `docs/PHASE-2-SECURITY-REVIEW.md`  
**Target Branch:** `feat/agentguard-banking`  
**Status:** COMPLETED & AUDITED  

---

## 1. Executive Summary

Phase 2.1 through 2.3 establishes the Gateway Control Plane for banking agent evaluation. This review documents the verified runtime behavior following the Phase 2.3.1 corrective checkpoint.

## 2. Component Audits & Verifications

### 2.1 Customer Identity & Mandates (`banking-stores.ts`, `customer-auth.ts`, `customer.ts`)
- **Persistence & Seeding:** SQLite database stores customers, accounts (in integer paise), mandates, and sessions. Seeds baseline customer `CUST_101` and mandate `MND_ELEC_101`.
- **Mandate Versioning:** Mandate modifications automatically increment `mandate_version` (`mandate_version++`). Any previous permit referencing an older version is invalidated at execution.
- **Authentication & Namespace Isolation (Rule E5):** `/api/customer/*` requires a valid session token (via HttpOnly cookie or Bearer header) and CSRF token on mutating requests. Any request supplying agent credentials (`x-agent-signature`, `x-api-key`) is immediately rejected with HTTP 401 `CROSS_NAMESPACE_AUTH_REJECTED`.
- **Demo Fixture Isolation (Rule E6):** Static PIN login is gated by `DEMO_MODE=1` or `NODE_ENV !== 'production'`. Production deployments require enterprise IdP/SSO/WebAuthn.

### 2.2 Agent Identity & Delegation (`banking-agent-identity.ts`)
- **Ed25519 Detached Verification:** Agent requests are signed with agent Ed25519 private keys and verified against registered public keys using Node.js `crypto.verify(null, payloadBytes, pubKey, sig)`.
- **Recursive Cascading Revocation:** Delegation validation checks child limits, expiration, and recursively verifies the complete parent ancestry. If any parent agent is `SUSPENDED` or `REVOKED`, the sub-agent cannot act.
- **Namespace Isolation (Rule E5):** `/api/agent/*` explicitly rejects customer session cookies and CSRF tokens with HTTP 401.

### 2.3 Permit & Nonce Engine (`permit-engine.ts`, `agent-banking.ts`)
- **Authority Boundary:** Authoritative funds verification and ledger holds are strictly moved to Bank Gate (:4000) and Ledger Adapter (:4001). Gateway does not maintain a competing ledger.
- **Permit Schema & Expiry:** Mints strictly 22-field `TransactionBoundPermitPayload` with a 90-second TTL (`expires_at = issued_at + 90000`).
- **Signature Envelope:** Detached Ed25519 signature of the RFC 8785 canonical JSON string with explicit `gateway_key_id` and `algorithm: 'ed25519'`.
- **Replay Protection (T06):** Mints unique single-use UUIDv4 nonces tracked in SQLite.

---

## 3. Residual Risks & Next Steps

1. **Bank Gate Service (Phase 3.1):** Bank Gate on Port 4000 must independently verify the Ed25519 signature, recompute the 7-field canonical transaction digest, enforce mandate version matching, and atomically consume nonces.
2. **Ledger Adapter (Phase 3.2):** Integrates TigerBeetle 128-bit transfers (`transfer_id = BigInt('0x' + uuid.replace(/-/g, ''))`).
