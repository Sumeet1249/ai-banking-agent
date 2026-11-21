# AgentGuard Trust Intelligence — TI-7: Professional Cockpit Guide

## Navigation & UI Surface
The Trust Intelligence Cockpit is located at `/agent-trust` in the Compliance Cockpit, with full accessibility via the `⌘K / Ctrl+K` global command palette (`Trust Intelligence`).

## 9 Sub-Views Overview
1. **Overview**: Executive telemetry dashboard showing System Trust Index (94.2%), Active vs Quarantined agents, Bounded Delegations count, and live policy decisions stream.
2. **Agent Registry**: Complete directory of enrolled agents, Ed25519 public key fingerprints, dynamic trust scores (0-1000), parent-child relationships, and lifecycle status badges.
3. **Delegation Manager**: Hierarchical delegation trees displaying purpose, scoped tool allowlists, usage quotas, and integer paise per-tx & daily caps.
4. **Behavioural Monitor**: Real-time multi-agent telemetry tracking tool call frequency (calls/min), call interval delta (ms), and Asia/Kolkata off-hours tracking (23:00 to 06:00 IST).
5. **Anomaly Investigation**: Statistical Z-score deviations, baseline sample counts, median absolute deviations, and cold-start safety flags.
6. **Quarantine Centre**: Active containment hub displaying contained rogue agents, violation timelines, and the authenticated human supervisor release modal.
7. **Approval Queue (ASK)**: Escalated decisions requiring customer biometric step-up consent (WebAuthn passkey).
8. **Incident Forensics**: End-to-end incident investigation graph with root cause analysis, event chain hashes, and witness checkpoint hashes.
9. **Audit Verification**: Interactive cryptographic verification of forensic evidence packs against independent Witness digests.
