/**
 * Unit Tests: Market Store SQLite Persistence (Phase MI-9)
 */

import Database from 'better-sqlite3';
import { MarketDataStore } from '../db/market-store';

describe('MarketDataStore', () => {
  let db: Database.Database;
  let store: MarketDataStore;

  beforeEach(() => {
    // In-memory SQLite for deterministic, isolated unit testing
    db = new Database(':memory:');
    store = new MarketDataStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Instruments & Symbol Resolution', () => {
    it('seeds baseline Indian blue-chips and wealth instruments', () => {
      const allNse = store.searchInstruments('', 'NSE');
      expect(allNse.length).toBeGreaterThanOrEqual(9);

      const symbols = allNse.map((i) => i.symbol);
      expect(symbols).toContain('INFY');
      expect(symbols).toContain('TCS');
      expect(symbols).toContain('HDFCBANK');
      expect(symbols).toContain('HDFCGROWTH');
      expect(symbols).toContain('NIPPONAMCGOLD');
      expect(symbols).toContain('SGB2028');
    });

    it('resolves symbol by exact and fuzzy company name', () => {
      const exact = store.resolveSymbol('INFY');
      expect(exact).not.toBeNull();
      expect(exact?.company_name).toBe('Infosys Limited');

      const fuzzy = store.resolveSymbol('tata consultancy');
      expect(fuzzy).not.toBeNull();
      expect(fuzzy?.symbol).toBe('TCS');
    });
  });

  describe('Profiles & Audited Fundamentals', () => {
    it('retrieves company profile for INFY', () => {
      const profile = store.getCompanyProfile('INFY', 'NSE');
      expect(profile).not.toBeNull();
      expect(profile?.sector).toBe('Information Technology');
      expect(profile?.market_cap_tier).toBe('LARGE_CAP');
    });

    it('retrieves multi-year fundamentals sorted by financial period', () => {
      const fundamentals = store.getFundamentals('INFY', 'NSE');
      expect(fundamentals.length).toBeGreaterThanOrEqual(3);
      expect(fundamentals[0].financial_period).toBe('FY2025');
      expect(fundamentals[0].roe_percent).toBeGreaterThan(25);
    });

    it('retrieves historical price bars', () => {
      const prices = store.getHistoricalPrices('INFY', 'NSE', 'DAILY', 30);
      expect(prices.length).toBeGreaterThan(0);
      expect(prices[0].currency).toBe('INR');
      expect(prices[0].close).toBeGreaterThan(1500);
    });
  });

  describe('Customer Wealth Portfolio & Fixed SIPs', () => {
    it('retrieves seeded portfolio snapshot for cust-101', () => {
      const snapshot = store.getPortfolioSnapshot('tenant-default', 'cust-101');
      expect(snapshot).not.toBeNull();
      expect(snapshot?.broker).toBe('UPSTOX');
      expect(snapshot?.total_portfolio_value).toBeGreaterThan(500000);
      expect(snapshot?.total_monthly_sip_commit).toBe(25000);

      // Check holdings
      const holdings = snapshot?.holdings || [];
      expect(holdings.length).toBe(5);

      const mfHolding = holdings.find((h) => h.symbol === 'HDFCGROWTH');
      expect(mfHolding).toBeDefined();
      expect(mfHolding?.is_sip).toBe(true);
      expect(mfHolding?.sip_monthly_amount).toBe(10000);

      const goldHolding = holdings.find((h) => h.symbol === 'NIPPONAMCGOLD');
      expect(goldHolding).toBeDefined();
      expect(goldHolding?.is_sip).toBe(true);
      expect(goldHolding?.sip_monthly_amount).toBe(5000);
    });

    it('supports broker disconnect', () => {
      store.disconnectBroker('tenant-default', 'cust-101');
      const conn = store.getBrokerConnection('tenant-default', 'cust-101');
      expect(conn?.status).toBe('DISCONNECTED');
    });
  });

  describe('Audit Events Logging', () => {
    it('appends and lists tamper-evident market audit events', () => {
      store.appendAuditEvent({
        event_id: 'test-aud-1',
        tenant_id: 'tenant-default',
        customer_ref: 'cust-101',
        actor: 'TestActor',
        event_type: 'MARKET_DATA_FETCHED',
        timestamp: Date.now(),
        correlation_id: 'corr-1',
        provider: 'LICENSED_MARKET_FEED',
        resource_ref: 'INFY',
        outcome: 'SUCCESS',
        metadata_redacted: { test: true },
      });

      const events = store.listAuditEvents(10);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event_id).toBe('test-aud-1');
      expect(events[0].metadata_redacted).toEqual({ test: true });
    });
  });
});
