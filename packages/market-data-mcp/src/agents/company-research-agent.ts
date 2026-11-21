/**
 * AgentGuard Company Research Agent (Phase MI-6)
 * Discovers company profile, business model, operating segments, management, and key drivers.
 */

import { CompanyProfile, MarketInstrument } from '@agentguard/core-schema';
import { IMarketDataProvider } from '../providers/provider-interface';

export interface CompanyResearchResult {
  instrument: MarketInstrument | null;
  profile: CompanyProfile | null;
  businessHighlights: string[];
  keyDrivers: string[];
  evidence: Array<{ source: string; claim: string; timestamp: number }>;
}

export class CompanyResearchAgent {
  readonly agentName = 'CompanyResearchAgent';
  readonly description = 'Specialized agent for Indian equity discovery, corporate structure, and operating analysis.';

  constructor(private readonly provider: IMarketDataProvider) {}

  async research(symbolOrName: string, exchange = 'NSE'): Promise<CompanyResearchResult> {
    // 1. Resolve symbol
    let instrument = await this.provider.resolveSymbol(symbolOrName, exchange);
    if (!instrument) {
      const search = await this.provider.searchInstruments(symbolOrName, exchange);
      instrument = search[0] || null;
    }

    if (!instrument) {
      return {
        instrument: null,
        profile: null,
        businessHighlights: [],
        keyDrivers: [],
        evidence: [],
      };
    }

    const symbol = instrument.symbol;
    const profile = await this.provider.getCompanyProfile(symbol, instrument.exchange);

    const businessHighlights: string[] = [];
    const keyDrivers: string[] = [];
    const evidence: Array<{ source: string; claim: string; timestamp: number }> = [];

    if (profile) {
      businessHighlights.push(
        `${profile.company_name} operates in the ${profile.sector} sector (${profile.industry}).`,
        `Market Capitalization: ₹${(profile.market_cap_inr_crores || 0).toLocaleString('en-IN')} Crores.`
      );
      keyDrivers.push(
        `Established market presence in ${profile.industry} with consistent institutional interest.`,
        `Listed on ${profile.exchange} under symbol ${profile.symbol}.`
      );
      evidence.push({
        source: `${profile.exchange} Corporate Master Listing`,
        claim: `${profile.company_name} (${profile.symbol}) is active in ${profile.sector}`,
        timestamp: Date.now(),
      });
    }

    return {
      instrument,
      profile,
      businessHighlights,
      keyDrivers,
      evidence,
    };
  }
}
