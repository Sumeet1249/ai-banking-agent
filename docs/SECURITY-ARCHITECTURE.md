# AGENTGUARD AI — SECURITY ARCHITECTURE & THREAT MODEL

**Target Standard**: Banking-Grade Autonomous AI Security  
**Invariants**: I1 – I9  
**Engineering Rules**: E1 – E8  

---

## 1. Threat Vectors Addressed

| Threat Vector | Attack Scenario | AgentGuard Defense | Invariant |
|---|---|---|---|
| **Prompt Injection** | LLM persuaded by untrusted prompt to wire ₹100,000 to an attacker | Hard category pool limit and sub-agent per-tx limit reject amount; fails closed into human-in-the-loop (ASK). | I2, I8 |
| **Merchant Spoofing** | Attacker claims utility payee status using self-asserted metadata | ISO 18245 MCC dictionary requires Tier 1/2 evidence; Tier 4/5 defaults to UNVERIFIED and fails closed. | I2, I8 |
| **Gateway Bypass** | Attacker attempts to hit Bank Gate execute endpoint directly | Bank Gate rejects any transaction lacking an Ed25519-signed 22-field Transaction-Bound Permit (TBP). | I1 |
| **Replay Attack** | Attacker intercepts a valid permit and replays it to drain funds | Permits enforce a 90-second TTL and unique single-use cryptographic nonces consumed atomically. | I6 |
| **Sub-Agent Privilege Escalation** | Child bot attempts to assign itself higher budget or bypass parent limits | Child allocations cannot exceed parent pool monthly ceilings; blocked categories override allowed categories. | I7 |
| **Audit Log Tampering** | Attacker attempts to alter SQLite history or delete evidence of spend | SHA-256 hash chains + RFC 6962 Merkle batching with independent Witness cosigning (:5000) detect any alteration. | I9 |

---

## 2. Invariants I1–I9 Technical Enforcement

- **I1 (No Gateway Bypass)**: Verified in `permit-verifier.ts`. Permitted transactions require detached Ed25519 public-key signature match and 7-field SHA-256 transaction digest equality.
- **I2 (Hard Rules First & Final DENY)**: Evaluated in `category-budget-store.ts`. `blocked_categories` array is evaluated prior to checking `allowed_categories`. A hard DENY never escalates to ASK.
- **I3 (Restricted ASK & Trusted Consent)**: AI explanations never constitute consent. Only cryptographically verified WebAuthn/Passkey signatures authorize escalated transactions.
- **I4 (Atomic Daily Budgets — Reserve Once)**: Category capacity is reserved atomically once at permit issuance (`RESERVED -> SETTLED`). No double reservation.
- **I5 (Exact vs. Uncertain Duplicates)**: Reusing an idempotency key with an altered transaction digest triggers an immediate hard rejection (`IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD`).
- **I6 (Single-Use & Continuous Revocation)**: Parent and child agent statuses are checked dynamically at reservation and execution. Suspended or revoked entities cannot transact.
- **I7 (Strict Sub-Agent Delegation)**: Child agent limit validated against parent pool monthly cap at creation and runtime.
- **I8 (Fail-Closed DEFER & Honest Claims)**: Unhandled exceptions return `DEFER`. Technical documentation accurately describes mitigation: *"limits the financial damage of a successful prompt injection to what the customer authorized"*.
- **I9 (Independent Tamper-Evident Audit)**: Audit events hashed under RFC 6962 domain separation (`0x00` leaf, `0x01` node) and anchored to Witness (:5000).

---

## 3. Engineering Rules E1–E8 Compliance

- **E1**: All monetary calculations execute strictly in **INTEGER PAISE** (₹1 = 100 paise). Zero floating-point arithmetic.
- **E2**: Timestamps are 64-bit integer UTC milliseconds since Unix epoch. Timezone conversions strictly employ IANA identifiers (`Asia/Kolkata`).
- **E3**: Clock dependency injection (`Clock` interface) utilized across all security evaluators to allow deterministic test vectors.
- **E4**: Architectural layer isolation: Bank Gate contains zero permit signing keys; Cockpit and Gateway contain zero TigerBeetle client code.
- **E5**: Agent endpoints accept only Ed25519-signed requests; Customer endpoints accept PIN/session credentials.
- **E6**: Demo routes and override headers disabled unless `DEMO_MODE=1`.
- **E7**: Zero external CDN dependencies in Compliance Cockpit; runs entirely self-contained offline.
- **E8**: Technical architecture and pitch deck slides contain zero vendor buzzwords or library fluff.
