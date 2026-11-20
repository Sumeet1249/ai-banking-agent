# AGENTS.md — AgentGuard AI Non-Negotiable Rules

Read AGENTS.md, DECISIONS.md, CONTRACTS.md, and REPO_MAP.md before every edit.
Never edit this file.

## Security Invariants (I1–I9)
- I1 (No Gateway Bypass): Bank Gate (:4000) rejects any payment lacking a valid Ed25519-signed 22-field Transaction-Bound Permit (TBP).
- I2 (Hard Rules First & Final DENY): Validation, identity, mandate rules, read-only daily pre-check, biller invoice check, and exact-duplicate checks execute BEFORE behavioral monitoring. A hard DENY can never become ASK or be approved by a customer.
- I3 (Restricted ASK & Trusted Consent): Only eligible, in-scope risky transactions escalate to ASK. AI-generated explanations never constitute customer consent.
- I4 (Atomic Daily Budgets — Reserve Once): Daily caps (Asia/Kolkata day) are pre-checked read-only in hard rules, then reserved atomically ONCE at permit issuance (RESERVED -> COMMITTED at bank). Never reserve twice. Expired permits release reservations; uncertain bank timeouts stay PENDING_RECONCILIATION.
- I5 (Exact vs. Uncertain Duplicates): Paid invoice_ref + same request_id returns idempotent prior receipt. Paid or active-permit invoice_ref + different request_id returns DENY (never ASK). Similar amount (±5%) to same payee within 24h raises an ASK signal.
- I6 (Single-Use & Continuous Revocation): Bank Gate (:4000) verifies detached Ed25519 signature (public key only), 7-field SHA-256 payload digest, identity bindings, permit TTL (90s <= 120s reservation TTL), live mandate status/version, live agent/parent status, available balance, and atomically consumes permit (ISSUED -> CONSUMED, changes === 1) + reservation (RESERVED -> COMMITTED, changes === 1).
- I7 (Strict Sub-Agent Delegation): Child agents cannot exceed parent scope or expiry. Suspending or revoking a parent suspends/revokes all children in the same DB transaction.
- I8 (Fail-Closed DEFER & Honest AI Claims): Any unhandled exception, DB failure, or gateway timeout returns DEFER and issues no permit. Wording everywhere: "limits the financial damage of a successful prompt injection to what the customer authorized" — never "blocks prompt injection".
- I9 (Independent Tamper-Evident Audit): SHA-256 hash-chained audit events are written inside the same BEGIN IMMEDIATE transaction as state changes, logged to Aegis's Merkle transparency log, and cosigned by independent Witness (:5000) with its own Ed25519 key.

## Engineering Rules (E1–E8)
- E1: All money is INTEGER paise (e.g., ₹5,000 = 500000). Zero floats anywhere in gateway/bank/anomaly math (use `amount * 100 >= 85 * limit`).
- E2: All timestamps are INTEGER UTC epoch milliseconds. IST is used strictly for daily bucketing (`kolkataDay`) and display.
- E3: Never call `Date.now()` or `new Date()` directly inside security rules; always use the injected `Clock`. Never trust an agent-supplied timestamp for UNUSUAL_HOURS_IST.
- E4: ESLint MUST block `packages/agentguard-bank/**` from importing permit issuers or private keys, AND MUST block `packages/gateway-mcp/**` and the Next.js Cockpit from importing `tigerbeetle-node`.
- E5: Agent routes (`/api/agent/*`) accept only Ed25519-signed requests; Customer routes (`/api/customer/*`) accept only PIN session cookie + CSRF token. Cross-namespace credentials MUST return HTTP 401.
- E6: All `/api/demo/*` routes and fault/time override headers MUST return HTTP 404 or be ignored unless `DEMO_MODE=1`.
- E7: Zero external CDN scripts, fonts, or images on `/banking`; full demo must run with Wi-Fi disabled.
- E8: Pitch deck slides and mock-ups must contain zero programming languages, frameworks, libraries, or repo/vendor names.
