/**
 * AgentGuard Fundamental Analysis Agent (Phase MI-6)
 * Analyzes audited balance sheet, profit & loss, cash flows, ROE/ROCE, and quarterly financial trends.
 */

import { CompanyFundamental } from '@agentguard/core-schema';
import { IMarketDataProvider } from '../providers/provider-interface';

export interface FundamentalAnalysisResult {
  symbol: string;
  quarterlyTrends: CompanyFundamental[];
  healthScore: number; // 0 - 100
  profitabilityScore: number; // 0 - 100
  solvencyScore: number; // 0 - 100
  keyInsights: string[];
  flags: Array<{ type: 'POSITIVE' | 'WARNING' | 'NEUTRAL'; message: string }>;
  evidence: Array<{ source: string; claim: string; timestamp: number }>;
}

export class FundamentalAnalysisAgent {
  readonly agentName = 'FundamentalAnalysisAgent';
  readonly description = 'Specialized agent for audited corporate balance sheet, margin expansion, and solvency diagnostics.';

  constructor(private readonly provider: IMarketDataProvider) {}

  async analyze(symbol: string, exchange = 'NSE'): Promise<FundamentalAnalysisResult> {
    const fundamentals = await this.provider.getFundamentals(symbol, exchange);
    const flags: Array<{ type: 'POSITIVE' | 'WARNING' | 'NEUTRAL'; message: string }> = [];
    const keyInsights: string[] = [];
    const evidence: Array<{ source: string; claim: string; timestamp: number }> = [];

    if (fundamentals.length === 0) {
      return {
        symbol: symbol.toUpperCase(),
        quarterlyTrends: [],
        healthScore: 50,
        profitabilityScore: 50,
        solvencyScore: 50,
        keyInsights: ['No historical quarterly filings found for audited analysis.'],
        flags,
        evidence,
      };
    }

    const latest = fundamentals[0];
    const prev = fundamentals.length > 1 ? fundamentals[1] : null;

    // Profitability scoring
    let profitabilityScore = 60;
    if (latest.roe_percent !== null && latest.roe_percent !== undefined) {
      if (latest.roe_percent >= 20) {
        profitabilityScore += 25;
        flags.push({ type: 'POSITIVE', message: `Excellent Return on Equity (ROE: ${latest.roe_percent}%)` });
      } else if (latest.roe_percent >= 15) {
        profitabilityScore += 15;
        flags.push({ type: 'POSITIVE', message: `Healthy Return on Equity (ROE: ${latest.roe_percent}%)` });
      } else if (latest.roe_percent < 10) {
        profitabilityScore -= 20;
        flags.push({ type: 'WARNING', message: `Subdued Return on Equity (ROE: ${latest.roe_percent}%)` });
      }
    }

    const operatingMargin =
      latest.operating_profit_inr_crores && latest.revenue_inr_crores
        ? (latest.operating_profit_inr_crores / latest.revenue_inr_crores) * 100
        : null;

    if (operatingMargin !== null) {
      if (operatingMargin >= 20) {
        profitabilityScore += 15;
        keyInsights.push(`Strong operating margin of ${operatingMargin.toFixed(1)}% indicates pricing power.`);
      }
    }

    // Solvency scoring
    let solvencyScore = 70;
    if (latest.debt_to_equity !== null && latest.debt_to_equity !== undefined) {
      if (latest.debt_to_equity === 0) {
        solvencyScore += 25;
        flags.push({ type: 'POSITIVE', message: 'Virtually debt-free balance sheet (Debt/Equity: 0.00)' });
      } else if (latest.debt_to_equity < 0.5) {
        solvencyScore += 15;
        flags.push({ type: 'POSITIVE', message: `Conservative leverage with low Debt/Equity of ${latest.debt_to_equity}` });
      } else if (latest.debt_to_equity > 1.5) {
        solvencyScore -= 30;
        flags.push({ type: 'WARNING', message: `Elevated leverage detected (Debt/Equity: ${latest.debt_to_equity})` });
      }
    }

    // Revenue growth YoY
    if (prev && latest.revenue_inr_crores && prev.revenue_inr_crores) {
      const growth = ((latest.revenue_inr_crores - prev.revenue_inr_crores) / prev.revenue_inr_crores) * 100;
      keyInsights.push(`Revenue changed by ${growth.toFixed(1)}% compared to the prior recorded period.`);
    }

    profitabilityScore = Math.max(0, Math.min(100, profitabilityScore));
    solvencyScore = Math.max(0, Math.min(100, solvencyScore));
    const healthScore = Math.round((profitabilityScore * 0.5) + (solvencyScore * 0.5));

    evidence.push({
      source: `BSE/NSE Audited Results (${latest.financial_period})`,
      claim: `Reported Net Profit: ₹${latest.net_profit_inr_crores || 0} Cr, Revenue: ₹${latest.revenue_inr_crores || 0} Cr, ROE: ${latest.roe_percent || 'N/A'}%`,
      timestamp: Date.now(),
    });

    return {
      symbol: symbol.toUpperCase(),
      quarterlyTrends: fundamentals,
      healthScore,
      profitabilityScore,
      solvencyScore,
      keyInsights,
      flags,
      evidence,
    };
  }
}
