/**
 * Enterprise OIDC Authentication Service (PKCE + JWKS Cryptographic Verification)
 *
 * Implements Phase 7.1:
 *   - Provider-neutral OIDC (Microsoft Entra ID, Okta, Keycloak, etc.)
 *   - Authorization Code Flow with PKCE (S256)
 *   - Cryptographic ID token verification via jose (JWKS / RS256 / ES256)
 *   - Strict claims validation: iss, aud, exp, nbf, iat, nonce
 *   - Stable (issuer, subject) identity pair mapping (no email-only lookup)
 *   - State validation and single-use enforcement
 */

import { createHash, randomBytes } from 'crypto';
import * as jose from 'jose';
import type { Logger } from 'pino';
import {
  OidcProviderConfig,
  CustomerIdentityMapping,
} from '@agentguard/core-schema';
import { BankingStores, CustomerIdpIdentityRow, OidcAuthStateRow } from '../db/banking-stores';

export interface OidcTokensResult {
  access_token: string;
  id_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface VerifiedIdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat: number;
  nonce?: string;
  email?: string;
  name?: string;
  [key: string]: any;
}

export class EnterpriseOidcService {
  private jwksCache = new Map<string, any>();

  constructor(
    private stores: BankingStores,
    private config: OidcProviderConfig,
    private logger?: Logger,
  ) {}

  /**
   * Generates PKCE code_verifier and code_challenge (S256)
   */
  public generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = hash.toString('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Generates a random cryptographic state or nonce (base64url)
   */
  public generateRandomString(bytes: number = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /**
   * Stage 1: Initiates OIDC login URL with PKCE (S256), state, and nonce
   */
  public async initiateLogin(redirectUri: string): Promise<{
    authorizationUrl: string;
    state: string;
    expiresAt: number;
  }> {
    // Exact redirect URI allowlist validation
    if (!this.config.allowed_redirect_uris.includes(redirectUri)) {
      throw new Error('INVALID_REDIRECT_URI');
    }

    const state = this.generateRandomString(32);
    const nonce = this.generateRandomString(32);
    const { codeVerifier, codeChallenge } = this.generatePkce();

    // Store state with 10-minute TTL
    this.stores.storeOidcAuthState({
      state,
      nonce,
      codeVerifier,
      redirectUri,
      idpIssuer: this.config.issuer,
      ttlSeconds: 600,
    });

    const authEndpoint = this.config.authorization_endpoint ||
      `${this.config.issuer.replace(/\/$/, '')}/oauth2/v2.0/authorize`;

    const sp = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.client_id,
      redirect_uri: redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authorizationUrl: `${authEndpoint}?${sp.toString()}`,
      state,
      expiresAt: Date.now() + 600 * 1000,
    };
  }

  /**
   * Stage 2: Exchanges authorization code with PKCE code_verifier and validates ID token cryptographically
   */
  public async handleCallback(
    code: string,
    state: string,
    jwksOrKeySet?: jose.JWTVerifyGetKey | Uint8Array | jose.KeyLike,
  ): Promise<{
    identity: CustomerIdpIdentityRow;
    claims: VerifiedIdTokenClaims;
    tokens: OidcTokensResult;
  }> {
    // 1. Single-use state consumption
    const authState = this.stores.consumeOidcAuthState(state);
    if (!authState) {
      throw new Error('INVALID_OR_EXPIRED_OIDC_STATE');
    }

    // 2. Code exchange at token endpoint
    const tokens = await this.exchangeCodeForTokens(code, authState);
    if (!tokens.id_token) {
      throw new Error('OIDC_MISSING_ID_TOKEN');
    }

    // 3. Cryptographic ID Token Verification via jose
    const claims = await this.verifyIdToken(tokens.id_token, authState.nonce, jwksOrKeySet);

    // 4. Stable (iss, sub) lookup
    const identity = this.stores.findCustomerByIdp(claims.iss, claims.sub);
    if (!identity) {
      this.logger?.warn({ iss: claims.iss, sub: claims.sub }, 'Authenticated OIDC user has no customer mapping');
      throw new Error('CUSTOMER_IDP_MAPPING_NOT_FOUND');
    }

    if (identity.status !== 'ACTIVE') {
      throw new Error(`CUSTOMER_IDP_STATUS_${identity.status}`);
    }

    return { identity, claims, tokens };
  }

  public async exchangeCodeForTokens(code: string, authState: OidcAuthStateRow): Promise<OidcTokensResult> {
    const tokenEndpoint = this.config.token_endpoint ||
      `${this.config.issuer.replace(/\/$/, '')}/oauth2/v2.0/token`;

    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.client_id,
        ...(this.config.client_secret ? { client_secret: this.config.client_secret } : {}),
        code,
        redirect_uri: authState.redirect_uri,
        code_verifier: authState.code_verifier,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => '');
      this.logger?.error({ status: tokenRes.status, errText }, 'OIDC token exchange failed');
      throw new Error(`OIDC_TOKEN_EXCHANGE_FAILED: ${tokenRes.status}`);
    }

    return (await tokenRes.json()) as OidcTokensResult;
  }

  /**
   * Cryptographically validates an ID Token against the provider's JWKS
   */
  public async verifyIdToken(
    idToken: string,
    expectedNonce?: string,
    keySetOverride?: jose.JWTVerifyGetKey | Uint8Array | jose.KeyLike,
  ): Promise<VerifiedIdTokenClaims> {
    const keySet = keySetOverride || this.getJwks();

    let verified: jose.JWTVerifyResult;
    try {
      verified = await jose.jwtVerify(idToken, keySet as any, {
        issuer: this.config.issuer,
        audience: this.config.client_id,
        clockTolerance: 30, // 30s clock skew allowance
      });
    } catch (err: any) {
      this.logger?.error({ err: err.message }, 'ID Token signature/claims verification failed');
      throw new Error(`ID_TOKEN_VERIFICATION_FAILED: ${err.message}`);
    }

    const payload = verified.payload as unknown as VerifiedIdTokenClaims;

    // Strict Nonce Check
    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new Error('ID_TOKEN_NONCE_MISMATCH');
    }

    // Verify sub exists
    if (!payload.sub) {
      throw new Error('ID_TOKEN_MISSING_SUB');
    }

    return payload;
  }

  private customJwks?: jose.JWTVerifyGetKey;

  public setCustomJwks(jwks: jose.JWTVerifyGetKey) {
    this.customJwks = jwks;
  }

  private getJwks(): jose.JWTVerifyGetKey {
    if (this.customJwks) {
      return this.customJwks;
    }

    const jwksUri = this.config.jwks_uri ||
      `${this.config.issuer.replace(/\/$/, '')}/discovery/v2.0/keys`;

    if (!this.jwksCache.has(jwksUri)) {
      this.jwksCache.set(jwksUri, jose.createRemoteJWKSet(new URL(jwksUri)));
    }

    return this.jwksCache.get(jwksUri);
  }
}
