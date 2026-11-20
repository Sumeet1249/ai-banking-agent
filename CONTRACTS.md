# CONTRACTS.md — Frozen Schemas, Endpoints & Fixtures

## 1. Canonical PaymentRequest (Signed by Agent)
{
  "request_id": "uuid-v4",
  "agent_id": "AGENT_ELEC_01",
  "customer_ref": "CUST_101",
  "mandate_id": "MND_ELEC_101",
  "account_ref": "ACC_101",
  "action": "bill_payment",
  "purpose": "electricity_bill",
  "payee_id": "PAYEE_CESC_001",
  "amount_paise": 240000,
  "currency": "INR",
  "invoice_ref": "INV-1001",
  "timestamp_ms": 1795000000000,
  "approval_ref": null,
  "task_ref": null,
  "agent_signature": "jws-eddsa-over-canonicalJson-without-agent_signature"
}

## 2. Canonical Transaction Digest (7 fields — `payload_hash`)
SHA-256 hex over canonicalJson({
  account_ref, action, amount_paise, currency, invoice_ref, payee_id, purpose
})

## 3. Permit v1 Signed Payload (22 fields + detached `signature`)
{
  "permit_version": "1",
  "customer_ref": "CUST_101",
  "agent_id": "AGENT_ELEC_01",
  "delegation_ref": "sha256(canonicalJson([agent_id, parent_agent_id_or_null, mandate_id, mandate_version]))",
  "mandate_id": "MND_ELEC_101",
  "mandate_version": 1,
  "account_ref": "ACC_101",
  "action": "bill_payment",
  "purpose": "electricity_bill",
  "amount_paise": 240000,
  "currency": "INR",
  "payee_id": "PAYEE_CESC_001",
  "invoice_ref": "INV-1001",
  "request_id": "uuid-v4",
  "permit_id": "uuid-v4",
  "nonce": "uuid-v4",
  "payload_hash": "64-hex-sha256",
  "policy_version": "policy-v1",
  "reservation_id": "uuid-v4",
  "issued_at": 1795000000000,
  "expires_at": 1795000090000,
  "approval_ref": null
}
Envelope: { "permit": <22 fields>, "signature": "jws-eddsa" }

## 4. TTL Constants
- Request freshness: ±60,000 ms
- Permit TTL: 90,000 ms (90 s)
- Reservation TTL: 120,000 ms (120 s)  [strictly >= Permit TTL]
- Approval TTL: 600,000 ms (10 min)

## 5. Fixed Reason Codes
- Gateway DENY: MALFORMED_REQUEST, INVALID_AMOUNT, INVALID_CURRENCY, UNKNOWN_AGENT, INVALID_SIGNATURE, STALE_REQUEST, REQUEST_ID_REUSE_MISMATCH, AGENT_SUSPENDED, AGENT_EXPIRED, SUBAGENT_SCOPE_EXCEEDED, PARENT_REVOKED, MANDATE_NOT_FOUND, MANDATE_REVOKED, MANDATE_EXPIRED, ACCOUNT_MISMATCH, ACTION_NOT_PERMITTED, PURPOSE_MISMATCH, UNKNOWN_PAYEE, EXCEEDS_PER_TX_LIMIT, DAILY_LIMIT_EXCEEDED, UNKNOWN_INVOICE, INVOICE_AMOUNT_MISMATCH, INVOICE_PAYEE_MISMATCH, DUPLICATE_INVOICE_ALREADY_PAID, AGENT_TRUST_SUSPENDED, APPROVAL_INVALID_OR_EXPIRED.
- Bank DENY: MISSING_PERMIT, INVALID_PERMIT_SIGNATURE, UNSUPPORTED_PERMIT_VERSION, PAYLOAD_DIGEST_MISMATCH, IDENTITY_BINDING_MISMATCH, PERMIT_EXPIRED, MANDATE_REVOKED, MANDATE_VERSION_CHANGED, MANDATE_EXPIRED, AGENT_NOT_ACTIVE, INSUFFICIENT_FUNDS, PERMIT_ALREADY_CONSUMED, BUDGET_RESERVATION_LOST.
- DEFER: SECURITY_SERVICE_UNAVAILABLE.
- ASK Signals: HIGH_RATIO_PAYMENT (-120), UNUSUAL_HOURS_IST (-100), VELOCITY_BURST (-200), UNCERTAIN_DUPLICATE_PATTERN (-150), AEGIS_BEHAVIOR_DRIFT (-150), LIMIT_SPLITTING (-180), NEW_PAYEE_FOR_AGENT (-100), UNREGISTERED_TASK_REF (-150), TRUST_BELOW_500.

## 6. HTTP Endpoints
- Aegis Gateway (:8080):
  - GET  /health
  - GET  /api/v1/banking/permit-key
  - POST /api/agent/evaluate
  - GET  /api/agent/requests/:request_id
  - POST /api/customer/login                 (PIN "2468" -> HttpOnly cookie + CSRF token)
  - POST /api/customer/logout | GET /api/customer/me
  - GET/POST /api/customer/mandates | PATCH /api/customer/mandates/:id | POST /api/customer/mandates/:id/revoke
  - GET /api/customer/approvals | POST /api/customer/approvals/:ref
  - POST /api/customer/agents/:id/suspend | POST /api/customer/agents/:id/reactivate
  - GET /api/customer/ledger | POST /api/customer/reconcile/:reservation_id
  - GET /api/customer/audit | POST /api/customer/audit/verify
  - POST /api/demo/* (404 unless DEMO_MODE=1): reset, tamper, pin-hour, fault, run-scenario
- Bank Gate (:4000):
  - GET  /health
  - POST /execute                            ({ permitEnvelope, request })
  - POST /reconcile                          ({ reservation_id, outcome: "COMMIT" | "RELEASE" })
  - GET  /internal/ledger?epoch=<n>
  - POST /internal/reset-epoch               (DEMO_MODE=1 only -> { epoch })
- Witness (:5000):
  - GET  /health | GET /public-key | GET /checkpoints?epoch=<n>
  - POST /checkpoints                        ({ epoch, seq, event_hash, merkle_root? })
  - POST /epoch                              (DEMO_MODE=1 only)

## 7. Seed Fixtures
- Customer: CUST_101 | Account: ACC_101 | Balance: 10000000 paise (₹1,00,000) | PIN: 2468
- Agents: AGENT_ELEC_01 ("Electricity Assistant", trust 800), AGENT_BILL_VERIFY_01 (child, scope: ["bill_verify"], trust 800)
- Mandate: MND_ELEC_101 v1 | bill_payment / electricity_bill | PAYEE_CESC_001, PAYEE_TATA_POWER_001 | 500000 paise/tx | 800000 paise/day | expiry = max(2026-12-31T23:59:59+05:30, now + 30 days)
- Historical Paid Bills (30–120d ago, PAYEE_CESC_001): 230000, 240000, 250000, 240000 paise (avg = 240000)
- Biller Invoices (OPEN, PAYEE_CESC_001):
  - INV-1001: 240000 (J-2 ALLOW)
  - INV-1002: 490000 (ASK scene)
  - INV-1003: 30000  (Tamper & replay scene)
  - INV-1004: 40000  (Revocation-race scene)
  - INV-1005: 600000 (Over per-tx cap DENY)
  - INV-1006: 245000 (Uncertain duplicate ASK after INV-1001)
  - INV-1007: 500000 (Daily-split #1 -> ASK -> Approve -> Settle)
  - INV-1008: 500000 (Daily-split #2 -> Hard DENY DAILY_LIMIT_EXCEEDED)
  - INV-1009..INV-1015: 100000 each (Velocity burst & 20x concurrency tests)
