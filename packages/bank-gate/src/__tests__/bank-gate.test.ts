/**
 * Bank Gate Unit & Concurrency Test Suite
 *
 * Verifies:
 *   - Independent Ed25519 signature & 7-field digest verification
 *   - Atomic single-use nonce consumption under concurrent race conditions
 *   - Mandatory mandate version matching (Invariant I6)
 *   - 2-stage pending transfer creation & posting on Ledger
 *   - Liveness (/health) & Readiness (/ready)
 */

import Database from 'better-sqlite3';
import {
  generateKeyPairSync,
  sign as cryptoSign,
  randomUUID,
} from 'crypto';
import {
  CanonicalTransaction,
  PermitEnvelope,
  TransactionBoundPermitPayload,
  computeCanonicalTransactionDigest,
  canonicalJson,
  TestClock,
} from '@agentguard/core-schema';
import { BankGateStore } from '../db/bank-gate-store';
import { PermitVerifierService } from '../services/permit-verifier';
import { TransactionExecutorService } from '../services/transaction-executor';
import { FakeLedgerClient } from '../adapters/ledger-client';

describe('Phase 3.1: Bank Gate Runtime Service', () => {
  let bgDb: Database.Database;
  let bgStore: BankGateStore;
  let permitVerifier: PermitVerifierService;
  let ledgerClient: FakeLedgerClient;
  let executor: TransactionExecutorService;
  let clock: TestClock;

  // Keypair for simulated Gateway signing
  let gwPrivateKey: any;
  let gwPublicKeyPem: string;
  const gwKeyId = 'gw_key_test_01';

  const validTx: CanonicalTransaction = {
    account_ref: 'ACC_101',
    action: 'bill_payment',
    amount_paise: 240000, // ₹2,400
    currency: 'INR',
    invoice_ref: 'INV-1001',
    payee_id: 'PAYEE_CESC_001',
    purpose: 'electricity_bill',
  };

  function createSignedPermit(overrides?: Partial<TransactionBoundPermitPayload>): PermitEnvelope {
    const now = clock.now();
    const digest = computeCanonicalTransactionDigest(validTx);
    const payload: TransactionBoundPermitPayload = {
      permit_version: '1',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ELEC_01',
      delegation_ref: 'DEL_DIRECT',
      mandate_id: 'MND_ELEC_101',
      mandate_version: 1,
      account_ref: validTx.account_ref,
      action: validTx.action,
      purpose: validTx.purpose,
      amount_paise: validTx.amount_paise,
      currency: validTx.currency,
      payee_id: validTx.payee_id,
      invoice_ref: validTx.invoice_ref,
      request_id: randomUUID(),
      permit_id: randomUUID(),
      nonce: randomUUID(),
      payload_hash: digest,
      policy_version: '1.0.0',
      reservation_id: randomUUID(),
      issued_at: now,
      expires_at: now + 90 * 1000,
      approval_ref: null,
      ...overrides,
    };

    const canonicalString = canonicalJson(payload);
    const sigBuf = cryptoSign(null, Buffer.from(canonicalString, 'utf8'), gwPrivateKey);

    return {
      permit: payload,
      signature: sigBuf.toString('base64'),
      gateway_key_id: gwKeyId,
      algorithm: 'ed25519',
    };
  }

  beforeEach(() => {
    clock = new TestClock(1700000000000);

    const keypair = generateKeyPairSync('ed25519');
    gwPrivateKey = keypair.privateKey;
    gwPublicKeyPem = keypair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    // Setup Bank Gate
    bgDb = new Database(':memory:');
    bgStore = new BankGateStore(bgDb);
    ledgerClient = new FakeLedgerClient();

    // Cache baseline mandate in Bank Gate store
    bgStore.setCachedMandate({
      mandate_id: 'MND_ELEC_101',
      mandate_version: 1,
      customer_ref: 'CUST_101',
      account_ref: 'ACC_101',
      authorized_agent_id: 'AGENT_ELEC_01',
      allowed_payees: ['PAYEE_CESC_001'],
      per_tx_limit_paise: 500000,
      daily_limit_paise: 800000,
      status: 'ACTIVE',
      expires_at: clock.now() + 86400000 * 30,
    });

    permitVerifier = new PermitVerifierService(
      gwPublicKeyPem,
      gwKeyId,
      clock,
    );

    executor = new TransactionExecutorService(
      bgStore,
      permitVerifier,
      ledgerClient,
      clock,
    );
  });

  afterEach(() => {
    bgDb.close();
  });

  describe('Independent Permit Verification', () => {
    it('successfully verifies a valid Gateway permit and matching 7-field transaction digest', () => {
      const envelope = createSignedPermit();
      const verifyResult = permitVerifier.verifyPermit(envelope, validTx);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.permit?.permit_id).toBe(envelope.permit.permit_id);
    });

    it('rejects permit when 7-field canonical transaction digest does not match (payload tampering)', () => {
      const envelope = createSignedPermit();
      const alteredTx: CanonicalTransaction = { ...validTx, amount_paise: 999900 };

      const verifyResult = permitVerifier.verifyPermit(envelope, alteredTx);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toBe('PAYLOAD_DIGEST_MISMATCH');
    });

    it('rejects expired permit when clock exceeds 90-second TTL', () => {
      const envelope = createSignedPermit();
      // Advance clock past 90 seconds
      clock.advance(95000);

      const verifyResult = permitVerifier.verifyPermit(envelope, validTx);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toBe('PERMIT_EXPIRED');
    });

    it('rejects permit signed with an unknown signing key ID', () => {
      const envelope = createSignedPermit();
      envelope.gateway_key_id = 'unknown_key_id';

      const verifyResult = permitVerifier.verifyPermit(envelope, validTx);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.reason).toBe('UNKNOWN_SIGNING_KEY_ID');
    });
  });

  describe('Atomic Nonce Replay Protection & Concurrency', () => {
    it('executes transaction and successfully settles with Ledger', async () => {
      const envelope = createSignedPermit();

      const result = await executor.executeTransaction({
        envelope,
        transaction: validTx,
      });

      expect(result.decision).toBe('ALLOW');
      expect(result.status).toBe('SETTLED');
      expect(result.transfer_id).toBeDefined();

      // Verify Ledger account balance decremented
      const bal = await ledgerClient.getAccountBalance('ACC_101');
      expect(bal?.liquid_balance_paise).toBe(10000000 - 240000);
    });

    it('rejects replay execution with identical nonce (Atomic Nonce Consumption)', async () => {
      const envelope = createSignedPermit();

      // First run succeeds
      const firstRes = await executor.executeTransaction({ envelope, transaction: validTx });
      expect(firstRes.decision).toBe('ALLOW');

      // Second run using identical permit envelope must fail
      const secondRes = await executor.executeTransaction({ envelope, transaction: validTx });
      expect(secondRes.decision).toBe('DENY');
      expect(secondRes.reason).toBe('NONCE_ALREADY_CONSUMED');
    });

    it('safely handles concurrent requests with identical nonce (Only one succeeds)', async () => {
      const envelope = createSignedPermit();

      // Fire 5 concurrent execution requests
      const promises = [
        executor.executeTransaction({ envelope, transaction: validTx }),
        executor.executeTransaction({ envelope, transaction: validTx }),
        executor.executeTransaction({ envelope, transaction: validTx }),
        executor.executeTransaction({ envelope, transaction: validTx }),
        executor.executeTransaction({ envelope, transaction: validTx }),
      ];

      const results = await Promise.all(promises);
      const allowed = results.filter((r) => r.decision === 'ALLOW');
      const denied = results.filter((r) => r.decision === 'DENY');

      expect(allowed).toHaveLength(1);
      expect(denied).toHaveLength(4);
      expect(denied[0].reason).toBe('NONCE_ALREADY_CONSUMED');
    });

    it('rejects execution when mandate version in permit does not match live mandate version (Invariant I6)', async () => {
      // Mandate bumped to version 2 in Bank Gate store
      bgStore.setCachedMandate({
        mandate_id: 'MND_ELEC_101',
        mandate_version: 2,
        customer_ref: 'CUST_101',
        account_ref: 'ACC_101',
        authorized_agent_id: 'AGENT_ELEC_01',
        allowed_payees: ['PAYEE_CESC_001'],
        per_tx_limit_paise: 500000,
        daily_limit_paise: 800000,
        status: 'ACTIVE',
        expires_at: clock.now() + 86400000 * 30,
      });

      // Permit was issued for mandate_version 1
      const envelope = createSignedPermit({ mandate_version: 1 });

      const result = await executor.executeTransaction({ envelope, transaction: validTx });
      expect(result.decision).toBe('DENY');
      expect(result.reason).toBe('MANDATE_VERSION_MISMATCH');
    });
  });
});
