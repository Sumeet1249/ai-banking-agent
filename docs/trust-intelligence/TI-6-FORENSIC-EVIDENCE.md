# AgentGuard Trust Intelligence — TI-6: Forensic Evidence & Audit Graphs

## Overview
Phase TI-6 generates tamper-evident audit evidence packs binding an incident record, its associated raw invocation logs, and cryptographic hashes into an RFC 8785 canonical digest.

## Forensic Correlation Pipeline
When an incident is logged by `IncidentForensicsService`:
1. Correlates `agent_id`, `parent_agent_id`, `session_id`, `request_id`, `intent_id`, and `delegation_id`.
2. Computes the SHA-256 event hash over the normalized incident record.
3. Stamps the record with an independent Witness verification reference checkpoint (`witness_checkpoint_ref`).
4. Persists the incident in SQLite WAL table `forensic_incidents`.

## Evidence Pack Verification
- **Leaf Hashes**: Computed over individual invocation logs and the incident header.
- **Root Hash**: Merkle combination of all leaf hashes.
- **Verification**: `ForensicEvidencePack.verifyEvidencePack` recalculates the root digest and confirms bitwise equality against the stamped root hash.
