# DECISIONS.md — Architecture & Design Decisions

## D1: Three-Process Separation
**Decision**: Gateway (:8080), Bank Gate (:4000), and Witness (:5000) run as three independent processes.
**Rationale**: The gateway holds the Ed25519 private key for signing permits but NEVER touches account balances or the ledger. The bank gate holds the public key ONLY and manages the financial ledger. The witness holds its own independent Ed25519 key pair. Compromise of one process cannot forge permits AND drain funds.

## D2: SQLite with BEGIN IMMEDIATE for Gateway State
**Decision**: Gateway uses SQLite (better-sqlite3) with `BEGIN IMMEDIATE` transactions for all state mutations.
**Rationale**: Ensures serializable writes for permit issuance, budget reservations, and audit log entries within a single atomic transaction. WAL mode provides concurrent read access for the cockpit dashboard.

## D3: Integer Paise, Never Floats (E1)
**Decision**: All monetary values are stored and computed as INTEGER paise throughout the entire stack.
**Rationale**: IEEE 754 floating-point arithmetic introduces rounding errors in financial calculations. ₹5,000.00 = 500000 paise. Comparisons use integer math: `amount * 100 >= 85 * limit` instead of `amount >= 0.85 * limit`.

## D4: Injected Clock (E3)
**Decision**: Security rules receive a `Clock` interface (`{ now(): number }`) rather than calling `Date.now()` directly.
**Rationale**: Makes all time-dependent security logic deterministic and testable. Demo mode can inject a pinned clock. UNUSUAL_HOURS_IST detection uses the clock, never agent-supplied timestamps.

## D5: Permit-First, Not Token-First
**Decision**: The gateway issues a cryptographically signed, single-use Transaction-Bound Permit (TBP) rather than a reusable access token.
**Rationale**: Each permit is bound to exactly one transaction (7-field payload hash), one agent, one mandate version, one account. It cannot be replayed, reused, or repurposed. The bank gate atomically consumes it.

## D6: Hard Rules Before Behavioral Monitoring (I2)
**Decision**: The evaluation pipeline runs validation → identity → mandate → budget pre-check → invoice check → duplicate check BEFORE any behavioral/anomaly scoring.
**Rationale**: Hard DENYs (malformed request, revoked mandate, exceeded limits) must never be overridden by behavioral scoring or customer approval. This is a security invariant, not a performance optimization.

## D7: ASK is Not ALLOW (I3)
**Decision**: ASK suspends execution and requires explicit customer consent via PIN-authenticated session. The gateway never auto-approves.
**Rationale**: Behavioral signals (unusual hours, high ratio, velocity burst) indicate risk but not certainty. Only the customer can authorize risky-but-valid transactions. AI-generated explanations inform but never constitute consent.

## D8: Reservation TTL > Permit TTL (I4)
**Decision**: Budget reservations live 120s; permits live 90s. The reservation outlives the permit.
**Rationale**: If a permit expires before the bank processes it, the reservation can be released cleanly. If the bank times out, the reservation stays PENDING_RECONCILIATION until manual or automatic reconciliation.

## D9: Fail-Closed DEFER (I8)
**Decision**: Any unhandled exception, database failure, or gateway timeout returns DEFER (not DENY, not ALLOW).
**Rationale**: DEFER signals "we cannot evaluate this request safely" without permanently blocking the agent. No permit is issued. The agent or customer can retry after the system recovers.

## D10: Independent Witness Cosigning (I9)
**Decision**: The Witness service (:5000) runs as a separate process with its own Ed25519 key pair and independently cosigns audit checkpoints.
**Rationale**: Even if the gateway is fully compromised, the witness's independent hash chain and signatures provide a second source of truth. Merkle inclusion proofs from the witness can verify or refute gateway audit claims.

## D11: No External CDN Dependencies (E7)
**Decision**: The `/banking` UI loads zero external scripts, fonts, stylesheets, or images.
**Rationale**: The demo must function with Wi-Fi disabled. All assets are bundled. This also eliminates supply-chain attack vectors through CDN compromise.

## D12: ESLint Import Boundaries (E4)
**Decision**: ESLint rules enforce that `packages/agentguard-bank/**` cannot import permit issuers or private keys, and `packages/gateway-mcp/**` cannot import `tigerbeetle-node`.
**Rationale**: Compile-time enforcement of the three-process security boundary. A developer cannot accidentally cross the trust boundary.

## D13: Existing Codebase as Foundation
**Decision**: Build the banking payment firewall on top of the existing AgentGuard gateway infrastructure rather than starting from scratch.
**Rationale**: The existing gateway already provides SQLite + better-sqlite3, Express server infrastructure, policy engine, detector pipeline, audit logging with hash chains, witness service skeleton, approval workflows, and a Next.js cockpit. We extend and specialize rather than rewrite.

