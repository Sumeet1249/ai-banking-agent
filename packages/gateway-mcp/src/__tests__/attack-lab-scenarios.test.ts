/**
 * Phase 2: Attack Lab 7 Scenarios Integration Test Suite (Direct Execution)
 *
 * Verifies all 7 hackathon attack scenarios across Protection ON vs. OFF:
 *   1. Prompt Injection / Payee Diversion
 *   2. Overreach / Over-permission Limit Breach
 *   3. Stolen Token & Replay Attack
 *   4. Structuring / Smurfing Evading Per-Tx Caps
 *   5. Compromised Agent Runaway Velocity Spike
 *   6. Post-Revocation Unauthorized Calling (<1s propagation)
 *   7. Insider Database Tamper (Chain break detection)
 */

import Database from 'better-sqlite3';
import { BankingStores } from '../db/banking-stores';
import { BankingAgentIdentityService } from '../services/banking-agent-identity';
import { PermitEngineService } from '../services/permit-engine';
import { AttackLabAPI } from '../api/attack-lab';

describe('Phase 2: Attack Lab 7 Scenarios (Protection ON vs. OFF)', () => {
  let db: Database.Database;
  let stores: BankingStores;
  let identity: BankingAgentIdentityService;
  let permitEngine: PermitEngineService;
  let labApi: AttackLabAPI;

  beforeAll(() => {
    db = new Database(':memory:');
    stores = new BankingStores(db);
    stores.seedFixtures();
    identity = new BankingAgentIdentityService(db);
    permitEngine = new PermitEngineService(db, stores, identity);
    labApi = new AttackLabAPI(db, permitEngine, identity, stores);
  });

  afterAll(() => {
    db.close();
  });

  // ── Scenario 1: Prompt Injection ───────────────────────────────────────────
  describe('Scenario 1: Prompt Injection / Payee Diversion', () => {
    it('OFF: allows prompt injection draining funds', () => {
      const res = labApi.runScenarioDirect('scenario_1_prompt_injection', false);
      expect(res.protection).toBe(false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(490000); // ₹4,900
      expect(res.amount_saved_paise).toBe(0);
    });

    it('ON: blocks malicious payee diversion and saves funds', () => {
      const res = labApi.runScenarioDirect('scenario_1_prompt_injection', true);
      expect(res.protection).toBe(true);
      expect(res.decision).toBe('BLOCK');
      expect(res.amount_saved_paise).toBe(490000); // ₹4,900
      expect(res.simulated_money_lost_paise).toBe(0);
      expect(res.reasons.some((r: string) => r.includes('PAYEE') || r.includes('divert') || r.includes('INTENT'))).toBe(true);
    });
  });

  // ── Scenario 2: Overreach / Limit Exceeded ──────────────────────────────────
  describe('Scenario 2: Overreach Limit Breach', () => {
    it('OFF: allows ₹50,000 transaction exceeding limit', () => {
      const res = labApi.runScenarioDirect('scenario_2_overreach', false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(5000000); // ₹50,000
    });

    it('ON: strictly blocks transaction exceeding ₹5,000 per-txn cap', () => {
      const res = labApi.runScenarioDirect('scenario_2_overreach', true);
      expect(res.decision).toBe('BLOCK');
      expect(res.amount_saved_paise).toBe(5000000);
      expect(res.reasons.some((r: string) => r.includes('LIMIT') || r.includes('EXCEEDS'))).toBe(true);
    });
  });

  // ── Scenario 3: Stolen Token & Replay ───────────────────────────────────────
  describe('Scenario 3: Stolen Token & Replay Attack', () => {
    it('OFF: replays token and executes duplicate transfer', () => {
      const res = labApi.runScenarioDirect('scenario_3_stolen_token_replay', false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(250000); // ₹2,500
    });

    it('ON: enforces single-use atomic nonce and rejects replay', () => {
      const res = labApi.runScenarioDirect('scenario_3_stolen_token_replay', true);
      expect(res.decision).toBe('BLOCK');
      expect(res.amount_saved_paise).toBe(250000);
      expect(res.reasons.some((r: string) => r.includes('NONCE_ALREADY_CONSUMED'))).toBe(true);
    });
  });

  // ── Scenario 4: Structuring / Smurfing ──────────────────────────────────────
  describe('Scenario 4: Structuring / Smurfing Detection', () => {
    it('OFF: permits 10 successive ₹4,900 transfers (₹49,000 drained)', () => {
      const res = labApi.runScenarioDirect('scenario_4_structuring', false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(4900000); // ₹49,000
    });

    it('ON: flags structuring pattern and blocks smurfing', () => {
      const res = labApi.runScenarioDirect('scenario_4_structuring', true);
      expect(res.decision).toBe('BLOCK');
      expect(res.amount_saved_paise).toBe(4900000);
      expect(res.reasons.some((r: string) => r.includes('STRUCTURING'))).toBe(true);
    });
  });

  // ── Scenario 5: Runaway Compromised Agent ───────────────────────────────────
  describe('Scenario 5: Compromised Agent Runaway & Auto-Quarantine', () => {
    it('OFF: permits runaway burst causing balance depletion', () => {
      const res = labApi.runScenarioDirect('scenario_5_compromised_agent', false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(8000000); // ₹80,000
    });

    it('ON: auto-quarantines rogue agent and halts executions', () => {
      const res = labApi.runScenarioDirect('scenario_5_compromised_agent', true);
      expect(res.decision).toBe('QUARANTINE');
      expect(res.amount_saved_paise).toBe(8000000);
      expect(res.reasons.some((r: string) => r.includes('quarantined') || r.includes('QUARANTINE'))).toBe(true);
    });
  });

  // ── Scenario 6: Post-Revocation Call ───────────────────────────────────────
  describe('Scenario 6: Post-Revocation Call', () => {
    it('OFF: permits call after customer revoked (stale token)', () => {
      const res = labApi.runScenarioDirect('scenario_6_post_revocation', false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(320000); // ₹3,200
    });

    it('ON: rejects call within <1s of mandate revocation', () => {
      const res = labApi.runScenarioDirect('scenario_6_post_revocation', true);
      expect(res.decision).toBe('BLOCK');
      expect(res.amount_saved_paise).toBe(320000);
      expect(res.reasons.some((r: string) => r.includes('REVOKED'))).toBe(true);
    });
  });

  // ── Scenario 7: Insider Database Tamper ────────────────────────────────────
  describe('Scenario 7: Insider Database Tampering & Audit Verification', () => {
    it('OFF: tamper remains undetectable without cryptographic verification', () => {
      const res = labApi.runScenarioDirect('scenario_7_insider_tamper', false);
      expect(res.decision).toBe('ALLOW');
      expect(res.simulated_money_lost_paise).toBe(10000000); // ₹1,00,000
    });

    it('ON: detects broken hash chain when DB row is modified', () => {
      const res = labApi.runScenarioDirect('scenario_7_insider_tamper', true);
      expect(res.decision).toBe('BLOCK');
      expect(res.amount_saved_paise).toBe(10000000);
      expect(res.reasons.some((r: string) => r.includes('tamper') || r.includes('broken') || r.includes('chain') || r.includes('TAMPER'))).toBe(true);
    });
  });

  // ── Audit Ledger Direct Verification ───────────────────────────────────────
  describe('Audit Ledger API Verification', () => {
    it('confirms integrity initially', () => {
      const check = labApi.verifyAuditLedger();
      expect(check.valid).toBe(true);
      expect(check.total_blocks).toBeGreaterThan(0);
    });

    it('breaks block #1 when tamper is applied', () => {
      const tampered = labApi.tamperAuditBlock(1, 9999900);
      expect(tampered).toBe(true);

      const check = labApi.verifyAuditLedger();
      expect(check.valid).toBe(false);
      expect(check.failed_at_block).toBe(1);
    });

    it('restores integrity when repair is executed', () => {
      labApi.repairAuditLedger();
      const check = labApi.verifyAuditLedger();
      expect(check.valid).toBe(true);
    });
  });
});
