/**
 * WebAuthn Passkey Registration & Verification Service
 *
 * Implements Phase 7.1:
 *   - Standards-compliant FIDO2 / WebAuthn passkeys via @simplewebauthn/server
 *   - Multi-device passkey registration per customer
 *   - Cryptographic assertion signature verification (no client-side booleans)
 *   - Ephemeral single-use challenge consumption
 *   - RP ID and Origin enforcement
 *   - Counter management & replay protection
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import type { Logger } from 'pino';
import { BankingStores, WebAuthnCredentialRow } from '../db/banking-stores';

export interface WebAuthnConfig {
  rpName: string;
  rpId: string;
  expectedOrigin: string | string[];
}

export class WebAuthnService {
  constructor(
    private stores: BankingStores,
    private config: WebAuthnConfig,
    private logger?: Logger,
  ) {}

  /**
   * Stage 1: Generate WebAuthn Registration Options for a customer
   */
  public async generateRegistrationOptions(customerRef: string): Promise<any> {
    const customer = this.stores.getCustomer(customerRef);
    if (!customer) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    // Exclude already registered credentials for this customer
    const existingCreds = this.stores.listWebAuthnCredentials(customerRef);
    const excludeCredentials = existingCreds.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: new TextEncoder().encode(customerRef),
      userName: customer.email,
      userDisplayName: customer.name,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Store ephemeral challenge with 5-minute TTL
    this.stores.storeWebAuthnChallenge({
      challenge: options.challenge,
      customer_ref: customerRef,
      challenge_type: 'REGISTRATION',
      ttlSeconds: 300,
    });

    return options;
  }

  /**
   * Stage 2: Verify WebAuthn Registration Response and store credential
   */
  public async verifyRegistration(
    customerRef: string,
    challenge: string,
    response: RegistrationResponseJSON,
    name?: string,
  ): Promise<WebAuthnCredentialRow> {
    // 1. Single-use challenge consumption
    const storedChallenge = this.stores.consumeWebAuthnChallenge(challenge);
    if (!storedChallenge || storedChallenge.customer_ref !== customerRef || storedChallenge.challenge_type !== 'REGISTRATION') {
      throw new Error('INVALID_OR_EXPIRED_WEBAUTHN_CHALLENGE');
    }

    // 2. Cryptographic verification via @simplewebauthn/server
    let verification: any;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.expectedOrigin,
        expectedRPID: this.config.rpId,
        requireUserVerification: false,
      });
    } catch (err: any) {
      this.logger?.warn({ err: err.message }, 'WebAuthn registration verification failed');
      throw new Error(`WEBAUTHN_REGISTRATION_FAILED: ${err.message}`);
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('WEBAUTHN_REGISTRATION_NOT_VERIFIED');
    }

    const { credential, aaguid } = verification.registrationInfo;

    // Convert public key bytes to Base64URL string for safe storage
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

    // 3. Persist credential
    const saved = this.stores.storeWebAuthnCredential({
      credential_id: credential.id,
      customer_ref: customerRef,
      public_key: publicKeyBase64,
      counter: credential.counter,
      transports: response.response.transports as string[] | undefined,
      aaguid,
      name: name || 'My Passkey',
    });

    this.logger?.info({ customerRef, credentialId: saved.credential_id }, 'WebAuthn passkey registered successfully');
    return saved;
  }

  /**
   * Stage 1: Generate WebAuthn Authentication Options
   */
  public async generateAuthenticationOptions(customerRef: string): Promise<any> {
    const creds = this.stores.listWebAuthnCredentials(customerRef);
    if (creds.length === 0) {
      throw new Error('NO_REGISTERED_WEBAUTHN_CREDENTIALS');
    }

    const allowCredentials = creds.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    }));

    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      allowCredentials,
      userVerification: 'preferred',
    });

    // Store ephemeral challenge with 5-minute TTL
    this.stores.storeWebAuthnChallenge({
      challenge: options.challenge,
      customer_ref: customerRef,
      challenge_type: 'AUTHENTICATION',
      ttlSeconds: 300,
    });

    return options;
  }

  /**
   * Stage 2: Verify WebAuthn Authentication Assertion
   */
  public async verifyAuthentication(
    customerRef: string,
    challenge: string,
    response: AuthenticationResponseJSON,
  ): Promise<{ verified: boolean; credentialId: string }> {
    // 1. Single-use challenge consumption
    const storedChallenge = this.stores.consumeWebAuthnChallenge(challenge);
    if (!storedChallenge || storedChallenge.customer_ref !== customerRef) {
      throw new Error('INVALID_OR_EXPIRED_WEBAUTHN_CHALLENGE');
    }

    // 2. Lookup credential by ID
    const cred = this.stores.getWebAuthnCredential(response.id);
    if (!cred || cred.customer_ref !== customerRef) {
      throw new Error('WEBAUTHN_CREDENTIAL_NOT_FOUND');
    }

    if (cred.revoked_at !== null) {
      throw new Error('WEBAUTHN_CREDENTIAL_REVOKED');
    }

    const publicKeyBytes = Buffer.from(cred.public_key, 'base64url');

    // 3. Cryptographic assertion verification
    let verification: any;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.expectedOrigin,
        expectedRPID: this.config.rpId,
        authenticator: {
          credentialID: cred.credential_id,
          credentialPublicKey: publicKeyBytes,
          counter: cred.counter,
        },
        requireUserVerification: false,
      });
    } catch (err: any) {
      this.logger?.warn({ err: err.message }, 'WebAuthn authentication verification failed');
      throw new Error(`WEBAUTHN_AUTHENTICATION_FAILED: ${err.message}`);
    }

    if (!verification.verified) {
      throw new Error('WEBAUTHN_ASSERTION_NOT_VERIFIED');
    }

    // 4. Update counter to prevent replay attacks
    this.stores.updateWebAuthnCredentialCounter(
      cred.credential_id,
      verification.authenticationInfo.newCounter,
    );

    return {
      verified: true,
      credentialId: cred.credential_id,
    };
  }

  public listCredentials(customerRef: string): WebAuthnCredentialRow[] {
    return this.stores.listWebAuthnCredentials(customerRef);
  }

  public revokeCredential(credentialId: string, customerRef: string): boolean {
    return this.stores.revokeWebAuthnCredential(credentialId, customerRef);
  }

  public renameCredential(credentialId: string, customerRef: string, name: string): boolean {
    return this.stores.renameWebAuthnCredential(credentialId, customerRef, name);
  }
}
