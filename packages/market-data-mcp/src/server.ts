/**
 * AgentGuard Indian Stock Market Intelligence, SIPs & Broker MCP Service (Port 4004)
 * Provides JSON-RPC 2.0 MCP interface and REST API for long-term Indian market research.
 *
 * ABSOLUTE INVARIANT:
 * Strictly read-only market intelligence, filings, concall transcripts, and wealth portfolio data.
 * Zero trading capabilities. Zero banking permit issuance. Completely isolated from Bank Gate :4000.
 */

import express, { Request, Response, NextFunction } from 'express';
import { marketConfig, createResponseMetadata } from './config';
import { MarketStore } from './db/market-store';
import { ReadOnlyPolicy } from './security/read-only-policy';
import { DrishtiMarketDataAdapter } from './providers/drishti/drishti-adapter';
import { LicensedMarketDataAdapter } from './providers/market-data/licensed-data-adapter';
import { UpstoxReadOnlyAdapter } from './providers/upstox/upstox-readonly-adapter';
import { MarketResearchOrchestrator } from './orchestration/market-research-orchestrator';
import { ALLOWED_MARKET_TOOLS } from '@agentguard/core-schema';

export function createMarketServer() {
  const app = express();
  app.use(express.json());

  // CORS middleware for local Cockpit integration
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id, x-customer-ref');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Initialize Core Services
  const store = new MarketStore(marketConfig.dbPath);
  const readOnlyPolicy = new ReadOnlyPolicy();
  const drishtiProvider = new DrishtiMarketDataAdapter(marketConfig.drishtiApiKey, marketConfig.drishtiMcpUrl, store);
  const licensedProvider = new LicensedMarketDataAdapter(store);
  const upstoxProvider = new UpstoxReadOnlyAdapter(store, readOnlyPolicy);

  // We can use licensedProvider or drishtiProvider as primary
  const orchestrator = new MarketResearchOrchestrator(
    store,
    licensedProvider,
    upstoxProvider,
    readOnlyPolicy
  );

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'OK',
      service: 'AgentGuard_Market_Data_MCP',
      port: marketConfig.port,
      market: 'India_NSE_BSE',
      is_read_only: true,
      allowed_tools_count: ALLOWED_MARKET_TOOLS.length,
      primary_research_provider: drishtiProvider.providerName,
      licensed_data_provider: licensedProvider.providerName,
      broker_provider: upstoxProvider.brokerName,
      timestamp: Date.now(),
    });
  });

  // Market status (NSE/BSE trading session)
  app.get('/api/market/status', async (_req: Request, res: Response) => {
    try {
      const status = await licensedProvider.getMarketStatus();
      res.json({
        success: true,
        data: status,
        meta: createResponseMetadata({ provider: licensedProvider.providerName, exchange: 'NSE' }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Search instruments (Equities, Mutual Funds, Gold ETFs, SGBs)
  app.get('/api/market/search', async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || '';
      const exchange = req.query.exchange as string | undefined;
      const instruments = await licensedProvider.searchInstruments(query, exchange);
      res.json({
        success: true,
        count: instruments.length,
        data: instruments,
        meta: createResponseMetadata({ provider: 'NSE_BSE_MASTER', exchange: (exchange as any) || 'NSE' }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Company Deep Dive: Profile, Fundamentals, Filings, Price History
  app.get('/api/market/company/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const exchange = (req.query.exchange as string) || 'NSE';

      const [profile, fundamentals, filings, announcements, concalls, prices] = await Promise.all([
        licensedProvider.getCompanyProfile(symbol, exchange),
        licensedProvider.getFundamentals(symbol, exchange),
        licensedProvider.getCompanyFilings(symbol, exchange),
        licensedProvider.getAnnouncements(symbol, exchange),
        licensedProvider.getConcallTranscripts(symbol, exchange),
        licensedProvider.getHistoricalPrices(symbol, exchange, 'DAILY', 30),
      ]);

      if (!profile) {
        return res.status(404).json({ success: false, error: `Company ${symbol} not found on ${exchange}` });
      }

      res.json({
        success: true,
        data: {
          profile,
          fundamentals,
          filings,
          announcements,
          concallTranscripts: concalls,
          historicalPrices: prices,
        },
        meta: createResponseMetadata({
          provider: drishtiProvider.providerName,
          instrument: symbol,
          exchange: exchange as any,
        }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Peer comparison
  app.get('/api/market/peers/:symbol', async (req: Request, res: Response) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const peerData = await licensedProvider.getPeerComparison(symbol);
      res.json({ success: true, data: peerData });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Run Multi-Agent Research
  app.post('/api/market/research', async (req: Request, res: Response) => {
    try {
      const { symbol, exchange, tenantId, userRef, includePortfolioContext } = req.body;
      if (!symbol) {
        return res.status(400).json({ success: false, error: 'Symbol is required' });
      }

      const report = await orchestrator.runCompanyResearch({
        tenantId: tenantId || 'tenant-default',
        userRef: userRef || 'cust-101',
        symbol,
        exchange: exchange || 'NSE',
        includePortfolioContext: !!includePortfolioContext,
      });

      res.json({
        success: true,
        data: report,
        meta: createResponseMetadata({
          provider: 'AgentGuard_MultiAgent_Orchestrator',
          instrument: report.symbol,
          exchange: report.exchange as any,
        }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // List Research Reports
  app.get('/api/market/reports', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const reports = store.listResearchReports(limit);
      res.json({ success: true, count: reports.length, data: reports });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get specific report by ID
  app.get('/api/market/reports/:id', (req: Request, res: Response) => {
    try {
      const report = store.getResearchReport(req.params.id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }
      res.json({
        success: true,
        data: report,
        meta: createResponseMetadata({
          provider: 'AgentGuard_MultiAgent_Orchestrator',
          instrument: report.symbol,
          exchange: report.exchange as any,
        }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Customer Wealth Portfolio Snapshot & Active SIPs
  app.get('/api/market/portfolio', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenantId as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customerRef as string) || 'cust-101';

      const analysis = await orchestrator.runPortfolioAnalysis(tenantId, customerRef);
      res.json({
        success: true,
        data: analysis,
        meta: createResponseMetadata({
          provider: upstoxProvider.brokerName,
          isSynthetic: marketConfig.environment !== 'PRODUCTION',
        }),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Portfolio Risk Analysis
  app.get('/api/market/risk', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenantId as string) || 'tenant-default';
      const customerRef = (req.headers['x-customer-ref'] as string) || (req.query.customerRef as string) || 'cust-101';

      const holdings = await upstoxProvider.getHoldings(tenantId, customerRef);
      const riskAgent = new (require('./agents/risk-analysis-agent').RiskAnalysisAgent)();
      const riskReport = await riskAgent.analyze(holdings);

      res.json({ success: true, data: riskReport });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Broker Connection (Customer Consented Read-Only Upstox)
  app.post('/api/market/broker/connect', async (req: Request, res: Response) => {
    try {
      const { tenantId, customerRef, brokerUserId, accessToken, scopes, expiresAt } = req.body;
      const connection = await upstoxProvider.connectBroker({
        tenantId: tenantId || 'tenant-default',
        customerRef: customerRef || 'cust-101',
        brokerUserId: brokerUserId || 'UPSTOX_USER_99',
        accessToken: accessToken || 'mock_secure_token',
        scopes: scopes || ['read', 'portfolio_read'],
        expiresAt: expiresAt || Date.now() + 86400000 * 30,
      });

      res.json({ success: true, data: connection });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Broker Disconnect
  app.post('/api/market/broker/disconnect', async (req: Request, res: Response) => {
    try {
      const { tenantId, customerRef } = req.body;
      const success = await upstoxProvider.disconnect(tenantId || 'tenant-default', customerRef || 'cust-101');
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Market Audit Trail
  app.get('/api/market/audit', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const events = store.listAuditEvents(limit);
      res.json({ success: true, count: events.length, data: events });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // JSON-RPC 2.0 MCP Protocol Endpoint
  app.post('/mcp', async (req: Request, res: Response) => {
    const { id, method, params } = req.body;

    if (method === 'tools/list') {
      const tools = ALLOWED_MARKET_TOOLS.map((t) => ({
        name: t,
        description: `Read-only market intelligence tool: ${t}`,
        inputSchema: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock or ETF symbol (e.g. INFY, TCS)' },
            exchange: { type: 'string', description: 'NSE or BSE' },
            query: { type: 'string', description: 'Search keywords' },
          },
        },
      }));

      return res.json({
        jsonrpc: '2.0',
        id,
        result: { tools },
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      // 1. Enforce strict read-only tool policy
      const policyCheck = readOnlyPolicy.validateToolCall(toolName, args);
      if (!policyCheck.allowed) {
        return res.status(403).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32600,
            message: `Tool Execution Denied: ${policyCheck.reason}`,
          },
        });
      }

      try {
        let toolResult: any = null;

        switch (toolName) {
          case 'market_search_instruments':
            toolResult = await licensedProvider.searchInstruments(args.query || '', args.exchange);
            break;
          case 'market_resolve_symbol':
            toolResult = await licensedProvider.resolveSymbol(args.query || args.symbol || '', args.exchange);
            break;
          case 'market_get_company_profile':
            toolResult = await licensedProvider.getCompanyProfile(args.symbol, args.exchange);
            break;
          case 'market_get_fundamentals':
            toolResult = await licensedProvider.getFundamentals(args.symbol, args.exchange);
            break;
          case 'market_get_historical_prices':
            toolResult = await licensedProvider.getHistoricalPrices(args.symbol, args.exchange, args.interval, args.limit);
            break;
          case 'market_get_filings':
            toolResult = await licensedProvider.getCompanyFilings(args.symbol, args.exchange);
            break;
          case 'market_get_announcements':
            toolResult = await licensedProvider.getAnnouncements(args.symbol, args.exchange);
            break;
          case 'market_get_concall_transcripts':
            toolResult = await licensedProvider.getConcallTranscripts(args.symbol, args.exchange);
            break;
          case 'market_generate_research_report':
            toolResult = await orchestrator.runCompanyResearch({
              tenantId: args.tenantId || 'tenant-default',
              userRef: args.userRef || 'cust-101',
              symbol: args.symbol,
              exchange: args.exchange || 'NSE',
              includePortfolioContext: !!args.includePortfolioContext,
            });
            break;
          case 'market_get_portfolio_snapshot':
            toolResult = await upstoxProvider.getPortfolioSnapshot(args.tenantId || 'tenant-default', args.customerRef || 'cust-101');
            break;
          case 'market_get_holdings':
            toolResult = await upstoxProvider.getHoldings(args.tenantId || 'tenant-default', args.customerRef || 'cust-101');
            break;
          case 'market_get_sip_schedules':
            toolResult = await upstoxProvider.getSipSchedules(args.tenantId || 'tenant-default', args.customerRef || 'cust-101');
            break;
          case 'market_analyze_portfolio_risk':
            toolResult = await orchestrator.runPortfolioAnalysis(args.tenantId || 'tenant-default', args.customerRef || 'cust-101');
            break;
          default:
            toolResult = { message: `Tool ${toolName} processed successfully.` };
        }

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(toolResult, null, 2),
              },
            ],
          },
        });
      } catch (err: any) {
        return res.status(500).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: `Internal Tool Error: ${err.message}`,
          },
        });
      }
    }

    return res.status(400).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  });

  return app;
}

// Start server if executed directly
if (require.main === module) {
  const app = createMarketServer();
  const port = marketConfig.port;
  app.listen(port, () => {
    console.log(`[MarketDataMCP] Indian Stock Market Intelligence Service listening on port ${port}`);
    console.log(`[MarketDataMCP] Mode: Strictly Read-Only (Equities, Mutual Funds, Gold ETFs, SGBs, Insurance)`);
    console.log(`[MarketDataMCP] REST API: http://localhost:${port}/api/market/*`);
    console.log(`[MarketDataMCP] MCP JSON-RPC: http://localhost:${port}/mcp`);
  });
}
