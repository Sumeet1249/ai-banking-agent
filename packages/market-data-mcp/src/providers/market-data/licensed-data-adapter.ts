/**
 * AgentGuard Licensed Market Data Provider Adapter (Phase MI-4)
 * Authoritative Indian Market Data: NSE & BSE OHLCV, Fundamentals, Corporate Actions, and Peer Benchmarking.
 * Strictly read-only market data feed with zero trade execution capabilities.
 */

import {
  MarketInstrument,
  CompanyProfile,
  CompanyFundamental,
  HistoricalPriceBar,
  CompanyFiling,
  CompanyAnnouncement,
  CorporateAction,
} from '@agentguard/core-schema';
import { IMarketDataProvider } from '../provider-interface';
import { MarketDataStore } from '../../db/market-store';

export class LicensedMarketDataAdapter implements IMarketDataProvider {
  readonly providerName = 'LicensedMarketData_NSE_BSE';

  constructor(private readonly store: MarketDataStore) {}

  async searchInstruments(query: string, exchange?: string): Promise<MarketInstrument[]> {
    return this.store.searchInstruments(query, exchange);
  }

  async resolveSymbol(companyName: string, exchange?: string): Promise<MarketInstrument | null> {
    const res = this.store.resolveSymbol(companyName);
    if (res && exchange && res.exchange !== exchange) {
      return null;
    }
    return res;
  }

  async getCompanyProfile(symbol: string, exchange: string = 'NSE'): Promise<CompanyProfile | null> {
    return this.store.getCompanyProfile(symbol, exchange);
  }

  async getFundamentals(symbol: string, exchange: string = 'NSE'): Promise<CompanyFundamental[]> {
    return this.store.getFundamentals(symbol, exchange);
  }

  async getHistoricalPrices(
    symbol: string,
    exchange: string = 'NSE',
    interval = 'DAILY',
    limit = 90
  ): Promise<HistoricalPriceBar[]> {
    return this.store.getHistoricalPrices(symbol, exchange, interval, limit);
  }

  async getCompanyFilings(symbol: string, exchange: string = 'NSE'): Promise<CompanyFiling[]> {
    return this.store.getCompanyFilings(symbol, exchange);
  }

  async getAnnouncements(symbol: string, exchange: string = 'NSE'): Promise<CompanyAnnouncement[]> {
    return this.store.getAnnouncements(symbol, exchange);
  }

  async getConcallTranscripts(
    symbol: string,
    exchange: string = 'NSE'
  ): Promise<Array<{ period: string; title: string; summary: string; audio_url?: string }>> {
    const filings = this.store.getCompanyFilings(symbol, exchange);
    return filings
      .filter((f: CompanyFiling) => f.category === 'CONCALL_TRANSCRIPT' || f.category === 'FINANCIAL_RESULTS')
      .map((f: CompanyFiling) => ({
        period: f.financial_period || 'Recent',
        title: f.title,
        summary: f.title,
        audio_url: f.document_url,
      }));
  }

  async getCorporateActions(_symbol: string, _exchange?: string): Promise<CorporateAction[]> {
    return [];
  }

  async getMarketStatus(): Promise<{ exchange: string; status: 'OPEN' | 'CLOSED'; trading_day: string }> {
    const now = new Date();
    // Indian Standard Time (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const day = istDate.getUTCDay();
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const timeNum = hours * 100 + minutes;

    // Normal Indian trading session: Mon-Fri (1-5), 09:15 to 15:30 IST
    const isWeekday = day >= 1 && day <= 5;
    const isTradingHours = timeNum >= 915 && timeNum <= 1530;
    const status = isWeekday && isTradingHours ? 'OPEN' : 'CLOSED';

    return {
      exchange: 'NSE',
      status,
      trading_day: istDate.toISOString().split('T')[0],
    };
  }

  /**
   * Peer comparison analysis for industry groups
   */
  async getPeerComparison(symbol: string): Promise<{
    target: { symbol: string; pe_ratio: number | null; pb_ratio: number | null; roe_percent: number | null; market_cap_crores: number | null };
    peers: Array<{ symbol: string; name: string; pe_ratio: number | null; pb_ratio: number | null; roe_percent: number | null; market_cap_crores: number | null }>;
  }> {
    const targetProfile = this.store.getCompanyProfile(symbol);
    const targetFundamentals = this.store.getFundamentals(symbol);
    const latestTargetFund = targetFundamentals[0] || null;

    const target = {
      symbol: symbol.toUpperCase(),
      pe_ratio: latestTargetFund?.pe_ratio ?? null,
      pb_ratio: latestTargetFund?.pb_ratio ?? null,
      roe_percent: latestTargetFund?.roe_percent ?? null,
      market_cap_crores: targetProfile?.market_cap_inr_crores ?? null,
    };

    if (!targetProfile) {
      return { target, peers: [] };
    }

    // Find peers in the same industry/sector
    const allInstruments = this.store.searchInstruments('', targetProfile.exchange);
    const peerProfiles = allInstruments
      .filter((i: MarketInstrument) => i.symbol !== target.symbol)
      .map((i: MarketInstrument) => this.store.getCompanyProfile(i.symbol, i.exchange))
      .filter((p: CompanyProfile | null): p is CompanyProfile => p !== null && p.sector === targetProfile.sector);

    const peers = peerProfiles.slice(0, 4).map((p: CompanyProfile) => {
      const fund = this.store.getFundamentals(p.symbol, p.exchange)[0];
      return {
        symbol: p.symbol,
        name: p.company_name,
        pe_ratio: fund?.pe_ratio ?? null,
        pb_ratio: fund?.pb_ratio ?? null,
        roe_percent: fund?.roe_percent ?? null,
        market_cap_crores: p.market_cap_inr_crores ?? null,
      };
    });

    return { target, peers };
  }
}
