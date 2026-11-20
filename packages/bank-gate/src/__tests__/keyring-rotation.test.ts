/**
 * Bank Gate Trusted Keyring & Key Rotation Tests
 *
 * Implements Phase 7.4 & Phase 7.4.1 Hardening:
 *   - Multi-key verification trust store holding active, retired, and revoked public keys
 *   - Grace period verification: in-flight permits signed BEFORE rotation remain valid
 *   - CRITICAL BOUNDARY: Retired keys CANNOT authorize newly minted permits issued after retirement
 *   - Future-dated timestamps and inflated TTL protection
 *   - Immediate emergency revocation barrier across multiple service instances
 *   - RFC 7517 JWKS import for dynamic key discovery
 */

import { generateKeyPairSync, sign as cryptoSign, randomUUID } from 'crypto';
import {
  CanonicalTransaction,
  PermitEnvelope,
  TransactionBoundPermitPayload,
  computeCanonicalTransactionDigest,
  canonicalJson,
  TestClock,
  JwksResponse,
  KeyRevocationEvent,
} from '@agentguard/core-schema';
import { TrustedKeyring } from '../services/trusted-keyring';
import { PermitVerifierService } from '../services/permit-verifier';

describe('Phase 7.4.1: Bank Gate Trusted Keyring & Rotation Hardening', () => {
  let clock: TestClock;
  let keyring: TrustedKeyring;
  let verifier: PermitVerifierService;

  const validTx: CanonicalTransaction = {
    account_ref: 'ACC_ROTA_01',
    action: 'vendor_payout',
    amount_paise: 500000, // ₹5,000
    currency: 'INR',
    invoice_ref: 'INV-ROTA-001',
    payee_id: 'PAYEE_VENDOR_99',
    purpose: 'hardware_procurement',
  };

  function signPermitWithKey(
    privateKey: any,
    keyId: string,
    overrides?: Partial<TransactionBoundPermitPayload>,
  ): PermitEnvelope {
    const now = clock.now();
    const digest = computeCanonicalTransactionDigest(validTx);
    const payload: TransactionBoundPermitPayload = {
      permit_version: '1',
      customer_ref: 'CUST_ACME',
      agent_id: 'AGENT_FINANCE_01',
      delegation_ref: 'DEL_DIRECT',
      mandate_id: 'MAND_001',
      mandate_version: 1,
      account_ref: validTx.account_ref,
      action: validTx.action,
      purpose: validTx.purpose,
      amount_paise: validTx.amount_paise,
      currency: 'INR',
      payee_id: validTx.payee_id,
      invoice_ref: validTx.invoice_ref,
      request_id: randomUUID(),
      permit_id: randomUUID(),
      nonce: randomUUID(),
      payload_hash: digest,
      policy_version: '1.0.0',
      reservation_id: randomUUID(),
      issued_at: now,
      expires_at: now + 90000,
      approval_ref: null,
      ...overrides,
    };

    const canonical = canonicalJson(payload);
    const sig = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');

    return {
      permit: payload,
      signature: sig,
      gateway_key_id: keyId,
      algorithm: 'ed25519',
    };
  }

  beforeEach(() => {
    clock = new TestClock(1700000000000);
    keyring = new TrustedKeyring(undefined, clock);
    verifier = new PermitVerifierService(keyring, clock);
  });

  it('verifies permit successfully under initial active key', () => {
    const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
    const pubPem1 = pub1.export({ type: 'spki', format: 'pem' }) as string;
    const keyId1 = 'gw_key_01';

    keyring.addKey({
      key_id: keyId1,
      public_key_pem: pubPem1,
      status: 'ACTIVE',
      activated_at: clock.now(),
    });

    const envelope = signPermitWithKey(priv1, keyId1);
    const result = verifier.verifyPermit(envelope, validTx);

    expect(result.valid).toBe(true);
    expect(result.permit?.account_ref).toBe('ACC_ROTA_01');
  });

  describe('Retired-Key Security Boundaries (Phase 7.4.1 Audit)', () => {
    it('accepts permit issued immediately before retirement when verified during grace window', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      const pubPem1 = pub1.export({ type: 'spki', format: 'pem' }) as string;
      const keyId1 = 'gw_key_01';

      keyring.addKey({
        key_id: keyId1,
        public_key_pem: pubPem1,
        status: 'ACTIVE',
        activated_at: clock.now(),
        grace_period_ms: 180000,
      });

      // Permit 1 is minted 1 second before retirement
      clock.advance(5000);
      const envelope1 = signPermitWithKey(priv1, keyId1);

      // Rotate to Key 2
      clock.advance(1000); // 1s later retirement happens
      const { publicKey: pub2 } = generateKeyPairSync('ed25519');
      const pubPem2 = pub2.export({ type: 'spki', format: 'pem' }) as string;
      keyring.rotateKey({
        key_id: 'gw_key_02',
        public_key_pem: pubPem2,
        grace_period_ms: 180000,
      });

      // Arrives at Bank Gate 30 seconds into the grace window
      clock.advance(30000);
      const result1 = verifier.verifyPermit(envelope1, validTx);
      expect(result1.valid).toBe(true);
    });

    it('CRITICAL: Strictly REJECTS brand-new permit signed AFTER key retirement even if inside grace window', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      const pubPem1 = pub1.export({ type: 'spki', format: 'pem' }) as string;
      const keyId1 = 'gw_key_01';

      keyring.addKey({
        key_id: keyId1,
        public_key_pem: pubPem1,
        status: 'ACTIVE',
        activated_at: clock.now(),
        grace_period_ms: 180000,
      });

      // Key 1 is rotated and becomes RETIRED
      clock.advance(5000);
      const { publicKey: pub2 } = generateKeyPairSync('ed25519');
      keyring.rotateKey({
        key_id: 'gw_key_02',
        public_key_pem: pub2.export({ type: 'spki', format: 'pem' }) as string,
        grace_period_ms: 180000,
      });

      // Attacker possessing retired Key 1 signs a NEW permit 10s AFTER retirement
      clock.advance(10000);
      const rogueEnvelope = signPermitWithKey(priv1, keyId1, {
        issued_at: clock.now(), // Issued AFTER retirement!
        expires_at: clock.now() + 90000,
      });

      const result = verifier.verifyPermit(rogueEnvelope, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PERMIT_ISSUED_AFTER_KEY_RETIREMENT');
    });

    it('rejects permit issued before retirement if permit TTL has expired', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      const pubPem1 = pub1.export({ type: 'spki', format: 'pem' }) as string;
      const keyId1 = 'gw_key_01';

      keyring.addKey({
        key_id: keyId1,
        public_key_pem: pubPem1,
        status: 'ACTIVE',
        activated_at: clock.now(),
        grace_period_ms: 180000,
      });

      // Mint permit with 90s TTL
      const envelope = signPermitWithKey(priv1, keyId1);

      // Rotate key
      clock.advance(2000);
      const { publicKey: pub2 } = generateKeyPairSync('ed25519');
      keyring.rotateKey({
        key_id: 'gw_key_02',
        public_key_pem: pub2.export({ type: 'spki', format: 'pem' }) as string,
        grace_period_ms: 180000,
      });

      // Advance 95s (permit expires at +90s, even though key grace period is 180s)
      clock.advance(95000);

      const result = verifier.verifyPermit(envelope, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PERMIT_EXPIRED');
    });

    it('rejects in-flight permits once key grace period expires', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      const pubPem1 = pub1.export({ type: 'spki', format: 'pem' }) as string;
      const keyId1 = 'gw_key_01';

      keyring.addKey({
        key_id: keyId1,
        public_key_pem: pubPem1,
        status: 'ACTIVE',
        activated_at: clock.now(),
        grace_period_ms: 60000, // 60s grace
      });

      const envelope1 = signPermitWithKey(priv1, keyId1, {
        issued_at: clock.now(),
        expires_at: clock.now() + 80000,
      });

      // Rotate key
      const { publicKey: pub2 } = generateKeyPairSync('ed25519');
      keyring.rotateKey({
        key_id: 'gw_key_02',
        public_key_pem: pub2.export({ type: 'spki', format: 'pem' }) as string,
        grace_period_ms: 60000,
      });

      // Advance past 60s grace period
      clock.advance(65000);

      const result = verifier.verifyPermit(envelope1, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('RETIRED_KEY_GRACE_EXPIRED');
    });

    it('rejects permits with future-dated issued_at beyond allowable clock skew', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      keyring.addKey({
        key_id: 'gw_key_skew',
        public_key_pem: pub1.export({ type: 'spki', format: 'pem' }) as string,
        status: 'ACTIVE',
      });

      // Future-dated by 15 seconds (exceeds 5s skew tolerance)
      const envelope = signPermitWithKey(priv1, 'gw_key_skew', {
        issued_at: clock.now() + 15000,
        expires_at: clock.now() + 105000,
      });

      const result = verifier.verifyPermit(envelope, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PERMIT_ISSUED_IN_FUTURE');
    });

    it('rejects permits with inflated TTL exceeding maximum allowed (90s + skew)', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      keyring.addKey({
        key_id: 'gw_key_ttl',
        public_key_pem: pub1.export({ type: 'spki', format: 'pem' }) as string,
        status: 'ACTIVE',
      });

      // Attacker creates permit with 500-second TTL
      const envelope = signPermitWithKey(priv1, 'gw_key_ttl', {
        issued_at: clock.now(),
        expires_at: clock.now() + 500000,
      });

      const result = verifier.verifyPermit(envelope, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PERMIT_TTL_EXCEEDS_MAXIMUM');
    });
  });

  describe('Emergency Revocation & Multi-Instance Synchronization', () => {
    it('emergency revocation immediately blocks all verification for compromised key', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      const pubPem1 = pub1.export({ type: 'spki', format: 'pem' }) as string;
      const keyId1 = 'gw_key_compromised';

      keyring.addKey({
        key_id: keyId1,
        public_key_pem: pubPem1,
        status: 'ACTIVE',
      });

      const envelope = signPermitWithKey(priv1, keyId1);

      // Emergency revocation triggered
      const revoked = keyring.revokeKey(keyId1, 'Compromised Gateway host');
      expect(revoked).toBe(true);

      const result = verifier.verifyPermit(envelope, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('REVOKED_SIGNING_KEY_ID');
    });

    it('synchronizes revocations across multiple independent Bank Gate instances', () => {
      const { privateKey: priv1, publicKey: pub1 } = generateKeyPairSync('ed25519');
      const pubPem = pub1.export({ type: 'spki', format: 'pem' }) as string;
      const keyId = 'gw_key_multi_inst';

      // Instance 1 & Instance 2
      const keyring1 = new TrustedKeyring(undefined, clock);
      const keyring2 = new TrustedKeyring(undefined, clock);
      const verifier1 = new PermitVerifierService(keyring1, clock);
      const verifier2 = new PermitVerifierService(keyring2, clock);

      keyring1.addKey({ key_id: keyId, public_key_pem: pubPem, status: 'ACTIVE' });
      keyring2.addKey({ key_id: keyId, public_key_pem: pubPem, status: 'ACTIVE' });

      const envelope = signPermitWithKey(priv1, keyId);
      expect(verifier1.verifyPermit(envelope, validTx).valid).toBe(true);
      expect(verifier2.verifyPermit(envelope, validTx).valid).toBe(true);

      // Gateway publishes revocation list
      const revocationEvent: KeyRevocationEvent = {
        event_id: randomUUID(),
        key_id: keyId,
        purpose: 'PERMIT_SIGNING',
        revoked_at: clock.now(),
        operator: 'ciso_ops',
        reason: 'Compromised credential containment',
      };

      // Both instances ingest authoritative revocation sync
      keyring1.syncRevocations([revocationEvent]);
      keyring2.syncRevocations([revocationEvent]);

      // Both instances immediately reject permits
      expect(verifier1.verifyPermit(envelope, validTx).valid).toBe(false);
      expect(verifier1.verifyPermit(envelope, validTx).reason).toBe('REVOKED_SIGNING_KEY_ID');
      expect(verifier2.verifyPermit(envelope, validTx).valid).toBe(false);
      expect(verifier2.verifyPermit(envelope, validTx).reason).toBe('REVOKED_SIGNING_KEY_ID');
    });
  });

  describe('JWKS & Discovery', () => {
    it('rejects unknown gateway_key_id with UNKNOWN_SIGNING_KEY_ID', () => {
      const { privateKey: unkPriv } = generateKeyPairSync('ed25519');
      const envelope = signPermitWithKey(unkPriv, 'gw_key_untrusted_99');

      const result = verifier.verifyPermit(envelope, validTx);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('UNKNOWN_SIGNING_KEY_ID');
    });

    it('imports public keys from RFC 7517 JWKS payload and verifies permits', () => {
      const { privateKey: jwkPriv, publicKey: jwkPub } = generateKeyPairSync('ed25519');
      const jwk = jwkPub.export({ format: 'jwk' }) as any;

      const jwksPayload: JwksResponse = {
        keys: [
          {
            kty: 'OKP',
            crv: 'Ed25519',
            kid: 'gw_jwks_key_01',
            x: jwk.x,
            use: 'sig',
            key_ops: ['verify'],
            alg: 'EdDSA',
            status: 'ACTIVE',
          },
        ],
        updated_at: clock.now(),
      };

      keyring.importFromJwks(jwksPayload);

      const envelope = signPermitWithKey(jwkPriv, 'gw_jwks_key_01');
      const result = verifier.verifyPermit(envelope, validTx);

      expect(result.valid).toBe(true);
      expect(result.permit?.agent_id).toBe('AGENT_FINANCE_01');
    });
  });
});
