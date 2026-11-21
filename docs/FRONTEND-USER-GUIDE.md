# AGENTGUARD AI — COMPLIANCE COCKPIT USER GUIDE

**Target Audience**: Fintech Operations, Security Administrators, and Chief Compliance Officers  
**Application URL**: `http://localhost:13003/budget-pools`  

---

## 1. Navigating the Sovereign Budget Console

The Category Budget Pools page (`/budget-pools`) provides a 6-tab unified interface for controlling agent spending authority:

```
[ Executive Overview ] [ Category Pools ] [ Multi-Agent Quotas ] [ Merchant Intelligence ] [ Approvals & Exceptions ] [ Merkle Explorer ]
```

---

## 2. Tab-by-Tab Operations

### Tab 1: Executive Overview
- **Summary Cards**:
  - **Total Customer Budget**: Sum of all active monthly pool limits.
  - **Total Settled Spend**: Confirmed posted transactions.
  - **Total Reserved Capacity**: Funds held for in-flight agent permits (TTL 90s).
  - **Available Budget**: Real-time formula: $\text{Available} = \text{Limit} - \text{Settled} - \text{Reserved}$.
- **Category Breakdown**: Multi-color utilization progress bars showing settled vs reserved portions.

### Tab 2: Category Pools
- **Create Pool**: Click **"New Budget Pool"** in the top right. Select category (`SHOPPING`, `TRANSPORT`, `UTILITIES`, etc.), enter monthly/daily/per-tx limits in Rupees, and choose an autonomy mode.
- **Autonomy Modes**:
  1. `AUTO_APPROVE_WITHIN_LIMITS`: Transactions within limits and verified merchants execute autonomously.
  2. `ASK_BEFORE_EVERY_PAYMENT`: Every transaction escalates to human review.
  3. `MANUAL_ONLY`: Autonomous spending completely disabled.
- **Freeze / Reactivate**: Click **"Freeze Pool"** to temporarily halt all spending in a category without losing historical records.

### Tab 3: Multi-Agent Quotas
- **Sub-Agent Allocation**: Click **"Assign Agent Quota"**. Enter the agent ID, parent pool, and caps.
- **Subordinate Ceiling**: The system automatically rejects any sub-agent allocation that exceeds the parent pool's monthly limit.
- **Category Filters**: Configure `allowed_categories` and `blocked_categories`. Blocked categories take priority (deny-first).
- **Status Lifecycle**:
  - `Suspend`: Temporarily pauses agent permissions. Can be resumed.
  - `Revoke`: Permanently terminates delegation. Irreversible terminal state.

### Tab 4: Merchant Intelligence
- **ISO 18245 Registry**: Search payees by name, ID, or 4-digit MCC code.
- **Evidence Tiers**:
  - *Tier 1: Authoritative Rail* (Direct clearing/bank statement)
  - *Tier 2: Regulatory Registry* (GSTIN/PAN validated)
  - *Tier 3: Customer Override* (Customer-confirmed)
  - *Tier 4: Deterministic Heuristic* (Directory match)
  - *Tier 5: Advisory Heuristic* (AI inference; non-authoritative)
- **Customer Override**: Click **"Override"** on any merchant row to assign a trusted category classification with an audit reason.

### Tab 5: Approvals & Exception Center
- **Pending Human-in-the-Loop Reviews**: Displays transactions flagged for review (ASK escalations).
- **Passkey Review**: Click **"Review & Sign Passkey Approval"** to inspect transaction digests and provide biometric/WebAuthn confirmation.

### Tab 6: Merkle Explorer & Notary
- **Cryptographic Verification**: Select a batch ID and enter an audit event ID. Click **"Verify Inclusion Proof"**.
- **Tamper Detection**: Demonstrates mathematical proof verification against the Witness-cosigned Merkle root.
