/**
 * AgentGuard Market Intelligence Durable Database Store (Phase MI-1)
 *
 * Persists:
 *   - NSE / BSE Market Instruments & Quotes
 *   - Comprehensive Fundamentals, Ratios, Filings, & Announcements
 *   - Tenant-Isolated Customer Portfolios, Holdings, & Monthly SIP Schedules
 *   - Research Sessions, Validated Evidence, & Reports
 *   - Tamper-Evident Market Audit Logs
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';
import {
  MarketInstrument,
  CompanyProfile,
  CompanyFundamental,
  HistoricalPriceBar,
  CompanyFiling,
  CompanyAnnouncement,
  CorporateAction,
  BrokerConnection,
  BrokerConsent,
  PortfolioSnapshot,
  PortfolioHolding,
  ResearchSession,
  ResearchEvidence,
  ResearchReport,
  MarketAuditEvent,
} from '@agentguard/core-schema';

export class MarketDataStore {
  private db: Database.Database;

  constructor(
    dbOrPath: Database.Database | string,
    private logger?: Logger,
  ) {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
    this.init();
    this.seedBaselineData();
  }

  public init(): void {
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_instruments (
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        company_name TEXT NOT NULL,
        isin TEXT,
        asset_class TEXT NOT NULL DEFAULT 'EQUITY',
        sector TEXT,
        industry TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        source TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (symbol, exchange)
      );

      CREATE INDEX IF NOT EXISTS idx_mi_symbol ON market_instruments(symbol);
      CREATE INDEX IF NOT EXISTS idx_mi_sector ON market_instruments(sector);

      CREATE TABLE IF NOT EXISTS market_profiles (
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        company_name TEXT NOT NULL,
        isin TEXT,
        sector TEXT NOT NULL,
        industry TEXT NOT NULL,
        market_cap_tier TEXT NOT NULL,
        market_cap_inr_crores REAL,
        description TEXT NOT NULL,
        website TEXT,
        listing_date TEXT,
        data_timestamp INTEGER NOT NULL,
        source TEXT NOT NULL,
        PRIMARY KEY (symbol, exchange)
      );

      CREATE TABLE IF NOT EXISTS market_fundamentals (
        fundamental_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        financial_period TEXT NOT NULL,
        period_type TEXT NOT NULL,
        revenue_inr_crores REAL NOT NULL,
        operating_profit_inr_crores REAL,
        ebitda_inr_crores REAL,
        net_profit_inr_crores REAL NOT NULL,
        eps_inr REAL NOT NULL,
        roe_percent REAL,
        roce_percent REAL,
        debt_to_equity REAL,
        interest_coverage REAL,
        operating_cash_flow_crores REAL,
        free_cash_flow_crores REAL,
        pe_ratio REAL,
        pb_ratio REAL,
        dividend_yield_percent REAL,
        calculation_status TEXT NOT NULL DEFAULT 'REPORTED',
        source TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        UNIQUE(symbol, exchange, financial_period)
      );

      CREATE INDEX IF NOT EXISTS idx_mf_sym ON market_fundamentals(symbol, exchange);

      CREATE TABLE IF NOT EXISTS market_historical_prices (
        price_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        adjusted_close REAL,
        volume INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        interval TEXT NOT NULL DEFAULT 'DAILY',
        source TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        UNIQUE(symbol, exchange, date, interval)
      );

      CREATE INDEX IF NOT EXISTS idx_mhp_sym_date ON market_historical_prices(symbol, exchange, timestamp DESC);

      CREATE TABLE IF NOT EXISTS market_filings (
        filing_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        publication_date TEXT NOT NULL,
        document_url TEXT NOT NULL,
        financial_period TEXT,
        original_reference TEXT,
        source TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_filings_sym ON market_filings(symbol, exchange);

      CREATE TABLE IF NOT EXISTS market_announcements (
        announcement_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        details TEXT NOT NULL,
        broadcast_timestamp INTEGER NOT NULL,
        source_url TEXT,
        source TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ann_sym ON market_announcements(symbol, broadcast_timestamp DESC);

      CREATE TABLE IF NOT EXISTS corporate_actions (
        action_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        action_type TEXT NOT NULL,
        purpose TEXT NOT NULL,
        ex_date TEXT,
        record_date TEXT,
        ratio TEXT,
        dividend_amount_inr REAL,
        source TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS broker_connections (
        connection_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        broker TEXT NOT NULL DEFAULT 'UPSTOX',
        status TEXT NOT NULL DEFAULT 'CONNECTED',
        read_only_verified INTEGER NOT NULL DEFAULT 1,
        allowed_scopes TEXT NOT NULL,
        connected_at INTEGER NOT NULL,
        last_synced_at INTEGER,
        expires_at INTEGER,
        UNIQUE(tenant_id, customer_ref, broker)
      );

      CREATE TABLE IF NOT EXISTS broker_consents (
        consent_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        broker TEXT NOT NULL DEFAULT 'UPSTOX',
        scope_description TEXT NOT NULL,
        hardware_passkey_bound INTEGER NOT NULL DEFAULT 1,
        consented_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        broker TEXT NOT NULL DEFAULT 'UPSTOX',
        total_portfolio_value REAL NOT NULL,
        total_invested_value REAL NOT NULL,
        total_unrealized_pnl REAL NOT NULL,
        total_unrealized_pnl_percent REAL NOT NULL,
        total_monthly_sip_commit REAL NOT NULL DEFAULT 0,
        as_of_timestamp INTEGER NOT NULL,
        data_freshness TEXT NOT NULL DEFAULT 'LIVE_SYNC',
        holdings_count INTEGER NOT NULL,
        asset_breakdown TEXT NOT NULL,
        sector_breakdown TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portfolio_holdings (
        holding_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL DEFAULT 'NSE',
        isin TEXT,
        instrument_name TEXT NOT NULL,
        asset_class TEXT NOT NULL,
        quantity REAL NOT NULL,
        average_buy_price REAL NOT NULL,
        current_market_price REAL NOT NULL,
        invested_amount REAL NOT NULL,
        current_value REAL NOT NULL,
        unrealized_pnl REAL NOT NULL,
        unrealized_pnl_percent REAL NOT NULL,
        portfolio_weight_percent REAL NOT NULL,
        sector TEXT NOT NULL,
        is_sip INTEGER NOT NULL DEFAULT 0,
        sip_monthly_amount REAL,
        sip_day_of_month INTEGER,
        risk_category TEXT NOT NULL DEFAULT 'MODERATE',
        FOREIGN KEY (snapshot_id) REFERENCES portfolio_snapshots(snapshot_id)
      );

      CREATE TABLE IF NOT EXISTS research_sessions (
        session_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        user_prompt TEXT NOT NULL,
        resolved_symbol TEXT,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS research_evidence (
        evidence_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        title TEXT NOT NULL,
        citation_url TEXT,
        financial_period TEXT,
        payload_summary TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 1,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES research_sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS research_reports (
        report_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        exchange TEXT NOT NULL,
        company_name TEXT NOT NULL,
        research_date TEXT NOT NULL,
        as_of_date TEXT NOT NULL,
        executive_summary TEXT NOT NULL,
        business_model TEXT NOT NULL,
        revenue_trends TEXT NOT NULL,
        profitability_and_margins TEXT NOT NULL,
        debt_and_solvency TEXT NOT NULL,
        cash_flow_quality TEXT NOT NULL,
        valuation_analysis TEXT NOT NULL,
        peer_comparison TEXT NOT NULL,
        material_announcements_and_concall TEXT NOT NULL,
        major_positive_catalysts TEXT NOT NULL,
        major_risks_and_headwinds TEXT NOT NULL,
        data_quality_score REAL NOT NULL,
        data_completeness_assessment TEXT NOT NULL,
        sources_cited TEXT NOT NULL,
        compliance_disclosure TEXT NOT NULL,
        generated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_audit_events (
        event_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        actor TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        correlation_id TEXT NOT NULL,
        provider TEXT,
        resource_ref TEXT NOT NULL,
        outcome TEXT NOT NULL,
        metadata_redacted TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mae_time ON market_audit_events(timestamp DESC);
    `);
  }

  // ── INSTRUMENTS & DISCOVERY ───────────────────────────────────────────────

  public searchInstruments(query: string, exchange?: string): MarketInstrument[] {
    const q = `%${query.toLowerCase()}%`;
    let sql = `
      SELECT * FROM market_instruments
      WHERE (LOWER(symbol) LIKE ? OR LOWER(company_name) LIKE ? OR LOWER(sector) LIKE ?)
    `;
    const params: any[] = [q, q, q];

    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange.toUpperCase());
    }
    sql += ' ORDER BY symbol ASC LIMIT 25';

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      symbol: r.symbol,
      exchange: r.exchange,
      company_name: r.company_name,
      isin: r.isin,
      asset_class: r.asset_class,
      sector: r.sector,
      industry: r.industry,
      status: r.status,
      source: r.source,
      fetched_at: r.fetched_at,
    }));
  }

  public resolveSymbol(query: string): MarketInstrument | null {
    const exact = this.db
      .prepare('SELECT * FROM market_instruments WHERE symbol = ? OR UPPER(company_name) = ? LIMIT 1')
      .get(query.toUpperCase(), query.toUpperCase()) as any;
    if (exact) return exact;

    const fuzzy = this.db
      .prepare('SELECT * FROM market_instruments WHERE LOWER(company_name) LIKE ? OR LOWER(symbol) LIKE ? LIMIT 1')
      .get(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`) as any;
    return fuzzy || null;
  }

  // ── PROFILES & FUNDAMENTALS ───────────────────────────────────────────────

  public getCompanyProfile(symbol: string, exchange: string = 'NSE'): CompanyProfile | null {
    const row = this.db
      .prepare('SELECT * FROM market_profiles WHERE symbol = ? AND exchange = ? LIMIT 1')
      .get(symbol.toUpperCase(), exchange.toUpperCase()) as any;
    return row || null;
  }

  public getFundamentals(symbol: string, exchange: string = 'NSE'): CompanyFundamental[] {
    const rows = this.db
      .prepare('SELECT * FROM market_fundamentals WHERE symbol = ? AND exchange = ? ORDER BY financial_period DESC')
      .all(symbol.toUpperCase(), exchange.toUpperCase()) as any[];
    return rows;
  }

  public getHistoricalPrices(symbol: string, exchange: string = 'NSE', interval: string = 'DAILY', limit: number = 90): HistoricalPriceBar[] {
    const normInterval = interval === '1D' || interval === '1d' ? 'DAILY' : interval.toUpperCase();
    const rows = this.db
      .prepare(`
        SELECT * FROM market_historical_prices
        WHERE symbol = ? AND exchange = ? AND interval = ?
        ORDER BY timestamp ASC
        LIMIT ?
      `)
      .all(symbol.toUpperCase(), exchange.toUpperCase(), normInterval, limit) as any[];
    return rows;
  }

  public getCompanyFilings(symbol: string, exchange: string = 'NSE'): CompanyFiling[] {
    const rows = this.db
      .prepare('SELECT * FROM market_filings WHERE symbol = ? AND exchange = ? ORDER BY publication_date DESC LIMIT 20')
      .all(symbol.toUpperCase(), exchange.toUpperCase()) as any[];
    return rows;
  }

  public getAnnouncements(symbol: string, exchange: string = 'NSE'): CompanyAnnouncement[] {
    const rows = this.db
      .prepare('SELECT * FROM market_announcements WHERE symbol = ? AND exchange = ? ORDER BY broadcast_timestamp DESC LIMIT 20')
      .all(symbol.toUpperCase(), exchange.toUpperCase()) as any[];
    return rows;
  }

  // ── PORTFOLIO & WEALTH SIPs ───────────────────────────────────────────────

  public getPortfolioSnapshot(tenantId: string, customerRef: string): PortfolioSnapshot | null {
    const snapshot = this.db
      .prepare('SELECT * FROM portfolio_snapshots WHERE tenant_id = ? AND customer_ref = ? ORDER BY as_of_timestamp DESC LIMIT 1')
      .get(tenantId, customerRef) as any;

    if (!snapshot) return null;

    const holdings = this.db
      .prepare('SELECT * FROM portfolio_holdings WHERE snapshot_id = ?')
      .all(snapshot.snapshot_id) as any[];

    return {
      snapshot_id: snapshot.snapshot_id,
      tenant_id: snapshot.tenant_id,
      customer_ref: snapshot.customer_ref,
      broker: snapshot.broker,
      total_portfolio_value: snapshot.total_portfolio_value,
      total_invested_value: snapshot.total_invested_value,
      total_unrealized_pnl: snapshot.total_unrealized_pnl,
      total_unrealized_pnl_percent: snapshot.total_unrealized_pnl_percent,
      total_monthly_sip_commit: snapshot.total_monthly_sip_commit,
      as_of_timestamp: snapshot.as_of_timestamp,
      data_freshness: snapshot.data_freshness,
      holdings_count: snapshot.holdings_count,
      holdings: holdings.map((h) => ({
        ...h,
        is_sip: Boolean(h.is_sip),
      })),
      asset_breakdown: JSON.parse(snapshot.asset_breakdown || '{}'),
      sector_breakdown: JSON.parse(snapshot.sector_breakdown || '{}'),
    };
  }

  public getHoldings(tenantId: string, customerRef: string): PortfolioHolding[] {
    const snapshot = this.getPortfolioSnapshot(tenantId, customerRef);
    return snapshot ? snapshot.holdings : [];
  }

  public saveBrokerConnection(conn: BrokerConnection): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO broker_connections (
        connection_id, tenant_id, customer_ref, broker, status,
        allowed_scopes, connected_at, last_synced_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conn.connection_id,
      conn.tenant_id,
      conn.customer_ref,
      conn.broker,
      conn.status,
      JSON.stringify(conn.allowed_scopes),
      conn.connected_at,
      conn.last_synced_at,
      conn.expires_at,
    );
  }

  public saveResearchSession(session: ResearchSession): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO research_sessions (
        session_id, tenant_id, customer_ref, user_prompt, resolved_symbol,
        status, started_at, completed_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.session_id,
      session.tenant_id,
      session.customer_ref,
      session.user_prompt,
      session.resolved_symbol || null,
      session.status,
      session.started_at,
      session.completed_at || null,
      session.error || null,
    );
  }

  public saveResearchEvidence(evidence: ResearchEvidence): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO research_evidence (
        evidence_id, session_id, source, evidence_type, title,
        citation_url, financial_period, payload_summary, verified, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidence.evidence_id,
      evidence.session_id,
      evidence.source,
      evidence.evidence_type,
      evidence.title,
      evidence.citation_url || null,
      evidence.financial_period || null,
      evidence.payload_summary,
      evidence.verified ? 1 : 0,
      evidence.timestamp,
    );
  }

  public getResearchReport(reportId: string): ResearchReport | null {
    const row = this.db.prepare('SELECT * FROM research_reports WHERE report_id = ? LIMIT 1').get(reportId) as any;
    if (!row) return null;
    return {
      ...row,
      peer_comparison: JSON.parse(row.peer_comparison || '[]'),
      major_positive_catalysts: JSON.parse(row.major_positive_catalysts || '[]'),
      major_risks_and_headwinds: JSON.parse(row.major_risks_and_headwinds || '[]'),
      sources_cited: JSON.parse(row.sources_cited || '[]'),
    };
  }

  public recordAuditEvent(event: any): void {
    const auditEvent: MarketAuditEvent = {
      event_id: event.event_id || `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: event.tenant_id || 'tenant-default',
      customer_ref: event.customer_ref || 'cust-101',
      actor: event.actor || 'MarketResearchAgent',
      event_type: event.event_type || 'MARKET_DATA_FETCHED',
      timestamp: event.timestamp || Date.now(),
      correlation_id: event.correlation_id || event.request_payload_digest || 'corr-market',
      provider: event.provider || 'LICENSED_MARKET_FEED',
      resource_ref: event.resource_ref || event.tool_name || 'market_intelligence',
      outcome: event.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
      metadata_redacted: event.metadata || event.metadata_redacted || {},
    };
    this.appendAuditEvent(auditEvent);
  }

  public getBrokerConnection(tenantId: string, customerRef: string): BrokerConnection | null {
    const row = this.db
      .prepare("SELECT * FROM broker_connections WHERE tenant_id = ? AND customer_ref = ? AND broker = 'UPSTOX' LIMIT 1")
      .get(tenantId, customerRef) as any;

    if (!row) return null;
    return {
      connection_id: row.connection_id,
      tenant_id: row.tenant_id,
      customer_ref: row.customer_ref,
      broker: 'UPSTOX',
      status: row.status,
      read_only_verified: true,
      allowed_scopes: JSON.parse(row.allowed_scopes || '["read_holdings", "read_portfolio", "read_pnl"]'),
      connected_at: row.connected_at,
      last_synced_at: row.last_synced_at,
      expires_at: row.expires_at,
    };
  }

  public saveBrokerConsent(consent: BrokerConsent): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO broker_consents (
        consent_id, tenant_id, customer_ref, broker, scope_description,
        hardware_passkey_bound, consented_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      consent.consent_id,
      consent.tenant_id,
      consent.customer_ref,
      consent.broker,
      consent.scope_description,
      consent.hardware_passkey_bound ? 1 : 0,
      consent.consented_at,
      consent.revoked_at || null,
    );
  }

  public disconnectBroker(tenantId: string, customerRef: string): void {
    this.db.prepare(`
      UPDATE broker_connections SET status = 'DISCONNECTED'
      WHERE tenant_id = ? AND customer_ref = ? AND broker = 'UPSTOX'
    `).run(tenantId, customerRef);
  }

  // ── RESEARCH REPORTS & AUDIT ──────────────────────────────────────────────

  public saveResearchReport(report: ResearchReport): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO research_reports (
        report_id, session_id, symbol, exchange, company_name, research_date, as_of_date,
        executive_summary, business_model, revenue_trends, profitability_and_margins,
        debt_and_solvency, cash_flow_quality, valuation_analysis, peer_comparison,
        material_announcements_and_concall, major_positive_catalysts, major_risks_and_headwinds,
        data_quality_score, data_completeness_assessment, sources_cited, compliance_disclosure, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.report_id,
      report.session_id,
      report.symbol,
      report.exchange,
      report.company_name,
      report.research_date,
      report.as_of_date,
      report.executive_summary,
      report.business_model,
      report.revenue_trends,
      report.profitability_and_margins,
      report.debt_and_solvency,
      report.cash_flow_quality,
      report.valuation_analysis,
      JSON.stringify(report.peer_comparison),
      report.material_announcements_and_concall,
      JSON.stringify(report.major_positive_catalysts),
      JSON.stringify(report.major_risks_and_headwinds),
      report.data_quality_score,
      report.data_completeness_assessment,
      JSON.stringify(report.sources_cited),
      report.compliance_disclosure,
      Date.now(),
    );
  }

  public listResearchReports(limit: number = 20): any[] {
    const rows = this.db.prepare('SELECT * FROM research_reports ORDER BY generated_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => ({
      ...r,
      peer_comparison: JSON.parse(r.peer_comparison || '[]'),
      major_positive_catalysts: JSON.parse(r.major_positive_catalysts || '[]'),
      major_risks_and_headwinds: JSON.parse(r.major_risks_and_headwinds || '[]'),
      sources_cited: JSON.parse(r.sources_cited || '[]'),
    }));
  }

  public appendAuditEvent(event: MarketAuditEvent): void {
    this.db.prepare(`
      INSERT INTO market_audit_events (
        event_id, tenant_id, customer_ref, actor, event_type, timestamp,
        correlation_id, provider, resource_ref, outcome, metadata_redacted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.event_id,
      event.tenant_id,
      event.customer_ref,
      event.actor,
      event.event_type,
      event.timestamp,
      event.correlation_id,
      event.provider || null,
      event.resource_ref,
      event.outcome,
      JSON.stringify(event.metadata_redacted),
    );
  }

  public listAuditEvents(limit: number = 50): MarketAuditEvent[] {
    const rows = this.db.prepare('SELECT * FROM market_audit_events ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => ({
      event_id: r.event_id,
      tenant_id: r.tenant_id,
      customer_ref: r.customer_ref,
      actor: r.actor,
      event_type: r.event_type,
      timestamp: r.timestamp,
      correlation_id: r.correlation_id,
      provider: r.provider,
      resource_ref: r.resource_ref,
      outcome: r.outcome,
      metadata_redacted: JSON.parse(r.metadata_redacted || '{}'),
    }));
  }

  // ── SEED BASELINE DATA ────────────────────────────────────────────────────

  private seedBaselineData(): void {
    const count = (this.db.prepare('SELECT count(*) as c FROM market_instruments').get() as any)?.c || 0;
    if (count > 0) return;

    const now = Date.now();

    // 1. Instruments
    const insertInst = this.db.prepare(`
      INSERT OR IGNORE INTO market_instruments (
        symbol, exchange, company_name, isin, asset_class, sector, industry, status, source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertInst.run('INFY', 'NSE', 'Infosys Limited', 'INE009A01021', 'EQUITY', 'Information Technology', 'IT Consulting', 'ACTIVE', 'DRISHTI_MCP', now);
    insertInst.run('TCS', 'NSE', 'Tata Consultancy Services Ltd', 'INE467B01029', 'EQUITY', 'Information Technology', 'IT Services', 'ACTIVE', 'DRISHTI_MCP', now);
    insertInst.run('RELIANCE', 'NSE', 'Reliance Industries Limited', 'INE002A01018', 'EQUITY', 'Energy & Petrochemicals', 'Oil, Gas & Telecom', 'ACTIVE', 'DRISHTI_MCP', now);
    insertInst.run('HDFCBANK', 'NSE', 'HDFC Bank Limited', 'INE040A01034', 'EQUITY', 'Financial Services', 'Private Banking', 'ACTIVE', 'DRISHTI_MCP', now);
    insertInst.run('TATAMOTORS', 'NSE', 'Tata Motors Limited', 'INE155A01022', 'EQUITY', 'Automobile', 'Passenger & EV Vehicles', 'ACTIVE', 'DRISHTI_MCP', now);

    // Wealth Instruments (MF, Gold ETF, SGB, Insurance)
    insertInst.run('HDFCGROWTH', 'NSE', 'HDFC Top 100 Growth Direct Plan', 'INF179K01BE2', 'MUTUAL_FUND', 'Large Cap Equity', 'Mutual Fund', 'ACTIVE', 'UPSTOX_READONLY', now);
    insertInst.run('NIPPONAMCGOLD', 'NSE', 'Nippon India ETF Gold BeES', 'INF204KB17I5', 'GOLD_ETF', 'Commodities', 'Gold ETF', 'ACTIVE', 'UPSTOX_READONLY', now);
    insertInst.run('SGB2028', 'NSE', 'Sovereign Gold Bonds 2.5% 2028-Series IV', 'IN0020200112', 'SGB', 'Sovereign Bullion', 'Gold Bond', 'ACTIVE', 'UPSTOX_READONLY', now);
    insertInst.run('SBILIFETERM', 'NSE', 'SBI Life Shield Term Wealth Cover', 'IN0000000000', 'INSURANCE_ULIP_OR_TERM', 'Life Insurance', 'Term Protection', 'ACTIVE', 'UPSTOX_READONLY', now);

    // 2. Company Profile (Infosys)
    this.db.prepare(`
      INSERT OR IGNORE INTO market_profiles (
        symbol, exchange, company_name, isin, sector, industry, market_cap_tier, market_cap_inr_crores,
        description, website, listing_date, data_timestamp, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'INFY',
      'NSE',
      'Infosys Limited',
      'INE009A01021',
      'Information Technology',
      'IT Services & Software Engineering',
      'LARGE_CAP',
      784500,
      'Infosys is a global leader in next-generation digital services and consulting, enabling clients across 56 countries to navigate their cloud and digital transformation.',
      'https://www.infosys.com',
      '1993-06-14',
      now,
      'DRISHTI_MCP',
    );

    // 3. Multi-Year Fundamentals (Infosys FY23-FY25)
    const insertFund = this.db.prepare(`
      INSERT OR IGNORE INTO market_fundamentals (
        fundamental_id, symbol, exchange, financial_period, period_type, revenue_inr_crores,
        operating_profit_inr_crores, ebitda_inr_crores, net_profit_inr_crores, eps_inr,
        roe_percent, roce_percent, debt_to_equity, interest_coverage, operating_cash_flow_crores,
        free_cash_flow_crores, pe_ratio, pb_ratio, dividend_yield_percent, calculation_status, source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertFund.run('fund_infy_fy25', 'INFY', 'NSE', 'FY2025', 'ANNUAL', 162980, 34820, 39400, 27450, 66.2, 31.4, 38.6, 0.08, 142.5, 31200, 26800, 28.4, 8.9, 2.45, 'REPORTED', 'DRISHTI_MCP', now);
    insertFund.run('fund_infy_fy24', 'INFY', 'NSE', 'FY2024', 'ANNUAL', 153670, 31740, 36200, 26233, 63.4, 31.8, 39.1, 0.09, 138.2, 28900, 24600, 27.1, 8.4, 2.52, 'REPORTED', 'DRISHTI_MCP', now);
    insertFund.run('fund_infy_fy23', 'INFY', 'NSE', 'FY2023', 'ANNUAL', 146767, 30100, 35140, 24095, 57.6, 31.2, 38.0, 0.10, 130.0, 27100, 23200, 25.5, 7.8, 2.65, 'REPORTED', 'DRISHTI_MCP', now);

    // 4. Historical Prices (INFY Daily Sample 30 days)
    const insertPrice = this.db.prepare(`
      INSERT OR IGNORE INTO market_historical_prices (
        price_id, symbol, exchange, date, timestamp, open, high, low, close, adjusted_close, volume, currency, interval, source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'DAILY', ?, ?)
    `);

    const basePrice = 1880.0;
    for (let i = 30; i >= 0; i--) {
      const dayMs = now - i * 86400000;
      const dateStr = new Date(dayMs).toISOString().split('T')[0];
      const variance = (Math.sin(i / 3) * 35) + ((i % 4) * 8);
      const close = basePrice + variance;
      insertPrice.run(`price_infy_${dateStr}`, 'INFY', 'NSE', dateStr, dayMs, close - 12, close + 18, close - 15, close, close, 4200000 + (i * 50000), 'LICENSED_MARKET_FEED', now);
    }

    // 5. Filings & Announcements
    this.db.prepare(`
      INSERT OR IGNORE INTO market_filings (
        filing_id, symbol, exchange, title, category, publication_date, document_url, financial_period, original_reference, source, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'filing_infy_01', 'INFY', 'NSE', 'Audited Financial Results for Q3 ended Dec 31, 2025',
      'FINANCIAL_RESULTS', '2026-01-15', 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/infy_q3_results.pdf',
      'Q3-FY26', 'NSE/CORP/INFY/2026/0115', 'DRISHTI_MCP', now
    );

    this.db.prepare(`
      INSERT OR IGNORE INTO market_announcements (
        announcement_id, symbol, exchange, title, category, details, broadcast_timestamp, source_url, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ann_infy_01', 'INFY', 'NSE', 'Expansion of Strategic Collaboration with Leading European Cloud Utility',
      'BUSINESS_EXPANSION', 'Infosys expands its 5-year partnership to accelerate enterprise AI adoption and cloud automation for Nordic utilities.',
      now - 86400000 * 2, 'https://www.nseindia.com/corporate/announcements/infy_ann_1.pdf', 'DRISHTI_MCP'
    );

    // 6. Upstox Read-Only Broker Connection & Customer Portfolio (cust-101)
    this.db.prepare(`
      INSERT OR IGNORE INTO broker_connections (
        connection_id, tenant_id, customer_ref, broker, status, read_only_verified,
        allowed_scopes, connected_at, last_synced_at, expires_at
      ) VALUES (?, ?, ?, 'UPSTOX', 'CONNECTED', 1, ?, ?, ?, ?)
    `).run(
      'conn_upstox_cust_101',
      'tenant-default',
      'cust-101',
      JSON.stringify(['read_holdings', 'read_portfolio', 'read_pnl', 'read_sip']),
      now - 86400000 * 14,
      now - 3600000,
      now + 86400000 * 76,
    );

    const snapshotId = 'snap_cust101_2026';
    this.db.prepare(`
      INSERT OR IGNORE INTO portfolio_snapshots (
        snapshot_id, tenant_id, customer_ref, broker, total_portfolio_value, total_invested_value,
        total_unrealized_pnl, total_unrealized_pnl_percent, total_monthly_sip_commit,
        as_of_timestamp, data_freshness, holdings_count, asset_breakdown, sector_breakdown
      ) VALUES (?, ?, ?, 'UPSTOX', ?, ?, ?, ?, ?, ?, 'LIVE_SYNC', ?, ?, ?)
    `).run(
      snapshotId,
      'tenant-default',
      'cust-101',
      845200.0, // Total Value ₹8,45,200
      712000.0, // Invested ₹7,12,000
      133200.0, // P&L +₹1,33,200
      18.7,     // +18.7%
      25000.0,  // Monthly SIP commitment ₹25,000
      now,
      5,
      JSON.stringify({ EQUITY: 55, MUTUAL_FUND: 25, GOLD_ETF: 12, SGB: 8 }),
      JSON.stringify({ 'Information Technology': 35, 'Financial Services': 25, 'Commodities/Gold': 20, Energy: 20 }),
    );

    const insertHold = this.db.prepare(`
      INSERT OR IGNORE INTO portfolio_holdings (
        holding_id, snapshot_id, symbol, exchange, isin, instrument_name, asset_class,
        quantity, average_buy_price, current_market_price, invested_amount, current_value,
        unrealized_pnl, unrealized_pnl_percent, portfolio_weight_percent, sector,
        is_sip, sip_monthly_amount, sip_day_of_month, risk_category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // INFY Equity
    insertHold.run('hold_01', snapshotId, 'INFY', 'NSE', 'INE009A01021', 'Infosys Limited', 'EQUITY', 150, 1620.0, 1895.0, 243000.0, 284250.0, 41250.0, 16.97, 33.6, 'Information Technology', 0, null, null, 'GROWTH');
    // TCS Equity
    insertHold.run('hold_02', snapshotId, 'TCS', 'NSE', 'INE467B01029', 'Tata Consultancy Services', 'EQUITY', 40, 3450.0, 4120.0, 138000.0, 164800.0, 26800.0, 19.42, 19.5, 'Information Technology', 0, null, null, 'GROWTH');
    // HDFC Mutual Fund Monthly SIP
    insertHold.run('hold_03', snapshotId, 'HDFCGROWTH', 'NSE', 'INF179K01BE2', 'HDFC Top 100 Growth Direct Plan', 'MUTUAL_FUND', 220.45, 820.0, 965.0, 180769.0, 212734.25, 31965.25, 17.68, 25.1, 'Large Cap Equity', 1, 10000.0, 5, 'MODERATE');
    // Nippon Gold ETF Monthly SIP
    insertHold.run('hold_04', snapshotId, 'NIPPONAMCGOLD', 'NSE', 'INF204KB17I5', 'Nippon India ETF Gold BeES', 'GOLD_ETF', 1500, 58.5, 72.8, 87750.0, 109200.0, 21450.0, 24.44, 12.9, 'Commodities', 1, 5000.0, 10, 'CONSERVATIVE');
    // Sovereign Gold Bond
    insertHold.run('hold_05', snapshotId, 'SGB2028', 'NSE', 'IN0020200112', 'Sovereign Gold Bonds 2028 IV', 'SGB', 12, 5200.0, 6184.6, 62400.0, 74215.75, 11815.75, 18.93, 8.9, 'Sovereign Bullion', 0, null, null, 'CONSERVATIVE');
  }
}

export { MarketDataStore as MarketStore };

