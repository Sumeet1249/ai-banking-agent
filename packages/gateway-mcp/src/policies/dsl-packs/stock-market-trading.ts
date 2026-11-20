/**
 * Stock Market & Algorithmic Trading Security Pack (2026).
 *
 * Covers autonomous AI agents operating brokerages, algorithmic trading,
 * execution management systems (EMS/OMS), and portfolio rebalancing:
 *   · SEC Rule 15c3-5 (Market Access Rule: Pre-Trade Risk Controls)
 *   · FINRA Rule 5210 (Publication of Transactions & Anti-Wash Trading)
 *   · SEBI 2026 Master Directions on Algorithmic & Automated Trading
 *   · CFTC Regulation 1.73 (Clearing Member Risk Management)
 *
 * Enforces the core controls institutional desks and retail brokers require:
 *   1. Single-order notional value caps with Human-in-the-Loop step-up
 *   2. Fat-finger / price collar enforcement (preventing runaway slippage)
 *   3. Restricted ticker & penny stock blocks (OTC / illiquid equities)
 *   4. Algorithmic loop velocity circuit-breakers (flash-crash prevention)
 *   5. Naked short & unauthorized leverage blocks
 */

import { PolicyDsl } from '@agentguard/core-schema';

const dsl: PolicyDsl = {
  version: 1,
  rules: [
    // ── Pre-Trade Notional Value Caps (SEC Rule 15c3-5) ─────────────
    {
      name: 'equity-notional-threshold-pending',
      when: {
        all: [
          { 'tool.name': { matches: '^(trade|order|buy|sell|equity|broker)_' } },
          { 'tool.args.notional_value_usd': { '>': 25000 } },
        ],
      },
      then: {
        decision: 'pending',
        reason: 'Order notional value exceeds $25,000 — requires trader approval per SEC 15c3-5 pre-trade risk controls',
        tags: ['stock-market', 'sec-15c3-5', 'notional-cap', 'step-up'],
      },
    },
    {
      name: 'equity-notional-hard-block',
      when: {
        all: [
          { 'tool.name': { matches: '^(trade|order|buy|sell|equity|broker)_' } },
          { 'tool.args.notional_value_usd': { '>': 100000 } },
        ],
      },
      then: {
        decision: 'block',
        reason: 'Order notional value exceeds $100,000 autonomous desk limit — blocked; submit via principal dealer desk',
        tags: ['stock-market', 'sec-15c3-5', 'hard-block'],
      },
    },

    // ── Fat-Finger & Price Collar Protection ────────────────────────
    {
      name: 'fat-finger-collar-block',
      when: {
        all: [
          { 'tool.name': { matches: '^(trade|order|place_order|submit_order)' } },
          { 'tool.args.price_deviation_pct': { '>': 5 } },
        ],
      },
      then: {
        decision: 'block',
        reason: 'Limit price deviates > 5% from National Best Bid/Offer (NBBO) — fat-finger price collar triggered',
        tags: ['stock-market', 'fat-finger', 'price-collar'],
      },
    },

    // ── Restricted Tickers & OTC / Illiquid Stocks ──────────────────
    {
      name: 'unauthorized-penny-stock-block',
      when: {
        all: [
          { 'tool.name': { matches: '^(trade|order|place_order)' } },
          { 'tool.args.market_tier': { matches: '^(OTC|PINK|MICROCAP|PENNY)' } },
        ],
      },
      then: {
        decision: 'block',
        reason: 'Autonomous execution on OTC / Micro-cap penny stocks is strictly prohibited by compliance policy',
        tags: ['stock-market', 'restricted-symbols', 'compliance'],
      },
    },

    // ── Algorithmic Runaway Loop Velocity (Flash Crash Prevention) ──
    {
      name: 'algo-velocity-circuit-breaker',
      when: {
        all: [
          { 'tool.name': { matches: '(order|trade|buy|sell)' } },
          { 'agent.calls_5m': { '>': 15 } },
        ],
      },
      then: {
        decision: 'pending',
        reason: 'Order velocity (>15 orders / 5m) exceeds algorithmic threshold — held for market access compliance review',
        tags: ['stock-market', 'circuit-breaker', 'velocity'],
      },
    },

    // ── Derivative & Short Selling Position Limits ──────────────────
    {
      name: 'uncovered-short-derivative-block',
      when: {
        all: [
          { 'tool.name': { matches: '^(trade|order|options)_' } },
          { 'tool.args.position_type': { matches: '^(NAKED_SHORT|UNCOVERED_CALL|3X_LEVERAGED)' } },
        ],
      },
      then: {
        decision: 'block',
        reason: 'Uncovered derivative and 3x leveraged ETF position opening blocked for autonomous agent mandate',
        tags: ['stock-market', 'derivatives', 'margin-risk'],
      },
    },
  ],
};

export const stockMarketTradingPack = {
  description:
    'Institutional Pre-Trade Risk Controls & Algorithmic Market Access Guards. Enforces SEC Rule 15c3-5, FINRA Rule 5210, notional order value limits, fat-finger price collars, OTC penny-stock blocking, and flash-crash velocity circuit breakers.',
  citation:
    'SEC Rule 15c3-5 (Risk Management Controls for Market Access) · FINRA Rule 5210 · SEBI Algorithmic Trading Master Circular (2026) · CFTC Regulation 1.73',
  dsl,
};
