/**
 * AgentGuard Risk Analysis Agent (Phase MI-6)
 * Analyzes portfolio concentration, maximum drawdown risk, asset correlation,
 * and single-name exposure to maintain disciplined capital preservation.
 */

import { PortfolioHolding } from '@agentguard/core-schema';

export interface PortfolioRiskReport {
  overallRiskRating: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'VERY_HIGH_RISK';
  concentrationScore: number; // 0 (well diversified) - 100 (heavily concentrated)
  topHoldingsConcentrationPercent: number;
  highestExposedAsset: { name: string; percentage: number };
  sectorExposures: Array<{ sector: string; percentage: number }>;
  riskFlags: Array<{ severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }>;
  evidence: Array<{ source: string; claim: string; timestamp: number }>;
}

export class RiskAnalysisAgent {
  readonly agentName = 'RiskAnalysisAgent';
  readonly description = 'Specialized agent for portfolio stress testing, concentration metrics, and downside volatility management.';

  async analyze(holdings: PortfolioHolding[]): Promise<PortfolioRiskReport> {
    const riskFlags: Array<{ severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];
    const evidence: Array<{ source: string; claim: string; timestamp: number }> = [];

    const nonInsuranceHoldings = holdings.filter((h) => h.asset_class !== 'INSURANCE_ULIP_OR_TERM');
    const totalCorpus = nonInsuranceHoldings.reduce((sum, h) => sum + h.current_value, 0);

    if (totalCorpus === 0 || nonInsuranceHoldings.length === 0) {
      return {
        overallRiskRating: 'CONSERVATIVE',
        concentrationScore: 0,
        topHoldingsConcentrationPercent: 0,
        highestExposedAsset: { name: 'None', percentage: 0 },
        sectorExposures: [],
        riskFlags: [{ severity: 'LOW', message: 'No active investment holdings to evaluate.' }],
        evidence: [],
      };
    }

    // Sort by current value descending
    const sorted = [...nonInsuranceHoldings].sort((a, b) => b.current_value - a.current_value);
    const topHolding = sorted[0];
    const topHoldingPct = Math.round((topHolding.current_value / totalCorpus) * 100);

    const top3Value = sorted.slice(0, 3).reduce((sum, h) => sum + h.current_value, 0);
    const top3Pct = Math.round((top3Value / totalCorpus) * 100);

    // Concentration flag
    if (topHoldingPct > 35) {
      riskFlags.push({
        severity: 'HIGH',
        message: `High single-asset concentration: ${topHolding.instrument_name} represents ${topHoldingPct}% of your total portfolio. Prudent cap is 20%.`,
      });
    } else if (topHoldingPct > 20) {
      riskFlags.push({
        severity: 'MEDIUM',
        message: `Moderate single-asset exposure: ${topHolding.instrument_name} represents ${topHoldingPct}% of your portfolio.`,
      });
    }

    // Sector breakdown
    const sectorMap = new Map<string, number>();
    for (const h of nonInsuranceHoldings) {
      const sector =
        h.sector ||
        (h.asset_class === 'MUTUAL_FUND'
          ? 'Diversified MF'
          : h.asset_class === 'GOLD_ETF' || h.asset_class === 'SGB'
          ? 'Precious Metals'
          : 'General');
      sectorMap.set(sector, (sectorMap.get(sector) || 0) + h.current_value);
    }

    const sectorExposures = Array.from(sectorMap.entries()).map(([sector, val]) => ({
      sector,
      percentage: Math.round((val / totalCorpus) * 100),
    })).sort((a, b) => b.percentage - a.percentage);

    const highestSector = sectorExposures[0];
    if (highestSector && highestSector.percentage > 45 && highestSector.sector !== 'Diversified MF') {
      riskFlags.push({
        severity: 'HIGH',
        message: `High sector concentration: ${highestSector.sector} accounts for ${highestSector.percentage}% of non-MF wealth.`,
      });
    }

    // Overall Rating
    let overallRiskRating: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'VERY_HIGH_RISK' = 'MODERATE';
    if (topHoldingPct > 40 || (highestSector && highestSector.percentage > 60)) {
      overallRiskRating = 'VERY_HIGH_RISK';
    } else if (top3Pct > 65) {
      overallRiskRating = 'AGGRESSIVE';
    } else if (top3Pct < 40) {
      overallRiskRating = 'CONSERVATIVE';
    }

    evidence.push({
      source: 'Cross-Asset Portfolio Risk Model',
      claim: `Top 3 holdings constitute ${top3Pct}% of portfolio. Highest single asset is ${topHolding.instrument_name} at ${topHoldingPct}%.`,
      timestamp: Date.now(),
    });

    return {
      overallRiskRating,
      concentrationScore: top3Pct,
      topHoldingsConcentrationPercent: top3Pct,
      highestExposedAsset: { name: topHolding.instrument_name, percentage: topHoldingPct },
      sectorExposures,
      riskFlags,
      evidence,
    };
  }
}
