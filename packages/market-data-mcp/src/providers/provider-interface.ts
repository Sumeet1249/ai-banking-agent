/**
 * AgentGuard Market Intelligence Provider Interfaces (Phases MI-3, MI-4, MI-5)
 */

import {
  MarketInstrument,
  CompanyProfile,
  CompanyFundamental,
  HistoricalPriceBar,
  CompanyFiling,
  CompanyAnnouncement,
  CorporateAction,
  PortfolioSnapshot,
  PortfolioHolding,
} from '@agentguard/core-schema';

export interface IMarketDataProvider {
  readonly providerName: string;
  searchInstruments(query: string, exchange?: string): Promise<MarketInstrument[]>;
  resolveSymbol(companyName: string, exchange?: string): Promise<MarketInstrument | null>;
  getCompanyProfile(symbol: string, exchange?: string): Promise<CompanyProfile | null>;
  getFundamentals(symbol: string, exchange?: string): Promise<CompanyFundamental[]>;
  getHistoricalPrices(symbol: string, exchange?: string, interval?: string, limit?: number): Promise<HistoricalPriceBar[]>;
  getCompanyFilings(symbol: string, exchange?: string): Promise<CompanyFiling[]>;
  getAnnouncements(symbol: string, exchange?: string): Promise<CompanyAnnouncement[]>;
  getConcallTranscripts(symbol: string, exchange?: string): Promise<Array<{ period: string; title: string; summary: string; audio_url?: string }>>;
  getCorporateActions(symbol: string, exchange?: string): Promise<CorporateAction[]>;
  getMarketStatus(): Promise<{ exchange: string; status: 'OPEN' | 'CLOSED'; trading_day: string }>;
}

export interface IBrokerProvider {
  readonly brokerName: string;
  getPortfolioSnapshot(tenantId: string, customerRef: string): Promise<PortfolioSnapshot | null>;
  getHoldings(tenantId: string, customerRef: string): Promise<PortfolioHolding[]>;
  getSipSchedules(tenantId: string, customerRef: string): Promise<Array<{
    holding_id: string;
    symbol: string;
    instrument_name: string;
    monthly_amount_inr: number;
    sip_day: number;
    asset_class: string;
    status: 'ACTIVE' | 'PAUSED';
  }>>;
  verifyReadOnlyStatus(tenantId: string, customerRef: string): Promise<{ isReadOnly: boolean; scopes: string[] }>;
  disconnect(tenantId: string, customerRef: string): Promise<boolean>;
}
