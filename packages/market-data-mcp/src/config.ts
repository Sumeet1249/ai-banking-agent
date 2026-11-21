/**
 * AgentGuard Market Intelligence Configuration
 */

export interface MarketMcpConfig {
  port: number;
  dbPath: string;
  drishtiApiKey: string;
  drishtiMcpUrl: string;
  upstoxClientId: string;
  upstoxClientSecret: string;
  upstoxRedirectUri: string;
  marketDataProvider: string;
  marketDataApiKey: string;
  cacheTtlSeconds: number;
  requestTimeoutMs: number;
  maxConcurrency: number;
  dailyQuota: number;
  demoMode: boolean;
  portfolioSyncEnabled: boolean;
  environment: string;
}

export const marketMcpConfig: MarketMcpConfig = {
  port: Number(process.env.MARKET_MCP_PORT || 4004),
  dbPath: process.env.MARKET_DB_PATH || 'market_intelligence.db',
  drishtiApiKey: process.env.DRISHTI_API_KEY || '',
  drishtiMcpUrl: process.env.DRISHTI_MCP_URL || 'https://mcp.drishti.manasija.in',
  upstoxClientId: process.env.UPSTOX_CLIENT_ID || '',
  upstoxClientSecret: process.env.UPSTOX_CLIENT_SECRET || '',
  upstoxRedirectUri: process.env.UPSTOX_REDIRECT_URI || 'http://localhost:13003/api/market/broker/upstox/callback',
  marketDataProvider: process.env.MARKET_DATA_PROVIDER || 'DEMO_FIXTURE',
  marketDataApiKey: process.env.MARKET_DATA_API_KEY || '',
  cacheTtlSeconds: Number(process.env.MARKET_DATA_CACHE_TTL_SECONDS || 3600),
  requestTimeoutMs: Number(process.env.MARKET_PROVIDER_TIMEOUT_MS || 10000),
  maxConcurrency: Number(process.env.MARKET_RESEARCH_MAX_CONCURRENCY || 5),
  dailyQuota: Number(process.env.MARKET_RESEARCH_DAILY_QUOTA || 100),
  demoMode: process.env.DEMO_MODE === '1' || process.env.MARKET_DEMO_MODE === 'true' || true,
  portfolioSyncEnabled: process.env.MARKET_PORTFOLIO_SYNC_ENABLED !== 'false',
  environment: process.env.NODE_ENV || 'development',
};

export const marketConfig = marketMcpConfig;

