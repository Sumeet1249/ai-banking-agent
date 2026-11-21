/**
 * Unit Tests: Deterministic Financial Math & Calculation Integrity (Phase TI-1)
 */

import { FinancialMath } from '../finance/financial-math';

describe('FinancialMath Engine (Deterministic & Audited)', () => {
  describe('P/E and P/B Ratios', () => {
    it('calculates P/E accurately', () => {
      const pe = FinancialMath.calculatePE(1895.0, 66.2);
      expect(pe).toBe(28.63);
    });

    it('returns null for invalid or negative EPS/Price', () => {
      expect(FinancialMath.calculatePE(-100, 50)).toBeNull();
      expect(FinancialMath.calculatePE(100, 0)).toBeNull();
      expect(FinancialMath.calculatePE(100, -10)).toBeNull();
    });

    it('calculates P/B accurately', () => {
      const pb = FinancialMath.calculatePB(1895.0, 213.0);
      expect(pb).toBe(8.9);
    });
  });

  describe('Profitability & Solvency Ratios', () => {
    it('calculates ROE %', () => {
      const roe = FinancialMath.calculateROE(27450, 87400);
      expect(roe).toBe(31.41);
    });

    it('calculates ROCE %', () => {
      const roce = FinancialMath.calculateROCE(34820, 90200);
      expect(roce).toBe(38.6);
    });
  });

  describe('Risk Metrics: Maximum Drawdown & Volatility', () => {
    it('computes maximum drawdown across historical series', () => {
      const prices = [100, 120, 110, 90, 85, 130, 125];
      const mdd = FinancialMath.calculateMaxDrawdown(prices);
      // Peak 120, Trough 85 -> (120 - 85)/120 = 29.17%
      expect(mdd.maxDrawdownPercent).toBe(29.17);
      expect(mdd.peakPrice).toBe(120);
      expect(mdd.troughPrice).toBe(85);
    });

    it('computes annualized volatility from daily return series', () => {
      const returns = [0.01, -0.015, 0.008, 0.002, -0.005, 0.012];
      const vol = FinancialMath.calculateAnnualizedVolatility(returns);
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(100);
    });
  });

  describe('Portfolio Weighting Normalization', () => {
    it('normalizes asset values into exact percentage weights', () => {
      const holdings = [
        { id: 'INFY', value: 300000 },
        { id: 'TCS', value: 200000 },
        { id: 'GOLD', value: 500000 },
      ];
      const weights = FinancialMath.calculatePortfolioWeights(holdings);
      expect(weights.get('INFY')).toBe(30);
      expect(weights.get('TCS')).toBe(20);
      expect(weights.get('GOLD')).toBe(50);
    });
  });

  describe('Wealth Compounding Horizon Projections', () => {
    it('calculates compounding future value with explicit non-guaranteed attestation', () => {
      const projection = FinancialMath.calculateCompoundingProjection(500000, 15000, 11.0, 5);
      expect(projection.years).toBe(5);
      expect(projection.totalInvestedInr).toBe(500000 + 15000 * 60); // 1,400,000
      expect(projection.projectedPortfolioValueInr).toBeGreaterThan(projection.totalInvestedInr);
      expect(projection.assumedAnnualCagrPercent).toBe(11.0);
      expect(projection.isGuaranteed).toBe(false);
    });

    it('handles zero monthly SIP gracefully', () => {
      const projection = FinancialMath.calculateCompoundingProjection(100000, 0, 10.0, 3);
      expect(projection.totalInvestedInr).toBe(100000);
      // FV = 100000 * (1 + 0.1/12)^36 ~ 134818
      expect(projection.projectedPortfolioValueInr).toBeCloseTo(134818, -2);
    });
  });
});
