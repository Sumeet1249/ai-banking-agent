# AgentGuard Indian Stock Market Intelligence & Wealth Research
## Architecture & System Design Document (Phases MI-0 – MI-10)

### 1. Executive Summary
AgentGuard Stock Market Intelligence is a specialized, strictly read-only market intelligence and wealth planning system integrated into the AgentGuard banking platform. Its primary purpose is to empower AI agents and retail investors with deep, evidence-based Indian stock market research (NSE & BSE) and disciplined long-term wealth accumulation—specifically focused on:
- **Company Fundamental Research**: Balance sheet solvency, audited quarterly trends, ROE, ROCE, P/E multiples, and management conference call analysis.
- **Disciplined Wealth Assets**: Fixed monthly Systematic Investment Plans (SIPs), diversified mutual funds, gold bullion ETFs, Sovereign Gold Bonds (SGB), and term life protection.
- **Zero Trading Capabilities**: Scalping, day-trading, automated buy/sell signals, order placement, order modification, and broker funds withdrawals are strictly prohibited and hard-blocked at the architectural boundary.

---

### 2. Domain Separation Invariant: Market Research vs. Banking Execution
The system maintains an absolute architectural boundary between financial execution and market intelligence:

```
┌─────────────────────────────────────────────────────────────┐
│                   BANKING EXECUTION DOMAIN                  │
│                                                             │
│   • Bank Gate (:4000) - Authoritative payment enforcement   │
│   • Gateway MCP (:8081) - Ed25519 TBP Permit Signing        │
│   • Ledger Adapter (:4001) - TigerBeetle / Core Banking     │
│   • Witness Service (:5000) - Independent Audit Cosigning   │
│   • Integer Paise Math (Rule E1), 22-field TBPs (Rule I1)   │
└──────────────────────────────▲──────────────────────────────┘
                               │
            HARD AIR-GAP (Zero Signing Keys / Zero TBPs)
                               │
┌──────────────────────────────▼──────────────────────────────┐
│              MARKET INTELLIGENCE DOMAIN (:4004)             │
│                                                             │
│   • Strictly Read-Only (Positive Tool Allowlist: 20 tools)  │
│   • Drishti Research MCP Connector (Filings & Concalls)     │
│   • Licensed NSE/BSE Market Data Feed (OHLCV & Ratios)      │
│   • Upstox Read-Only Broker Adapter (Holdings & SIPs)       │
│   • Multi-Agent Research Orchestrator                       │
│   • Tamper-Evident Market Audit DB (market_intelligence.db) │
└─────────────────────────────────────────────────────────────┘
```

**Key Architectural Invariants:**
1. Market Intelligence agents never receive payment mandates, private keys, or Ed25519 permit signing authorities.
2. Market Intelligence agents cannot call Bank Gate `:4000` execution endpoints.
3. Market Intelligence operations can never debit customer accounts or initiate transfers.
4. Monetary amounts in the banking domain are integer paise; market domain calculations accommodate fractional units (mutual funds/gold ETFs) with high-precision decimal accounting.

---

### 3. Provider Adapters
1. **Drishti Research MCP (`https://mcp.drishti.manasija.in`)**:
   - Primary research connector for Indian corporate filings, BSE/NSE regulatory announcements, earnings conference call transcripts, and board meeting notes.
   - Built-in fallback caching and deterministic fixtures for offline resilience.
2. **Licensed Market Data Feed (NSE & BSE)**:
   - Historical daily OHLCV price bars, dividend histories, corporate actions, and industry peer cohort benchmarking.
3. **Upstox Read-Only Broker Adapter**:
   - Customer-consented read-only access to portfolio holdings, asset allocation breakdown, and recurring monthly SIP schedules.
   - OAuth scope whitelist: only `read_holdings`, `read_portfolio`, `read_pnl` permitted. Any write or trade scope triggers immediate rejection.

---

### 4. Specialized Multi-Agent Intelligence System
The orchestrator coordinates 6 specialized subagents:
1. **CompanyResearchAgent**: Discovers corporate identity, corporate master listing on NSE/BSE, operating segments, management, and strategic highlights.
2. **FundamentalAnalysisAgent**: Audits multi-year balance sheets, net profit margins, Return on Equity (ROE), Return on Capital Employed (ROCE), and Debt-to-Equity leverage.
3. **ValuationAnalysisAgent**: Calculates trailing P/E, P/B, EV/EBITDA, dividend yields, and benchmarks against peer cohorts.
4. **NewsFilingAgent**: Analyzes stock exchange disclosures, sanitizes prompt injection attempts, and extracts executive sentiment from concalls.
5. **PortfolioIntelligenceAgent**: Analyzes customer wealth distribution, tracks active SIP schedules, calculates rupee cost averaging, and computes 3/5/10/15-year compounding wealth projections at a conservative 11.5% nominal CAGR.
6. **RiskAnalysisAgent**: Evaluates single-stock concentration risk, sector exposures, and flags asset concentration exceeding 20%.

---

### 5. Compliance & Statutory Disclaimers
Every generated research report includes the mandatory SEBI Non-Advisory Statutory Disclaimer:
> *"This report is generated strictly for informational, educational, and long-term research purposes. AgentGuard AI is NOT a SEBI-registered Investment Advisor or Research Analyst. Nothing contained herein constitutes financial advice, stock recommendation, trading call, or buy/sell signal. Securities investments are subject to market risks. AgentGuard AI does not engage in trading or trade execution."*
