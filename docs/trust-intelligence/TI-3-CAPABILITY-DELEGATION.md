# AgentGuard Trust Intelligence — TI-3: Capability & Delegation Engine

## Overview
Phase TI-3 implements dynamic, bounded capability enforcement and hierarchical delegation controls across multi-agent systems.

## Strict Capability Narrowing
When a parent agent delegates execution authority to a child sub-agent:
1. **Tool Subsetting**: Child agent's `allowed_tools` must be a strict subset of the parent's allowed tools.
2. **Action Subsetting**: Child agent's `permitted_actions` must be a subset of parent permitted actions.
3. **Financial Limit Ceilings**:
   - `child.max_amount_paise <= parent.max_amount_paise`
   - `child.daily_max_paise <= parent.daily_max_paise`
   - Integer paise representation strictly maintained (Rule E1). Zero floats.
4. **Time Boundedness**: Child delegation expiry cannot exceed parent delegation expiry (`child.expires_at <= parent.expires_at`).
5. **Delegation Depth Limits**: Maximum delegation depth defaults to 2 levels (`depth <= max_delegation_depth`). Exceeding depth results in deterministic `DENY`.

## Cascading Revocation (Security Invariant I7)
Revoking or quarantining a parent agent or parent delegation cascades atomically to all downstream sub-delegations and child agents within a single SQLite WAL transaction.
