# AgentGuard Trust Intelligence — TI-2: Agent Identity & Cryptographic Registry

## Overview
AgentGuard Trust Intelligence Phase TI-2 establishes authoritative cryptographic identity, public key lifecycle management, and detached signature verification for all autonomous agents interacting with AgentGuard financial kernels and services.

## Core Architectural Invariants
1. **Detached Ed25519 Signatures**: Every tool invocation payload must be accompanied by an Ed25519 signature computed over canonical invocation fields.
2. **Deterministic Canonical Digest**: Arguments are serialized according to RFC 8785 canonical JSON formatting and hashed using SHA-256 (`canonical_argument_digest`).
3. **Timestamp Skew Window**: Timestamps must fall within $\pm90,000$ milliseconds ($\pm90$s) of server clock. Stale or future-skewed requests are unconditionally rejected.
4. **Atomic Anti-Replay Nonce Verification**: Nonces are stored in SQLite WAL table `agent_nonces (nonce, agent_id, timestamp_ms)`. Primary key uniqueness guarantees atomic deduplication.
5. **Zero-Downtime Key Rotation**: Key rotation issues a new key in `ACTIVE` state while the retiring key is placed into `GRACE_PERIOD` (default 1 hour) before permanent deprecation.

## Identity State Lifecycle
```
[PENDING] ---> [ACTIVE] <---> [RESTRICTED]
                   |                |
                   v                v
            [QUARANTINED] <---> [REVOKED]
```
- **ACTIVE**: Standard operational status. Permitted to invoke tools satisfying capabilities.
- **RESTRICTED**: Minor anomaly detected or temporary policy throttle. Execution escalated to biometric step-up (`ASK`).
- **QUARANTINED**: Automated circuit breaker tripped (3 consecutive security violations) or critical anomaly. Invocations rejected (`DENY`). Requires authenticated human supervisor release.
- **REVOKED**: Key compromised or agent permanently decommissioned. Permanent fail-closed termination.
