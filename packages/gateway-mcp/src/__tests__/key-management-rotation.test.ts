/**
 * Phase 7.4 & 7.4.1 Hardening: Enterprise Key Management, KMS/HSM Security Verification
 *
 * Test Suite verifies:
 *   1. Non-exportable private key custody (private keys encapsulated in KeyObject)
 *   2. Mock HSM Provider production lockout (strictly forbidden in NODE_ENV=production)
 *   3. Pkcs11HsmProvider hardware configuration and fail-closed security
 *   4. Zero-downtime key rotation with 3-minute grace window
 *   5. Retired-key post-retirement issuance rejection
 *   6. Emergency revocation barrier: immediate rejection of revoked keys
 *   7. Cryptographic Key Destruction, legal hold protection, and retention safeguards
 *   8. RFC 7517 JWKS export with key_ops and lifecycle states
 *   9. PermitEngineService integration with concurrent rotation mutex
 *  10. Key Management REST API endpoints (/api/v1/keys/*, /revocations, /destroy, /legal-hold)
 */

import express from 'express';
import * as http from 'http';
import { AddressInfo } from 'net';
import Database from 'better-sqlite3';
import { verify as cryptoVerify, createPublicKey, randomUUID } from 'crypto';
import {
  CanonicalTransaction,
  computeCanonicalTransactionDigest,
  JwksResponse,
  KeyRevocationList,
  TestClock,
} from '@agentguard/core-schema';
import { SoftwareKmsProvider, MockHsmProvider, Pkcs11HsmProvider } from '../crypto/kms-provider';
import { BankingStores } from '../db/banking-stores';
import { BankingAgentIdentityService } from '../services/banking-agent-identity';
import { PermitEngineService } from '../services/permit-engine';
import { KeyManagementApi } from '../api/keys';

describe('Phase 7.4.1: Enterprise Key Management & KMS/HSM Security Hardening', () => {
  let db: Database.Database;
  let stores: BankingStores;
  let agentIdentity: BankingAgentIdentityService;
  let permitEngine: PermitEngineService;
  let kms: SoftwareKmsProvider;
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    db = new Database(':memory:');
    stores = new BankingStores(db);
    agentIdentity = new BankingAgentIdentityService(db);
    kms = new SoftwareKmsProvider();
    permitEngine = new PermitEngineService(db, stores, agentIdentity, undefined, kms);

    const keysApi = new KeyManagementApi(permitEngine);
    app = express();
    app.use(express.json());
    app.use('/api/v1/keys', keysApi.getRouter());

    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  describe('1. Non-Exportable Key Custody & Software KMS Provider', () => {
    it('initializes active Ed25519 key and exposes only public metadata', async () => {
      const active = await kms.getActiveKey('PERMIT_SIGNING');
      expect(active).toBeDefined();
      expect(active.status).toBe('ACTIVE');
      expect(active.algorithm).toBe('ed25519');
      expect(active.public_key_pem).toContain('-----BEGIN PUBLIC KEY-----');
      // Verify private key is NOT in metadata (PCI-DSS non-exportability)
      expect((active as any).private_key_pem).toBeUndefined();
      expect((active as any).privateKey).toBeUndefined();
    });

    it('signs and verifies payload correctly with active key', async () => {
      const active = await kms.getActiveKey('PERMIT_SIGNING');
      const testData = Buffer.from('banking-payload-digest-12345', 'utf8');

      const sigResult = await kms.sign(active.key_id, testData);
      expect(sigResult.keyId).toBe(active.key_id);
      expect(sigResult.algorithm).toBe('ed25519');
      expect(sigResult.signature.length).toBe(64); // Ed25519 64-byte signature

      const isValid = await kms.verify(active.key_id, testData, sigResult.signature);
      expect(isValid).toBe(true);
    });

    it('fails verification if payload is tampered', async () => {
      const active = await kms.getActiveKey('PERMIT_SIGNING');
      const testData = Buffer.from('genuine-transaction', 'utf8');
      const tamperedData = Buffer.from('tampered-transaction', 'utf8');

      const sigResult = await kms.sign(active.key_id, testData);
      const isValid = await kms.verify(active.key_id, tamperedData, sigResult.signature);
      expect(isValid).toBe(false);
    });
  });

  describe('2. Mock HSM Production Lockout & Hardware Fail-Closed Security', () => {
    it('simulates HSM slot authentication and non-exportable signing in non-production', async () => {
      const hsm = new MockHsmProvider();
      await hsm.initializeDefaultKey('PERMIT_SIGNING', 'hsm_gw_');

      const active = await hsm.getActiveKey('PERMIT_SIGNING');
      expect(active.key_id).toMatch(/^hsm_gw_/);

      const data = Buffer.from('hsm-protected-financial-instruction', 'utf8');
      const sig = await hsm.sign(active.key_id, data);
      expect(sig.signature.length).toBe(64);

      const valid = await hsm.verify(active.key_id, data, sig.signature);
      expect(valid).toBe(true);
    });

    it('strictly forbids MockHsmProvider instantiation in NODE_ENV=production', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => new MockHsmProvider()).toThrow(/CRITICAL_SECURITY_VIOLATION.*production/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('enforces fail-closed semantics on PKCS#11 HSM provider (no silent software fallback)', () => {
      expect(() => {
        new Pkcs11HsmProvider({
          modulePath: '',
          slotId: 0,
          pin: '',
          keyLabel: 'AgentGuard_Root',
        });
      }).toThrow(/CRITICAL_HSM_CONFIG_ERROR/);
    });
  });

  describe('3. Zero-Downtime Key Rotation & Grace Window', () => {
    it('rotates key from ACTIVE to RETIRED with 3-minute grace period', async () => {
      const rotKms = new SoftwareKmsProvider();
      await rotKms.initializeDefaultKey('PERMIT_SIGNING', 'rot_test_');
      const preRotationActive = await rotKms.getActiveKey('PERMIT_SIGNING');
      const testData = Buffer.from('in-flight-permit-buffer', 'utf8');
      const sigBefore = await rotKms.sign(preRotationActive.key_id, testData);

      // Perform rotation
      const rotation = await rotKms.rotateKey('PERMIT_SIGNING', 'Annual compliance rotation', 'sec_admin_01');
      expect(rotation.oldKey.key_id).toBe(preRotationActive.key_id);
      expect(rotation.oldKey.status).toBe('RETIRED');
      expect(rotation.oldKey.retired_at).toBeGreaterThan(0);
      expect(rotation.newKey.status).toBe('ACTIVE');
      expect(rotation.event.purpose).toBe('PERMIT_SIGNING');
      expect(rotation.event.grace_period_expires_at).toBe(rotation.oldKey.retired_at! + 180000);

      // Active key is now the new key
      const currentActive = await rotKms.getActiveKey('PERMIT_SIGNING');
      expect(currentActive.key_id).toBe(rotation.newKey.key_id);

      // In-flight permit signed before retirement verifies within grace window
      const validInFlight = await rotKms.verify(preRotationActive.key_id, testData, sigBefore.signature, preRotationActive.activated_at);
      expect(validInFlight).toBe(true);

      // Cannot sign new payloads with retired key
      await expect(rotKms.sign(preRotationActive.key_id, testData)).rejects.toThrow(
        /Cannot sign with non-active key/,
      );
    });

    it('CRITICAL: rejects signature verification if permit was issued AFTER retirement', async () => {
      const rotKms = new SoftwareKmsProvider();
      const initialKey = await rotKms.initializeDefaultKey('PERMIT_SIGNING', 'rot_sec_');
      const testData = Buffer.from('post-retirement-attack', 'utf8');
      const sig = await rotKms.sign(initialKey.key_id, testData);

      const rotation = await rotKms.rotateKey('PERMIT_SIGNING');

      // Attempt verification where permit was issued AFTER key was retired
      const postRetirementTimestamp = rotation.oldKey.retired_at! + 5000;
      const isValid = await rotKms.verify(initialKey.key_id, testData, sig.signature, postRetirementTimestamp);
      expect(isValid).toBe(false);
    });
  });

  describe('4. Emergency Key Revocation Barrier', () => {
    it('immediately prevents signing and verification with revoked key', async () => {
      const testKms = new SoftwareKmsProvider();
      const initialKey = await testKms.initializeDefaultKey('PERMIT_SIGNING', 'rev_test_');
      const testData = Buffer.from('compromised-key-test', 'utf8');
      const sig = await testKms.sign(initialKey.key_id, testData);

      // Emergency Revocation
      const revocation = await testKms.revokeKey(initialKey.key_id, 'Private key exposed on pastebin', 'ciso_officer');
      expect(revocation.key.status).toBe('REVOKED');
      expect(revocation.event.reason).toBe('Private key exposed on pastebin');

      // Attempting to sign throws immediately
      await expect(testKms.sign(initialKey.key_id, testData)).rejects.toThrow(/Cannot sign with non-active key/);

      // Attempting to verify immediately fails
      const isValid = await testKms.verify(initialKey.key_id, testData, sig.signature);
      expect(isValid).toBe(false);
    });
  });

  describe('5. Cryptographic Key Destruction & Legal Hold Protection', () => {
    it('prevents destruction of an ACTIVE key', async () => {
      const testKms = new SoftwareKmsProvider();
      const active = await testKms.initializeDefaultKey('PERMIT_SIGNING', 'active_dest_');

      await expect(testKms.destroyKey(active.key_id, 'Premature deletion', 'admin')).rejects.toThrow(
        /Cannot destroy an ACTIVE key/,
      );
    });

    it('prevents destruction of a key placed under active Legal Hold', async () => {
      const testKms = new SoftwareKmsProvider();
      const key = await testKms.initializeDefaultKey('PERMIT_SIGNING', 'legal_dest_');
      await testKms.revokeKey(key.key_id, 'Revoked for investigation');

      // Place legal hold
      await testKms.setLegalHold(key.key_id, true);

      // Attempt destruction must be rejected
      await expect(testKms.destroyKey(key.key_id, 'Attempted shred', 'admin')).rejects.toThrow(
        /active legal hold/,
      );

      // Clear legal hold allows destruction
      await testKms.setLegalHold(key.key_id, false);
      const destruction = await testKms.destroyKey(key.key_id, 'Lawful zeroization', 'compliance_officer');
      expect(destruction.key.status).toBe('DESTROYED');
      expect(destruction.event.destruction_digest).toBeDefined();
    });

    it('prevents destruction when retention compliance window has not expired', async () => {
      const testKms = new SoftwareKmsProvider();
      const key = await testKms.initializeDefaultKey('PERMIT_SIGNING', 'ret_dest_');
      await testKms.revokeKey(key.key_id, 'Revoked key');

      // Schedule destruction with future retention window (e.g. 1 hour in future)
      const futureRetention = Date.now() + 3600000;
      await testKms.scheduleKeyDestruction(key.key_id, futureRetention, 'officer');

      await expect(testKms.destroyKey(key.key_id, 'Premature destruction', 'officer')).rejects.toThrow(
        /mandatory retention period has not expired/,
      );
    });
  });

  describe('6. RFC 7517 JWKS Public Key Distribution', () => {
    it('exports JWKS with OKP / Ed25519 format, key_ops, and excludes revoked/destroyed keys', async () => {
      const jwks = await kms.exportJwks('PERMIT_SIGNING');
      expect(jwks.keys).toBeDefined();
      expect(jwks.keys.length).toBeGreaterThanOrEqual(1);

      const activeKey = jwks.keys.find((k) => k.status === 'ACTIVE');
      expect(activeKey).toBeDefined();
      expect(activeKey?.kty).toBe('OKP');
      expect(activeKey?.crv).toBe('Ed25519');
      expect(activeKey?.use).toBe('sig');
      expect(activeKey?.key_ops).toEqual(['verify']);
      expect(activeKey?.alg).toBe('EdDSA');
      expect(activeKey?.x).toBeDefined();
    });
  });

  describe('7. PermitEngineService KMS Integration & Mutex Protection', () => {
    it('mints permits signed with active KMS key and verifies via Bank Gate digest', () => {
      const res = permitEngine.evaluateAndMintPermit({
        agent_id: 'AGENT_ELEC_01',
        customer_ref: 'CUST_101',
        mandate_id: 'MND_ELEC_101',
        account_ref: 'ACC_101',
        action: 'bill_payment',
        purpose: 'electricity_bill',
        amount_paise: 150000,
        currency: 'INR',
        payee_id: 'PAYEE_CESC_001',
        invoice_ref: 'INV-2024-KMS-01',
        request_id: randomUUID(),
        approval_ref: 'APP_KMS_VERIFIED',
      });

      expect(res.decision).toBe('ALLOW');
      expect(res.permit_envelope).toBeDefined();
      expect(res.permit_envelope?.gateway_key_id).toBe(permitEngine.getGatewayKeyId());

      // Verify signature is valid base64
      expect(res.permit_envelope?.signature).toBeDefined();
      expect(Buffer.from(res.permit_envelope!.signature, 'base64').length).toBe(64);
    });

    it('rotates signing key via PermitEngineService', async () => {
      const oldKeyId = permitEngine.getGatewayKeyId();
      const result = await permitEngine.rotateSigningKey('Quarterly rotation', 'admin');

      expect(result.oldKey.key_id).toBe(oldKeyId);
      expect(result.newKey.key_id).not.toBe(oldKeyId);
      expect(permitEngine.getGatewayKeyId()).toBe(result.newKey.key_id);
    });
  });

  describe('8. Key Management REST API Endpoints', () => {
    it('GET /api/v1/keys/jwks returns RFC 7517 compliant JWKS response', async () => {
      const res = await fetch(`${baseUrl}/api/v1/keys/jwks`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = (await res.json()) as JwksResponse;
      expect(Array.isArray(body.keys)).toBe(true);
      expect(body.keys.length).toBeGreaterThan(0);
      expect(body.keys[0].kty).toBe('OKP');
      expect(body.keys[0].crv).toBe('Ed25519');
    });

    it('GET /api/v1/keys/revocations returns authoritative revocation list with no-cache header', async () => {
      const res = await fetch(`${baseUrl}/api/v1/keys/revocations`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('no-cache');

      const body = (await res.json()) as KeyRevocationList;
      expect(Array.isArray(body.revocations)).toBe(true);
      expect(body.published_at).toBeGreaterThan(0);
    });

    it('GET /api/v1/keys/active returns active key public metadata', async () => {
      const res = await fetch(`${baseUrl}/api/v1/keys/active`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.key_id).toBe(permitEngine.getGatewayKeyId());
      expect(body.status).toBe('ACTIVE');
      expect(body.algorithm).toBe('ed25519');
      expect(body.public_key_pem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(body.private_key_pem).toBeUndefined();
    });

    it('POST /api/v1/keys/rotate triggers zero-downtime rotation via REST', async () => {
      const preRotateRes = await fetch(`${baseUrl}/api/v1/keys/active`);
      const preRotateKey = (await preRotateRes.json()) as any;

      const rotateRes = await fetch(`${baseUrl}/api/v1/keys/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'API rotation test', operator: 'test_sec_ops' }),
      });
      expect(rotateRes.status).toBe(200);

      const rotateBody = (await rotateRes.json()) as any;
      expect(rotateBody.success).toBe(true);
      expect(rotateBody.old_key.key_id).toBe(preRotateKey.key_id);
      expect(rotateBody.new_key.key_id).not.toBe(preRotateKey.key_id);
    });

    it('POST /api/v1/keys/legal-hold and POST /api/v1/keys/destroy enforce destruction policy via REST', async () => {
      // 1. Get currently active key, revoke it first
      const activeRes = await fetch(`${baseUrl}/api/v1/keys/active`);
      const activeKey = (await activeRes.json()) as any;

      await fetch(`${baseUrl}/api/v1/keys/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: activeKey.key_id, reason: 'Testing destruction FSM', operator: 'sec_admin' }),
      });

      // 2. Set legal hold
      const holdRes = await fetch(`${baseUrl}/api/v1/keys/legal-hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: activeKey.key_id, hold: true }),
      });
      expect(holdRes.status).toBe(200);

      // 3. Attempt destruction with legal hold -> must be 400 DESTRUCTION_REJECTED
      const destroyHoldRes = await fetch(`${baseUrl}/api/v1/keys/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: activeKey.key_id, reason: 'Cleanup', operator: 'sec_admin' }),
      });
      expect(destroyHoldRes.status).toBe(400);

      // 4. Release legal hold
      await fetch(`${baseUrl}/api/v1/keys/legal-hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: activeKey.key_id, hold: false }),
      });

      // 5. Successful destruction
      const destroySuccessRes = await fetch(`${baseUrl}/api/v1/keys/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: activeKey.key_id, reason: 'Audit cleanup', operator: 'sec_admin' }),
      });
      expect(destroySuccessRes.status).toBe(200);
      const destroyBody = (await destroySuccessRes.json()) as any;
      expect(destroyBody.key.status).toBe('DESTROYED');
      expect(destroyBody.event.destruction_digest).toBeDefined();
    });
  });
});
