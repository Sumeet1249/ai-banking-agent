# AGENTGUARD AI — API REFERENCE MANUAL

**Base URLs**:
- **Bank Gate Authoritative Core**: `http://localhost:4000`
- **Gateway MCP Proxy & Signer**: `http://localhost:8081`
- **Witness Notary**: `http://localhost:5000`

---

## 1. Dashboard Aggregates

### `GET /api/v1/dashboard/summary`
Retrieves aggregated financial metrics across all active pools and agent quotas.
- **Headers**:
  - `x-tenant-id` (string, optional, defaults to `tenant-default`)
  - `x-customer-ref` (string, optional, defaults to `cust-101`)
- **Response `200 OK`**:
```json
{
  "total_budget_paise": 5000000,
  "total_settled_paise": 1420000,
  "total_reserved_paise": 250000,
  "available_budget_paise": 3330000,
  "active_agents_count": 4,
  "active_delegations_count": 6,
  "pending_customer_approvals_count": 1,
  "pools_count": 3,
  "category_breakdown": [
    {
      "pool_id": "pool_shopping",
      "category": "SHOPPING",
      "name": "Shopping & E-Commerce",
      "limit_paise": 5000000,
      "settled_paise": 1420000,
      "reserved_paise": 250000,
      "available_paise": 3330000,
      "utilization_pct": 33,
      "autonomy_mode": "AUTO_APPROVE_WITHIN_LIMITS",
      "status": "ACTIVE"
    }
  ]
}
```

---

## 2. Category Budget Pools

### `POST /api/v1/category-pools`
Creates a new sovereign category budget pool.
- **Body**:
```json
{
  "category_id": "SHOPPING",
  "category_name": "E-Commerce & Retail",
  "monthly_limit_paise": 2500000,
  "weekly_limit_paise": 1000000,
  "daily_limit_paise": 500000,
  "per_transaction_limit_paise": 100000,
  "autonomy_mode": "AUTO_APPROVE_WITHIN_LIMITS"
}
```

### `GET /api/v1/category-pools`
Lists all category budget pools for a customer.

### `PUT /api/v1/category-pools/:poolId`
Updates limits or autonomy mode on an existing pool.

### `POST /api/v1/category-pools/:poolId/status`
Freezes or reactivates a category pool (`status: "ACTIVE" | "FROZEN"`).

---

## 3. Multi-Agent Quotas & Delegations

### `GET /api/v1/agents/allocations`
Lists all sub-agent budget allocations across all pools.

### `POST /api/v1/category-pools/:poolId/agents`
Establishes a subordinate agent allocation under a parent pool.
- **Validation**: Agent limit cannot exceed parent pool monthly cap. `allowed_categories` and `blocked_categories` must be disjoint.
- **Body**:
```json
{
  "agent_id": "agent-procure-01",
  "agent_limit_paise": 1000000,
  "daily_limit_paise": 200000,
  "per_transaction_limit_paise": 50000,
  "allowed_categories": ["SHOPPING"],
  "blocked_categories": ["GAMBLING", "CRYPTO"]
}
```

### `PUT /api/v1/category-pools/:poolId/agents/:agentId`
Safely modifies agent limits without violating parent ceilings or already reserved funds.

### `POST /api/v1/category-pools/:poolId/agents/:agentId/status`
Transitions an agent allocation's status:
- `ACTIVE` -> `SUSPENDED` (Permitted)
- `SUSPENDED` -> `ACTIVE` (Permitted if parent pool is active)
- `*` -> `REVOKED` (Permitted, irreversible)
- `REVOKED` -> `ACTIVE` (Strictly rejected with HTTP 400)

---

## 4. Merchant Intelligence Registry

### `GET /api/v1/merchants`
Searches or lists classified merchants with evidence tiers.
- **Query Params**: `?q=Amazon&category=SHOPPING&status=VERIFIED`

### `GET /api/v1/merchants/conflicts`
Retrieves recent category classification conflicts and mismatch alerts.

### `GET /api/v1/merchants/review-queue`
Retrieves unverified or provisional merchants awaiting compliance confirmation.

### `POST /api/v1/merchants/override`
Stores a customer-approved category reclassification for a merchant.

---

## 5. Approvals & Server-Side Biometric Signatures

### `GET /api/v1/approvals/pending`
Lists transactions currently held in `REQUIRES_HUMAN_APPROVAL` state (ASK escalations).

### `POST /api/v1/category-reservations/:reservationId/approve`
Performs server-side cryptographic approval of an escalated transaction.
- **Body**:
```json
{
  "transaction_digest": "64_char_hex_digest",
  "biometric_signature": "valid_webauthn_assertion_token"
}
```

---

## 6. Cryptographic Merkle Tree Audit & Verification

### `GET /api/v1/audit/merkle/batches`
Lists sequential audit batches with root hashes.

### `GET /api/v1/audit/merkle/proofs/:eventId?batch_id=:batchId`
Generates an inclusion proof (sibling audit path) for a specific audit event.

### `POST /api/v1/audit/merkle/verify`
Server-side independent verification of a Merkle inclusion proof.
- **Body**:
```json
{
  "batch_id": "batch_2026_01",
  "event_id": "audit_1795218000",
  "leaf_hash": "64_char_hex",
  "merkle_proof": ["sibling_hash_1", "sibling_hash_2"],
  "merkle_root": "64_char_hex",
  "leaf_index": 0
}
```
- **Response**: `{ "valid": true, "verification_status": "VERIFIED", "details": "..." }`
