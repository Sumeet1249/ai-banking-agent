import {
  MarketInstrumentSchema,
  CompanyProfileSchema,
  PortfolioHoldingSchema,
  PortfolioSnapshotSchema,
  ALLOWED_MARKET_TOOLS,
  PROHIBITED_TRADE_PATTERNS,
  AllowedMarketToolSchema,
} from './market-schema';

describe('Market Intelligence Canonical Contracts (Phase MI-1)', () => {
  it('validates MarketInstrument with Indian Exchange and NSE Symbol', () => {
    const validInstrument = {
      symbol: 'INFY',
      exchange: 'NSE',
      company_name: 'Infosys Limited',
      isin: 'INE009A01021',
      asset_class: 'EQUITY',
      sector: 'Information Technology',
      industry: 'IT Services & Consulting',
      status: 'ACTIVE',
      source: 'DRISHTI_MCP',
      fetched_at: Date.now(),
    };

    const parsed = MarketInstrumentSchema.parse(validInstrument);
    expect(parsed.symbol).toBe('INFY');
    expect(parsed.exchange).toBe('NSE');
    expect(parsed.asset_class).toBe('EQUITY');
  });

  it('validates Wealth Assets (Mutual Funds, Gold ETF, Fixed SIP)', () => {
    const sipHolding = {
      holding_id: 'hold_mf_01',
      symbol: 'HDFCGROWTH',
      exchange: 'NSE',
      instrument_name: 'HDFC Top 100 Growth Direct Plan',
      asset_class: 'MUTUAL_FUND',
      quantity: 124.582, // Fractional units
      average_buy_price: 850.40,
      current_market_price: 940.20,
      invested_amount: 105944.53,
      current_value: 117131.99,
      unrealized_pnl: 11187.46,
      unrealized_pnl_percent: 10.56,
      portfolio_weight_percent: 25.0,
      sector: 'Large Cap Equity',
      is_sip: true,
      sip_monthly_amount: 10000,
      sip_day_of_month: 5,
      risk_category: 'GROWTH',
    };

    const parsed = PortfolioHoldingSchema.parse(sipHolding);
    expect(parsed.is_sip).toBe(true);
    expect(parsed.sip_monthly_amount).toBe(10000);
    expect(parsed.quantity).toBe(124.582);
  });

  it('strictly validates Allowed Read-Only Market Tools and rejects Order Tools', () => {
    expect(ALLOWED_MARKET_TOOLS).toContain('market.get_stock_history');
    expect(ALLOWED_MARKET_TOOLS).toContain('market.get_fundamentals');
    expect(ALLOWED_MARKET_TOOLS).toContain('market.get_portfolio_snapshot');

    // Verify prohibited patterns catch execution tools
    const illegalTools = ['place_order', 'cancel_order', 'trade_buy', 'gtt_create', 'withdraw_funds'];
    for (const tool of illegalTools) {
      const isProhibited = PROHIBITED_TRADE_PATTERNS.some((pat) => tool.includes(pat));
      expect(isProhibited).toBe(true);
      expect(AllowedMarketToolSchema.safeParse(tool).success).toBe(false);
    }
  });
});
