# TI-0: Repository & Branch Verification Report
**Date:** 2026-11-21  
**Auditor:** Principal Cybersecurity Architect & Verification Engineer  
**System:** AgentGuard AI / AgentShield  

---

## 1. Branch & Commit Verification

| Item | Expected | Verified Reality | Status |
| :--- | :--- | :--- | :---: |
| **Current Branch** | `feat/market-intelligence` | `feat/market-intelligence` | **CONFIRMED** |
| **Target Commit** | `9e5230b` | `commit 9e5230b101b2cf790bfa7f242cd9a8229bdcb852` | **CONFIRMED** |
| **Remote Tracking** | `origin/feat/market-intelligence` | Up to date (`53125aa..9e5230b` pushed) | **CONFIRMED** |
| **Parent Commit** | `53125aa` | `53125aa feat: separate audit ledger database (audit_ledger.db)...` | **CONFIRMED** |
| **Working Tree** | Clean | Working tree clean (zero unstaged changes) | **CONFIRMED** |

---

## 2. Modified & Introduced Files in Commit `9e5230b`

Commit `9e5230b` introduced **35 files** (+5434 insertions, -3 deletions):
- **Core Schema**: `packages/core-schema/src/market/market-schema.ts`, `packages/core-schema/src/market/index.ts`, `packages/core-schema/src/market/market.test.ts`
- **Market MCP Package**: `packages/market-data-mcp/`
  - Database: `src/db/market-store.ts` (16 SQLite tables, baseline Indian blue-chips & wealth fixtures)
  - Security: `src/security/read-only-policy.ts` (allowlist of 20 read-only tools, prohibited trade pattern rejection, prompt injection sanitization)
  - Adapters: `src/providers/drishti/drishti-adapter.ts`, `src/providers/market-data/licensed-data-adapter.ts`, `src/providers/upstox/upstox-readonly-adapter.ts`
  - Subagents: `CompanyResearchAgent`, `FundamentalAnalysisAgent`, `ValuationAnalysisAgent`, `NewsFilingAgent`, `PortfolioIntelligenceAgent`, `RiskAnalysisAgent`
  - Orchestration: `MarketResearchOrchestrator`
  - Server: `src/server.ts` (port 4004, REST + MCP JSON-RPC 2.0)
  - Tests: `read-only-policy.test.ts`, `market-store.test.ts`, `agents-and-orchestrator.test.ts`, `server-api.test.ts`
- **Cockpit Frontend**: `apps/compliance-cockpit/src/app/market-intelligence/page.tsx` (7-tab research UI), `apps/compliance-cockpit/src/app/api/market/[...path]/route.ts` (proxy route), navigation updates in `layout.tsx` and `command-palette.tsx`
- **Documentation**: `docs/market-intelligence/` (`ARCHITECTURE.md`, `SECURITY-INVARIANTS.md`, `VERIFICATION-REPORT.md`, `MI-0-REPOSITORY-AUDIT.md`)

---

## 3. Provider Reality Audit: Real Implementations vs. Fixtures

1. **Drishti Research Connector**:
   - *Status*: Real network HTTP client implemented to `https://mcp.drishti.manasija.in/v1/instruments/search` and filings endpoints with 5000ms timeout.
   - *Limitation*: No commercial `DRISHTI_API_KEY` is pre-configured in local `.env`; falls back to local SQLite fixtures.
2. **Licensed Market Data**:
   - *Status*: Queries local SQLite store seeded with historical daily OHLCV bars, financial statements, and ratios.
   - *Limitation*: Does not connect to an external live exchange feed (e.g., Bloomberg, Refinitiv, or NSE NOW). Must be explicitly marked as `DEMO_FIXTURE` in production mode unless a valid commercial license key is provided.
3. **Upstox Broker Connector**:
   - *Status*: Read-only OAuth scope verification policy implemented (`read_holdings`, `read_portfolio`, `read_pnl`).
   - *Limitation*: The connected portfolio is seeded demo data for `cust-101`. Real live broker sync requires customer OAuth credential binding.

---

## 4. Baseline Test Verification (All Suites Passing)

| Test Suite | Package | Tests Run | Result | Duration |
| :--- | :--- | :---: | :---: | :---: |
| **Core Canonical Schemas** | `@agentguard/core-schema` | 63 | **PASS** | 1.28 s |
| **Market Data MCP & Security** | `@agentguard/market-data-mcp` | 35 | **PASS** | 4.05 s |
| **Hackathon 5 Requirements** | `@agentguard/gateway-mcp` | 13 | **PASS** | 2.89 s |
| **Bank Gate Keyring & Budgets** | `@agentguard/bank-gate` | 54 | **PASS** | 5.47 s |
| **Witness Merkle Notary** | `@agentguard/witness` | 14 | **PASS** | 2.66 s |
| **Ledger Two-Phase Settlement** | `@agentguard/ledger-adapter` | 17 | **PASS** | 1.63 s |
| **Total Baseline Tests** | | **196** | **196 / 196 PASSED** | **17.98 s** |

---

## 5. Branch Initialization

The new development branch `feat/agentguard-trust-intelligence` is branched directly from `9e5230b`.
All subsequent Phase TI-1 through TI-8 enhancements will be committed exclusively on this branch.
