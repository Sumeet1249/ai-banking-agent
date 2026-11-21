# TI-1: Market Intelligence Data Integrity & Calculation Methodology
**Module:** `@agentguard/market-data-mcp`  
**Standard:** Phase TI-1 Production Separation & Deterministic Financial Math  

---

## 1. Production vs. Demo Separation

The system distinguishes 4 operational environments:
1. `DEVELOPMENT`: Local developer workstation mode with mock stores and SQLite fallback.
2. `TEST`: Deterministic in-memory unit/integration test mode.
3. `DEMO`: Interactive hackathon/demonstration mode with realistic seeded fixtures for `INFY`, `TCS`, `RELIANCE`, `HDFCBANK`, `TATAMOTORS`, `HDFCGROWTH`, and `NIPPONAMCGOLD`.
4. `PRODUCTION`: Strict production mode.

### Production Constraints:
- In `PRODUCTION`, synthetic fixtures are **strictly prohibited** from masquerading as live customer accounts or real-time exchange quotes.
- Every API response is stamped with a canonical `MarketResponseMetadata` envelope:
  - `provider`: Data vendor attribution (e.g., `DRISHTI_MCP`, `NSE_BSE_MASTER`, `Upstox`).
  - `data_delay_ms`: Data latency in milliseconds (-1 for end-of-day/historical, >0 for delayed feeds, 0 for live).
  - `entitlement_status`: `LICENSED` | `DELAYED_PUBLIC` | `SYNTHETIC_DEMO` | `UNENTITLED`.
  - `is_synthetic`: Explicit boolean indicating whether data is generated/simulated.
  - `is_cached`: Explicit boolean indicating cache origin.
  - `environment`: Active runtime environment (`DEVELOPMENT`, `TEST`, `DEMO`, `PRODUCTION`).

---

## 2. Deterministic Financial Calculation Engine

All financial ratios and projections are implemented in `FinancialMath` (`src/finance/financial-math.ts`) as pure, deterministic functions without floating-point accumulation drift:

### 2.1 Price-to-Earnings (P/E)
$$\text{P/E} = \frac{\text{Current Market Price per Share}}{\text{Audited Diluted EPS}}$$
Returns `null` when EPS $\le 0$ or price is invalid. Rounded deterministically to 2 decimal places.

### 2.2 Price-to-Book (P/B)
$$\text{P/B} = \frac{\text{Current Market Price per Share}}{\text{Book Value per Share (BVPS)}}$$

### 2.3 Return on Equity (ROE) & Return on Capital Employed (ROCE)
$$\text{ROE} = \left(\frac{\text{Net Profit After Tax}}{\text{Total Shareholder Equity}}\right) \times 100$$
$$\text{ROCE} = \left(\frac{\text{EBIT}}{\text{Total Assets} - \text{Current Liabilities}}\right) \times 100$$

### 2.4 Maximum Historical Drawdown (MDD)
$$\text{MDD} = \max_{t \in [0, T]} \left( \frac{\text{Peak}_t - \text{Trough}_t}{\text{Peak}_t} \right) \times 100$$

### 2.5 Annualized Volatility
$$\sigma_{\text{ann}} = \sigma_{\text{daily}} \times \sqrt{252} \times 100$$

### 2.6 Wealth Compounding Horizon Projections
$$\text{FV} = \text{Corpus}_0 \times (1 + r_m)^n + \text{SIP} \times \frac{(1 + r_m)^n - 1}{r_m} \times (1 + r_m)$$
where $r_m = \frac{\text{CAGR}}{12}$ and $n = \text{years} \times 12$.

**Mandatory Integrity Invariant**: Projections explicitly flag `isGuaranteed: false` and make the assumed CAGR rate (`assumedAnnualCagrPercent`) completely visible and editable by the operator/customer. Silently assuming or promising fixed return rates is architecturally blocked.
