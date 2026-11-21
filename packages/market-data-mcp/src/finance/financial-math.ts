/**
 * AgentGuard Deterministic Financial Calculation Engine (Phase TI-1)
 * Pure, audited math for financial ratios, risk metrics, compounding projections,
 * and portfolio weighting. Never uses arbitrary hardcoded return claims.
 */

export interface CompoundingProjectionItem {
  years: number;
  projectedPortfolioValueInr: number;
  totalInvestedInr: number;
  projectedWealthGainInr: number;
  assumedAnnualCagrPercent: number;
  isGuaranteed: false; // Invariant: Projections are mathematical simulations, not guarantees
}

export class FinancialMath {
  /**
   * Price-to-Earnings (P/E) Ratio
   * P/E = Market Price per Share / Earnings per Share (EPS)
   */
  public static calculatePE(price: number, eps: number): number | null {
    if (!Number.isFinite(price) || !Number.isFinite(eps) || eps <= 0 || price <= 0) {
      return null;
    }
    return Math.round((price / eps) * 100) / 100;
  }

  /**
   * Price-to-Book (P/B) Ratio
   * P/B = Market Price per Share / Book Value per Share (BVPS)
   */
  public static calculatePB(price: number, bvps: number): number | null {
    if (!Number.isFinite(price) || !Number.isFinite(bvps) || bvps <= 0 || price <= 0) {
      return null;
    }
    return Math.round((price / bvps) * 100) / 100;
  }

  /**
   * Return on Equity (ROE) %
   * ROE = (Net Profit / Total Shareholder Equity) * 100
   */
  public static calculateROE(netProfit: number, shareholderEquity: number): number | null {
    if (!Number.isFinite(netProfit) || !Number.isFinite(shareholderEquity) || shareholderEquity <= 0) {
      return null;
    }
    return Math.round((netProfit / shareholderEquity) * 10000) / 100;
  }

  /**
   * Return on Capital Employed (ROCE) %
   * ROCE = (EBIT / (Total Assets - Current Liabilities)) * 100
   */
  public static calculateROCE(ebit: number, capitalEmployed: number): number | null {
    if (!Number.isFinite(ebit) || !Number.isFinite(capitalEmployed) || capitalEmployed <= 0) {
      return null;
    }
    return Math.round((ebit / capitalEmployed) * 10000) / 100;
  }

  /**
   * Maximum Drawdown (MDD) % over historical price series
   * MDD = (Peak - Trough) / Peak * 100
   */
  public static calculateMaxDrawdown(priceSeries: number[]): {
    maxDrawdownPercent: number;
    peakPrice: number;
    troughPrice: number;
  } {
    if (!priceSeries || priceSeries.length < 2) {
      return { maxDrawdownPercent: 0, peakPrice: 0, troughPrice: 0 };
    }

    let peak = priceSeries[0];
    let maxDrawdown = 0;
    let bestPeak = peak;
    let worstTrough = peak;

    for (const p of priceSeries) {
      if (p > peak) {
        peak = p;
      }
      const dd = peak > 0 ? ((peak - p) / peak) * 100 : 0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        bestPeak = peak;
        worstTrough = p;
      }
    }

    return {
      maxDrawdownPercent: Math.round(maxDrawdown * 100) / 100,
      peakPrice: bestPeak,
      troughPrice: worstTrough,
    };
  }

  /**
   * Annualized Volatility % from daily price returns
   * Volatility = stdDev(dailyReturns) * sqrt(252 trading days)
   */
  public static calculateAnnualizedVolatility(dailyReturns: number[]): number {
    if (!dailyReturns || dailyReturns.length < 2) return 0;

    const n = dailyReturns.length;
    const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / n;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1);
    const dailyStdDev = Math.sqrt(variance);
    const annualized = dailyStdDev * Math.sqrt(252) * 100;

    return Math.round(annualized * 100) / 100;
  }

  /**
   * Portfolio Weighting % breakdown
   * Enforces total sum normalized to 100%.
   */
  public static calculatePortfolioWeights(
    items: Array<{ id: string; value: number }>
  ): Map<string, number> {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
    const weights = new Map<string, number>();

    if (total === 0) {
      for (const item of items) weights.set(item.id, 0);
      return weights;
    }

    for (const item of items) {
      const w = Math.round((Math.max(0, item.value) / total) * 1000) / 10;
      weights.set(item.id, w);
    }

    return weights;
  }

  /**
   * Wealth Compounding Horizon Projection
   * Computes FV of starting corpus + monthly SIP annuity at an explicit assumed annual rate.
   * Parameterized, non-guaranteed mathematical modeling.
   */
  public static calculateCompoundingProjection(
    startingCorpus: number,
    monthlySip: number,
    annualRatePercent: number,
    years: number
  ): CompoundingProjectionItem {
    const annualRate = Math.max(0, annualRatePercent) / 100;
    const monthlyRate = annualRate / 12;
    const months = Math.max(1, Math.round(years * 12));

    let corpusFV = startingCorpus;
    let sipFV = 0;

    if (monthlyRate > 0) {
      corpusFV = startingCorpus * Math.pow(1 + monthlyRate, months);
      sipFV = monthlySip > 0
        ? monthlySip * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate)
        : 0;
    } else {
      corpusFV = startingCorpus;
      sipFV = monthlySip * months;
    }

    const totalFV = Math.round(corpusFV + sipFV);
    const totalInvested = Math.round(startingCorpus + monthlySip * months);
    const gain = Math.max(0, totalFV - totalInvested);

    return {
      years,
      projectedPortfolioValueInr: totalFV,
      totalInvestedInr: totalInvested,
      projectedWealthGainInr: gain,
      assumedAnnualCagrPercent: annualRatePercent,
      isGuaranteed: false,
    };
  }
}
