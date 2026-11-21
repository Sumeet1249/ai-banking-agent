/**
 * AgentGuard Market Intelligence Configuration (Phase TI-1 Hardened)
 */

import { MarketResponseMetadata } from '@agentguard/core-schema';

export type MarketEnvironment = 'DEVELOPMENT' | 'TEST' | 'DEMO' | 'PRODUCTION';

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
  environment: MarketEnvironment;
  defaultCompoundingCagrPercent: number;
}

function resolveEnvironment(): MarketEnvironment {
  const envStr = (process.env.MARKET_ENV || process.env.NODE_ENV || 'DEVELOPMENT').toUpperCase();
  if (envStr === 'PRODUCTION' || envStr === 'PROD') return 'PRODUCTION';
  if (envStr === 'TEST') return 'TEST';
  if (envStr === 'DEMO') return 'DEMO';
  return 'DEVELOPMENT';
}

const env = resolveEnvironment();
const isProd = env === 'PRODUCTION';

export const marketMcpConfig: MarketMcpConfig = {
  port: Number(process.env.MARKET_MCP_PORT || 4004),
  dbPath: process.env.MARKET_DB_PATH || 'market_intelligence.db',
  drishtiApiKey: process.env.DRISHTI_API_KEY || '',
  drishtiMcpUrl: process.env.DRISHTI_MCP_URL || 'https://mcp.drishti.manasija.in',
  upstoxClientId: process.env.UPSTOX_CLIENT_ID || '',
  upstoxClientSecret: process.env.UPSTOX_CLIENT_SECRET || '',
  upstoxRedirectUri: process.env.UPSTOX_REDIRECT_URI || 'http://localhost:13003/api/market/broker/upstox/callback',
  marketDataProvider: process.env.MARKET_DATA_PROVIDER || (isProd ? 'UNCONFIGURED_PRODUCTION' : 'DEMO_FIXTURE'),
  marketDataApiKey: process.env.MARKET_DATA_API_KEY || '',
  cacheTtlSeconds: Number(process.env.MARKET_DATA_CACHE_TTL_SECONDS || 3600),
  requestTimeoutMs: Number(process.env.MARKET_PROVIDER_TIMEOUT_MS || 10000),
  maxConcurrency: Number(process.env.MARKET_RESEARCH_MAX_CONCURRENCY || 5),
  dailyQuota: Number(process.env.MARKET_RESEARCH_DAILY_QUOTA || 100),
  demoMode: !isProd && (process.env.DEMO_MODE === '1' || process.env.MARKET_DEMO_MODE === 'true' || true),
  portfolioSyncEnabled: process.env.MARKET_PORTFOLIO_SYNC_ENABLED !== 'false',
  environment: env,
  defaultCompoundingCagrPercent: Number(process.env.DEFAULT_COMPOUNDING_CAGR || 11.0),
};

export const marketConfig = marketMcpConfig;

/**
 * Helper to build canonical MarketResponseMetadata (TI-1)
 */
export function createResponseMetadata(params: {
  provider: string;
  instrument?: string;
  exchange?: 'NSE' | 'BSE';
  isSynthetic?: boolean;
  isCached?: boolean;
  dataDelayMs?: number;
}): MarketResponseMetadata {
  const isSynthetic = params.isSynthetic ?? (marketMcpConfig.environment !== 'PRODUCTION');
  let entitlement: 'LICENSED' | 'DELAYED_PUBLIC' | 'SYNTHETIC_DEMO' | 'UNENTITLED' = 'SYNTHETIC_DEMO';

  if (marketMcpConfig.environment === 'PRODUCTION') {
    if (params.provider === 'DRISHTI_MCP' && marketMcpConfig.drishtiApiKey) {
      entitlement = 'LICENSED';
    } else if (marketMcpConfig.marketDataApiKey) {
      entitlement = 'LICENSED';
    } else {
      entitlement = 'UNENTITLED';
    }
  }

  return {
    provider: params.provider,
    instrument: params.instrument,
    exchange: params.exchange,
    source_timestamp: Date.now() - (params.dataDelayMs || 0),
    retrieved_at: Date.now(),
    data_delay_ms: params.dataDelayMs ?? (isSynthetic ? -1 : 0),
    currency: 'INR',
    entitlement_status: entitlement,
    is_synthetic: isSynthetic,
    is_cached: params.isCached ?? false,
    environment: marketMcpConfig.environment,
  };
}
