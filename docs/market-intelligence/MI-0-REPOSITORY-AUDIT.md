# MI-0: AgentGuard Market Intelligence — Repository Audit & Architecture Baseline

**Document:** MI-0-REPOSITORY-AUDIT.md  
**Date:** 2026-11-21  
**Project:** AgentGuard AI (AgentShield)  
**Target Market:** India (NSE / BSE)  
**Scope:** Long-Term Research, Fundamentals, Filings, Announcements, Portfolio & Monthly SIP Tracking, Mutual Funds, Gold ETF, Insurance.  
**Execution Policy:** Strictly Read-Only. No Scalping, No Intraday, No Automated Trading, No Order Placement.  

---

## 1. Existing Monorepo Architecture

The AgentGuard AI repository is a high-integrity, multi-tenant banking security and autonomous agent governance monorepo managed with npm workspaces and Turbo.

### 1.1 Core Components & Port Allocations
1. **Compliance Cockpit (`apps/compliance-cockpit`, Port 13003 / 3000)**:
   - Next.js 14 App Router, Tailwind CSS, Lucide icons, TanStack React Query.
   - Houses the sovereign customer interfaces: Mission Control, Banking Defense Command, Agent Mandate Governance, and Sovereign Category Budget Pools.
   - Multi-tenant, customer PIN session + CSRF token authenticated.
2. **Gateway MCP Server & LLM Proxy (`packages/gateway-mcp`, Port 8080 / 8081)**:
   - Express server with MCP WebSocket and HTTP endpoints (`ws://localhost:8080/mcp-audit`, `/api/v1/llm-proxy/*`).
   - Houses the policy evaluation engine (DSL packs), detector registry (PII, Prompt Injection, Exfiltration), and Ed25519 permit signing service.
3. **Bank Gate Core (`packages/bank-gate`, Port 4000)**:
   - Autonomous execution gateway and Category Budget authority.
   - Enforces atomic budget reservations, multi-period caps (daily, weekly, monthly), merchant intelligence, and single-use permit consumption.
   - Backed by operational database `bank_gate.db`.
4. **Dedicated Audit Ledger Database (`audit_ledger.db`)**:
   - Physically separated SQLite database for tamper-evident hash-chained audit events (`budget_audit_events`), security interception logs (`agent_block_history`), and Merkle audit records (`merkle_audit_batches`).
5. **Independent Witness (`packages/witness`, Port 5000)**:
   - Cryptographic checkpoint co-signer using an independent Ed25519 keypair and RFC 6962 Merkle engine.
6. **Ledger Adapter (`packages/ledger-adapter`, Port 4001)**:
   - Dual-backend TigerBeetle and SQLite two-phase settlement adapter.

---

## 2. Existing MCP Integration Points

- `packages/gateway-mcp/src/mcp/aegis-mcp-server.ts`:
  - Exposes WebSocket transport (`ws://.../mcp-audit`) handling JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`).
  - Standardized tool schemas with Zod/JSON-Schema validation.
- `packages/gateway-mcp/src/mcp/proxy-service.ts`:
  - Manages upstream MCP server discovery and connection proxies.
- Target Market MCP Integration:
  - We establish a dedicated, decoupled domain package `packages/market-data-mcp` (or market intelligence module) exposing standardized `market.*` tools via JSON-RPC 2.0 with rate-limiting, source attribution, and request timeouts.

---

## 3. Authentication & Authorization Boundaries

- **Rule E5 Compliance**:
  - `/api/agent/*`: Ed25519-signed requests with HMAC / detached signature verification.
  - `/api/customer/*`: Customer PIN session cookie + anti-CSRF token verification.
- **Tenant Context**:
  - Multi-tenant isolation enforced via `AsyncLocalStorage` tenant resolution.
  - No client-provided `tenant_id` or `customer_ref` is ever trusted blindly.
- **Market Domain Isolation**:
  - All market research routes (`/api/customer/market/*`) operate strictly under customer authentication and tenant isolation.
  - Broker connections (Upstox read-only) require explicit customer consent records with hardware/passkey binding.

---

## 4. Database Conventions & Decimal Precision

- **Banking vs. Market Precision (Rule E1 Separation)**:
  - Banking payment transactions strictly utilize `INTEGER` paise (1 INR = 100 paise; zero floats allowed).
  - Market Domain requires independent decimal-safe representation:
    - Share quantities: safe fixed-point (e.g. integer micro-shares or decimal string) to accommodate fractional ETF / mutual fund units.
    - Historical prices & NAV: integer paise or decimal string with currency metadata (`INR`).
    - Valuation ratios (P/E, P/B, EV/EBITDA, ROE %): exact precision numeric fields.
  - **No sharing of payment permit schemas or `amount_paise` fields with stock market quantities.**

---

## 5. Frontend Design System & Theme Alignment

- The Compliance Cockpit utilizes:
  - `hsl(var(--background))`, `hsl(var(--card))`, `hsl(var(--border))`, and `hsl(var(--primary))`.
  - Staggered animations (`stagger-in`), 3D tilt effects (`tilt-3d`), and glassmorphism headers.
  - Zero external CDN dependencies (Rule E7) — local Lucide icons and Geist fonts.
- Market Intelligence UI will live at `/market-intelligence` in `apps/compliance-cockpit`, integrating with existing sidebar navigation and theme toggles.

---

## 6. Recommended Package & Directory Architecture

```
packages/
├── market-data-mcp/                <-- Dedicated Market MCP Server & Adapters
│   ├── src/
│   │   ├── server.ts               <-- MCP Server (JSON-RPC 2.0)
│   │   ├── config.ts               <-- Provider keys & rate limits
│   │   ├── tools/                  <-- market.* tool implementations
│   │   ├── providers/
│   │   │   ├── drishti/            <-- Drishti Research API/MCP Adapter
│   │   │   ├── market-data/        <-- Licensed Market Data Provider Adapter
│   │   │   └── upstox/             <-- Upstox Read-Only Broker Adapter
│   │   └── security/               <-- Read-only policy & allowlists
│
├── core-schema/
│   └── src/market/                 <-- Canonical Market & Portfolio Zod Schemas
│
apps/compliance-cockpit/
├── src/app/market-intelligence/    <-- Next.js Page & Sub-routes
├── src/components/market/          <-- Professional Financial UI Components
└── src/app/api/market/             <-- Cockpit Proxy / Server-side Routes
```

---

## 7. Files That Must NOT Be Changed (Protected Invariants)

1. `AGENTS.md`: Frozen non-negotiable security invariants (I1–I9).
2. `CONTRACTS.md`: Frozen banking payment permit schemas, reason codes, and TTL constants.
3. `packages/bank-gate/src/services/permit-verifier.ts`: Ed25519 22-field TBP verification logic.
4. `packages/bank-gate/src/db/bank-gate-store.ts`: Authoritative banking payment tables.
5. `packages/witness/src/services/merkle-engine.ts`: Core banking transparency tree.

---

## 8. Critical Implementation Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Accidental Trade Execution** | Strict positive allowlist in `read-only-policy.ts`. Zero write endpoints implemented. Immediate hard-rejection for any order/buy/sell payload. |
| **SEBI Regulatory Misclassification** | Prominent disclaimer: Research and portfolio tracking engine only. No automated personal investment advice or buy/sell recommendations. |
| **Prompt Injection via Filings / Transcripts** | All external corporate filings and concall transcripts treated as untrusted text. Analyzed through quarantined parser; model instructed never to execute embedded directives. |
| **Broker Token Leakage** | Upstox tokens encrypted using server KMS; never exposed to LLM context, browser storage, or logs. |
| **API Outages & Rate Limits** | Provider-adapter architecture with graceful degradation, caching, and deterministic test fixtures. |

---

*Audit completed. Proceeding directly to Phase MI-1 implementation.*
