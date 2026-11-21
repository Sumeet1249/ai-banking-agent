# AgentGuard Trust Intelligence — API Reference

## Endpoints (Port 4006 / `/api/trust/*`)

### 1. Health & Overview
- `GET /api/trust/health`: Returns engine status, timestamp, and emergency stop state.
- `GET /api/trust/overview`: Aggregated telemetry: total/active/quarantined agents, active delegations, 24h evaluation count, open incidents, and system trust index.

### 2. Agent Identity Registry
- `GET /api/trust/agents`: List all enrolled agents for the tenant.
- `POST /api/trust/agents`: Enroll a new agent with Ed25519 public key and capability boundaries.
- `POST /api/trust/agents/:id/status`: Transition lifecycle status (`ACTIVE`, `RESTRICTED`, `QUARANTINED`, `REVOKED`).

### 3. Delegation Management
- `GET /api/trust/delegations`: List active and historical delegation trees.
- `POST /api/trust/delegations`: Create narrowed delegation from parent to child agent.
- `POST /api/trust/delegations/:id/revoke`: Atomically revoke delegation and all downstream sub-delegations.

### 4. Policy Kernel Evaluation
- `POST /api/trust/evaluate`: Authoritative deterministic evaluation endpoint. Accepts `InvocationRequest` and optional context, returning `TrustEvaluationDecision` (`ALLOW`, `DENY`, `ASK`, `DEFER`).

### 5. Threat Containment & Quarantine
- `GET /api/trust/quarantine`: List quarantined agents and containment details.
- `POST /api/trust/quarantine/:id/release`: Human supervisor authenticated quarantine release.
- `POST /api/trust/emergency-stop`: Toggle global kill-switch (`ENGAGE` / `DISENGAGE`).

### 6. Forensics & Audit
- `GET /api/trust/incidents`: Query forensic incident records.
- `GET /api/trust/incidents/:id/evidence-pack`: Retrieve cryptographic evidence pack with Merkle digest.
- `POST /api/trust/verify-evidence-pack`: Verify evidence pack integrity.
