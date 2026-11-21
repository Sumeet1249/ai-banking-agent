# AgentGuard Trust Intelligence — TI-4: Behavioural Intelligence & Intent-Drift

## Overview
Phase TI-4 provides real-time multi-agent behavioural monitoring and structured customer intent verification.

## Explainable Behavioural Features
- `tool_call_rate_per_min`: Invocations within rolling 60-second window.
- `unique_tools_in_session`: Cardinality of distinct API signatures accessed in current session.
- `consecutive_denied_calls`: Rapid succession of failed or rejected calls. Tripping $\ge 3$ triggers auto-quarantine.
- `call_interval_ms`: Inter-call arrival time. Sub-200ms intervals flagged as automated burst flooding.
- `argument_entropy`: Shannon entropy metric of serialized argument payload detecting large injected payloads.
- `unusual_hours_detected`: Off-hours activity check evaluated in Asia/Kolkata timezone (23:00 to 06:00 IST) using deterministic injected clock (Rules E2 & E3).

## Structured Customer Intent Verification
Incoming invocations are deterministically compared against `CustomerIntent`:
- **Approved Payees**: Invocation payee must match approved whitelist. Payee diversion triggers score 85 + `DENY`.
- **Max Authorized Amount**: Integer paise ceiling check. Overflow triggers score 85 + `DENY`.
- **Approved Account Reference**: Matches target source account.
- **Validity Window**: Verified against `valid_until`. Expired intents reject execution.

## Statistical Anomaly Detection
- **Rolling Z-Score & MAD**: Evaluates deviation from historical baseline mean and variance.
- **Cold-Start Safe Ceiling**: In agents with $< 10$ historical baseline records, deterministic safety ceilings apply without generating false positive penalization.
