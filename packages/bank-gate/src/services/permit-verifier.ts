/**
 * Independent Permit Verifier Service
 *
 * Implements Bank Gate Section 4:
 *   - Verifies Ed25519 Gateway signature over canonical 22-field permit JSON
 *   - Recomputes 7-field RFC 8785 canonical transaction digest and verifies payload_hash
 *   - Checks permit expiration using injected Clock (strictly 90s)
 *   - Validates that amounts are safe positive integers (Paise, Rule E1)
 *   - Never trusts boolean flags from clients or Gateway
 *   - Does NOT import Gateway private keys (Rule E4)
 */

import {
  createPublicKey,
  verify as cryptoVerify,
  KeyObject,
} from 'crypto';
import type { Logger } from 'pino';
import {
  CanonicalTransaction,
  computeCanonicalTransactionDigest,
  canonicalJson,
  PermitEnvelope,
  PermitEnvelopeSchema,
  TransactionBoundPermitPayload,
  TransactionBoundPermitPayloadSchema,
  Clock,
  SystemClock,
} from '@agentguard/core-schema';
import { TrustedKeyring } from './trusted-keyring';

export interface PermitVerificationResult {
  valid: boolean;
  reason?: string;
  permit?: TransactionBoundPermitPayload;
}

export class PermitVerifierService {
  private gatewayPublicKey: KeyObject | null = null;
  private keyring: TrustedKeyring;
  private gatewayPublicKeyPem?: string;
  private trustedKeyId?: string;
  private clock: Clock;
  private logger?: Logger;

  constructor(
    keyringOrPem: TrustedKeyring | string,
    trustedKeyIdOrClock?: string | Clock,
    clock?: Clock,
    logger?: Logger,
  ) {
    if (typeof keyringOrPem === 'string') {
      this.gatewayPublicKeyPem = keyringOrPem;
      this.trustedKeyId = typeof trustedKeyIdOrClock === 'string' ? trustedKeyIdOrClock : '';
      this.clock = clock ?? (typeof trustedKeyIdOrClock === 'object' ? (trustedKeyIdOrClock as Clock) : new SystemClock());
      this.logger = logger;
      this.keyring = TrustedKeyring.fromSingleKey(keyringOrPem, this.trustedKeyId, this.logger, this.clock);
      try {
        this.gatewayPublicKey = createPublicKey(keyringOrPem);
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'Failed to parse Gateway public key PEM');
      }
    } else {
      this.keyring = keyringOrPem;
      this.clock = (trustedKeyIdOrClock as Clock) ?? new SystemClock();
      this.logger = logger ?? (clock as unknown as Logger);
      this.trustedKeyId = this.keyring.getActiveKeyId() ?? undefined;
      this.gatewayPublicKey = this.keyring.getActivePublicKey();
    }
  }

  public getKeyring(): TrustedKeyring {
    return this.keyring;
  }

  public setGatewayPublicKey(pem: string, keyId: string): void {
    this.gatewayPublicKeyPem = pem;
    this.trustedKeyId = keyId;
    this.gatewayPublicKey = createPublicKey(pem);
    this.keyring.addKey({
      key_id: keyId,
      public_key_pem: pem,
      status: 'ACTIVE',
      activated_at: this.clock.now(),
    });
  }

  /**
   * Independently verifies an incoming signed permit envelope and its matching transaction.
   */
  public verifyPermit(
    envelope: PermitEnvelope,
    rawTransaction: CanonicalTransaction,
  ): PermitVerificationResult {
    // 1. Validate envelope schema
    const envelopeParsed = PermitEnvelopeSchema.safeParse(envelope);
    if (!envelopeParsed.success) {
      return { valid: false, reason: 'INVALID_PERMIT_ENVELOPE' };
    }

    const { permit, signature, gateway_key_id } = envelopeParsed.data;

    // 2. Validate strict 22-field payload schema
    const payloadParsed = TransactionBoundPermitPayloadSchema.safeParse(permit);
    if (!payloadParsed.success) {
      return { valid: false, reason: 'MALFORMED_PERMIT_PAYLOAD' };
    }

    const validatedPayload = payloadParsed.data;
    const now = this.clock.now();
    const MAX_CLOCK_SKEW_MS = 5000; // 5-second maximum acceptable forward clock skew

    // 3. Verify Clock & Expiration Invariants
    // 3a. Rejection of future-dated issuance
    if (validatedPayload.issued_at > now + MAX_CLOCK_SKEW_MS) {
      return { valid: false, reason: 'PERMIT_ISSUED_IN_FUTURE' };
    }

    // 3b. Verify Permit Expiration (Strictly 90s permit TTL)
    if (validatedPayload.expires_at <= now) {
      return { valid: false, reason: 'PERMIT_EXPIRED' };
    }

    // 3c. Verify Maximum Permitted Permit Lifetime (<= 90s + 5s skew tolerance)
    if (validatedPayload.expires_at - validatedPayload.issued_at > 90000 + MAX_CLOCK_SKEW_MS) {
      return { valid: false, reason: 'PERMIT_TTL_EXCEEDS_MAXIMUM' };
    }

    // 4. Validate Key ID against Trusted Keyring (enforcing Retired-Key Issuance Invariants)
    let verificationKey: KeyObject | null = null;

    if (this.keyring) {
      const keyId = gateway_key_id || this.trustedKeyId || this.keyring.getActiveKeyId();
      if (!keyId) {
        return { valid: false, reason: 'GATEWAY_PUBLIC_KEY_NOT_CONFIGURED' };
      }
      // Critical check: Passes permit's signed issued_at to ensure RETIRED keys cannot authorize post-retirement permits
      const lookup = this.keyring.resolveKeyForVerification(keyId, now, validatedPayload.issued_at);
      if (!lookup.isUsable) {
        return { valid: false, reason: lookup.reason || 'UNKNOWN_SIGNING_KEY_ID' };
      }
      verificationKey = lookup.key.publicKey;
    } else {
      if (this.trustedKeyId && gateway_key_id && gateway_key_id !== this.trustedKeyId) {
        return { valid: false, reason: 'UNKNOWN_SIGNING_KEY_ID' };
      }
      verificationKey = this.gatewayPublicKey;
    }

    if (!verificationKey) {
      return { valid: false, reason: 'GATEWAY_PUBLIC_KEY_NOT_CONFIGURED' };
    }

    // 5. Verify Ed25519 Detached Signature over canonical JSON
    const canonicalPayloadString = canonicalJson(validatedPayload);
    const isValidSignature = cryptoVerify(
      null,
      Buffer.from(canonicalPayloadString, 'utf8'),
      verificationKey,
      Buffer.from(signature, 'base64'),
    );

    if (!isValidSignature) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    // 6. Recompute 7-field Canonical Transaction Digest and compare
    const recomputedDigest = computeCanonicalTransactionDigest({
      account_ref: rawTransaction.account_ref,
      action: rawTransaction.action,
      amount_paise: rawTransaction.amount_paise,
      currency: rawTransaction.currency,
      invoice_ref: rawTransaction.invoice_ref,
      payee_id: rawTransaction.payee_id,
      purpose: rawTransaction.purpose,
    });

    if (recomputedDigest !== validatedPayload.payload_hash) {
      return { valid: false, reason: 'PAYLOAD_DIGEST_MISMATCH' };
    }

    // 7. Verify transaction parameters match permit parameters
    if (rawTransaction.account_ref !== validatedPayload.account_ref) {
      return { valid: false, reason: 'ACCOUNT_REF_MISMATCH' };
    }
    if (rawTransaction.amount_paise !== validatedPayload.amount_paise) {
      return { valid: false, reason: 'AMOUNT_MISMATCH' };
    }
    if (rawTransaction.currency !== validatedPayload.currency) {
      return { valid: false, reason: 'CURRENCY_MISMATCH' };
    }
    if (rawTransaction.payee_id !== validatedPayload.payee_id) {
      return { valid: false, reason: 'PAYEE_MISMATCH' };
    }

    return {
      valid: true,
      permit: validatedPayload,
    };
  }
}
