/**
 * AgentGuard Portfolio Intelligence Agent (Phase MI-6)
 * Focused on Long-Term Wealth Building & Financial Independence:
 * - Fixed Monthly Systematic Investment Plans (SIPs)
 * - Diversified Mutual Funds (Large-cap, Flexicap, Index)
 * - Gold Assets (Gold ETFs & Sovereign Gold Bonds - SGB)
 * - Protection Assets (Term Life & Comprehensive Health Insurance)
 * - Zero Day Trading, Zero Scalping, Zero Speculative Execution
 */

import {
  PortfolioSnapshot,
  PortfolioHolding,
} from '@agentguard/core-schema';
import { IBrokerProvider } from '../providers/provider-interface';
import { FinancialMath, CompoundingProjectionItem } from '../finance/financial-math';
import { marketConfig } from '../config';

export interface WealthAllocation {
  equityPercentage: number;
  mutualFundPercentage: number;
  goldPercentage: number;
  fixedIncomePercentage: number;
  insuranceCoverSumInr: number;
}

export interface SipScheduleSummary {
  totalMonthlyCommitmentInr: number;
  activeSipCount: number;
  items: Array<{
    holdingId: string;
    symbol: string;
    name: string;
    assetClass: string;
    monthlyAmountInr: number;
    sipDay: number;
  }>;
}

export type CompoundingProjection = CompoundingProjectionItem;

export interface PortfolioIntelligenceResult {
  tenantId: string;
  customerRef: string;
  snapshot: PortfolioSnapshot | null;
  holdings: PortfolioHolding[];
  allocation: WealthAllocation;
  sipSummary: SipScheduleSummary;
  projections: CompoundingProjection[];
  portfolioHealthAssessment: string[];
  rebalancingNotes: string[];
  evidence: Array<{ source: string; claim: string; timestamp: number }>;
}

export class PortfolioIntelligenceAgent {
  readonly agentName = 'PortfolioIntelligenceAgent';
  readonly description = 'Specialized agent for customer wealth architecture, disciplined monthly SIPs, gold hedges, and long-term asset allocation.';

  constructor(private readonly brokerProvider: IBrokerProvider) {}

  async analyze(
    tenantId: string,
    customerRef: string,
    options?: { assumedAnnualCagrPercent?: number }
  ): Promise<PortfolioIntelligenceResult> {
    const snapshot = await this.brokerProvider.getPortfolioSnapshot(tenantId, customerRef);
    const holdings = await this.brokerProvider.getHoldings(tenantId, customerRef);
    const sipSchedules = await this.brokerProvider.getSipSchedules(tenantId, customerRef);

    // 1. Calculate Asset Allocation
    let totalInvested = 0;
    let equityValue = 0;
    let mfValue = 0;
    let goldValue = 0;
    let fixedIncomeValue = 0;
    let insuranceCoverSum = 0;

    for (const h of holdings) {
      if (h.asset_class === 'INSURANCE_ULIP_OR_TERM') {
        insuranceCoverSum += h.current_value || h.invested_amount || 0;
        continue;
      }

      totalInvested += h.current_value;
      switch (h.asset_class) {
        case 'EQUITY':
          equityValue += h.current_value;
          break;
        case 'MUTUAL_FUND':
          mfValue += h.current_value;
          break;
        case 'GOLD_ETF':
        case 'SGB':
          goldValue += h.current_value;
          break;
        case 'FIXED_SIP':
          fixedIncomeValue += h.current_value;
          break;
      }
    }

    const divisor = totalInvested > 0 ? totalInvested : 1;
    const allocation: WealthAllocation = {
      equityPercentage: Math.round((equityValue / divisor) * 100),
      mutualFundPercentage: Math.round((mfValue / divisor) * 100),
      goldPercentage: Math.round((goldValue / divisor) * 100),
      fixedIncomePercentage: Math.round((fixedIncomeValue / divisor) * 100),
      insuranceCoverSumInr: insuranceCoverSum,
    };

    // 2. Active SIP Summary
    const sipItems = sipSchedules.map((s) => ({
      holdingId: s.holding_id,
      symbol: s.symbol,
      name: s.instrument_name,
      assetClass: s.asset_class,
      monthlyAmountInr: s.monthly_amount_inr,
      sipDay: s.sip_day,
    }));
    const totalMonthlyCommitmentInr = sipItems.reduce((acc, curr) => acc + curr.monthlyAmountInr, 0);

    const sipSummary: SipScheduleSummary = {
      totalMonthlyCommitmentInr,
      activeSipCount: sipItems.length,
      items: sipItems,
    };

    // 3. Long-Term Compounding Projections (Configurable, Non-Guaranteed)
    const assumedRate = options?.assumedAnnualCagrPercent ?? marketConfig.defaultCompoundingCagrPercent;
    const startingCorpus = totalInvested;

    const projections: CompoundingProjection[] = [
      FinancialMath.calculateCompoundingProjection(startingCorpus, totalMonthlyCommitmentInr, assumedRate, 3),
      FinancialMath.calculateCompoundingProjection(startingCorpus, totalMonthlyCommitmentInr, assumedRate, 5),
      FinancialMath.calculateCompoundingProjection(startingCorpus, totalMonthlyCommitmentInr, assumedRate, 10),
      FinancialMath.calculateCompoundingProjection(startingCorpus, totalMonthlyCommitmentInr, assumedRate, 15),
    ];

    // 4. Portfolio Health & Rebalancing Notes
    const portfolioHealthAssessment: string[] = [];
    const rebalancingNotes: string[] = [];

    if (sipSummary.activeSipCount > 0) {
      portfolioHealthAssessment.push(
        `Active disciplined rupee-cost averaging: ₹${totalMonthlyCommitmentInr.toLocaleString('en-IN')}/month invested across ${sipSummary.activeSipCount} wealth instruments.`
      );
    } else {
      portfolioHealthAssessment.push(
        'No active automated SIPs registered. Setting up recurring monthly SIPs is strongly recommended to hedge timing volatility.'
      );
    }

    if (allocation.goldPercentage >= 5 && allocation.goldPercentage <= 15) {
      portfolioHealthAssessment.push(
        `Prudent gold hedge (${allocation.goldPercentage}% in Gold ETF / SGB) shields wealth against currency debasement and geopolitical stress.`
      );
    } else if (allocation.goldPercentage < 5) {
      rebalancingNotes.push(
        `Gold allocation is ${allocation.goldPercentage}%. Consider directing a modest monthly SIP toward Sovereign Gold Bonds or Gold ETFs to maintain a 10% inflation hedge.`
      );
    }

    if (insuranceCoverSum > 0) {
      portfolioHealthAssessment.push(
        `Family protection in place: ₹${(insuranceCoverSum / 100000).toFixed(0)} Lakhs documented sum assured for term/health safety.`
      );
    } else {
      rebalancingNotes.push(
        'No active pure-risk term life insurance documented. Ensure family protection is secured before aggressive equity allocation.'
      );
    }

    const evidence: Array<{ source: string; claim: string; timestamp: number }> = [
      {
        source: 'Customer Consented Read-Only Upstox Broker Feed',
        claim: `Analyzed ${holdings.length} holdings across ${allocation.equityPercentage}% Equities, ${allocation.mutualFundPercentage}% Mutual Funds, ${allocation.goldPercentage}% Gold.`,
        timestamp: Date.now(),
      },
      {
        source: 'Automated Banking & Mandate Ledger',
        claim: `Current fixed monthly SIP obligation: ₹${totalMonthlyCommitmentInr.toLocaleString('en-IN')}.`,
        timestamp: Date.now(),
      },
    ];

    return {
      tenantId,
      customerRef,
      snapshot,
      holdings,
      allocation,
      sipSummary,
      projections,
      portfolioHealthAssessment,
      rebalancingNotes,
      evidence,
    };
  }
}
