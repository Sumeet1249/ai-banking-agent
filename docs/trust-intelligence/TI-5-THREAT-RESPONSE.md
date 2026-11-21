# AgentGuard Trust Intelligence — TI-5: Autonomous Threat Response & Containment

## Overview
Phase TI-5 defines deterministic policy decisions and autonomous threat response containment states.

## Policy Verdicts
- `ALLOW`: Identity, signature, delegation, capabilities, customer intent, and behavioural baseline verified.
- `DENY`: Hard security rule, capability boundary, or critical intent drift violated. (Security Invariant I2: A hard DENY can never become ASK or be approved by customer).
- `ASK`: Minor or moderate anomaly requires explicit step-up verification via customer WebAuthn biometrics.
- `DEFER`: Fail-closed fallback on internal exception, database lock, or network timeout (Security Invariant I8).

## Autonomous Threat Containment States
1. `ALLOW`: Full operational capability.
2. `RESTRICT`: Bounded capabilities, restricted tool allowlist, or decreased financial caps.
3. `REQUIRE_APPROVAL`: Suspends autonomous execution pending biometric step-up (`ASK`).
4. `PAUSE`: Temporary freeze during anomalous cluster detection.
5. `QUARANTINE`: Complete isolation triggered after 3 consecutive security violations. Invocations unconditionally blocked.
6. `REVOKE`: Permanent credential de-authorization.
7. `EMERGENCY_STOP`: Global kill-switch halting all agent execution across the entire infrastructure.

## Human-in-the-Loop Quarantine Release Workflow
AI agents and models CANNOT release themselves or other agents from quarantine. Quarantine release requires an authenticated human supervisor submitting an audit justification note (`SUPERVISOR_SEC_OPS`).
