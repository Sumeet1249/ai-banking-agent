# BP-3.3 — Gateway MCP Integration with Bank Gate

**Module**: Gateway MCP (`:8081`) & Bank Gate (`:4000`)  
**Package**: `@agentguard/gateway-mcp`  
**Status**: Completed & Formally Verified  

---

## 1. Architectural Responsibility Separation

To preserve Invariant I1 and avoid architectural drift:
- **Gateway MCP (`:8081`)**: Authenticates calling agents via Ed25519 signatures, verifies active delegation tokens, binds the request to the canonical 7-field transaction digest, and forwards budget checks to Bank Gate. It mints 22-field TBP permit envelopes **only** upon an authoritative `ALLOW`.
- **Bank Gate (`:4000`)**: Authoritative financial authority. Validates parent pool limits, agent quotas, and merchant evidence inside serialized SQLite `.immediate()` transactions.

```
Agent Client
     │
     ▼ Ed25519 Signed POST /api/agent/evaluate
Gateway MCP (:8081)
     │
     ▼ POST /api/v1/category-reservations (BankGateClient)
Bank Gate (:4000)
     │
     ├─► DENY  ──► Gateway returns HTTP 403 (No permit minted)
     ├─► DEFER ──► Gateway returns HTTP 503 (Fail-closed, no permit)
     ├─► ASK   ──► Gateway returns HTTP 202 (Step-up approval required)
     │
     ▼ ALLOW
Gateway MCP signs 22-field TBP Permit Envelope
     │
     ▼ Returns Permit Envelope to Agent
```

---

## 2. Decision Mapping

| Bank Gate Verdict | Gateway HTTP Status | Permit Minted? | Action Required |
|---|---|---|---|
| `ALLOW` | `200 OK` | **Yes** | 22-field signed TBP envelope returned with authoritative `reservation_id`. |
| `ASK` | `202 Accepted` | **No** | Requires transaction-bound customer biometric approval. |
| `DENY` | `403 Forbidden` | **No** | Policy violation; cannot be overridden by customer or agent. |
| `DEFER` | `503 Service Unavailable` | **No** | Fail-closed network timeout or database exception. |

---

## 3. Cryptographic Permit Binding

Permits minted by Gateway MCP strictly adhere to `PermitEnvelopeSchema`:
- Single-use UUIDv4 nonce tracked in `nonces` table.
- 90-second TTL (`issued_at` to `expires_at`).
- Detached Ed25519 signature over canonical transaction digest.
- Private key isolation: Bank Gate never receives or stores Gateway private signing keys.

---

## 4. Test Verification Summary

- `npm test --workspace=@agentguard/gateway-mcp -- src/__tests__/permit-security.test.ts` — **6 / 6 PASSED**
- Digest tampering rejection — **PASSED**
- Cascading revocation of sub-agents — **PASSED**
- Single-use nonce replay rejection — **PASSED**
