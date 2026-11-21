/**
 * Integration Tests: Market Intelligence REST & MCP API (Phase MI-9)
 * Uses native Node http server and fetch — zero external testing dependencies.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { createMarketServer } from '../server';

describe('Market Intelligence MCP & REST Service API', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    const app = createMarketServer();
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('Health & Status Endpoints', () => {
    it('returns service health with read-only invariant verified', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe('OK');
      expect(body.service).toBe('AgentGuard_Market_Data_MCP');
      expect(body.market).toBe('India_NSE_BSE');
      expect(body.is_read_only).toBe(true);
      expect(body.allowed_tools_count).toBeGreaterThan(0);
    });

    it('returns current Indian market trading session status', async () => {
      const res = await fetch(`${baseUrl}/api/market/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.exchange).toBe('NSE');
      expect(['OPEN', 'CLOSED']).toContain(body.data.status);
    });
  });

  describe('Instrument Discovery & Deep Dive', () => {
    it('searches instruments by query', async () => {
      const res = await fetch(`${baseUrl}/api/market/search?q=infosys`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.count).toBeGreaterThan(0);
      expect(body.data[0].symbol).toBe('INFY');
    });

    it('returns company profile, fundamentals, and filings for INFY', async () => {
      const res = await fetch(`${baseUrl}/api/market/company/INFY`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.profile.company_name).toBe('Infosys Limited');
      expect(body.data.fundamentals.length).toBeGreaterThanOrEqual(3);
      expect(body.data.historicalPrices.length).toBeGreaterThan(0);
    });

    it('returns 404 for unknown symbol', async () => {
      const res = await fetch(`${baseUrl}/api/market/company/UNKNOWN_STOCK_XYZ`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
    });
  });

  describe('Customer Wealth Portfolio & Active SIPs', () => {
    it('returns portfolio snapshot, holdings, asset allocation, and SIP schedule', async () => {
      const res = await fetch(`${baseUrl}/api/market/portfolio`, {
        headers: {
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.portfolio.holdings.length).toBe(5);
      expect(body.data.portfolio.sipSummary.totalMonthlyCommitmentInr).toBe(15000);
      expect(body.data.portfolio.allocation).toBeDefined();
      expect(body.data.risk).toBeDefined();
    });
  });

  describe('Research Reports & Multi-Agent Execution', () => {
    it('generates a new company research report via POST /api/market/research', async () => {
      const res = await fetch(`${baseUrl}/api/market/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'INFY',
          exchange: 'NSE',
          tenantId: 'tenant-default',
          userRef: 'cust-101',
          includePortfolioContext: true,
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.symbol).toBe('INFY');
      expect(body.data.compliance_disclosure).toContain('SEBI Non-Advisory Statutory Disclaimer');
      expect(body.data.data_quality_score).toBe(95);
    });

    it('lists generated research reports', async () => {
      const res = await fetch(`${baseUrl}/api/market/reports`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.count).toBeGreaterThan(0);
    });
  });

  describe('Market MCP JSON-RPC 2.0 Protocol', () => {
    it('handles tools/list request', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.result.tools).toBeDefined();
      expect(body.result.tools.length).toBeGreaterThan(0);
    });

    it('denies tools containing prohibited trade keywords with HTTP 403', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'market.place_order',
            arguments: { symbol: 'INFY', quantity: 10 },
          },
        }),
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe(-32600);
      expect(body.error.message).toContain('Tool Execution Denied');
    });

    it('executes permitted read-only tool successfully', async () => {
      const res = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'market_search_instruments',
            arguments: { query: 'TCS' },
          },
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.result.content).toBeDefined();
      const contentText = body.result.content[0].text;
      expect(contentText).toContain('TCS');
    });
  });
});
