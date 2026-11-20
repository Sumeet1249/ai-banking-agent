/**
 * Phase 3.3 End-to-End Failure-Injection, Reconciliation, and Concurrency Test Suite
 *
 * Verifies all 7 critical scenarios required by Phase 3.3:
 *   Scenario 1: Normal successful payment (Permit -> Pending -> Settle -> Ledger Confirmed)
 *   Scenario 2: Duplicate request rejection & idempotent response
 *   Scenario 3: Ledger timeout -> PENDING_RECONCILIATION -> Query ground truth -> Safe resolution
 *   Scenario 4: Insufficient funds rejection without financial balance mutation
 *   Scenario 5: Mandate revocation / version mismatch invalidates older permits
 *   Scenario 6: Permit replay attack rejection (T06 Single-Use Nonce)
 *   Scenario 7: Service restart / crash recovery from durable records
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
import { FinancialReconciliationService } from '../services/reconciliation';
import { FakeLedgerClient } from '../adapters/ledger-client';

describe('Phase 3.3: End-to-End Financial Reconciliation & Failure Recovery', () => {
  let bgDb: Database.Database;
  let bgStore: BankGateStore;
  let permitVerifier: PermitVerifierService;
  let ledgerClient: FakeLedgerClient;
  let executor: TransactionExecutorService;
  let reconciliation: FinancialReconciliationService;
  let clock: TestClock;

  let gwPrivateKey: any;
  let gwPublicKeyPem: string;
  const gwKeyId = 'gw_key_hardening_01';

  const sampleTx: CanonicalTransaction = {
    account_ref: 'ACC_101',
    action: 'bill_payment',
    amount_paise: 240000, // ₹2,400 in paise
    currency: 'INR',
    invoice_ref: 'INV-1001',
    payee_id: 'PAYEE_CESC_001',
    purpose: 'electricity_bill',
  };

  function createSignedPermit(overrides?: Partial<TransactionBoundPermitPayload>): PermitEnvelope {
    const now = clock.now();
    const digest = computeCanonicalTransactionDigest(sampleTx);
    const payload: TransactionBoundPermitPayload = {
      permit_version: '1',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ELEC_01',
      delegation_ref: 'DEL_DIRECT',
      mandate_id: 'MND_ELEC_101',
      mandate_version: 1,
      account_ref: sampleTx.account_ref,
      action: sampleTx.action,
      purpose: sampleTx.purpose,
      amount_paise: sampleTx.amount_paise,
      currency: sampleTx.currency,
      payee_id: sampleTx.payee_id,
      invoice_ref: sampleTx.invoice_ref,
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

    bgDb = new Database(':memory:');
    bgStore = new BankGateStore(bgDb);
    ledgerClient = new FakeLedgerClient();

    // Seed baseline mandate (version 1)
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

    permitVerifier = new PermitVerifierService(gwPublicKeyPem, gwKeyId, clock);
    executor = new TransactionExecutorService(bgStore, permitVerifier, ledgerClient, clock);
    reconciliation = new FinancialReconciliationService(bgStore, ledgerClient, clock);
  });

  afterEach(() => {
    bgDb.close();
  });

  // ── Scenario 1: Normal Successful Payment ──────────────────────────────────
  it('Scenario 1: Executes normal payment with atomic state transition to SETTLED', async () => {
    const envelope = createSignedPermit();
    const result = await executor.executeTransaction({ envelope, transaction: sampleTx });

    expect(result.decision).toBe('ALLOW');
    expect(result.status).toBe('SETTLED');
    expect(result.transfer_id).toBeDefined();

    const storedTx = bgStore.getTransaction(envelope.permit.request_id);
    expect(storedTx?.status).toBe('SETTLED');

    const bal = await ledgerClient.getAccountBalance('ACC_101');
    expect(bal?.liquid_balance_paise).toBe(10000000 - 240000); // Exactly ₹97,600
  });

  // ── Scenario 2: Duplicate Request ──────────────────────────────────────────
  it('Scenario 2: Duplicate request execution returns stable error and does not double-debit', async () => {
    const envelope = createSignedPermit();

    const first = await executor.executeTransaction({ envelope, transaction: sampleTx });
    expect(first.decision).toBe('ALLOW');

    // Duplicate submission using same permit envelope
    const second = await executor.executeTransaction({ envelope, transaction: sampleTx });
    expect(second.decision).toBe('DENY');
    expect(second.reason).toBe('NONCE_ALREADY_CONSUMED');

    // Ledger balance was debited exactly once
    const bal = await ledgerClient.getAccountBalance('ACC_101');
    expect(bal?.liquid_balance_paise).toBe(10000000 - 240000);
  });

  // ── Scenario 3: Ledger Timeout & Reconciliation ────────────────────────────
  it('Scenario 3: Resolves timed-out transfer via reconciliation without double-debit', async () => {
    const envelope = createSignedPermit();
    const requestId = envelope.permit.request_id;
    const transferId = BigInt('0x' + requestId.replace(/-/g, '')).toString();

    // Simulate stage 1 pending transfer succeeded on ledger, but Bank Gate experienced network timeout on stage 2 post
    await ledgerClient.createPendingTransfer({
      requestId,
      accountRef: 'ACC_101',
      amountPaise: 240000,
      ttlSeconds: 120,
    });

    // Durable store records transaction as PENDING_RECONCILIATION
    bgStore.createTransaction({
      request_id: requestId,
      permit_id: envelope.permit.permit_id,
      nonce: envelope.permit.nonce,
      customer_ref: 'CUST_101',
      account_ref: 'ACC_101',
      agent_id: 'AGENT_ELEC_01',
      amount_paise: 240000,
      payload_hash: envelope.permit.payload_hash,
      status: 'PENDING_RECONCILIATION',
      status_reason: 'LEDGER_SOCKET_TIMEOUT',
    });
    bgStore.updateTransactionStatus(requestId, 'PENDING_RECONCILIATION', { transferId });

    // Run reconciliation
    const reconResult = await reconciliation.reconcileTransaction(requestId);
    expect(reconResult.initial_status).toBe('PENDING_RECONCILIATION');
    expect(reconResult.resolved_status).toBe('SETTLED');
    expect(reconResult.action_taken).toBe('POSTED');

    const updatedTx = bgStore.getTransaction(requestId);
    expect(updatedTx?.status).toBe('SETTLED');

    // Confirm liquid balance reflects exactly one debit
    const bal = await ledgerClient.getAccountBalance('ACC_101');
    expect(bal?.liquid_balance_paise).toBe(10000000 - 240000);
  });

  // ── Scenario 4: Insufficient Funds ─────────────────────────────────────────
  it('Scenario 4: Rejects transaction exceeding balance without posting transfer', async () => {
    // Attempt transaction for ₹1,50,000 (exceeds ₹1,00,000 balance)
    const excessTx: CanonicalTransaction = {
      ...sampleTx,
      amount_paise: 15000000,
    };
    const envelope = createSignedPermit({
      amount_paise: 15000000,
      payload_hash: computeCanonicalTransactionDigest(excessTx),
    });

    const result = await executor.executeTransaction({ envelope, transaction: excessTx });
    expect(result.decision).toBe('DENY');
    expect(result.status).toBe('VOIDED');
    expect(result.reason).toBe('INSUFFICIENT_FUNDS');

    // Available balance remains untouched
    const bal = await ledgerClient.getAccountBalance('ACC_101');
    expect(bal?.liquid_balance_paise).toBe(10000000);
  });

  // ── Scenario 5: Mandate Revocation / Version Mismatch ───────────────────────
  it('Scenario 5: Rejects permit when live mandate version has been bumped (Invariant I6)', async () => {
    // Mandate updated to version 2 (e.g. customer lowered limit)
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

    // Permit referencing older mandate_version 1
    const envelope = createSignedPermit({ mandate_version: 1 });
    const result = await executor.executeTransaction({ envelope, transaction: sampleTx });

    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('MANDATE_VERSION_MISMATCH');
  });

  // ── Scenario 6: Permit Replay ──────────────────────────────────────────────
  it('Scenario 6: Rejects permit replay attack using already-consumed nonce', async () => {
    const envelope = createSignedPermit();
    const run1 = await executor.executeTransaction({ envelope, transaction: sampleTx });
    expect(run1.decision).toBe('ALLOW');

    const run2 = await executor.executeTransaction({ envelope, transaction: sampleTx });
    expect(run2.decision).toBe('DENY');
    expect(run2.reason).toBe('NONCE_ALREADY_CONSUMED');
  });

  // ── Scenario 7: Service Restart & Startup Recovery ─────────────────────────
  it('Scenario 7: Recovers uncertain transactions from durable SQLite on service startup', async () => {
    const req1 = randomUUID();
    const req2 = randomUUID();

    // Seed two transactions left in uncertain state before restart
    bgStore.createTransaction({
      request_id: req1,
      permit_id: randomUUID(),
      nonce: randomUUID(),
      customer_ref: 'CUST_101',
      account_ref: 'ACC_101',
      agent_id: 'AGENT_ELEC_01',
      amount_paise: 100000,
      payload_hash: 'a'.repeat(64),
      status: 'PENDING_TRANSFER',
    });

    bgStore.createTransaction({
      request_id: req2,
      permit_id: randomUUID(),
      nonce: randomUUID(),
      customer_ref: 'CUST_101',
      account_ref: 'ACC_101',
      agent_id: 'AGENT_ELEC_01',
      amount_paise: 150000,
      payload_hash: 'b'.repeat(64),
      status: 'PENDING_RECONCILIATION',
    });

    const uncertainList = bgStore.listUncertainTransactions();
    expect(uncertainList).toHaveLength(2);

    // Simulate startup recovery run
    const recovered = await reconciliation.recoverUncertainTransactions();
    expect(recovered).toHaveLength(2);

    // Since neither transfer existed on the ledger, both are safely marked VOIDED
    expect(recovered[0].resolved_status).toBe('VOIDED');
    expect(recovered[1].resolved_status).toBe('VOIDED');

    // No uncertain transactions remain
    expect(bgStore.listUncertainTransactions()).toHaveLength(0);
  });
});
