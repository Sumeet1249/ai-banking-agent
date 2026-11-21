/**
 * AgentGuard Valuation Analysis Agent (Phase MI-6)
 * Estimates valuation multiples (P/E, P/B, EV/EBITDA), peer benchmarking, and historical percentile ranges.
 */

import { IMarketDataProvider } from '../providers/provider-interface';

export interface ValuationAnalysisResult {
  symbol: string;
  peRatio: number | null;
  pbRatio: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;
  valuationStance: 'UNDERVALUED' | 'FAIRLY_VALUED' | 'PREMIUM' | 'HIGH_PREMIUM';
  peerComparison: {
    peers: Array<{ symbol: string; name: string; pe_ratio: number | null; pb_ratio: number | null; roe_percent: number | null }>;
  };
  summary: string;
  evidence: Array<{ source: string; claim: string; timestamp: number }>;
}

export class ValuationAnalysisAgent {
  readonly agentName = 'ValuationAnalysisAgent';
  readonly description = 'Specialized agent for fundamental relative valuation, historical multiples, and peer cohort assessment.';

  constructor(private readonly provider: IMarketDataProvider) {}

  async analyze(symbol: string, exchange = 'NSE'): Promise<ValuationAnalysisResult> {
    const fundamentals = await this.provider.getFundamentals(symbol, exchange);
    const latest = fundamentals[0] || null;

    const peRatio = latest?.pe_ratio ?? null;
    const pbRatio = latest?.pb_ratio ?? null;
    const evToEbitda = (latest as any)?.ev_to_ebitda ?? null;
    const dividendYield = latest?.dividend_yield_percent ?? null;

    // Determine valuation stance
    let valuationStance: 'UNDERVALUED' | 'FAIRLY_VALUED' | 'PREMIUM' | 'HIGH_PREMIUM' = 'FAIRLY_VALUED';
    if (peRatio !== null) {
      if (peRatio < 15) {
        valuationStance = 'UNDERVALUED';
      } else if (peRatio <= 28) {
        valuationStance = 'FAIRLY_VALUED';
      } else if (peRatio <= 45) {
        valuationStance = 'PREMIUM';
      } else {
        valuationStance = 'HIGH_PREMIUM';
      }
    }

    // Peers
    let peers: Array<{ symbol: string; name: string; pe_ratio: number | null; pb_ratio: number | null; roe_percent: number | null }> = [];
    if ('getPeerComparison' in this.provider) {
      const pc = await (this.provider as any).getPeerComparison(symbol);
      peers = pc?.peers || [];
    }

    const summary = `Trading at P/E of ${peRatio !== null ? peRatio.toFixed(1) : 'N/A'}x and P/B of ${pbRatio !== null ? pbRatio.toFixed(1) : 'N/A'}x. Classified as ${valuationStance.replace('_', ' ')} relative to traditional Indian equity benchmarks.`;

    const evidence: Array<{ source: string; claim: string; timestamp: number }> = [
      {
        source: 'Market Fundamentals & Earnings Multiples',
        claim: `P/E: ${peRatio || 'N/A'}, P/B: ${pbRatio || 'N/A'}, Dividend Yield: ${dividendYield || 0}%`,
        timestamp: Date.now(),
      },
    ];

    return {
      symbol: symbol.toUpperCase(),
      peRatio,
      pbRatio,
      evToEbitda,
      dividendYield,
      valuationStance,
      peerComparison: { peers },
      summary,
      evidence,
    };
  }
}
