/**
 * BP-3 Test Suite: Multi-Agent Quotas, Merchant Intelligence & Merkle Audit Verification
 *
 * Covers:
 *   - BP-3.1: Multi-Agent Quota Enforcement (Subordinate allocation, shared exhaustion, revocation, blocked categories)
 *   - BP-3.2: Merchant Intelligence (Payment rail MCC, Customer Override, AI advisory limit, Mismatch detection)
 *   - BP-3.5: Merkle Tree Audit Verification (Odd-leaf handling, inclusion proofs, tamper detection, root verification)
 *   - Verification Gates (Idempotency digest mismatch, Reversal idempotency, Biometric approval, Reconciliation)
 */

import Database from 'better-sqlite3';
import { CategoryBudgetStore } from '../db/category-budget-store';
import { CategoryBudgetService } from '../services/category-budget-service';
import { MerchantIntelligenceService } from '../services/merchant-intelligence-service';
import { MerkleAuditService } from '../services/merkle-audit-service';
import { FakeLedgerClient } from '../adapters/ledger-client';

describe('BP-3: Multi-Agent Quotas, Merchant Intelligence & Merkle Audit Verification', () => {
  let db: Database.Database;
  let store: CategoryBudgetStore;
  let ledgerClient: FakeLedgerClient;
  let merchantService: MerchantIntelligenceService;
  let merkleAudit: MerkleAuditService;
  let service: CategoryBudgetService;

  const TENANT_A = 'tenant_enterprise_01';
  const CUSTOMER_1 = 'cust_acme_corp';
  const POOL_SHOPPING = 'pool_shopping_shared';
  const AGENT_PROCURE = 'agent_procurement_bot';
  const AGENT_OFFICE = 'agent_office_supplies_bot';

  beforeEach(() => {
    db = new Database(':memory:');
    store = new CategoryBudgetStore(db);
    ledgerClient = new FakeLedgerClient();
    merchantService = new MerchantIntelligenceService(db);
    merkleAudit = new MerkleAuditService(db, 'http://localhost:5000');
    service = new CategoryBudgetService(store, ledgerClient, merchantService);

    // Setup Parent Shopping Pool: ₹25,000 Monthly (2,500,000 paise), ₹5,000 Per-Tx
    service.createPool({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      category_id: 'SHOPPING',
      category_name: 'Corporate Shopping & Procurement',
      monthly_limit_paise: 2500000, // ₹25,000
      per_transaction_limit_paise: 500000, // ₹5,000
      autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS',
    });
  });

  afterEach(() => {
    db.close();
  });

  // ── BP-3.1: MULTI-AGENT QUOTA ENFORCEMENT ────────────────────────────────

  test('BP-3.1.1: Prevents child agent allocation from exceeding parent customer pool capacity', () => {
    // Attempt to allocate ₹30,000 to an agent when parent pool is only ₹25,000
    expect(() => {
      service.setAgentAllocation({
        pool_id: POOL_SHOPPING,
        agent_id: AGENT_PROCURE,
        tenant_id: TENANT_A,
        customer_ref: CUSTOMER_1,
        agent_limit_paise: 3000000, // ₹30,000 > ₹25,000
        daily_limit_paise: 500000,
        per_transaction_limit_paise: 200000,
        allowed_categories: ['SHOPPING'],
      });
    }).toThrow(/exceeds parent pool monthly capacity/);
  });

  test('BP-3.1.2: Two autonomous agents share parent pool and enforce combined quota exhaustion', async () => {
    // Allocate ₹15,000 to Procurement Agent and ₹10,000 to Office Supplies Agent (Total ₹25,000)
    service.setAgentAllocation({
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_limit_paise: 1500000, // ₹15,000
      daily_limit_paise: 1500000,
      per_transaction_limit_paise: 500000,
      allowed_categories: ['SHOPPING'],
    });

    service.setAgentAllocation({
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_OFFICE,
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_limit_paise: 1000000, // ₹10,000
      daily_limit_paise: 1000000,
      per_transaction_limit_paise: 800000, // ₹8,000
      allowed_categories: ['SHOPPING'],
    });

    // 1. Procurement Agent reserves ₹5,000
    const res1 = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      workflow_id: 'wf_01',
      request_id: 'req_procure_01',
      idempotency_key: 'idem_p_01',
      transaction_digest: '1'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 500000, // ₹5,000
    });
    expect(res1.decision).toBe('ALLOW');

    // 2. Office Supplies Agent reserves ₹5,000
    const res2 = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_OFFICE,
      workflow_id: 'wf_02',
      request_id: 'req_office_01',
      idempotency_key: 'idem_o_01',
      transaction_digest: '2'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 500000, // ₹5,000
    });
    expect(res2.decision).toBe('ALLOW');

    // Settle both reservations
    await service.settlePayment(res1.reservation_id!, res1.transfer_id);
    await service.settlePayment(res2.reservation_id!, res2.transfer_id);

    // Remaining parent capacity is ₹15,000.
    // Procurement Agent spends remaining ₹10,000
    const res3 = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      workflow_id: 'wf_03',
      request_id: 'req_procure_02',
      idempotency_key: 'idem_p_02',
      transaction_digest: '3'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 500000, // ₹5,000
    });
    expect(res3.decision).toBe('ALLOW');
    await service.settlePayment(res3.reservation_id!, res3.transfer_id);

    // Office Agent attempts to spend ₹6,000 but only ₹5,000 remains in its allocation
    const res4 = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_OFFICE,
      workflow_id: 'wf_04',
      request_id: 'req_office_02',
      idempotency_key: 'idem_o_02',
      transaction_digest: '4'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 600000, // ₹6,000 > ₹5,000 remaining
    });
    expect(res4.decision).toBe('DENY');
    expect(res4.reason).toBe('EXCEEDS_AGENT_TOTAL_LIMIT');
  });

  test('BP-3.1.3: Rejects revoked and suspended agents immediately', async () => {
    service.setAgentAllocation({
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_limit_paise: 1000000,
      daily_limit_paise: 500000,
      per_transaction_limit_paise: 500000,
      allowed_categories: ['SHOPPING'],
      status: 'ACTIVE',
    });

    // Suspend agent
    service.setAgentAllocationStatus(TENANT_A, CUSTOMER_1, AGENT_PROCURE, POOL_SHOPPING, 'SUSPENDED');

    const result = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      workflow_id: 'wf_test',
      request_id: 'req_suspended',
      idempotency_key: 'idem_susp',
      transaction_digest: '5'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 100000,
    });

    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('AGENT_SUSPENDED');
  });

  test('BP-3.1.4: Blocks agent payment in explicitly blocked categories', async () => {
    service.setAgentAllocation({
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_limit_paise: 1000000,
      daily_limit_paise: 500000,
      per_transaction_limit_paise: 500000,
      allowed_categories: ['SHOPPING'],
      blocked_categories: ['TRANSPORT'], // Explicitly blocked
    });

    const result = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      workflow_id: 'wf_test',
      request_id: 'req_blocked_cat',
      idempotency_key: 'idem_blk',
      transaction_digest: '6'.repeat(64),
      category_id: 'TRANSPORT',
      amount_paise: 50000,
    });

    expect(result.decision).toBe('DENY');
    expect(result.reason).toBe('CATEGORY_BLOCKED_FOR_AGENT');
  });

  // ── BP-3.2: MERCHANT INTELLIGENCE & EVIDENCE HIERARCHY ───────────────────

  test('BP-3.2.1: Payment-rail MCC establishes authoritative VERIFIED status', () => {
    const evalResult = merchantService.evaluateMerchant({
      merchant_id: 'merch_amzn_in',
      merchant_name: 'Amazon India',
      payment_rail_mcc: '5311', // ISO 18245 Department Store
      claimed_category: 'SHOPPING',
    });

    expect(evalResult.is_valid).toBe(true);
    expect(evalResult.evidence_tier).toBe('AUTHORITATIVE_RAIL');
    expect(evalResult.status).toBe('VERIFIED');
    expect(evalResult.resolved_category).toBe('SHOPPING');
    expect(evalResult.is_mismatch_detected).toBe(false);
  });

  test('BP-3.2.2: Flags category/MCC mismatch and forces ASK approval', async () => {
    // Agent claims FOOD_DINING, but authenticated payment rail reports 5311 (Department Store)
    const result = await service.evaluateAndReserve({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_general',
      workflow_id: 'wf_mismatch',
      request_id: 'req_mismatch_01',
      idempotency_key: 'idem_mismatch_01',
      transaction_digest: '7'.repeat(64),
      category_id: 'SHOPPING',
      amount_paise: 50000,
      merchant_input: {
        merchant_id: 'merch_unknown_01',
        merchant_name: 'SuperStore',
        payment_rail_mcc: '5311',
        claimed_category: 'FOOD_DINING', // Mismatch!
      },
    });

    expect(result.decision).toBe('ASK');
    expect(result.requires_human_approval).toBe(true);
    expect(result.merchant_evaluation?.is_mismatch_detected).toBe(true);
  });

  test('BP-3.2.3: Customer override supersedes default classification with VERIFIED standing', () => {
    // Record customer preference: Custom Hardware Supplier mapped to SHOPPING
    merchantService.setCustomerOverride({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      merchant_id: 'merch_custom_hardware_01',
      merchant_name: 'Local Hardware Depot',
      assigned_category: 'SHOPPING',
      reason: 'Approved vendor for office maintenance',
    });

    const evalResult = merchantService.evaluateMerchant(
      {
        merchant_id: 'merch_custom_hardware_01',
        merchant_name: 'Local Hardware Depot',
      },
      TENANT_A,
      CUSTOMER_1,
    );

    expect(evalResult.is_valid).toBe(true);
    expect(evalResult.evidence_tier).toBe('CUSTOMER_OVERRIDE');
    expect(evalResult.status).toBe('VERIFIED');
    expect(evalResult.resolved_category).toBe('SHOPPING');
  });

  test('BP-3.2.4: AI Advisory inference alone cannot establish VERIFIED status (Rule E2)', () => {
    const evalResult = merchantService.evaluateMerchant({
      merchant_id: 'merch_unseen_09',
      merchant_name: 'Prompt Injection Labs',
      ai_inferred_category: 'SHOPPING',
      ai_confidence: 0.99, // High confidence AI inference
    });

    // Invariant: AI alone is NEVER authoritative
    expect(evalResult.is_valid).toBe(false);
    expect(evalResult.is_ai_advisory_only).toBe(true);
    expect(evalResult.status).toBe('PROVISIONAL');
    expect(evalResult.evidence_tier).toBe('ADVISORY_HEURISTIC');
  });

  // ── BP-3.5: MERKLE TREE AUDIT VERIFICATION ───────────────────────────────

  test('BP-3.5.1: Constructs Merkle batches and handles odd numbers of leaves deterministically', () => {
    // Generate 3 sample leaves
    const leaves3 = [
      merkleAudit.hashLeaf('event_1'),
      merkleAudit.hashLeaf('event_2'),
      merkleAudit.hashLeaf('event_3'),
    ];

    const root3 = merkleAudit.computeRoot(leaves3);
    expect(root3).toBeDefined();
    expect(root3).toMatch(/^[a-f0-9]{64}$/i);

    // Verify inclusion proof for each leaf in the 3-leaf odd batch
    for (let i = 0; i < leaves3.length; i++) {
      const proof = merkleAudit.generateProof(leaves3, i);
      const valid = merkleAudit.verifyProof({
        leafHash: leaves3[i],
        leafIndex: i,
        auditPath: proof,
        expectedRoot: root3,
      });
      expect(valid).toBe(true);
    }
  });

  test('BP-3.5.2: Batches sequential audit events and independently verifies inclusion proof', async () => {
    // Trigger transactions to populate audit trail
    for (let i = 1; i <= 4; i++) {
      await service.evaluateAndReserve({
        tenant_id: TENANT_A,
        customer_ref: CUSTOMER_1,
        pool_id: POOL_SHOPPING,
        agent_id: AGENT_PROCURE,
        workflow_id: `wf_${i}`,
        request_id: `req_audit_${i}`,
        idempotency_key: `idem_audit_${i}`,
        transaction_digest: `${i}`.repeat(64),
        category_id: 'SHOPPING',
        amount_paise: 10000,
      });
    }

    const events = db.prepare('SELECT * FROM budget_audit_events ORDER BY sequence_number ASC').all() as any[];
    expect(events.length).toBeGreaterThanOrEqual(4);

    const firstSeq = events[0].sequence_number;
    const lastSeq = events[3].sequence_number;

    // Create Merkle Batch
    const batch = merkleAudit.createBatch({
      batchId: 'BATCH_2026_TEST_01',
      startSequence: firstSeq,
      endSequence: lastSeq,
    });

    expect(batch.merkle_root).toBeDefined();
    expect(batch.witness_checkpoint_id).toBeDefined();

    // Retrieve proof for event 0
    const targetEvent = events[0];
    const proof = merkleAudit.getEventProof(batch.batch_id, targetEvent.event_id);

    expect(proof.batch_id).toBe(batch.batch_id);
    expect(proof.merkle_root).toBe(batch.merkle_root);
    expect(proof.audit_path.length).toBeGreaterThan(0);

    // Verify via Server-Side Verification API
    const verification = merkleAudit.verifyEventInclusion({
      batch_id: batch.batch_id,
      event_id: targetEvent.event_id,
      leaf_hash: proof.leaf_hash,
      merkle_proof: proof.audit_path,
      merkle_root: batch.merkle_root,
      leaf_index: proof.leaf_index,
    });

    expect(verification.valid).toBe(true);
    expect(verification.event_included).toBe(true);
    expect(verification.root_anchored).toBe(true);
    expect(verification.verification_status).toBe('VERIFIED');
  });

  test('BP-3.5.3: Detects tampered event payload and altered root', async () => {
    const events = db.prepare('SELECT * FROM budget_audit_events ORDER BY sequence_number ASC').all() as any[];
    const firstSeq = events[0].sequence_number;
    const lastSeq = events[events.length - 1].sequence_number;

    const batch = merkleAudit.createBatch({
      batchId: 'BATCH_2026_TAMPER_TEST',
      startSequence: firstSeq,
      endSequence: lastSeq,
    });

    const targetEvent = events[0];
    const proof = merkleAudit.getEventProof(batch.batch_id, targetEvent.event_id);

    // 1. Altered Root
    const fakeRoot = 'f'.repeat(64);
    const rootMismatch = merkleAudit.verifyEventInclusion({
      batch_id: batch.batch_id,
      event_id: targetEvent.event_id,
      leaf_hash: proof.leaf_hash,
      merkle_proof: proof.audit_path,
      merkle_root: fakeRoot,
    });
    expect(rootMismatch.valid).toBe(false);
    expect(rootMismatch.verification_status).toBe('ROOT_MISMATCH');

    // 2. Tampered Payload
    const payloadTamper = merkleAudit.verifyEventInclusion({
      batch_id: batch.batch_id,
      event_id: targetEvent.event_id,
      leaf_hash: 'd'.repeat(64), // Altered leaf hash
      merkle_proof: proof.audit_path,
      merkle_root: batch.merkle_root,
      event_payload: 'TAMPERED_EVENT_DATA',
    });
    expect(payloadTamper.valid).toBe(false);
    expect(payloadTamper.verification_status).toBe('TAMPER_DETECTED');
  });

  // ── VERIFICATION GATES (FROM BP-2 REVIEW) ────────────────────────────────

  test('Gate 3: Idempotency key reuse with different transaction digest returns DENY (Invariant I5)', async () => {
    const req = {
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      pool_id: POOL_SHOPPING,
      agent_id: AGENT_PROCURE,
      workflow_id: 'wf_idem',
      request_id: 'req_idem_01',
      idempotency_key: 'idem_key_fixed_01',
      transaction_digest: 'a'.repeat(64),
      category_id: 'SHOPPING' as const,
      amount_paise: 50000,
    };

    // First call succeeds
    const first = await service.evaluateAndReserve(req);
    expect(first.decision).toBe('ALLOW');

    // Second call with same idempotency key BUT altered transaction digest
    const second = await service.evaluateAndReserve({
      ...req,
      transaction_digest: 'b'.repeat(64), // Mismatch!
    });

    expect(second.decision).toBe('DENY');
    expect(second.reason).toBe('IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD');
  });

  test('Gate 6: Biometric passkey approval verifies transaction digest binding', () => {
    const validApproval = service.verifyBiometricApproval({
      reservationId: 'res_test_123',
      customerRef: CUSTOMER_1,
      transactionDigest: 'a'.repeat(64),
      biometricApprovalToken: 'WEBAUTHN_ASSERTION_SIG_' + 'x'.repeat(40),
    });

    // Mismatched reservation should fail
    expect(validApproval).toBe(false);
  });

  // ── FINAL VERIFICATION: AGENT RESUME/REVOKE, TENANT ISOLATION & DUAL MERKLE ──

  test('BP-3.1.5: Enforces terminal state on REVOKED agents, allows resumption for SUSPENDED agents', () => {
    service.setAgentAllocation({
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_lifecycle_test',
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_limit_paise: 500000,
      daily_limit_paise: 500000,
      per_transaction_limit_paise: 100000,
      allowed_categories: ['SHOPPING'],
    });

    // 1. Suspend agent
    const suspended = service.setAgentAllocationStatus(TENANT_A, CUSTOMER_1, 'agent_lifecycle_test', POOL_SHOPPING, 'SUSPENDED');
    expect(suspended.status).toBe('SUSPENDED');

    // 2. Resume suspended agent to ACTIVE (Allowed)
    const resumed = service.setAgentAllocationStatus(TENANT_A, CUSTOMER_1, 'agent_lifecycle_test', POOL_SHOPPING, 'ACTIVE');
    expect(resumed.status).toBe('ACTIVE');

    // 3. Permanently revoke agent
    const revoked = service.setAgentAllocationStatus(TENANT_A, CUSTOMER_1, 'agent_lifecycle_test', POOL_SHOPPING, 'REVOKED');
    expect(revoked.status).toBe('REVOKED');

    // 4. Attempt to reactivate permanently REVOKED agent (Must Throw)
    expect(() => {
      service.setAgentAllocationStatus(TENANT_A, CUSTOMER_1, 'agent_lifecycle_test', POOL_SHOPPING, 'ACTIVE');
    }).toThrow(/Cannot reactivate permanently REVOKED/);
  });

  test('BP-3.1.6: Safe allocation updates enforce parent pool capacity and utilized limits', () => {
    service.setAgentAllocation({
      pool_id: POOL_SHOPPING,
      agent_id: 'agent_limit_edit_test',
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_limit_paise: 500000,
      daily_limit_paise: 200000,
      per_transaction_limit_paise: 50000,
      allowed_categories: ['SHOPPING'],
    });

    // Valid edit
    const updated = service.updateAgentAllocation({
      tenant_id: TENANT_A,
      customer_ref: CUSTOMER_1,
      agent_id: 'agent_limit_edit_test',
      pool_id: POOL_SHOPPING,
      agent_limit_paise: 800000,
    });
    expect(updated.agent_limit_paise).toBe(800000);

    // Invalid edit exceeding parent monthly cap of ₹25,000 (2,500,000 paise)
    expect(() => {
      service.updateAgentAllocation({
        tenant_id: TENANT_A,
        customer_ref: CUSTOMER_1,
        agent_id: 'agent_limit_edit_test',
        pool_id: POOL_SHOPPING,
        agent_limit_paise: 5000000, // ₹50,000
      });
    }).toThrow(/exceeds parent pool monthly capacity/);
  });

  test('BP-3.2.5: Verifies strict tenant isolation across pools, allocations, and dashboard', () => {
    const TENANT_B = 'tenant_external_hacker';
    const CUSTOMER_B = 'cust_stranger';

    // Tenant B cannot see Tenant A's pools
    const poolsB = service.listPools(TENANT_B, CUSTOMER_B);
    expect(poolsB.length).toBe(0);

    // Tenant B cannot fetch Tenant A's pool
    const poolB = service.getPool(TENANT_B, CUSTOMER_B, POOL_SHOPPING);
    expect(poolB).toBeNull();

    // Tenant B cannot see Tenant A's agent allocations
    const allocsB = service.listAgentAllocations(TENANT_B, CUSTOMER_B, POOL_SHOPPING);
    expect(allocsB.length).toBe(0);

    // Tenant B's dashboard summary shows 0
    const summaryB = service.getDashboardSummary(TENANT_B, CUSTOMER_B);
    expect(summaryB.total_budget_paise).toBe(0);
    expect(summaryB.pools_count).toBe(0);
  });

  test('BP-3.5.5: Differentiates strict RFC 6962 power-of-2 split from AGENTGUARD_MERKLE_V1 self-pairing', () => {
    const leafHashes = [
      '1'.repeat(64),
      '2'.repeat(64),
      '3'.repeat(64), // 3 leaves (odd)
    ];

    // 1. AgentGuard V1 self-pairs the 3rd leaf: Node(1, 2) and Node(3, 3)
    const rootAgentGuardV1 = merkleAudit.computeRoot(leafHashes, 'AGENTGUARD_MERKLE_V1');
    expect(rootAgentGuardV1).toHaveLength(64);

    // 2. RFC 6962 Section 2.1 splits at largest power of 2 (k = 2):
    // Left: MTH(1, 2), Right: MTH(3) (single leaf, no self-pairing)
    const rootRfc6962 = merkleAudit.computeRoot(leafHashes, 'RFC6962_MTH_V1');
    expect(rootRfc6962).toHaveLength(64);

    // Crucial mathematical proof: For an odd leaf count (n = 3), the two root constructions are distinct
    expect(rootAgentGuardV1).not.toBe(rootRfc6962);

    // For a power-of-2 leaf count (n = 2), both algorithms produce the identical root!
    const evenLeaves = ['1'.repeat(64), '2'.repeat(64)];
    const rootEvenV1 = merkleAudit.computeRoot(evenLeaves, 'AGENTGUARD_MERKLE_V1');
    const rootEvenRfc = merkleAudit.computeRoot(evenLeaves, 'RFC6962_MTH_V1');
    expect(rootEvenV1).toBe(rootEvenRfc);
  });

  test('BP-3.6: Verifies real dashboard summary aggregation from SQLite ledger', () => {
    const summary = service.getDashboardSummary(TENANT_A, CUSTOMER_1);
    expect(summary.total_budget_paise).toBe(2500000); // ₹25,000
    expect(summary.pools_count).toBe(1);
    expect(summary.category_breakdown).toHaveLength(1);
    expect(summary.category_breakdown[0].category).toBe('SHOPPING');
    expect(summary.available_budget_paise).toBe(2500000);
  });
});
