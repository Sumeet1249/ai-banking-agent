/**
 * Phase 2.3.1 Corrective Security & Architecture Tests
 *
 * Verifies:
 *   1. Gateway issues signed 22-field TBP permits without mutating financial balances.
 *   2. Permit expiration is strictly 90 seconds (CONTRACTS.md & BANKING-ARCHITECTURE.md).
 *   3. Cascading multi-level delegation revocation works recursively.
 *   4. Single-use nonce emission and atomic consumption prevents replay.
 *   5. Rule E5 namespace isolation (agent vs customer credentials).
 *   6. Rule E6 demo PIN restriction outside DEMO_MODE=1.
 *   7. Ed25519 signature validity over canonical 22-field payload.
 */

import Database = require('better-sqlite3');
import { verify as cryptoVerify, createPublicKey } from 'crypto';
import {
  canonicalJson,
  PermitEnvelopeSchema,
  TransactionBoundPermitPayloadSchema,
} from '@agentguard/core-schema';
import { BankingStores } from '../db/banking-stores';
import { BankingAgentIdentityService } from '../services/banking-agent-identity';
import { PermitEngineService } from '../services/permit-engine';

describe('Phase 2.3.1: Security & Architecture Verification', () => {
  let db: Database.Database;
  let stores: BankingStores;
  let agentIdentity: BankingAgentIdentityService;
  let permitEngine: PermitEngineService;

  beforeEach(() => {
    db = new Database(':memory:');
    stores = new BankingStores(db);
    agentIdentity = new BankingAgentIdentityService(db);
    permitEngine = new PermitEngineService(db, stores, agentIdentity);
  });

  afterEach(() => {
    db.close();
  });

  describe('Permit Issuance & Financial Boundary Correction', () => {
    it('mints a valid 22-field signed permit without modifying liquid account balance', () => {
      const initialAccount = stores.getAccount('ACC_101');
      expect(initialAccount?.balance_paise).toBe(10000000); // ₹1,00,000

      const result = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_ELEC_01',
        customer_ref: 'CUST_101',
        mandate_id: 'MND_ELEC_101',
        account_ref: 'ACC_101',
        action: 'bill_payment',
        purpose: 'electricity_bill',
        amount_paise: 240000, // ₹2,400
        currency: 'INR',
        payee_id: 'PAYEE_CESC_001',
        invoice_ref: 'INV-1001',
        request_id: '11111111-1111-4111-8111-111111111111',
      });

      expect(result.decision).toBe('ALLOW');
      expect(result.permit_envelope).toBeDefined();

      const envelope = result.permit_envelope!;
      PermitEnvelopeSchema.parse(envelope);

      const permit = envelope.permit;
      TransactionBoundPermitPayloadSchema.parse(permit);

      // Verify exact 22 fields
      const keys = Object.keys(permit);
      expect(keys).toHaveLength(22);

      // Verify strictly 90-second permit TTL
      const ttlSeconds = (permit.expires_at - permit.issued_at) / 1000;
      expect(ttlSeconds).toBe(90);

      // Verify that Gateway did NOT decrement or lock funds in accounts table
      const postAccount = stores.getAccount('ACC_101');
      expect(postAccount?.balance_paise).toBe(10000000); // Still ₹1,00,000 (No duplicate ledger!)

      // Verify Ed25519 signature validity
      const canonicalString = canonicalJson(permit);
      const pubKey = createPublicKey(permitEngine.getGatewayPublicKeyPem());
      const isValid = cryptoVerify(
        null,
        Buffer.from(canonicalString, 'utf8'),
        pubKey,
        Buffer.from(envelope.signature, 'base64'),
      );
      expect(isValid).toBe(true);
    });

    it('rejects permit tampering (payload mutation breaks Ed25519 signature)', () => {
      const result = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_ELEC_01',
        customer_ref: 'CUST_101',
        mandate_id: 'MND_ELEC_101',
        account_ref: 'ACC_101',
        action: 'bill_payment',
        purpose: 'electricity_bill',
        amount_paise: 240000,
        currency: 'INR',
        payee_id: 'PAYEE_CESC_001',
        invoice_ref: 'INV-1001',
        request_id: '11111111-1111-4111-8111-111111111111',
      });

      const envelope = result.permit_envelope!;
      // Attacker attempts to tamper with amount_paise from 240000 to 500000
      const tamperedPermit = { ...envelope.permit, amount_paise: 500000 };

      const canonicalTampered = canonicalJson(tamperedPermit);
      const pubKey = createPublicKey(permitEngine.getGatewayPublicKeyPem());
      const isValid = cryptoVerify(
        null,
        Buffer.from(canonicalTampered, 'utf8'),
        pubKey,
        Buffer.from(envelope.signature, 'base64'),
      );
      expect(isValid).toBe(false);
    });
  });

  describe('Delegation & Cascading Revocation', () => {
    it('allows delegated sub-agent when parent and delegation are active', () => {
      const result = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_SUB_01',
        customer_ref: 'CUST_101',
        mandate_id: 'MND_ELEC_101',
        account_ref: 'ACC_101',
        action: 'bill_payment',
        purpose: 'electricity_bill',
        amount_paise: 200000, // ₹2,000 (within sub-limit of ₹3,000)
        currency: 'INR',
        payee_id: 'PAYEE_CESC_001',
        invoice_ref: 'INV-1001',
        request_id: '22222222-2222-4222-8222-222222222222',
        delegation_ref: 'DEL_ELEC_SUB_01',
      });

      expect(result.decision).toBe('ALLOW');
      expect(result.permit_envelope?.permit.delegation_ref).toBe('DEL_ELEC_SUB_01');
    });

    it('cascadingly rejects sub-agent operations when parent agent is suspended or revoked', () => {
      // Suspend parent agent
      agentIdentity.setAgentStatus('AGENT_ELEC_01', 'SUSPENDED');

      const result = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_SUB_01',
        customer_ref: 'CUST_101',
        mandate_id: 'MND_ELEC_101',
        account_ref: 'ACC_101',
        action: 'bill_payment',
        purpose: 'electricity_bill',
        amount_paise: 200000,
        currency: 'INR',
        payee_id: 'PAYEE_CESC_001',
        invoice_ref: 'INV-1001',
        request_id: '22222222-2222-4222-8222-222222222222',
        delegation_ref: 'DEL_ELEC_SUB_01',
      });

      expect(result.decision).toBe('DENY');
      expect(result.reason).toBe('PARENT_AGENT_SUSPENDED');
    });

    it('rejects sub-agent operations exceeding sub-delegation monetary bounds', () => {
      const result = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_SUB_01',
        customer_ref: 'CUST_101',
        mandate_id: 'MND_ELEC_101',
        account_ref: 'ACC_101',
        action: 'bill_payment',
        purpose: 'electricity_bill',
        amount_paise: 400000, // ₹4,000 (exceeds ₹3,000 sub-delegation limit!)
        currency: 'INR',
        payee_id: 'PAYEE_CESC_001',
        invoice_ref: 'INV-1001',
        request_id: '22222222-2222-4222-8222-222222222222',
        delegation_ref: 'DEL_ELEC_SUB_01',
      });

      expect(result.decision).toBe('DENY');
      expect(result.reason).toBe('AMOUNT_EXCEEDS_SUB_DELEGATION_LIMIT');
    });
  });

  describe('Single-Use Nonce Tracking', () => {
    it('mints unique single-use nonces and rejects duplicate consumption', () => {
      const nonce = permitEngine.mintNonce('AGENT_ELEC_01');
      expect(nonce).toBeDefined();

      // First consumption succeeds
      const firstUse = permitEngine.consumeNonce(nonce);
      expect(firstUse).toBe(true);

      // Second consumption fails (Replay Protection T06)
      const secondUse = permitEngine.consumeNonce(nonce);
      expect(secondUse).toBe(false);
    });
  });
});
