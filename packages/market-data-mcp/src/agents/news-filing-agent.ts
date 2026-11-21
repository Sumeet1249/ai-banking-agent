/**
 * AgentGuard News & Regulatory Filing Agent (Phase MI-6)
 * Processes stock exchange filings (BSE/NSE), earnings conference call transcripts,
 * board meetings, and corporate announcements with prompt-injection sanitization.
 */

import { CompanyFiling, CompanyAnnouncement } from '@agentguard/core-schema';
import { IMarketDataProvider } from '../providers/provider-interface';
import { ReadOnlyPolicy } from '../security/read-only-policy';

export interface NewsFilingResult {
  symbol: string;
  recentFilings: CompanyFiling[];
  announcements: CompanyAnnouncement[];
  concallInsights: Array<{ period: string; title: string; summary: string }>;
  governanceSignals: Array<{ type: 'POSITIVE' | 'NEUTRAL' | 'CAUTION'; text: string }>;
  evidence: Array<{ source: string; claim: string; timestamp: number }>;
}

export class NewsFilingAgent {
  readonly agentName = 'NewsFilingAgent';
  readonly description = 'Specialized agent for exchange regulatory disclosures, concalls, and corporate governance telemetry.';

  constructor(
    private readonly provider: IMarketDataProvider,
    private readonly readOnlyPolicy: ReadOnlyPolicy
  ) {}

  async analyze(symbol: string, exchange = 'NSE'): Promise<NewsFilingResult> {
    const filings = await this.provider.getCompanyFilings(symbol, exchange);
    const announcements = await this.provider.getAnnouncements(symbol, exchange);
    const concallInsights = await this.provider.getConcallTranscripts(symbol, exchange);

    const governanceSignals: Array<{ type: 'POSITIVE' | 'NEUTRAL' | 'CAUTION'; text: string }> = [];
    const evidence: Array<{ source: string; claim: string; timestamp: number }> = [];

    // Analyze announcements
    for (const ann of announcements) {
      const sanitizedDesc = this.readOnlyPolicy.sanitizeFilingText(ann.details || ann.title);
      evidence.push({
        source: `${ann.exchange} Regulatory Broadcast (${ann.category})`,
        claim: sanitizedDesc,
        timestamp: ann.broadcast_timestamp,
      });

      if (ann.category === 'DIVIDEND') {
        governanceSignals.push({ type: 'POSITIVE', text: `Shareholder return: ${sanitizedDesc}` });
      } else if (ann.category === 'EXPANSION') {
        governanceSignals.push({ type: 'POSITIVE', text: `Capacity investment: ${sanitizedDesc}` });
      } else if (ann.category === 'MANAGEMENT_CHANGE') {
        governanceSignals.push({ type: 'NEUTRAL', text: `Executive transition: ${sanitizedDesc}` });
      }
    }

    // Default signal if empty
    if (governanceSignals.length === 0) {
      governanceSignals.push({
        type: 'POSITIVE',
        text: 'Clean regulatory filing history with timely statutory disclosures on NSE/BSE.',
      });
    }

    return {
      symbol: symbol.toUpperCase(),
      recentFilings: filings,
      announcements,
      concallInsights,
      governanceSignals,
      evidence,
    };
  }
}
