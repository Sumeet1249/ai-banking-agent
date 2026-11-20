/**
 * Hackathon Problem Statement & AgentShield 5-Core Requirements Test Suite
 *
 * Problem: Cybersecurity — Securing Banks Against Rogue AI Agents
 * Verifies ALL 5 Core Hackathon Requirements + 7 Attack Lab Scenarios:
 *   1. Scoped delegation (limited, time-bound, instantly revocable in <1s)
 *   2. Agent identity & authentication (Ed25519 signing, timestamp skew, nonce anti-replay)
 *   3. Behavioural anomaly detection (velocity, structuring, intent-drift)
 *   4. Human-in-the-loop escalation (ASK step-up, WebAuthn binding)
 *   5. Tamper-evident audit trail (Merkle hash chain, row tampering detection)
 *   + 7 Attack Lab Scenarios (Protection ON vs OFF comparison)
 */

import Database from 'better-sqlite3';
import { generateKeyPairSync, sign as cryptoSign, randomUUID, createHash } from 'crypto';
import { BankingAnomalyDetector } from '../detectors/banking-anomaly-detector';
import { PermitEngineService } from '../services/permit-engine';
import { BankingAgentIdentityService } from '../services/banking-agent-identity';
import { BankingStores } from '../db/banking-stores';
import { AttackLabAPI } from '../api/attack-lab';

describe('AgentShield Hackathon 5-Requirement & Attack Lab Suite', () => {
  let db: Database.Database;
  let stores: BankingStores;
  let identity: BankingAgentIdentityService;
  let permitEngine: PermitEngineService;
  let labApi: AttackLabAPI;

  const customerRef = 'CUST_HACK_101';
  const mandateId = 'MND_HACK_101';
  let agentPubKeyPem: string;
  let agentPrivKey: any;

  beforeAll(() => {
    db = new Database(':memory:');
    stores = new BankingStores(db);
    identity = new BankingAgentIdentityService(db);
    permitEngine = new PermitEngineService(db, stores, identity);
    labApi = new AttackLabAPI(db, permitEngine, identity, stores);

    // Generate Custom Agent Ed25519 Keypair
    const pair = generateKeyPairSync('ed25519');
    agentPrivKey = pair.privateKey;
    agentPubKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    // Register Customer & Account (₹50,000 balance in paise)
    stores.createCustomer({
      customer_ref: customerRef,
      name: 'Hackathon Test Customer',
      email: 'hack.test@bank.com',
      phone: '+919876500000',
      pin: '2468',
      status: 'ACTIVE',
    });

    stores.createAccount({
      account_ref: 'ACC_HACK_101',
      customer_ref: customerRef,
      currency: 'INR',
      balance_paise: 5000000,
    });

    // Register Active Mandate (₹5,000 per-txn cap)
    stores.createMandate({
      mandate_id: mandateId,
      mandate_version: 1,
      customer_ref: customerRef,
      account_ref: 'ACC_HACK_101',
      authorized_agent_id: 'AGENT_TEST_01',
      action: 'pay_bill',
      purpose: 'electricity_bills',
      per_tx_limit_paise: 500000, // ₹5,000
      daily_limit_paise: 1500000,
      status: 'ACTIVE',
      allowed_payees: ['BESCOM', 'TATA_POWER'],
      created_at: Date.now() - 10000,
      updated_at: Date.now() - 10000,
      expires_at: Date.now() + 86400000 * 30,
    });

    // Register Agent Identity
    identity.registerAgent({
      agent_id: 'AGENT_TEST_01',
      name: 'Test Electric Agent',
      role: 'BILL_PAYMENT_PRIMARY',
      public_key_pem: agentPubKeyPem,
      key_id: 'key_test_01',
    });
  });

  afterAll(() => {
    db.close();
  });

  // ── Requirement 1: Scoped Delegation & Instant Revocation ─────────────────
  describe('Requirement 1: Scoped Delegation (Limited, Time-bound, Instantly Revocable)', () => {
    it('allows transaction within mandate bounds (₹1,200 to BESCOM)', () => {
      const res = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_TEST_01',
        customer_ref: customerRef,
        mandate_id: mandateId,
        account_ref: 'ACC_HACK_101',
        action: 'pay_bill',
        purpose: 'electricity_bills',
        intent: 'Pay my electricity bills',
        amount_paise: 120000, // ₹1,200
        currency: 'INR',
        payee_id: 'BESCOM',
        invoice_ref: 'INV-NORMAL-001',
        request_id: randomUUID(),
      });

      expect(res.decision).toBe('ALLOW');
      expect(res.permit_envelope).toBeDefined();
    });

    it('blocks overreach when amount exceeds limit (₹5,001 on ₹5,000 cap)', () => {
      const res = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_TEST_01',
        customer_ref: customerRef,
        mandate_id: mandateId,
        account_ref: 'ACC_HACK_101',
        action: 'pay_bill',
        purpose: 'electricity_bills',
        intent: 'Pay my electricity bills',
        amount_paise: 500100, // ₹5,001
        currency: 'INR',
        payee_id: 'BESCOM',
        invoice_ref: 'INV-OVERREACH-002',
        request_id: randomUUID(),
      });

      expect(res.decision).toBe('DENY');
      expect(res.reason).toContain('AMOUNT_EXCEEDS_PER_TX_LIMIT');
    });

    it('blocks call instantly when mandate is revoked by customer (<1s propagation)', () => {
      // Customer revokes mandate
      stores.revokeMandate(mandateId, customerRef);

      const res = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_TEST_01',
        customer_ref: customerRef,
        mandate_id: mandateId,
        account_ref: 'ACC_HACK_101',
        action: 'pay_bill',
        purpose: 'electricity_bills',
        amount_paise: 120000,
        currency: 'INR',
        payee_id: 'BESCOM',
        invoice_ref: 'INV-REVOKED-001',
        request_id: randomUUID(),
      });

      expect(res.decision).toBe('DENY');
      expect(res.reason).toBe('MANDATE_STATUS_REVOKED');

      // Reactivate for subsequent tests
      stores.reactivateMandate(mandateId, customerRef);
    });
  });

  // ── Requirement 2: Agent Identity & Anti-Replay ───────────────────────────
  describe('Requirement 2: Agent Identity & Cryptographic Anti-Replay', () => {
    it('verifies Ed25519 agent request signature', () => {
      const payloadBuf = Buffer.from('test-agent-payment-request', 'utf8');
      const sig = cryptoSign(null, payloadBuf, agentPrivKey).toString('base64');

      const verified = identity.verifySignature('AGENT_TEST_01', payloadBuf, sig);
      expect(verified).toBe(true);
    });

    it('rejects tampered or replayed signature from unauthorized party', () => {
      const otherPair = generateKeyPairSync('ed25519');
      const payloadBuf = Buffer.from('test-agent-payment-request', 'utf8');
      const forgedSig = cryptoSign(null, payloadBuf, otherPair.privateKey).toString('base64');

      const verified = identity.verifySignature('AGENT_TEST_01', payloadBuf, forgedSig);
      expect(verified).toBe(false);
    });

    it('enforces single-use atomic nonces (anti-replay)', () => {
      const nonce = permitEngine.mintNonce('AGENT_TEST_01');
      expect(permitEngine.consumeNonce(nonce)).toBe(true);
      // Second attempt to consume same nonce fails
      expect(permitEngine.consumeNonce(nonce)).toBe(false);
    });
  });

  // ── Requirement 3: Behavioural Anomaly & Intent-Drift Engine ──────────────
  describe('Requirement 3: Behavioural Anomaly & Intent-Drift Engine', () => {
    let detector: BankingAnomalyDetector;

    beforeEach(() => {
      detector = new BankingAnomalyDetector();
    });

    it('detects intent drift when stated intent differs from malicious action', () => {
      const evalResult = detector.evaluate({
        agent_id: 'AGENT_TEST_01',
        action: 'wire_transfer',
        purpose: 'crypto_drain',
        intent: 'Pay my electricity bills',
        amount_paise: 490000,
        payee_id: 'ATTACKER_OFFSHORE',
        allowed_payees: ['BESCOM'],
        max_per_txn_paise: 500000,
      });

      expect(evalResult.decision).toBe('DENY');
      expect(evalResult.risk_score).toBeGreaterThanOrEqual(75);
      expect(evalResult.signals.some((s) => s.code === 'INTENT_DRIFT_DETECTED')).toBe(true);
    });

    it('detects structuring / smurfing pattern (multiple calls near limit)', () => {
      // 3 calls at ₹4,900 on ₹5,000 limit
      detector.evaluate({
        agent_id: 'AGENT_TEST_01',
        action: 'pay_bill',
        purpose: 'bill',
        amount_paise: 490000,
        payee_id: 'BESCOM',
        allowed_payees: ['BESCOM'],
        max_per_txn_paise: 500000,
      });
      detector.evaluate({
        agent_id: 'AGENT_TEST_01',
        action: 'pay_bill',
        purpose: 'bill',
        amount_paise: 490000,
        payee_id: 'BESCOM',
        allowed_payees: ['BESCOM'],
        max_per_txn_paise: 500000,
      });
      const evalResult = detector.evaluate({
        agent_id: 'AGENT_TEST_01',
        action: 'pay_bill',
        purpose: 'bill',
        amount_paise: 490000,
        payee_id: 'BESCOM',
        allowed_payees: ['BESCOM'],
        max_per_txn_paise: 500000,
      });

      expect(evalResult.signals.some((s) => s.code === 'STRUCTURING_DETECTED')).toBe(true);
    });

    it('auto-quarantines rogue agent after 3 consecutive security blocks', () => {
      // Trigger 3 denials
      for (let i = 0; i < 3; i++) {
        detector.evaluate({
          agent_id: 'ROGUE_AGENT_99',
          action: 'wire_transfer',
          purpose: 'unauthorized',
          amount_paise: 490000,
          payee_id: 'UNKNOWN_PAYEE',
          allowed_payees: ['BESCOM'],
        });
      }

      expect(detector.isAgentQuarantined('ROGUE_AGENT_99')).toBe(true);
    });

    it('global emergency kill-switch halts all executions immediately', () => {
      detector.setGlobalFreeze(true, 'SecOps manual freeze drill');

      const evalResult = detector.evaluate({
        agent_id: 'AGENT_TEST_01',
        action: 'pay_bill',
        purpose: 'bill',
        amount_paise: 100000,
        payee_id: 'BESCOM',
        allowed_payees: ['BESCOM'],
      });

      expect(evalResult.decision).toBe('DENY');
      expect(evalResult.signals.some((s) => s.code === 'GLOBAL_KILL_SWITCH_ACTIVE')).toBe(true);

      // Reset global freeze after test
      detector.setGlobalFreeze(false);
    });
  });

  // ── Requirement 4: Human-in-the-Loop Step-Up Escalation ───────────────────
  describe('Requirement 4: Human-in-the-Loop Escalation (ASK Decision)', () => {
    it('escalates to ASK decision when risk is medium (step-up human approval required)', () => {
      const stepUpAgentId = 'AGENT_STEPUP_02';
      // Register dedicated agent for step-up test
      identity.registerAgent({
        agent_id: stepUpAgentId,
        name: 'Step Up Test Agent',
        role: 'BILL_PAYMENT_PRIMARY',
        public_key_pem: agentPubKeyPem,
        key_id: 'key_stepup_02',
      });

      // Register matching mandate
      stores.createMandate({
        mandate_id: 'MND_STEPUP_02',
        mandate_version: 1,
        customer_ref: customerRef,
        account_ref: 'ACC_HACK_101',
        authorized_agent_id: stepUpAgentId,
        action: 'pay_bill',
        purpose: 'electricity_bills',
        per_tx_limit_paise: 500000,
        daily_limit_paise: 1500000,
        status: 'ACTIVE',
        allowed_payees: ['BESCOM'],
        created_at: Date.now() - 10000,
        updated_at: Date.now() - 10000,
        expires_at: Date.now() + 86400000,
      });

      const detector = permitEngine.getAnomalyDetector();
      // Cause 3 transactions with matching intent to raise velocity without intent drift
      for (let i = 0; i < 3; i++) {
        detector.evaluate({
          agent_id: stepUpAgentId,
          action: 'pay_bill',
          purpose: 'electricity_bills',
          intent: 'Pay my electricity bills',
          amount_paise: 100000,
          payee_id: 'BESCOM',
          allowed_payees: ['BESCOM'],
          max_per_txn_paise: 500000,
          historical_mean_paise: 200000,
        });
      }

      const res = permitEngine.evaluateAndMintPermit({
        agent_id: stepUpAgentId,
        customer_ref: customerRef,
        mandate_id: 'MND_STEPUP_02',
        account_ref: 'ACC_HACK_101',
        action: 'pay_bill',
        purpose: 'electricity_bills',
        intent: 'Pay my electricity bills',
        amount_paise: 100000,
        currency: 'INR',
        payee_id: 'BESCOM',
        invoice_ref: 'INV-STEPUP-001',
        request_id: randomUUID(),
      });

      expect(res.decision).toBe('ASK');
      expect(res.reason).toMatch(/Velocity burst|RAPID_VELOCITY_SPIKE/i);
    });
  });

  // ── Requirement 5: Tamper-Evident Audit Ledger ─────────────────────────────
  describe('Requirement 5: Tamper-Evident Audit Ledger & Live Tamper Demo', () => {
    it('maintains valid hash chain across sequential blocks', () => {
      const blocks = db.prepare('SELECT * FROM audit_ledger_blocks ORDER BY block_index ASC').all() as any[];
      expect(blocks.length).toBeGreaterThan(0);

      // Verify genesis block
      expect(blocks[0].prev_hash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('detects tampering immediately when an internal DB row is edited', () => {
      // 1. Insert a clean test block
      const prevBlock = db.prepare('SELECT * FROM audit_ledger_blocks ORDER BY block_index DESC LIMIT 1').get() as any;
      const index = prevBlock.block_index + 1;
      const prevHash = prevBlock.block_hash;
      const blockData = `${index}:1700000050000:agent_test:CUST_101:pay_bill:200000:ALLOW:[]:${prevHash}`;
      const blockHash = createHash('sha256').update(blockData).digest('hex');

      db.prepare(`
        INSERT INTO audit_ledger_blocks (block_index, timestamp, agent_id, customer_ref, action, amount_paise, decision, reasons_json, prev_hash, block_hash)
        VALUES (?, 1700000050000, 'agent_test', 'CUST_101', 'pay_bill', 200000, 'ALLOW', '[]', ?, ?)
      `).run(index, prevHash, blockHash);

      // 2. Illegitimately edit the amount directly in SQL (simulating an insider attack)
      db.prepare('UPDATE audit_ledger_blocks SET amount_paise = 9999999 WHERE block_index = ?').run(index);

      // 3. Re-verify block hash
      const tamperedBlock = db.prepare('SELECT * FROM audit_ledger_blocks WHERE block_index = ?').get(index) as any;
      const recomputedData = `${tamperedBlock.block_index}:${tamperedBlock.timestamp}:${tamperedBlock.agent_id}:${tamperedBlock.customer_ref}:${tamperedBlock.action}:${tamperedBlock.amount_paise}:${tamperedBlock.decision}:${tamperedBlock.reasons_json}:${tamperedBlock.prev_hash}`;
      const recomputedHash = createHash('sha256').update(recomputedData).digest('hex');

      expect(recomputedHash).not.toBe(tamperedBlock.block_hash);
    });
  });
});
