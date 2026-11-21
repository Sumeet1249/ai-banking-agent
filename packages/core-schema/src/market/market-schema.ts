/**
 * AgentGuard Market Intelligence Canonical Contracts & Schemas (Phase MI-1)
 *
 * Implements:
 *   - Strictly Read-Only Indian Stock Market Research (NSE / BSE)
 *   - Long-Term Wealth Planning: Equities, Mutual Funds, Gold ETFs, Insurance & Monthly SIPs
 *   - Provider Attribution & Evidence Provenance (Drishti, Licensed Data, Upstox Read-Only)
 *   - Tenant-Isolated Customer Portfolio & Risk Snapshots
 *   - Positive Tool Allowlist (Execution Invariant: Zero Trade Execution Capabilities)
 */

import { z } from 'zod';

// ── ENUMS & BASE TYPES ───────────────────────────────────────────────────────

export const IndianExchangeSchema = z.enum(['NSE', 'BSE']);
export type IndianExchange = z.infer<typeof IndianExchangeSchema>;

export const AssetClassSchema = z.enum([
  'EQUITY',
  'MUTUAL_FUND',
  'GOLD_ETF',
  'SGB', // Sovereign Gold Bonds
  'INSURANCE_ULIP_OR_TERM',
  'FIXED_SIP',
  'INDEX_ETF',
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const PriceIntervalSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export type PriceInterval = z.infer<typeof PriceIntervalSchema>;

export const MarketDataProviderNameSchema = z.enum([
  'DRISHTI_MCP',
  'LICENSED_MARKET_FEED',
  'UPSTOX_READONLY',
  'MOCK_DEMO_FIXTURE',
]);
export type MarketDataProviderName = z.infer<typeof MarketDataProviderNameSchema>;

export const MarketAuditEventTypeSchema = z.enum([
  'MARKET_RESEARCH_STARTED',
  'MARKET_RESEARCH_COMPLETED',
  'MARKET_RESEARCH_FAILED',
  'MARKET_DATA_FETCHED',
  'MARKET_PROVIDER_FAILURE',
  'BROKER_CONNECTION_CREATED',
  'BROKER_CONSENT_GRANTED',
  'BROKER_PORTFOLIO_SYNCED',
  'BROKER_CONNECTION_REVOKED',
  'MARKET_REPORT_GENERATED',
  'MARKET_TOOL_DENIED',
]);
export type MarketAuditEventType = z.infer<typeof MarketAuditEventTypeSchema>;

// ── POSITIVE TOOL ALLOWLIST (READ-ONLY INVARIANT) ───────────────────────────

export const ALLOWED_MARKET_TOOLS = [
  'market.search_stock',
  'market.resolve_symbol',
  'market.get_stock_history',
  'market.get_company_profile',
  'market.get_fundamentals',
  'market.get_company_filings',
  'market.search_announcements',
  'market.get_earnings',
  'market.get_concall_transcripts',
  'market.get_corporate_actions',
  'market.get_sector_peers',
  'market.compare_companies',
  'market.get_market_status',
  'market.get_portfolio_snapshot',
  'market.analyze_portfolio_allocation',
  'market.analyze_sector_exposure',
  'market.calculate_historical_drawdown',
  'market.analyze_portfolio_risk',
  'market.generate_portfolio_report',
  'market.get_sip_schedules',
] as const;

export const AllowedMarketToolSchema = z.enum(ALLOWED_MARKET_TOOLS);
export type AllowedMarketTool = z.infer<typeof AllowedMarketToolSchema>;

// Prohibited Trade Keywords (Instant Hard Block)
export const PROHIBITED_TRADE_PATTERNS = [
  'order', 'trade', 'buy', 'sell', 'place', 'cancel', 'modify',
  'execute', 'transact', 'gtt', 'withdraw', 'transfer_fund', 'margin', 'leverage',
];

// ── INSTRUMENTS & QUOTES ────────────────────────────────────────────────────

export const MarketInstrumentSchema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: IndianExchangeSchema,
  company_name: z.string().min(1),
  isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/).nullable().optional(),
  asset_class: AssetClassSchema.default('EQUITY'),
  sector: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELISTED']).default('ACTIVE'),
  source: MarketDataProviderNameSchema,
  fetched_at: z.number().int().positive(),
});
export type MarketInstrument = z.infer<typeof MarketInstrumentSchema>;

export const HistoricalPriceBarSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  timestamp: z.number().int().positive(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  adjusted_close: z.number().nullable().optional(),
  volume: z.number().int().nonnegative(),
  currency: z.literal('INR').default('INR'),
  interval: PriceIntervalSchema.default('DAILY'),
  source: MarketDataProviderNameSchema,
  fetched_at: z.number().int().positive(),
});
export type HistoricalPriceBar = z.infer<typeof HistoricalPriceBarSchema>;

export const MarketQuoteSnapshotSchema = z.object({
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  company_name: z.string(),
  last_price: z.number(),
  change: z.number(),
  change_percent: z.number(),
  day_high: z.number().nullable().optional(),
  day_low: z.number().nullable().optional(),
  volume_shares: z.number().int().nonnegative(),
  currency: z.literal('INR').default('INR'),
  as_of_date: z.string(),
  data_freshness: z.enum(['END_OF_DAY', 'DELAYED_15MIN', 'HISTORICAL_SNAPSHOT']),
  source: MarketDataProviderNameSchema,
  fetched_at: z.number().int().positive(),
});
export type MarketQuoteSnapshot = z.infer<typeof MarketQuoteSnapshotSchema>;

// ── COMPANY PROFILE & FUNDAMENTALS ──────────────────────────────────────────

export const CompanyProfileSchema = z.object({
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  company_name: z.string(),
  isin: z.string().nullable().optional(),
  sector: z.string(),
  industry: z.string(),
  market_cap_tier: z.enum(['LARGE_CAP', 'MID_CAP', 'SMALL_CAP', 'MICRO_CAP']),
  market_cap_inr_crores: z.number().nullable().optional(),
  description: z.string(),
  website: z.string().url().nullable().optional(),
  listing_date: z.string().nullable().optional(),
  data_timestamp: z.number().int().positive(),
  source: MarketDataProviderNameSchema,
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const CompanyFundamentalSchema = z.object({
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  financial_period: z.string(), // e.g. "FY2025", "Q3-FY25"
  period_type: z.enum(['ANNUAL', 'QUARTERLY']),
  revenue_inr_crores: z.number(),
  operating_profit_inr_crores: z.number().nullable().optional(),
  ebitda_inr_crores: z.number().nullable().optional(),
  net_profit_inr_crores: z.number(),
  eps_inr: z.number(),
  roe_percent: z.number().nullable().optional(),
  roce_percent: z.number().nullable().optional(),
  debt_to_equity: z.number().nullable().optional(),
  interest_coverage: z.number().nullable().optional(),
  operating_cash_flow_crores: z.number().nullable().optional(),
  free_cash_flow_crores: z.number().nullable().optional(),
  pe_ratio: z.number().nullable().optional(),
  pb_ratio: z.number().nullable().optional(),
  dividend_yield_percent: z.number().nullable().optional(),
  calculation_status: z.enum(['REPORTED', 'DERIVED_FORMULA']),
  source: MarketDataProviderNameSchema,
  fetched_at: z.number().int().positive(),
});
export type CompanyFundamental = z.infer<typeof CompanyFundamentalSchema>;

// ── FILINGS, ANNOUNCEMENTS & CONCALLS ───────────────────────────────────────

export const CompanyFilingSchema = z.object({
  filing_id: z.string(),
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  title: z.string(),
  category: z.string(), // e.g. "ANNUAL_REPORT", "FINANCIAL_RESULTS", "INVESTOR_PRESENTATION"
  publication_date: z.string(),
  document_url: z.string().url(),
  financial_period: z.string().nullable().optional(),
  original_reference: z.string().nullable().optional(),
  source: MarketDataProviderNameSchema,
  fetched_at: z.number().int().positive(),
});
export type CompanyFiling = z.infer<typeof CompanyFilingSchema>;

export const CompanyAnnouncementSchema = z.object({
  announcement_id: z.string(),
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  title: z.string(),
  category: z.string(), // e.g. "BOARD_MEETING", "DIVIDEND", "EXPANSION", "REGULATORY"
  details: z.string(),
  broadcast_timestamp: z.number().int().positive(),
  source_url: z.string().url().nullable().optional(),
  source: MarketDataProviderNameSchema,
});
export type CompanyAnnouncement = z.infer<typeof CompanyAnnouncementSchema>;

export const CorporateActionSchema = z.object({
  action_id: z.string(),
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  action_type: z.enum(['DIVIDEND', 'BONUS', 'SPLIT', 'RIGHTS', 'BUYBACK', 'MERGER']),
  purpose: z.string(),
  ex_date: z.string().nullable().optional(),
  record_date: z.string().nullable().optional(),
  ratio: z.string().nullable().optional(), // e.g. "1:2", "5:1"
  dividend_amount_inr: z.number().nullable().optional(),
  source: MarketDataProviderNameSchema,
});
export type CorporateAction = z.infer<typeof CorporateActionSchema>;

// ── BROKER CONNECTION & CUSTOMER CONSENT (UPSTOX READ-ONLY) ─────────────────

export const BrokerConnectionSchema = z.object({
  connection_id: z.string(),
  tenant_id: z.string(),
  customer_ref: z.string(),
  broker: z.literal('UPSTOX'),
  status: z.enum(['CONNECTED', 'DISCONNECTED', 'EXPIRED', 'REVOKED']),
  read_only_verified: z.literal(true),
  allowed_scopes: z.array(z.string()).default(['read_holdings', 'read_portfolio', 'read_pnl']),
  connected_at: z.number().int().positive(),
  last_synced_at: z.number().int().positive().nullable(),
  expires_at: z.number().int().positive().nullable(),
});
export type BrokerConnection = z.infer<typeof BrokerConnectionSchema>;

export const BrokerConsentSchema = z.object({
  consent_id: z.string(),
  tenant_id: z.string(),
  customer_ref: z.string(),
  broker: z.literal('UPSTOX'),
  scope_description: z.string(),
  hardware_passkey_bound: z.boolean().default(true),
  consented_at: z.number().int().positive(),
  revoked_at: z.number().int().positive().nullable().optional(),
});
export type BrokerConsent = z.infer<typeof BrokerConsentSchema>;

// ── PORTFOLIO & WEALTH MODELS (SIP, MUTUAL FUNDS, GOLD ETF, INSURANCE) ──────

export const PortfolioHoldingSchema = z.object({
  holding_id: z.string(),
  symbol: z.string(),
  exchange: IndianExchangeSchema.default('NSE'),
  isin: z.string().nullable().optional(),
  instrument_name: z.string(),
  asset_class: AssetClassSchema,
  quantity: z.number().positive(), // Handles fractional units in Mutual Funds/Gold ETF
  average_buy_price: z.number().positive(),
  current_market_price: z.number().positive(),
  invested_amount: z.number().positive(),
  current_value: z.number().positive(),
  unrealized_pnl: z.number(),
  unrealized_pnl_percent: z.number(),
  portfolio_weight_percent: z.number().min(0).max(100),
  sector: z.string().default('Diversified'),
  // Dedicated long-term wealth attributes
  is_sip: z.boolean().default(false),
  sip_monthly_amount: z.number().nullable().optional(),
  sip_day_of_month: z.number().int().min(1).max(31).nullable().optional(),
  risk_category: z.enum(['CONSERVATIVE', 'MODERATE', 'GROWTH', 'HIGH_VOLATILITY']).default('MODERATE'),
});
export type PortfolioHolding = z.infer<typeof PortfolioHoldingSchema>;

export const PortfolioSnapshotSchema = z.object({
  snapshot_id: z.string(),
  tenant_id: z.string(),
  customer_ref: z.string(),
  broker: z.literal('UPSTOX').default('UPSTOX'),
  total_portfolio_value: z.number().nonnegative(),
  total_invested_value: z.number().nonnegative(),
  total_unrealized_pnl: z.number(),
  total_unrealized_pnl_percent: z.number(),
  total_monthly_sip_commit: z.number().nonnegative(),
  as_of_timestamp: z.number().int().positive(),
  data_freshness: z.enum(['LIVE_SYNC', 'STALE_CACHE', 'DISCONNECTED_OFFLINE']),
  holdings_count: z.number().int().nonnegative(),
  holdings: z.array(PortfolioHoldingSchema),
  asset_breakdown: z.record(z.number()), // e.g. { EQUITY: 60, MUTUAL_FUND: 25, GOLD_ETF: 15 }
  sector_breakdown: z.record(z.number()), // e.g. { TECHNOLOGY: 30, BANKING: 25, ENERGY: 10 }
});
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;

export const PortfolioRiskMetricSchema = z.object({
  risk_id: z.string(),
  snapshot_id: z.string(),
  single_stock_max_concentration_percent: z.number(),
  single_sector_max_concentration_percent: z.number(),
  historical_max_drawdown_percent: z.number(),
  historical_annualized_volatility_percent: z.number(),
  diversification_rating: z.enum(['HIGHLY_DIVERSIFIED', 'ADEQUATE', 'CONCENTRATED_CAUTION', 'HIGH_RISK']),
  observations: z.array(z.string()),
  computed_at: z.number().int().positive(),
});
export type PortfolioRiskMetric = z.infer<typeof PortfolioRiskMetricSchema>;

// ── RESEARCH ORCHESTRATION & REPORTS ────────────────────────────────────────

export const ResearchSessionSchema = z.object({
  session_id: z.string(),
  tenant_id: z.string(),
  customer_ref: z.string(),
  user_prompt: z.string(),
  resolved_symbol: z.string().nullable().optional(),
  status: z.enum(['INITIATED', 'RESOLVING_SYMBOL', 'GATHERING_EVIDENCE', 'COMPUTING_RATIOS', 'SYNTHESIZING_REPORT', 'COMPLETED', 'FAILED']),
  started_at: z.number().int().positive(),
  completed_at: z.number().int().positive().nullable(),
  error: z.string().nullable().optional(),
});
export type ResearchSession = z.infer<typeof ResearchSessionSchema>;

export const ResearchEvidenceSchema = z.object({
  evidence_id: z.string(),
  session_id: z.string(),
  source: MarketDataProviderNameSchema,
  evidence_type: z.enum(['COMPANY_PROFILE', 'HISTORICAL_PRICE', 'FINANCIAL_RATIO', 'FILING_ANN', 'CONCALL_TRANSCRIPT', 'PEER_BENCHMARK']),
  title: z.string(),
  citation_url: z.string().url().nullable().optional(),
  financial_period: z.string().nullable().optional(),
  payload_summary: z.string(),
  verified: z.boolean().default(true),
  timestamp: z.number().int().positive(),
});
export type ResearchEvidence = z.infer<typeof ResearchEvidenceSchema>;

export const ResearchReportSchema = z.object({
  report_id: z.string(),
  session_id: z.string(),
  symbol: z.string(),
  exchange: IndianExchangeSchema,
  company_name: z.string(),
  research_date: z.string(), // YYYY-MM-DD
  as_of_date: z.string(),
  executive_summary: z.string(),
  business_model: z.string(),
  revenue_trends: z.string(),
  profitability_and_margins: z.string(),
  debt_and_solvency: z.string(),
  cash_flow_quality: z.string(),
  valuation_analysis: z.string(),
  peer_comparison: z.array(z.object({
    symbol: z.string(),
    company_name: z.string(),
    pe_ratio: z.number().nullable().optional(),
    roe_percent: z.number().nullable().optional(),
    market_cap_crores: z.number().nullable().optional(),
  })),
  material_announcements_and_concall: z.string(),
  major_positive_catalysts: z.array(z.string()),
  major_risks_and_headwinds: z.array(z.string()),
  data_quality_score: z.number().min(0).max(100), // Explainable evidence completeness score
  data_completeness_assessment: z.string(),
  sources_cited: z.array(z.object({
    title: z.string(),
    source_provider: MarketDataProviderNameSchema,
    url: z.string().nullable().optional(),
    financial_period: z.string().nullable().optional(),
  })),
  compliance_disclosure: z.string(),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

// ── MARKET AUDIT EVENT ──────────────────────────────────────────────────────

export const MarketAuditEventSchema = z.object({
  event_id: z.string(),
  tenant_id: z.string(),
  customer_ref: z.string(),
  actor: z.string(),
  event_type: MarketAuditEventTypeSchema,
  timestamp: z.number().int().positive(),
  correlation_id: z.string(),
  provider: MarketDataProviderNameSchema.nullable().optional(),
  resource_ref: z.string(),
  outcome: z.enum(['SUCCESS', 'DENIED', 'FAILURE', 'TIMEOUT']),
  metadata_redacted: z.record(z.any()),
});
export type MarketAuditEvent = z.infer<typeof MarketAuditEventSchema>;

// ── MARKET RESPONSE METADATA (TI-1) ─────────────────────────────────────────

export const MarketResponseMetadataSchema = z.object({
  provider: z.string(),
  instrument: z.string().optional(),
  exchange: IndianExchangeSchema.optional(),
  source_timestamp: z.number().int().positive(),
  retrieved_at: z.number().int().positive(),
  data_delay_ms: z.number().int(),
  currency: z.literal('INR').default('INR'),
  entitlement_status: z.enum(['LICENSED', 'DELAYED_PUBLIC', 'SYNTHETIC_DEMO', 'UNENTITLED']),
  is_synthetic: z.boolean(),
  is_cached: z.boolean(),
  environment: z.enum(['DEVELOPMENT', 'TEST', 'DEMO', 'PRODUCTION']),
});
export type MarketResponseMetadata = z.infer<typeof MarketResponseMetadataSchema>;

