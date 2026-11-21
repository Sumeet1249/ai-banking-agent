# Merkle Tree Audit Architecture & Verification (BP-3.5)

**Product**: AgentGuard AI  
**Module**: Authoritative Audit Log & Merkle Verification Engine  
**Standard**: RFC 6962 / Certificate Transparency Domain Separation  

---

## 1. Objective & Design Rationale

While the BP-2 sequential SHA-256 hash chain guarantees ordered tamper-evidence, verifying that an individual event belongs to a historical audit log requires scanning every record up to that point.

The **Merkle Tree Audit Engine (BP-3.5)** supplements the sequential hash chain by batching committed audit events into verifiable binary trees. It allows any client, regulator, or autonomous agent to verify the existence and integrity of an individual transaction in $O(\log N)$ cryptographic operations using an **Inclusion Proof**, without revealing or processing unrelated records.

```
                    Merkle Root (Anchored to Witness :5000)
                                     ▲
                     ┌───────────────┴───────────────┐
                     │                               │
                 Parent Node                     Parent Node
           SHA256(0x01 || L || R)          SHA256(0x01 || L || R)
                     ▲                               ▲
             ┌───────┴───────┐               ┌───────┴───────┐
             │               │               │               │
         Leaf Node       Leaf Node       Leaf Node       Leaf Node
        0x00 || E1      0x00 || E2      0x00 || E3      0x00 || E4
             ▲               ▲               ▲               ▲
             │               │               │               │
        Audit Event 1   Audit Event 2   Audit Event 3   Audit Event 4
```

---

## 2. Cryptographic Specification

### A. Canonical Event Serialization
Before hashing, audit events are deterministically formatted:
```
canonical_event = sequence_number | prev_event_hash | event_hash | tenant_id | customer_ref | actor | operation | entity_id | policy_version | timestamp | event_payload
```

### B. Domain Separation (RFC 6962)
To prevent second-preimage attacks:
- **Leaf Hashing**:
  $$\text{LeafHash}(E) = \text{SHA-256}(0\text{x}00 \mathbin{\Vert} \text{canonical\_event})$$
- **Internal Node Hashing**:
  $$\text{NodeHash}(L, R) = \text{SHA-256}(0\text{x}01 \mathbin{\Vert} L \mathbin{\Vert} R)$$

### C. Odd-Leaf Policy & Algorithm Versioning

To ensure mathematical precision and clear cryptographic provenance, AgentGuard AI supports two explicit, versioned Merkle tree construction modes:

#### 1. Version `AGENTGUARD_MERKLE_V1` (Default Level-by-Level Self-Pairing)
- When a level in the tree has an odd number of nodes $k$, the unpartnered node is deterministically hashed with itself using the internal node domain prefix:
  $$\text{Parent}(\text{odd}) = \text{SHA-256}(0\text{x}01 \mathbin{\Vert} \text{odd} \mathbin{\Vert} \text{odd})$$
- This produces a deterministic, level-by-level binary tree across any batch size.

#### 2. Version `RFC6962_MTH_V1` (Strict Certificate Transparency Tree Hash)
- Adheres strictly to RFC 6962 Section 2.1:
  - For $n = 0$: $MTH(\{\}) = \text{SHA-256}("")$
  - For $n = 1$: $MTH(\{d_0\}) = \text{SHA-256}(0\text{x}00 \mathbin{\Vert} d_0)$
  - For $n > 1$: Let $k$ be the largest power of 2 strictly less than $n$ ($k < n \le 2k$).
    $$MTH(D[n]) = \text{SHA-256}(0\text{x}01 \mathbin{\Vert} MTH(D[0..k]) \mathbin{\Vert} MTH(D[k..n]))$$
- Note: RFC 6962 does NOT pair odd nodes with themselves; it splits recursively at the power-of-two boundary $k$.
- When $n$ is an exact power of 2, both `AGENTGUARD_MERKLE_V1` and `RFC6962_MTH_V1` produce identical root hashes. For odd batch sizes, the two constructions produce distinct, cryptographically valid roots.

> **Important Trust Model Note**: A Merkle inclusion proof proves cryptographic membership relative to a trusted, cosigned batch root. It does not by itself prove the real-world truth or economic intent of the original event. Real-world authorization is established by the 22-field Ed25519 Transaction-Bound Permit and customer WebAuthn signatures.

---

## 3. Inclusion Proof Generation & Verification

An **Inclusion Proof** consists of:
```typescript
interface MerkleInclusionProof {
  batch_id: string;
  event_id: string;
  sequence_number: number;
  leaf_index: number;
  leaf_hash: string;
  audit_path: string[]; // Ordered sibling hashes
  merkle_root: string;
}
```

### Verification Algorithm:
1. Initialize `current = leaf_hash`, `idx = leaf_index`.
2. For each sibling $S$ in `audit_path`:
   - If `idx` is odd (right child): `current = NodeHash(S, current)`.
   - If `idx` is even (left child): `current = NodeHash(current, S)`.
   - `idx = Math.floor(idx / 2)`.
3. Verify that `current.toLowerCase() === batch.merkle_root.toLowerCase()`.
4. Verify that `batch.merkle_root` is anchored and signed by Independent Witness (:5000).

---

## 4. Verification Endpoint

### `POST /api/v1/audit/merkle/verify`
Request:
```json
{
  "batch_id": "BATCH_2026_001",
  "event_id": "audit_1_1795210000",
  "leaf_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "merkle_proof": [
    "7a38914b1c8e...",
    "9d816a1240c1..."
  ],
  "merkle_root": "7e2b10a2489cbf81a3e6f9d2c1809a47d928bf160893a7e4b2d9a10fc41e9b82",
  "leaf_index": 0
}
```

Response:
```json
{
  "valid": true,
  "event_included": true,
  "root_anchored": true,
  "verification_status": "VERIFIED",
  "details": "Event inclusion cryptographically verified against Witness-anchored Merkle root",
  "witness_checkpoint_id": "chk_wit_2026_001",
  "witness_epoch": 1
}
```

### Security Properties:
- **Tamper Detection**: If the event payload was modified after commitment, the leaf hash check fails (`TAMPER_DETECTED`).
- **Root Integrity**: If an attacker presents an unanchored root, the database check rejects it (`ROOT_MISMATCH`).
- **Proof Integrity**: If a sibling hash is forged, the computed root will not match (`INVALID_PROOF`).
