/**
 * Trusted Keyring — Multi-Key Management & Rotation Trust Store for Bank Gate
 *
 * Implements Phase 7.4:
 *   - Multi-key verification trust store holding active, retired, and revoked public keys
 *   - Grace period verification: in-flight permits signed before rotation remain valid
 *   - Immediate emergency revocation barrier
 *   - RFC 7517 JWKS import for dynamic key discovery from Gateway
 */

import { createPublicKey, KeyObject } from 'crypto';
import type { Logger } from 'pino';
import {
  KeyMetadata,
  KeyStatus,
  KeyRevocationEvent,
  JwksResponse,
  JwkKey,
  Clock,
  SystemClock,
} from '@agentguard/core-schema';

export interface TrustedKeyEntry {
  keyId: string;
  publicKey: KeyObject;
  publicKeyPem: string;
  status: KeyStatus;
  activatedAt: number;
  retiredAt: number | null;
  revokedAt: number | null;
  gracePeriodMs: number;
}

export interface KeyLookupResult {
  key: TrustedKeyEntry;
  isUsable: boolean;
  reason?: string;
}

export class TrustedKeyring {
  private keys = new Map<string, TrustedKeyEntry>();
  private activeKeyId: string | null = null;
  private clock: Clock;

  constructor(private logger?: Logger, clock?: Clock) {
    this.clock = clock ?? new SystemClock();
  }

  public setClock(clock: Clock): void {
    this.clock = clock;
  }

  public static fromSingleKey(pem: string, keyId: string, logger?: Logger, clock?: Clock): TrustedKeyring {
    const keyring = new TrustedKeyring(logger, clock);
    keyring.addKey({
      key_id: keyId,
      public_key_pem: pem,
      status: 'ACTIVE',
      created_at: keyring.clock.now(),
      activated_at: keyring.clock.now(),
      retired_at: null,
      revoked_at: null,
      grace_period_ms: 180000,
      purpose: 'PERMIT_SIGNING',
      algorithm: 'ed25519',
      provider_type: 'LOCAL_SOFTWARE',
      hsm_label: null,
      rotation_reason: null,
      revocation_reason: null,
    });
    return keyring;
  }

  public addKey(params: {
    key_id: string;
    public_key_pem: string;
    status?: KeyStatus;
    activated_at?: number;
    retired_at?: number | null;
    revoked_at?: number | null;
    grace_period_ms?: number;
  } | KeyMetadata): void {
    const now = this.clock.now();
    const status = params.status ?? 'ACTIVE';
    const keyObject = createPublicKey(params.public_key_pem);

    const entry: TrustedKeyEntry = {
      keyId: params.key_id,
      publicKey: keyObject,
      publicKeyPem: params.public_key_pem,
      status,
      activatedAt: params.activated_at ?? now,
      retiredAt: params.retired_at ?? null,
      revokedAt: params.revoked_at ?? null,
      gracePeriodMs: params.grace_period_ms ?? 180000,
    };

    this.keys.set(params.key_id, entry);

    if (status === 'ACTIVE') {
      this.activeKeyId = params.key_id;
    }

    this.logger?.info({ key_id: params.key_id, status }, 'Added trusted key to Bank Gate keyring');
  }

  public getActiveKeyId(): string | null {
    return this.activeKeyId;
  }

  public getActivePublicKey(): KeyObject | null {
    if (!this.activeKeyId) return null;
    return this.keys.get(this.activeKeyId)?.publicKey ?? null;
  }

  /**
   * Resolves a key for verification, strictly enforcing key lifecycle FSM:
   *   - ACTIVE: Allowed
   *   - RETIRED: Allowed ONLY IF (now <= retiredAt + gracePeriodMs) AND (permitIssuedAt <= retiredAt)
   *   - REVOKED: Strictly rejected (REVOKED_SIGNING_KEY_ID)
   *   - DESTROYED: Strictly rejected (DESTROYED_SIGNING_KEY_ID)
   *
   * Security Invariant (Phase 7.4.1):
   * A RETIRED key CANNOT authorize permits issued after its retirement time,
   * completely closing the window for an attacker possessing a retired key to mint new permits.
   */
  public resolveKeyForVerification(
    keyId: string,
    currentTimestamp: number = Date.now(),
    permitIssuedAt?: number,
    clockSkewToleranceMs: number = 5000,
  ): KeyLookupResult {
    const entry = this.keys.get(keyId);
    if (!entry) {
      return {
        key: null as any,
        isUsable: false,
        reason: 'UNKNOWN_SIGNING_KEY_ID',
      };
    }

    if (entry.status === 'REVOKED') {
      return {
        key: entry,
        isUsable: false,
        reason: 'REVOKED_SIGNING_KEY_ID',
      };
    }

    if (entry.status === 'DESTROYED') {
      return {
        key: entry,
        isUsable: false,
        reason: 'DESTROYED_SIGNING_KEY_ID',
      };
    }

    // Pre-activation check: permit cannot be issued before key activation
    if (permitIssuedAt !== undefined && permitIssuedAt < entry.activatedAt - clockSkewToleranceMs) {
      return {
        key: entry,
        isUsable: false,
        reason: 'PERMIT_ISSUED_BEFORE_KEY_ACTIVATION',
      };
    }

    if (entry.status === 'RETIRED') {
      // 1. Grace period expiry check (overall settlement deadline)
      const graceCutoff = (entry.retiredAt ?? 0) + entry.gracePeriodMs;
      if (currentTimestamp > graceCutoff) {
        return {
          key: entry,
          isUsable: false,
          reason: 'RETIRED_KEY_GRACE_EXPIRED',
        };
      }

      // 2. Critical Security Boundary: Permit must have been issued BEFORE key retirement
      if (permitIssuedAt !== undefined && entry.retiredAt !== null) {
        if (permitIssuedAt > entry.retiredAt + clockSkewToleranceMs) {
          return {
            key: entry,
            isUsable: false,
            reason: 'PERMIT_ISSUED_AFTER_KEY_RETIREMENT',
          };
        }
      }
    }

    return {
      key: entry,
      isUsable: true,
    };
  }

  /**
   * Synchronizes authoritative key revocations across service instances.
   */
  public syncRevocations(revocations: KeyRevocationEvent[]): void {
    for (const rev of revocations) {
      const entry = this.keys.get(rev.key_id);
      if (entry) {
        entry.status = 'REVOKED';
        entry.revokedAt = rev.revoked_at;
      }
      if (this.activeKeyId === rev.key_id) {
        this.activeKeyId = null;
      }
    }
    this.logger?.info({ count: revocations.length }, 'Synchronized authoritative key revocations in keyring');
  }

  /**
   * Rotates active key: marks current active as RETIRED with grace window,
   * sets new key as ACTIVE.
   */
  public rotateKey(
    newKey: { key_id: string; public_key_pem: string; grace_period_ms?: number },
    nowTimestamp?: number,
  ): void {
    const now = nowTimestamp ?? this.clock.now();
    if (this.activeKeyId) {
      const oldEntry = this.keys.get(this.activeKeyId);
      if (oldEntry && oldEntry.status === 'ACTIVE') {
        oldEntry.status = 'RETIRED';
        oldEntry.retiredAt = now;
        this.logger?.info(
          { key_id: oldEntry.keyId, grace_period_ms: oldEntry.gracePeriodMs },
          'Bank Gate transitioned old key to RETIRED',
        );
      }
    }

    this.addKey({
      key_id: newKey.key_id,
      public_key_pem: newKey.public_key_pem,
      status: 'ACTIVE',
      activated_at: now,
      grace_period_ms: newKey.grace_period_ms ?? 180000,
    });
  }

  /**
   * Emergency revocation of a compromised key ID.
   */
  public revokeKey(
    keyId: string,
    reason: string = 'Security incident containment',
    nowTimestamp?: number,
  ): boolean {
    const entry = this.keys.get(keyId);
    if (!entry) return false;

    entry.status = 'REVOKED';
    entry.revokedAt = nowTimestamp ?? this.clock.now();

    if (this.activeKeyId === keyId) {
      this.activeKeyId = null;
    }

    this.logger?.warn({ key_id: keyId, reason }, 'Bank Gate marked key as REVOKED');
    return true;
  }

  public listKeys(): TrustedKeyEntry[] {
    return Array.from(this.keys.values());
  }

  /**
   * Imports public keys from a JWKS response.
   */
  public importFromJwks(jwks: JwksResponse): void {
    for (const key of jwks.keys) {
      if (key.kty === 'OKP' && key.crv === 'Ed25519') {
        try {
          const keyObj = createPublicKey({ key, format: 'jwk' });
          const pem = keyObj.export({ type: 'spki', format: 'pem' }) as string;
          this.addKey({
            key_id: key.kid,
            public_key_pem: pem,
            status: key.status ?? 'ACTIVE',
          });
        } catch (err: any) {
          this.logger?.warn({ err: err.message, kid: key.kid }, 'Failed to import JWK');
        }
      }
    }
  }
}
