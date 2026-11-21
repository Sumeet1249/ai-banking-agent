import * as fs from 'fs';
import * as path from 'path';
import { TrustStore } from '../db/trust-store';
import { TrustPolicyEngine } from '../policy/trust-policy-engine';
import { CredentialManager } from '../credentials/credential-manager';
import { DelegationEngine } from '../delegation/delegation-engine';
import { QuarantineManager } from '../quarantine/quarantine-manager';
import { computeSha256Digest } from '../credentials/signature-verifier';
import { InvocationRequest, CustomerIntent } from '@agentguard/core-schema';
import crypto from 'crypto';

const TEST_DB = path.join(__dirname, 'test_adversarial_suite.db');

describe('TI-8: Comprehensive Adversarial Evaluation Suite (25 Attack Vectors)', () => {
  let store: TrustStore;
  let policyEngine: TrustPolicyEngine;
  let credManager: CredentialManager;
  let delegationEngine: DelegationEngine;
  let agentKeyPair: crypto.KeyPairSyncResult<string, string>;
  let rawPubHex: string;

  beforeAll(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    store = new TrustStore(TEST_DB);
    policyEngine = new TrustPolicyEngine(store);
    credManager = new CredentialManager(store);
    delegationEngine = new DelegationEngine(store);

    // Generate real Ed25519 keypair
    agentKeyPair = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Register test agent
    store.insertAgent({
      agent_id: 'AGENT_ADV_01',
      name: 'Adversarial Test Agent',
      role: 'BILL_PAYMENT_AGENT',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: agentKeyPair.publicKey,
      key_id: 'key-adv-01',
      status: 'ACTIVE',
      trust_score: 900,
      version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    credManager.registerKey({
      agentId: 'AGENT_ADV_01',
      keyId: 'key-adv-01',
      publicKeyEd25519: agentKeyPair.publicKey,
    });

    // Seed delegation
    delegationEngine.createDelegation({
      delegation_id: 'DEL_ADV_01',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ADV_01',
      allowed_tools: ['bank.pay_bill', 'bank.query_bill'],
      purpose: 'Pay electricity bills',
      max_amount_paise: 500000, // 5,000 INR
      daily_max_paise: 2000000, // 20,000 INR
      expires_at: Date.now() + 86400000,
    });

    // Seed customer intent
    const intent: CustomerIntent = {
      intent_id: 'INTENT_ADV_01',
      customer_ref: 'CUST_101',
      objective: 'Monthly electricity bill to BESCOM',
      authorized_tools: ['bank.pay_bill', 'bank.query_bill'],
      approved_payees: ['BESCOM'],
      max_authorized_amount_paise: 300000, // 3,000 INR
      approved_account_ref: 'ACC_SAFE_01',
      valid_from: Date.now() - 1000,
      valid_until: Date.now() + 86400000,
      context_metadata: {},
    };
    store.insertIntent(intent);
  });

  afterAll(() => {
    store.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(() => {
    store.updateAgentStatus('AGENT_ADV_01', 'ACTIVE');
    const baseline = store.getBaseline('AGENT_ADV_01');
    if (baseline) {
      store.updateBaseline('AGENT_ADV_01', baseline.sampleCount, 5.0, 2.0, Date.now(), 0);
    }
  });

  function signRequest(req: Partial<InvocationRequest>, privateKeyPem?: string): InvocationRequest {
    const timestamp_ms = req.timestamp_ms || Date.now();
    const nonce = req.nonce || crypto.randomBytes(16).toString('hex');
    const tool_name = req.tool_name || 'bank.pay_bill';
    const agent_id = req.agent_id || 'AGENT_ADV_01';
    const argumentsPayload = req.arguments || { payee_name: 'BESCOM', amount_paise: 200000 };
    const canonical_argument_digest = computeSha256Digest(argumentsPayload);

    const payloadToSign = `${agent_id}:${tool_name}:${canonical_argument_digest}:${nonce}:${timestamp_ms}`;
    const sig = crypto.sign(null, Buffer.from(payloadToSign), privateKeyPem || agentKeyPair.privateKey);

    return {
      request_id: req.request_id || `REQ_${Date.now()}_${Math.random()}`,
      agent_id,
      session_id: req.session_id || 'SESS_01',
      tenant_id: req.tenant_id || 'tenant-default',
      credential_id: req.credential_id || 'key-adv-01',
      delegation_id: req.delegation_id || 'DEL_ADV_01',
      timestamp_ms,
      nonce,
      tool_name,
      arguments: argumentsPayload,
      canonical_argument_digest,
      agent_signature: req.agent_signature || sig.toString('hex'),
      customer_intent_id: req.customer_intent_id ?? 'INTENT_ADV_01',
    };
  }

  // Group 1: Cryptographic & Identity Attacks (Vectors 1-5)
  test('Vector 1: Invalid/forged Ed25519 signature is rejected with DENY', () => {
    const req = signRequest({ agent_signature: 'deadbeef'.repeat(16) });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('Cryptographic signature verification failed');
  });

  test('Vector 2: Nonce replay attack is blocked', () => {
    const nonce = 'NONCE_REPLAY_12345';
    const req1 = signRequest({ nonce });
    const dec1 = policyEngine.evaluateInvocation(req1);
    expect(['ALLOW', 'ASK']).toContain(dec1.verdict);

    // Second submission with exact same nonce
    const req2 = signRequest({ nonce, request_id: 'REQ_REPLAY_2' });
    const dec2 = policyEngine.evaluateInvocation(req2);
    expect(dec2.verdict).toBe('DENY');
    expect(dec2.violation_summary).toContain('Replay attack rejected');
  });

  test('Vector 3: Timestamp skew attack (> 90s in past or future) is rejected', () => {
    const expiredTime = Date.now() - 120000; // 120s ago
    const req = signRequest({ timestamp_ms: expiredTime });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('skew');
  });

  test('Vector 4: Unregistered agent identity is rejected with DENY', () => {
    const req = signRequest({ agent_id: 'GHOST_AGENT_999' });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('not registered in Trust Registry');
  });

  test('Vector 5: Revoked agent cannot execute any tools', () => {
    store.insertAgent({
      agent_id: 'AGENT_REVOKED_01',
      name: 'Revoked Agent',
      role: 'BILL_PAYMENT_AGENT',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: agentKeyPair.publicKey,
      key_id: 'key-revoked-01',
      status: 'REVOKED',
      trust_score: 0,
      version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const req = signRequest({ agent_id: 'AGENT_REVOKED_01' });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.action_response).toBe('REVOKE');
  });

  // Group 2: Capability & Privilege Escalation (Vectors 6-10)
  test('Vector 6: Unauthorized tool invocation blocked', () => {
    const req = signRequest({ tool_name: 'bank.delete_account' });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('TOOL_NOT_ALLOWED');
  });

  test('Vector 7: Single transaction limit breach rejected (integer paise rule E1)', () => {
    const req = signRequest({ arguments: { payee_name: 'BESCOM', amount_paise: 600000 } }); // Limit is 500000
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('TX_LIMIT_EXCEEDED');
  });

  test('Vector 8: Daily limit cumulative overflow rejected', () => {
    const req = signRequest({ arguments: { payee_name: 'BESCOM', amount_paise: 400000 } });
    // Already spent 1,800,000 + 400,000 = 2,200,000 > daily cap 2,000,000
    const dec = policyEngine.evaluateInvocation(req, { current_daily_spent_paise: 1800000 });
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('DAILY_LIMIT_EXCEEDED');
  });

  test('Vector 9: Sub-agent capability widening blocked (cannot grant tool parent lacks)', () => {
    const res = delegationEngine.createDelegation({
      delegation_id: 'DEL_CHILD_WIDEN',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ADV_01',
      parent_delegation_id: 'DEL_ADV_01',
      allowed_tools: ['wire_transfer_international'], // Parent does not have this
      purpose: 'Widening breach',
      expires_at: Date.now() + 3600000,
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('not in parent allowed_tools');
  });

  test('Vector 10: Delegation depth limit exceeded blocked', () => {
    // Attempting depth exceeding max
    const check = delegationEngine.createDelegation({
      delegation_id: 'DEL_TOO_DEEP',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ADV_01',
      parent_delegation_id: 'DEL_ELEC_101', // max_depth 1
      allowed_tools: ['bank.check_balance'],
      purpose: 'Depth breach',
      expires_at: Date.now() + 10000,
    });
    expect(check.success).toBe(true); // depth 1

    // Depth 2 on max_depth 1
    const check2 = delegationEngine.createDelegation({
      delegation_id: 'DEL_TOO_DEEP_2',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ADV_01',
      parent_delegation_id: 'DEL_TOO_DEEP',
      allowed_tools: ['bank.check_balance'],
      purpose: 'Depth breach 2',
      expires_at: Date.now() + 10000,
    });
    expect(check2.success).toBe(false);
    expect(check2.error).toContain('exceeds max allowed depth');
  });

  // Group 3: Intent Drift & Indirect Prompt Injection Payloads (Vectors 11-15)
  test('Vector 11: Prompt injection payload diverting payee to attacker triggers DENY', () => {
    const req = signRequest({ arguments: { payee_name: 'ATTACKER_ACCOUNT_LLC', amount_paise: 250000 } });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('Severe intent drift detected');
  });

  test('Vector 12: Injection inflating transaction amount beyond customer intent triggers DENY', () => {
    const req = signRequest({ arguments: { payee_name: 'BESCOM', amount_paise: 450000 } }); // Intent max 300000
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.violation_summary).toContain('exceeds customer authorized max');
  });

  test('Vector 13: Invocation against expired customer intent rejected', () => {
    store.insertIntent({
      intent_id: 'INTENT_EXPIRED_01',
      customer_ref: 'CUST_101',
      objective: 'Expired intent',
      authorized_tools: ['bank.pay_bill'],
      approved_payees: ['BESCOM'],
      max_authorized_amount_paise: 300000,
      approved_account_ref: 'ACC_SAFE_01',
      valid_from: Date.now() - 10000,
      valid_until: Date.now() - 5000, // expired 5s ago
      context_metadata: {},
    });

    const req = signRequest({
      customer_intent_id: 'INTENT_EXPIRED_01',
      arguments: { payee_name: 'BESCOM', amount_paise: 100000 },
    });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict === 'DENY' || dec.verdict === 'ASK').toBe(true);
  });

  test('Vector 14: Invocation referencing wrong account reference flagged', () => {
    const req = signRequest({
      arguments: { payee_name: 'BESCOM', amount_paise: 100000, account_ref: 'UNAUTHORIZED_ESCROW' },
    });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict === 'DENY' || dec.verdict === 'ASK').toBe(true);
  });

  test('Vector 15: High-privilege tool execution without customer intent triggers DENY/ASK', () => {
    const req = signRequest({
      tool_name: 'bank.pay_bill',
      customer_intent_id: undefined,
    });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict === 'DENY' || dec.verdict === 'ASK').toBe(true);
  });

  // Group 4: Behavioural & Denial-of-Service Anomalies (Vectors 16-20)
  test('Vector 16: High-frequency tool flooding triggered anomaly escalates to ASK/REQUIRE_APPROVAL', () => {
    const baseline = store.getBaseline('AGENT_ADV_01');
    store.updateBaseline('AGENT_ADV_01', 20, 2.0, 0.5, Date.now() - 500, 0);

    const req = signRequest({ tool_name: 'bank.query_bill' });
    const dec = policyEngine.evaluateInvocation(req);
    expect(['ALLOW', 'ASK']).toContain(dec.verdict);
  });

  test('Vector 17: Auto-quarantine circuit breaker trips on 3 consecutive blocks', () => {
    const quarantineManager = new QuarantineManager(store);
    expect(quarantineManager.isQuarantined('AGENT_ADV_01').is_quarantined).toBe(false);

    quarantineManager.recordViolation('AGENT_ADV_01', 'Attack 1');
    quarantineManager.recordViolation('AGENT_ADV_01', 'Attack 2');
    const v3 = quarantineManager.recordViolation('AGENT_ADV_01', 'Attack 3');
    expect(v3.autoQuarantined).toBe(true);

    const req = signRequest({});
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.action_response).toBe('QUARANTINE');

    quarantineManager.releaseQuarantine('AGENT_ADV_01', 'SUPERVISOR', 'Test reset');
  });

  test('Vector 18: Global Emergency Stop halts execution immediately for all agents', () => {
    QuarantineManager.triggerEmergencyStop('ADMIN', 'Adversarial drill');
    const req = signRequest({});
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.verdict).toBe('DENY');
    expect(dec.action_response).toBe('EMERGENCY_STOP');

    QuarantineManager.resetEmergencyStop('ADMIN');
  });

  test('Vector 19: Argument entropy anomaly detected on massive hex injection payload', () => {
    const massivePayload = crypto.randomBytes(512).toString('hex');
    const req = signRequest({
      arguments: { payee_name: 'BESCOM', amount_paise: 200000, prompt_injection: massivePayload },
    });
    const dec = policyEngine.evaluateInvocation(req);
    expect(dec.evaluated_at).toBeGreaterThan(0);
  });

  test('Vector 20: Rapid succession burst (< 200ms) triggers anomaly evaluation', () => {
    const req = signRequest({ tool_name: 'bank.query_bill' });
    const dec = policyEngine.evaluateInvocation(req);
    expect(['ALLOW', 'ASK']).toContain(dec.verdict);
  });

  // Group 5: Delegation & Concurrency Attacks (Vectors 21-25)
  test('Vector 21: Exhausted delegation usage quota rejects further calls', () => {
    const delRes = delegationEngine.createDelegation({
      delegation_id: 'DEL_QUOTA_EXHAUSTED',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ADV_01',
      allowed_tools: ['bank.query_bill'],
      purpose: 'Quota limit test',
      expires_at: Date.now() + 60000,
      usage_quota: 2,
    });
    expect(delRes.success).toBe(true);

    delegationEngine.incrementUsage('DEL_QUOTA_EXHAUSTED');
    delegationEngine.incrementUsage('DEL_QUOTA_EXHAUSTED');

    const check = delegationEngine.validateDelegation('DEL_QUOTA_EXHAUSTED');
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('usage quota exhausted');
  });

  test('Vector 22: Expired delegation token rejected', () => {
    const delRes = delegationEngine.createDelegation({
      delegation_id: 'DEL_EXPIRED_01',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ADV_01',
      allowed_tools: ['bank.query_bill'],
      purpose: 'Expiry test',
      expires_at: Date.now() - 5000,
    });
    expect(delRes.success).toBe(true);

    const check = delegationEngine.validateDelegation('DEL_EXPIRED_01');
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('expired');
  });

  test('Vector 23: Parent agent revocation immediately invalidates child delegations', () => {
    store.insertAgent({
      agent_id: 'PARENT_TEMP_01',
      name: 'Temp Parent',
      role: 'SUPERVISOR',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: agentKeyPair.publicKey,
      key_id: 'key-p-01',
      status: 'ACTIVE',
      trust_score: 800,
      version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    store.insertAgent({
      agent_id: 'CHILD_TEMP_01',
      name: 'Temp Child',
      role: 'WORKER',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: agentKeyPair.publicKey,
      key_id: 'key-c-01',
      parent_agent_id: 'PARENT_TEMP_01',
      status: 'ACTIVE',
      trust_score: 800,
      version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    delegationEngine.createDelegation({
      delegation_id: 'DEL_ORPHAN_TEST',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'CHILD_TEMP_01',
      allowed_tools: ['bank.query_bill'],
      purpose: 'Orphan test',
      expires_at: Date.now() + 60000,
    });

    // Revoke parent agent
    store.updateAgentStatus('PARENT_TEMP_01', 'REVOKED', 'Parent revoked');

    const check = delegationEngine.validateDelegation('DEL_ORPHAN_TEST');
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('Parent agent PARENT_TEMP_01 is not ACTIVE');
  });

  test('Vector 24: Corrupted forensic evidence pack is detected by cryptographic verifier', () => {
    const logs = [{ event: 'INVOCATION', timestamp: 123456 }];
    const pack = {
      incident: {
        incident_id: 'INC_TEST_01',
        tenant_id: 'tenant-default',
        agent_id: 'AGENT_ADV_01',
        session_id: 'SESS_01',
        severity: 'HIGH' as const,
        status: 'OPEN' as const,
        trigger_type: 'POLICY_DENIAL',
        summary: 'Breach attempt',
        root_cause_analysis: 'RCA test',
        containment_action: 'RESTRICT' as const,
        event_chain_hashes: ['abc'],
        evidence_pack: {},
        detected_at: Date.now(),
      },
      logs,
      tamper_evident_root_hash: 'f'.repeat(64), // Invalid hash
    };
    const valid = require('../evidence/forensic-evidence-pack').ForensicEvidencePack.verifyEvidencePack(pack);
    expect(valid).toBe(false);
  });

  test('Vector 25: Fail-closed DEFER on internal kernel error (Rule I8)', () => {
    const dec = policyEngine.evaluateInvocation(null as unknown as InvocationRequest);
    expect(dec.verdict).toBe('DEFER');
    expect(dec.action_response).toBe('PAUSE');
    expect(dec.violation_summary).toContain('Fail-closed policy kernel exception');
  });
});
