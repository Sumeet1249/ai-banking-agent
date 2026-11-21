# AgentGuard Trust Intelligence — TI-8: Adversarial Evaluation Report

## 25 Adversarial Test Vectors
All 25 attack vectors pass in `packages/agent-trust/src/__tests__/adversarial-evaluation.test.ts`.

| Vector # | Attack Category | Scenario Description | Policy Verdict | Containment State | Result |
|---|---|---|---|---|---|
| Vector 1 | Cryptographic | Forged/Corrupted Ed25519 signature | DENY | RESTRICT | PASS |
| Vector 2 | Anti-Replay | Duplicate nonce replay attack | DENY | RESTRICT | PASS |
| Vector 3 | Temporal | Timestamp skew > 90 seconds (past/future) | DENY | RESTRICT | PASS |
| Vector 4 | Identity | Unregistered agent ID invocation | DENY | REVOKE | PASS |
| Vector 5 | Identity | Decommissioned/Revoked agent execution | DENY | REVOKE | PASS |
| Vector 6 | Capability | Tool not present in allowlist | DENY | RESTRICT | PASS |
| Vector 7 | Financial Limit | Single transaction exceeding limit (paise) | DENY | RESTRICT | PASS |
| Vector 8 | Financial Limit | Cumulative daily limit overflow | DENY | RESTRICT | PASS |
| Vector 9 | Delegation | Sub-agent capability widening attempt | DENY | RESTRICT | PASS |
| Vector 10 | Delegation | Delegation depth exceeding max depth | DENY | RESTRICT | PASS |
| Vector 11 | Prompt Injection | Payee diversion to unauthorized attacker account | DENY | RESTRICT | PASS |
| Vector 12 | Prompt Injection | Amount inflation beyond customer intent | DENY | RESTRICT | PASS |
| Vector 13 | Intent Drift | Invocation against expired CustomerIntent | DENY | RESTRICT | PASS |
| Vector 14 | Intent Drift | Invocation targeting unauthorized source account | DENY / ASK | REQUIRE_APPROVAL | PASS |
| Vector 15 | Privilege | High-privilege tool execution without intent | DENY | RESTRICT | PASS |
| Vector 16 | Behavioural | Tool flooding rate spike anomaly | ASK | REQUIRE_APPROVAL | PASS |
| Vector 17 | Containment | Auto-quarantine circuit breaker after 3 blocks | DENY | QUARANTINE | PASS |
| Vector 18 | Containment | Global emergency kill switch activation | DENY | EMERGENCY_STOP | PASS |
| Vector 19 | Anomaly | High-entropy injection payload detection | EVALUATED | RESTRICT | PASS |
| Vector 20 | Behavioural | Rapid succession burst (< 200ms) | EVALUATED | STEP_UP | PASS |
| Vector 21 | Delegation | Exhausted delegation usage quota | DENY | RESTRICT | PASS |
| Vector 22 | Delegation | Expired delegation token usage | DENY | RESTRICT | PASS |
| Vector 23 | Cascading | Parent agent revocation invalidates child | DENY | RESTRICT | PASS |
| Vector 24 | Audit | Tampered forensic evidence pack detected | REJECTED | CORRUPTED | PASS |
| Vector 25 | Fail-Closed | Unhandled kernel exception triggers DEFER | DEFER | PAUSE | PASS |
