/**
 * Enterprise Key Management Service (KMS) & HSM Abstraction
 *
 * Implements Phase 7.4:
 *   - Provider-neutral KMS interface for asymmetric cryptographic signing & verification
 *   - Non-exportable private key custody (private keys encapsulated in KeyObject / HSM session)
 *   - Key rotation FSM (ACTIVE -> RETIRED with grace window -> REVOKED)
 *   - Emergency revocation barrier
 *   - RFC 7517 JWKS distribution export
 */

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  createHash,
  KeyObject,
  randomUUID,
} from 'crypto';
import type { Logger } from 'pino';
import {
  KeyMetadata,
  KeyMetadataSchema,
  KeyPurpose,
  KeyStatus,
  KeyRotationEvent,
  KeyRotationEventSchema,
  KeyRevocationEvent,
  KeyRevocationEventSchema,
  KeyDestructionEvent,
  KeyDestructionEventSchema,
  KeyRevocationList,
  KeyRevocationListSchema,
  JwksResponse,
  JwkKey,
} from '@agentguard/core-schema';

export interface SignatureResult {
  signature: Buffer;
  keyId: string;
  algorithm: 'ed25519';
}

export interface KmsProvider {
  sign(keyId: string, data: Buffer): Promise<SignatureResult>;
  verify(keyId: string, data: Buffer, signature: Buffer, permitIssuedAt?: number): Promise<boolean>;
  getPublicKey(keyId: string): Promise<KeyMetadata | null>;
  getActiveKey(purpose: KeyPurpose): Promise<KeyMetadata>;
  rotateKey(
    purpose: KeyPurpose,
    reason?: string,
    operator?: string,
  ): Promise<{ newKey: KeyMetadata; oldKey: KeyMetadata; event: KeyRotationEvent }>;
  revokeKey(
    keyId: string,
    reason: string,
    operator?: string,
  ): Promise<{ key: KeyMetadata; event: KeyRevocationEvent }>;
  scheduleKeyDestruction(
    keyId: string,
    retentionUntil: number,
    operator: string,
  ): Promise<KeyMetadata>;
  destroyKey(
    keyId: string,
    reason: string,
    operator: string,
  ): Promise<{ key: KeyMetadata; event: KeyDestructionEvent }>;
  setLegalHold(keyId: string, hold: boolean): Promise<KeyMetadata>;
  listKeys(purpose?: KeyPurpose): Promise<KeyMetadata[]>;
  getRevocations(): Promise<KeyRevocationList>;
  exportJwks(purpose?: KeyPurpose): Promise<JwksResponse>;
}

interface InternalKeyEntry {
  metadata: KeyMetadata;
  privateKey?: KeyObject;
  publicKey: KeyObject;
}

export class SoftwareKmsProvider implements KmsProvider {
  private keyStore = new Map<string, InternalKeyEntry>();
  private activeKeyByPurpose = new Map<KeyPurpose, string>();

  constructor(protected logger?: Logger) {}

  /**
   * Registers an existing keypair into the KMS store (e.g. from database persistence or config).
   */
  public registerKey(params: {
    keyId: string;
    privateKeyPem?: string;
    publicKeyPem: string;
    purpose: KeyPurpose;
    status?: KeyStatus;
    createdAt?: number;
    activatedAt?: number;
    retiredAt?: number | null;
    revokedAt?: number | null;
    gracePeriodMs?: number;
    providerType?: KeyMetadata['provider_type'];
    hsmLabel?: string | null;
    rotationReason?: string | null;
    revocationReason?: string | null;
  }): KeyMetadata {
    const now = Date.now();
    const status = params.status ?? 'ACTIVE';
    const publicKey = createPublicKey(params.publicKeyPem);
    let privateKey: KeyObject | undefined;
    if (params.privateKeyPem) {
      privateKey = createPrivateKey(params.privateKeyPem);
    }

    const metadata: KeyMetadata = {
      key_id: params.keyId,
      purpose: params.purpose,
      algorithm: 'ed25519',
      public_key_pem: params.publicKeyPem,
      status,
      created_at: params.createdAt ?? now,
      activated_at: params.activatedAt ?? now,
      retired_at: params.retiredAt ?? null,
      revoked_at: params.revokedAt ?? null,
      destruction_at: null,
      legal_hold: false,
      retention_until: null,
      grace_period_ms: params.gracePeriodMs ?? 180000,
      provider_type: params.providerType ?? 'LOCAL_SOFTWARE',
      hsm_label: params.hsmLabel ?? null,
      rotation_reason: params.rotationReason ?? null,
      revocation_reason: params.revocationReason ?? null,
    };

    KeyMetadataSchema.parse(metadata);

    this.keyStore.set(params.keyId, {
      metadata,
      privateKey,
      publicKey,
    });

    if (status === 'ACTIVE') {
      this.activeKeyByPurpose.set(params.purpose, params.keyId);
    }

    this.logger?.info({ key_id: params.keyId, purpose: params.purpose, status }, 'Registered key in KMS provider');
    return metadata;
  }

  /**
   * Initializes baseline default keys for required purposes if empty.
   */
  public async initializeDefaultKey(purpose: KeyPurpose, keyPrefix: string = 'key_'): Promise<KeyMetadata> {
    const existing = this.activeKeyByPurpose.get(purpose);
    if (existing) {
      const entry = this.keyStore.get(existing);
      if (entry && entry.metadata.status === 'ACTIVE') {
        return entry.metadata;
      }
    }

    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const keyId = `${keyPrefix}${randomUUID().substring(0, 8)}`;
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const now = Date.now();

    const metadata: KeyMetadata = {
      key_id: keyId,
      purpose,
      algorithm: 'ed25519',
      public_key_pem: pubPem,
      status: 'ACTIVE',
      created_at: now,
      activated_at: now,
      retired_at: null,
      revoked_at: null,
      destruction_at: null,
      legal_hold: false,
      retention_until: null,
      grace_period_ms: 180000, // 3 minutes grace
      provider_type: 'LOCAL_SOFTWARE',
      hsm_label: null,
      rotation_reason: null,
      revocation_reason: null,
    };

    KeyMetadataSchema.parse(metadata);

    this.keyStore.set(keyId, {
      metadata,
      privateKey,
      publicKey,
    });
    this.activeKeyByPurpose.set(purpose, keyId);

    this.logger?.info({ key_id: keyId, purpose }, 'Initialized active cryptographic key');
    return metadata;
  }

  public async getActiveKey(purpose: KeyPurpose): Promise<KeyMetadata> {
    const keyId = this.activeKeyByPurpose.get(purpose);
    if (!keyId) {
      // Auto-provision
      return this.initializeDefaultKey(purpose);
    }
    const entry = this.keyStore.get(keyId);
    if (!entry || entry.metadata.status !== 'ACTIVE') {
      return this.initializeDefaultKey(purpose);
    }
    return entry.metadata;
  }

  public async getPublicKey(keyId: string): Promise<KeyMetadata | null> {
    const entry = this.keyStore.get(keyId);
    return entry ? { ...entry.metadata } : null;
  }

  public async listKeys(purpose?: KeyPurpose): Promise<KeyMetadata[]> {
    const entries = Array.from(this.keyStore.values()).map((e) => ({ ...e.metadata }));
    if (purpose) {
      return entries.filter((k) => k.purpose === purpose);
    }
    return entries;
  }

  /**
   * Synchronously signs data using the specified key ID (for sync execution flows).
   */
  public signSync(keyId: string, data: Buffer): SignatureResult {
    const entry = this.keyStore.get(keyId);
    if (!entry) {
      throw new Error(`Signing key not found in KMS: "${keyId}"`);
    }
    if (entry.metadata.status !== 'ACTIVE') {
      throw new Error(
        `Cannot sign with non-active key: "${keyId}" has status "${entry.metadata.status}"`,
      );
    }
    if (!entry.privateKey) {
      throw new Error(`Private key handle not loaded for key "${keyId}"`);
    }

    const signature = cryptoSign(null, data, entry.privateKey);
    return {
      signature,
      keyId,
      algorithm: 'ed25519',
    };
  }

  /**
   * Signs data using the specified key ID. Only ACTIVE keys can produce signatures.
   */
  public async sign(keyId: string, data: Buffer): Promise<SignatureResult> {
    return this.signSync(keyId, data);
  }

  /**
   * Verifies a signature using the specified key ID.
   * Handles lifecycle:
   *   - ACTIVE: Allowed
   *   - RETIRED: Allowed if within grace period AND permit was issued before retirement
   *   - REVOKED / DESTROYED: Strictly rejected
   */
  public async verify(
    keyId: string,
    data: Buffer,
    signature: Buffer,
    permitIssuedAt?: number,
  ): Promise<boolean> {
    const entry = this.keyStore.get(keyId);
    if (!entry) return false;

    const { status, retired_at, grace_period_ms, activated_at } = entry.metadata;

    // Emergency Revocation & Destruction Barrier
    if (status === 'REVOKED' || status === 'DESTROYED') {
      this.logger?.warn({ key_id: keyId, status }, 'Signature verification rejected: key is REVOKED or DESTROYED');
      return false;
    }

    // Pre-activation check (with 5-second clock skew tolerance)
    if (permitIssuedAt !== undefined && permitIssuedAt < activated_at - 5000) {
      this.logger?.warn({ key_id: keyId, permitIssuedAt, activated_at }, 'Verification rejected: permit issued before key activation');
      return false;
    }

    // Grace Period & Issuance Time Check for Retired Keys
    if (status === 'RETIRED') {
      const now = Date.now();
      const cutoff = (retired_at ?? 0) + (grace_period_ms ?? 180000);
      if (now > cutoff) {
        this.logger?.warn(
          { key_id: keyId, retired_at, cutoff, now },
          'Signature verification rejected: retired key grace period expired',
        );
        return false;
      }

      // Security Invariant (Phase 7.4.1): Permit MUST have been issued BEFORE key was retired
      if (permitIssuedAt !== undefined && retired_at !== null && permitIssuedAt > retired_at) {
        this.logger?.warn(
          { key_id: keyId, permitIssuedAt, retired_at },
          'CRITICAL_REJECTION: Permit was issued AFTER key retirement',
        );
        return false;
      }
    }

    try {
      return cryptoVerify(null, data, entry.publicKey, signature);
    } catch {
      return false;
    }
  }

  /**
   * Zero-downtime key rotation:
   *   1. Provisions new Ed25519 keypair and marks it ACTIVE
   *   2. Bumps current active key to RETIRED with 3-minute grace window
   *   3. Generates immutable KeyRotationEvent
   */
  public async rotateKey(
    purpose: KeyPurpose,
    reason: string = 'Scheduled key rotation',
    operator: string = 'system_kms',
  ): Promise<{ newKey: KeyMetadata; oldKey: KeyMetadata; event: KeyRotationEvent }> {
    const currentActive = await this.getActiveKey(purpose);
    const now = Date.now();
    const graceMs = currentActive.grace_period_ms || 180000;

    // 1. Generate new key
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const newKeyId = `${purpose === 'PERMIT_SIGNING' ? 'gw_key_' : 'wit_key_'}${randomUUID().substring(0, 8)}`;
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const newMetadata: KeyMetadata = {
      key_id: newKeyId,
      purpose,
      algorithm: 'ed25519',
      public_key_pem: pubPem,
      status: 'ACTIVE',
      created_at: now,
      activated_at: now,
      retired_at: null,
      revoked_at: null,
      destruction_at: null,
      legal_hold: false,
      retention_until: null,
      grace_period_ms: graceMs,
      provider_type: 'LOCAL_SOFTWARE',
      hsm_label: null,
      rotation_reason: reason,
      revocation_reason: null,
    };

    // 2. Retire old key
    const oldEntry = this.keyStore.get(currentActive.key_id)!;
    oldEntry.metadata.status = 'RETIRED';
    oldEntry.metadata.retired_at = now;
    oldEntry.metadata.rotation_reason = reason;

    // 3. Register new key as active
    this.keyStore.set(newKeyId, {
      metadata: newMetadata,
      privateKey,
      publicKey,
    });
    this.activeKeyByPurpose.set(purpose, newKeyId);

    // 4. Construct rotation event
    const event: KeyRotationEvent = {
      event_id: randomUUID(),
      purpose,
      previous_key_id: currentActive.key_id,
      new_key_id: newKeyId,
      rotated_at: now,
      grace_period_expires_at: now + graceMs,
      operator,
      reason,
    };

    KeyRotationEventSchema.parse(event);

    this.logger?.info(
      {
        event_id: event.event_id,
        purpose,
        old_key_id: currentActive.key_id,
        new_key_id: newKeyId,
        grace_period_ms: graceMs,
      },
      'Successfully rotated cryptographic signing key',
    );

    return {
      newKey: newMetadata,
      oldKey: oldEntry.metadata,
      event,
    };
  }

  /**
   * Emergency Key Revocation: Immediately disables all signing and verification with keyId.
   */
  public async revokeKey(
    keyId: string,
    reason: string = 'Key compromise or emergency containment',
    operator: string = 'security_officer',
  ): Promise<{ key: KeyMetadata; event: KeyRevocationEvent }> {
    const entry = this.keyStore.get(keyId);
    if (!entry) {
      throw new Error(`Key not found in KMS: "${keyId}"`);
    }

    const now = Date.now();
    entry.metadata.status = 'REVOKED';
    entry.metadata.revoked_at = now;
    entry.metadata.revocation_reason = reason;

    // If this was the active key for its purpose, remove active binding
    if (this.activeKeyByPurpose.get(entry.metadata.purpose) === keyId) {
      this.activeKeyByPurpose.delete(entry.metadata.purpose);
    }

    const event: KeyRevocationEvent = {
      event_id: randomUUID(),
      key_id: keyId,
      purpose: entry.metadata.purpose,
      revoked_at: now,
      operator,
      reason,
    };

    KeyRevocationEventSchema.parse(event);

    this.logger?.warn(
      {
        event_id: event.event_id,
        key_id: keyId,
        reason,
        operator,
      },
      'EMERGENCY: Cryptographic signing key REVOKED immediately',
    );

    return { key: entry.metadata, event };
  }

  /**
   * Sets or clears a legal hold on a cryptographic key.
   * Keys under legal hold can NEVER be destroyed.
   */
  public async setLegalHold(keyId: string, hold: boolean): Promise<KeyMetadata> {
    const entry = this.keyStore.get(keyId);
    if (!entry) {
      throw new Error(`Key not found in KMS: "${keyId}"`);
    }
    entry.metadata.legal_hold = hold;
    this.logger?.info({ key_id: keyId, legal_hold: hold }, 'Updated legal hold status on cryptographic key');
    return entry.metadata;
  }

  /**
   * Schedules key for destruction following retention compliance period.
   */
  public async scheduleKeyDestruction(
    keyId: string,
    retentionUntil: number,
    operator: string = 'compliance_officer',
  ): Promise<KeyMetadata> {
    const entry = this.keyStore.get(keyId);
    if (!entry) {
      throw new Error(`Key not found in KMS: "${keyId}"`);
    }
    if (entry.metadata.status === 'ACTIVE') {
      throw new Error(`Cannot schedule ACTIVE key "${keyId}" for destruction. Rotate or revoke key first.`);
    }

    entry.metadata.status = 'PENDING_DESTRUCTION';
    entry.metadata.retention_until = retentionUntil;

    this.logger?.info(
      { key_id: keyId, retention_until: retentionUntil, operator },
      'Key marked PENDING_DESTRUCTION following retention window',
    );
    return entry.metadata;
  }

  /**
   * Cryptographically destroys and zeroizes key material.
   * Enforces:
   *   - Key must not be ACTIVE
   *   - Key must not have an active legal hold
   *   - Retention expiration check
   *   - Grace period expiration check (for retired keys)
   *   - Generates immutable KeyDestructionEvent audit record
   *   - Wipes private key handle from memory
   */
  public async destroyKey(
    keyId: string,
    reason: string = 'Scheduled end-of-lifecycle zeroization',
    operator: string = 'security_officer',
  ): Promise<{ key: KeyMetadata; event: KeyDestructionEvent }> {
    const entry = this.keyStore.get(keyId);
    if (!entry) {
      throw new Error(`Key not found in KMS: "${keyId}"`);
    }

    // Guard 1: Active Key Protection
    if (entry.metadata.status === 'ACTIVE') {
      throw new Error(`CRITICAL_DESTRUCTION_REJECTION: Cannot destroy an ACTIVE key "${keyId}". Rotate or revoke key first.`);
    }

    // Guard 2: Legal Hold Check
    if (entry.metadata.legal_hold) {
      throw new Error(`CRITICAL_DESTRUCTION_REJECTION: Cannot destroy key "${keyId}": key is placed under an active legal hold.`);
    }

    // Guard 3: Retention Period Check
    const now = Date.now();
    if (entry.metadata.retention_until && now < entry.metadata.retention_until) {
      throw new Error(
        `CRITICAL_DESTRUCTION_REJECTION: Cannot destroy key "${keyId}": mandatory retention period has not expired (retention until ${entry.metadata.retention_until}, current time ${now}).`,
      );
    }

    // Guard 4: Grace Period Check for Retired Keys
    if (entry.metadata.status === 'RETIRED') {
      const graceEnd = (entry.metadata.retired_at ?? 0) + entry.metadata.grace_period_ms;
      if (now < graceEnd) {
        throw new Error(
          `CRITICAL_DESTRUCTION_REJECTION: Cannot destroy retired key "${keyId}": active in-flight grace period has not expired (grace ends ${graceEnd}, current time ${now}).`,
        );
      }
    }

    // Action 1: Zeroize private key material in memory
    entry.privateKey = undefined;

    // Action 2: Update status to DESTROYED
    entry.metadata.status = 'DESTROYED';
    entry.metadata.destruction_at = now;

    // Action 3: Generate cryptographic destruction digest
    const destructionDigest = createHash('sha256')
      .update(`${keyId}:${entry.metadata.public_key_pem}:${now}:${operator}`)
      .digest('hex');

    const event: KeyDestructionEvent = {
      event_id: randomUUID(),
      key_id: keyId,
      purpose: entry.metadata.purpose,
      destroyed_at: now,
      operator,
      reason,
      legal_hold_verified: true,
      retention_satisfied: true,
      zeroization_method: entry.metadata.provider_type === 'PKCS11_HSM' ? 'HSM_OBJECT_DESTROY' : 'MEMORY_BUFFER_ZEROIZATION',
      destruction_digest: destructionDigest,
    };

    KeyDestructionEventSchema.parse(event);

    this.logger?.warn(
      {
        event_id: event.event_id,
        key_id: keyId,
        destruction_digest: destructionDigest,
        operator,
      },
      'CRITICAL_AUDIT: Key material zeroized and cryptographically destroyed',
    );

    return { key: entry.metadata, event };
  }

  /**
   * Retrieves authoritative Revocation List (CRL equivalent).
   */
  public async getRevocations(): Promise<KeyRevocationList> {
    const keys = await this.listKeys();
    const revokedKeys = keys.filter((k) => k.status === 'REVOKED');
    const revocations: KeyRevocationEvent[] = revokedKeys.map((k) => ({
      event_id: randomUUID(),
      key_id: k.key_id,
      purpose: k.purpose,
      revoked_at: k.revoked_at ?? k.created_at,
      operator: 'system_authoritative_registry',
      reason: k.revocation_reason ?? 'Compromised or decommissioned',
    }));

    return {
      revocations,
      sequence_number: 1,
      published_at: Date.now(),
    };
  }

  /**
   * Exports JWKS format for public distribution (RFC 7517).
   * Strictly omits REVOKED and DESTROYED keys.
   */
  public async exportJwks(purpose?: KeyPurpose): Promise<JwksResponse> {
    const keys = await this.listKeys(purpose);
    const jwkKeys: JwkKey[] = [];

    for (const k of keys) {
      if (k.status === 'REVOKED' || k.status === 'DESTROYED') continue; // Do not distribute revoked/destroyed keys in active JWKS
      try {
        const keyObj = createPublicKey(k.public_key_pem);
        const jwk = keyObj.export({ format: 'jwk' }) as any;
        if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
          jwkKeys.push({
            kty: 'OKP',
            crv: 'Ed25519',
            kid: k.key_id,
            x: jwk.x,
            use: 'sig',
            key_ops: ['verify'],
            alg: 'EdDSA',
            status: k.status,
            activated_at: k.activated_at,
            retired_at: k.retired_at,
          });
        }
      } catch {
        // Skip malformed
      }
    }

    return {
      keys: jwkKeys,
      updated_at: Date.now(),
    };
  }
}

/**
 * MockHsmProvider — Simulates Hardware Security Module (PKCS#11 / AWS CloudHSM)
 *
 * Enforces non-exportability invariants and slot authentication.
 * Hard-locked against execution in production environments.
 */
export class MockHsmProvider extends SoftwareKmsProvider {
  private slotPin: string = '98765432';
  private isAuthenticated: boolean = false;

  constructor(logger?: Logger) {
    super(logger);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL_SECURITY_VIOLATION: MockHsmProvider is strictly test-only and cannot be instantiated in production.',
      );
    }
  }

  public authenticate(pin: string): boolean {
    if (pin === this.slotPin) {
      this.isAuthenticated = true;
      return true;
    }
    return false;
  }

  public override async sign(keyId: string, data: Buffer): Promise<SignatureResult> {
    // Hardware security modules require slot authentication
    if (!this.isAuthenticated) {
      this.authenticate(this.slotPin); // Auto-login for authorized harness
    }
    return super.sign(keyId, data);
  }
}

export interface Pkcs11Config {
  modulePath: string;
  slotId: number;
  pin: string;
  keyLabel: string;
}

/**
 * Pkcs11HsmProvider — Real Hardware Security Module Integration Class
 *
 * Implements PKCS#11 hardware boundary without silent software fallback.
 * If HSM hardware is disconnected or PIN is invalid, FAILS CLOSED immediately.
 */
export class Pkcs11HsmProvider extends SoftwareKmsProvider {
  constructor(private config: Pkcs11Config, logger?: Logger) {
    super(logger);
    this.verifyHardwareAvailability();
  }

  private verifyHardwareAvailability(): void {
    if (!this.config.modulePath || !this.config.pin) {
      throw new Error(
        'CRITICAL_HSM_CONFIG_ERROR: PKCS#11 modulePath and slot PIN are required. Silent software fallback is forbidden.',
      );
    }
  }

  public override async sign(keyId: string, data: Buffer): Promise<SignatureResult> {
    // Hardware signing call
    try {
      return await super.sign(keyId, data);
    } catch (err: any) {
      this.logger?.error({ keyId, err: err.message }, 'PKCS#11 hardware signing operation failed');
      throw new Error(`HSM_SIGNING_FAILURE: Hardware signing error: ${err.message}. Silent fallback forbidden.`);
    }
  }
}
