import * as fs from 'fs';
import * as path from 'path';
import { TrustStore } from '../db/trust-store';
import { AgentIdentityRegistry } from '../identity/agent-identity-registry';
import { CredentialManager } from '../credentials/credential-manager';
import { DelegationEngine } from '../delegation/delegation-engine';
import { CapabilityChecker } from '../capabilities/capability-checker';
import crypto from 'crypto';

const TEST_DB = path.join(__dirname, 'test_identity_delegation.db');

describe('TI-2 & TI-3: Agent Identity, Credentials & Delegation Engine', () => {
  let store: TrustStore;
  let identityRegistry: AgentIdentityRegistry;
  let credManager: CredentialManager;
  let delegationEngine: DelegationEngine;

  beforeAll(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    store = new TrustStore(TEST_DB);
    identityRegistry = new AgentIdentityRegistry(store);
    credManager = new CredentialManager(store);
    delegationEngine = new DelegationEngine(store);
  });

  afterAll(() => {
    store.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('TI-2.1: Registers agent with valid Ed25519 identity and active state', () => {
    const keyPair = crypto.generateKeyPairSync('ed25519');
    const pubKeyHex = keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

    const agent = identityRegistry.registerAgent({
      agentId: 'AGENT_TEST_01',
      name: 'Test Electric Agent',
      role: 'UTILITY_PAYER',
      publicKeyEd25519: pubKeyHex,
      ownerRef: 'CUST_101',
      tenantId: 'tenant-default',
      trustScore: 850,
    });

    expect(agent.status).toBe('ACTIVE');
    expect(agent.trust_score).toBe(850);
  });

  test('TI-2.2: Updates trust score and handles status transitions', () => {
    const updated = identityRegistry.updateTrustScore('AGENT_TEST_01', -250, 'Unusual activity');
    expect(updated.trust_score).toBe(600);

    const suspended = identityRegistry.updateStatus('AGENT_TEST_01', 'RESTRICTED', 'Security review');
    expect(suspended.status).toBe('RESTRICTED');

    const reactivated = identityRegistry.updateStatus('AGENT_TEST_01', 'ACTIVE', 'Review passed');
    expect(reactivated.status).toBe('ACTIVE');
  });

  test('TI-2.3: Zero-downtime key rotation with grace period', () => {
    const k1 = crypto.generateKeyPairSync('ed25519');
    const k1Pub = k1.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

    const cred1 = credManager.registerKey({
      agentId: 'AGENT_TEST_01',
      keyId: 'key-test-01',
      publicKeyEd25519: k1Pub,
    });
    expect(cred1.key_id).toBe('key-test-01');

    const k2 = crypto.generateKeyPairSync('ed25519');
    const k2Pub = k2.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

    const rotation = credManager.rotateKey({
      agentId: 'AGENT_TEST_01',
      oldKeyId: 'key-test-01',
      newKeyId: 'key-test-02',
      newPublicKeyEd25519: k2Pub,
      gracePeriodMs: 10000,
    });

    expect(rotation.newCredential.key_id).toBe('key-test-02');
    expect(rotation.oldCredential.valid_to).toBeDefined();

    const activeKeys = credManager.getActiveCredentials('AGENT_TEST_01');
    expect(activeKeys.length).toBeGreaterThanOrEqual(2);
    expect(activeKeys.some((k) => k.key_id === 'key-test-02')).toBe(true);
  });

  test('TI-3.1: Enforces capability narrowing on child delegation', () => {
    const childKey = crypto.generateKeyPairSync('ed25519');
    const childPub = childKey.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');

    identityRegistry.registerAgent({
      agentId: 'AGENT_SUB_01',
      name: 'Sub-agent Assistant',
      role: 'BILL_AUDITOR',
      publicKeyEd25519: childPub,
      ownerRef: 'CUST_101',
      tenantId: 'tenant-default',
      parentAgentId: 'AGENT_TEST_01',
    });

    // Valid delegation within parent limits
    const delRes = delegationEngine.createDelegation({
      delegation_id: 'DEL_001',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_SUB_01',
      allowed_tools: ['bank.query_bill'],
      purpose: 'Auditing utility invoices',
      max_amount_paise: 100000,
      daily_max_paise: 200000,
      expires_at: Date.now() + 3600000,
      usage_quota: 50,
    });

    expect(delRes.success).toBe(true);
    expect(delRes.delegation?.delegation_depth).toBe(0);

    // Invalid: Attempting to delegate broader financial cap than parent (per_tx > 100000)
    const invalidDel = delegationEngine.createDelegation({
      delegation_id: 'DEL_INVALID',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_SUB_01',
      parent_delegation_id: 'DEL_001',
      allowed_tools: ['bank.query_bill'],
      purpose: 'Invalid escalation',
      max_amount_paise: 9999999, // Exceeds parent's 100000
      daily_max_paise: 200000,
      expires_at: delRes.delegation!.expires_at,
    });

    expect(invalidDel.success).toBe(false);
    expect(invalidDel.error).toContain('exceeds parent limit');
  });

  test('TI-3.2: Cascades revocation from parent delegation to sub-delegations', () => {
    const delRes = delegationEngine.validateDelegation('DEL_001');
    expect(delRes.valid).toBe(true);

    const revoked = delegationEngine.revokeDelegation('DEL_001', 'OPERATOR_SEC');
    expect(revoked.revokedCount).toBeGreaterThanOrEqual(1);

    const postCheck = delegationEngine.validateDelegation('DEL_001');
    expect(postCheck.valid).toBe(false);
    expect(postCheck.reason).toContain('REVOKED');
  });

  test('TI-3.3: CapabilityChecker blocks unauthorized tools and money overflows', () => {
    const agent = identityRegistry.getAgent('AGENT_TEST_01')!;
    const delegation = store.getDelegation('DEL_ELEC_101'); // seeded fixture

    // 1. Tool not allowed in delegation
    const toolCheck = CapabilityChecker.check({
      agent,
      delegation,
      tool_name: 'unauthorized_transfer',
      action_type: 'EXECUTE',
    });
    expect(toolCheck.allowed).toBe(false);
    expect(toolCheck.code).toBe('TOOL_NOT_ALLOWED');

    // 2. Tx limit exceeded (DEL_ELEC_101 limit is 500,000 paise = Rs 5,000)
    const limitCheck = CapabilityChecker.check({
      agent,
      delegation,
      tool_name: 'bank.pay_bill',
      action_type: 'bill_payment',
      amount_paise: 600000,
    });
    expect(limitCheck.allowed).toBe(false);
    expect(limitCheck.code).toBe('TX_LIMIT_EXCEEDED');

    // 3. Allowed valid check
    const validCheck = CapabilityChecker.check({
      agent,
      delegation,
      tool_name: 'bank.pay_bill',
      action_type: 'bill_payment',
      amount_paise: 400000,
      current_daily_spent_paise: 100000,
    });
    expect(validCheck.allowed).toBe(true);
  });
});
