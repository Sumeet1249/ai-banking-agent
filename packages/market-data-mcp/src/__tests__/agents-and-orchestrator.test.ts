/**
 * Unit & Integration Tests: Specialized Agents & Orchestrator (Phase MI-9)
 * Tests multi-agent intelligence, compounding projections, risk metrics,
 * and canonical ResearchReport generation with SEBI disclaimer.
 */

import Database from 'better-sqlite3';
import { MarketDataStore } from '../db/market-store';
import { MarketReadOnlyPolicy } from '../security/read-only-policy';
import { LicensedMarketDataAdapter } from '../providers/market-data/licensed-data-adapter';
import { UpstoxReadOnlyAdapter } from '../providers/upstox/upstox-readonly-adapter';
import { CompanyResearchAgent } from '../agents/company-research-agent';
import { FundamentalAnalysisAgent } from '../agents/fundamental-analysis-agent';
import { ValuationAnalysisAgent } from '../agents/valuation-analysis-agent';
import { PortfolioIntelligenceAgent } from '../agents/portfolio-intelligence-agent';
import { RiskAnalysisAgent } from '../agents/risk-analysis-agent';
import { MarketResearchOrchestrator } from '../orchestration/market-research-orchestrator';

describe('Market Intelligence Multi-Agent System', () => {
  let db: Database.Database;
  let store: MarketDataStore;
  let policy: MarketReadOnlyPolicy;
  let marketProvider: LicensedMarketDataAdapter;
  let brokerProvider: UpstoxReadOnlyAdapter;
  let orchestrator: MarketResearchOrchestrator;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new MarketDataStore(db);
    policy = new MarketReadOnlyPolicy();
    marketProvider = new LicensedMarketDataAdapter(store);
    brokerProvider = new UpstoxReadOnlyAdapter(store, policy);
    orchestrator = new MarketResearchOrchestrator(store, marketProvider, brokerProvider, policy);
  });

  afterEach(() => {
    db.close();
  });

  describe('CompanyResearchAgent', () => {
    it('discovers company details and corporate listing', async () => {
      const agent = new CompanyResearchAgent(marketProvider);
      const res = await agent.research('INFY', 'NSE');

      expect(res.instrument).not.toBeNull();
      expect(res.profile).not.toBeNull();
      expect(res.profile?.company_name).toBe('Infosys Limited');
      expect(res.businessHighlights.length).toBeGreaterThan(0);
      expect(res.evidence.length).toBeGreaterThan(0);
    });
  });

  describe('FundamentalAnalysisAgent', () => {
    it('analyzes balance sheet health and computes scores', async () => {
      const agent = new FundamentalAnalysisAgent(marketProvider);
      const res = await agent.analyze('INFY', 'NSE');

      expect(res.quarterlyTrends.length).toBeGreaterThanOrEqual(3);
      expect(res.healthScore).toBeGreaterThanOrEqual(70);
      expect(res.profitabilityScore).toBeGreaterThanOrEqual(70);
      expect(res.solvencyScore).toBeGreaterThanOrEqual(70);
      expect(res.flags.some((f) => f.type === 'POSITIVE')).toBe(true);
    });
  });

  describe('ValuationAnalysisAgent', () => {
    it('computes P/E, P/B multiples and determines valuation stance', async () => {
      const agent = new ValuationAnalysisAgent(marketProvider);
      const res = await agent.analyze('INFY', 'NSE');

      expect(res.peRatio).toBeCloseTo(28.4, 0.5);
      expect(res.pbRatio).toBeCloseTo(8.9, 0.5);
      expect(res.valuationStance).toBeDefined();
      expect(res.peerComparison).toBeDefined();
    });
  });

  describe('PortfolioIntelligenceAgent (Wealth, SIPs, Gold & Insurance)', () => {
    it('analyzes customer asset allocation and active monthly SIP obligations', async () => {
      const agent = new PortfolioIntelligenceAgent(brokerProvider);
      const res = await agent.analyze('tenant-default', 'cust-101');

      expect(res.snapshot).not.toBeNull();
      expect(res.holdings.length).toBe(5);

      // Verify asset allocation
      expect(res.allocation.equityPercentage).toBeGreaterThan(0);
      expect(res.allocation.mutualFundPercentage).toBeGreaterThan(0);
      expect(res.allocation.goldPercentage).toBeGreaterThan(0);

      // Verify active SIPs
      expect(res.sipSummary.totalMonthlyCommitmentInr).toBe(15000);
      expect(res.sipSummary.activeSipCount).toBe(2);

      // Verify 3, 5, 10, 15 year compounding projections
      expect(res.projections).toHaveLength(4);
      expect(res.projections[1].years).toBe(5);
      expect(res.projections[1].projectedPortfolioValueInr).toBeGreaterThan(res.projections[1].totalInvestedInr);
      expect(res.projections[3].years).toBe(15);
      expect(res.projections[3].projectedWealthGainInr).toBeGreaterThan(0);
    });
  });

  describe('RiskAnalysisAgent', () => {
    it('evaluates portfolio concentration and single-stock exposure', async () => {
      const agent = new RiskAnalysisAgent();
      const holdings = await brokerProvider.getHoldings('tenant-default', 'cust-101');
      const risk = await agent.analyze(holdings);

      expect(risk.overallRiskRating).toBeDefined();
      expect(risk.concentrationScore).toBeGreaterThan(0);
      expect(risk.sectorExposures.length).toBeGreaterThan(0);
      expect(risk.highestExposedAsset.name).toBe('Infosys Limited');
    });
  });

  describe('MarketResearchOrchestrator End-to-End', () => {
    it('executes full multi-agent company research and produces a compliant ResearchReport', async () => {
      const report = await orchestrator.runCompanyResearch({
        tenantId: 'tenant-default',
        userRef: 'cust-101',
        symbol: 'INFY',
        exchange: 'NSE',
        includePortfolioContext: true,
      });

      expect(report.report_id).toBeDefined();
      expect(report.symbol).toBe('INFY');
      expect(report.exchange).toBe('NSE');
      expect(report.company_name).toBe('Infosys Limited');
      expect(report.executive_summary).toContain('Infosys Limited (INFY)');
      expect(report.executive_summary).toContain('customer portfolio');
      expect(report.data_quality_score).toBe(95);
      expect(report.sources_cited.length).toBeGreaterThan(0);

      // Verify non-negotiable SEBI statutory disclaimer
      expect(report.compliance_disclosure).toContain('SEBI Non-Advisory Statutory Disclaimer');
      expect(report.compliance_disclosure).toContain('does not provide financial advice');

      // Verify stored report
      const saved = store.getResearchReport(report.report_id);
      expect(saved).not.toBeNull();
      expect(saved?.report_id).toBe(report.report_id);
    });

    it('executes combined portfolio and risk analysis', async () => {
      const result = await orchestrator.runPortfolioAnalysis('tenant-default', 'cust-101');
      expect(result.portfolio).toBeDefined();
      expect(result.risk).toBeDefined();
      expect(result.portfolio.sipSummary.totalMonthlyCommitmentInr).toBe(15000);
      expect(result.risk.highestExposedAsset.name).toBe('Infosys Limited');
    });
  });
});
