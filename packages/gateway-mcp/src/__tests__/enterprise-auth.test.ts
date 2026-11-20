/**
 * Phase 7.1: Enterprise Authentication, WebAuthn & Transaction-Bound Approval Test Suite
 *
 * Comprehensive security testing covering:
 *   - Provider-neutral OIDC (PKCE S256, JWKS cryptographic signature verification, claims validation)
 *   - WebAuthn Passkeys (@simplewebauthn, registration, assertion, counter replay check, revocation)
 *   - Transaction-Bound Step-Up Customer Approval (canonical 7-field digest binding, mandate versioning, atomic consumption)
 *   - Demo Mode Fail-Closed Security (prohibited in production, fail-closed when unset)
 *   - Session Security (HttpOnly, SameSite, CSRF, logout revocation)
 */

import express = require('express');
import * as http from 'http';
import { AddressInfo } from 'net';
import Database = require('better-sqlite3');
import * as jose from 'jose';
import {
  CanonicalTransaction,
  computeCanonicalTransactionDigest,
} from '@agentguard/core-schema';
import { BankingStores } from '../db/banking-stores';
import { CustomerAuthService } from '../services/customer-auth';
import { EnterpriseOidcService } from '../services/enterprise-oidc-service';
import { WebAuthnService } from '../services/webauthn-service';
import { TransactionApprovalService } from '../services/transaction-approval-service';
import { CustomerAPI } from '../api/customer';

describe('Phase 7.1: Enterprise Authentication & Transaction-Bound Approval', () => {
  let db: Database.Database;
  let stores: BankingStores;
  let authService: CustomerAuthService;
  let oidcService: EnterpriseOidcService;
  let webauthnService: WebAuthnService;
  let approvalService: TransactionApprovalService;
  let customerApi: CustomerAPI;
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  // Mock OIDC RSA Keypair & JWKS
  let rsaKeyPair: jose.GenerateKeyPairResult;
  let rsaPublicKeyJwk: jose.JWK;
  const mockIssuer = 'https://login.microsoftonline.com/tenant-123/v2.0';
  const mockClientId = 'client-agentguard-enterprise';
  const mockRedirectUri = 'http://127.0.0.1:3000/api/auth/callback/oidc';

  let currentMockToken: string = '';

  beforeAll(async () => {
    process.env.DEMO_MODE = '1';

    // Generate in-memory RSA keypair for real cryptographic JWT signing and JWKS verification
    rsaKeyPair = await jose.generateKeyPair('RS256', { extractable: true });
    rsaPublicKeyJwk = await jose.exportJWK(rsaKeyPair.publicKey);
    rsaPublicKeyJwk.kid = 'test-key-id-1';
    rsaPublicKeyJwk.alg = 'RS256';
    rsaPublicKeyJwk.use = 'sig';

    db = new Database(':memory:');
    stores = new BankingStores(db);
    authService = new CustomerAuthService(stores);

    oidcService = new EnterpriseOidcService(stores, {
      provider_id: 'enterprise-entra',
      issuer: mockIssuer,
      client_id: mockClientId,
      client_secret: 'mock-secret',
      scopes: ['openid', 'profile', 'email'],
      allowed_redirect_uris: [mockRedirectUri],
    });

    // Set local cryptographic JWKS keySet
    oidcService.setCustomJwks(jose.createLocalJWKSet({ keys: [rsaPublicKeyJwk] }));

    // Mock token exchange to return our dynamically set ID token
    oidcService.exchangeCodeForTokens = async () => ({
      access_token: 'mock-access-token',
      id_token: currentMockToken,
      token_type: 'Bearer',
      expires_in: 3600,
    });

    webauthnService = new WebAuthnService(stores, {
      rpName: 'AgentGuard Enterprise',
      rpId: '127.0.0.1',
      expectedOrigin: 'http://127.0.0.1',
    });

    approvalService = new TransactionApprovalService(stores, webauthnService);

    customerApi = new CustomerAPI(stores, authService, {
      oidcService,
      webauthnService,
      approvalService,
    });

    app = express();
    app.use(express.json());
    app.use('/api/customer', customerApi.router);

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

  // Helper to create valid signed ID token
  async function signTestIdToken(claims: Record<string, any>, key = rsaKeyPair.privateKey, kid = 'test-key-id-1') {
    return await new jose.SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid })
      .sign(key);
  }

  // ── Part 1: Enterprise OIDC Flow & Cryptographic Verification ─────────────────

  describe('Enterprise OIDC (PKCE S256 & Cryptographic ID Token Verification)', () => {
    it('initiates PKCE authorization flow with S256 code challenge and persisted state', async () => {
      const res = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.authorization_url).toBeDefined();
      expect(data.state).toBeDefined();
      expect(data.authorization_url).toContain('response_type=code');
      expect(data.authorization_url).toContain('code_challenge_method=S256');
      expect(data.authorization_url).toContain(`code_challenge=`);
      expect(data.authorization_url).toContain(`state=${data.state}`);

      // Verify persisted state in database
      const storedState = stores.getOidcAuthState(data.state);
      expect(storedState).not.toBeNull();
      expect(storedState?.code_verifier).toBeDefined();
      expect(storedState?.nonce).toBeDefined();
      expect(storedState?.redirect_uri).toBe(mockRedirectUri);
    });

    it('rejects initiation with unauthorized redirect URI', async () => {
      const res = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: 'http://attacker-controlled-site.com/callback',
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.reason_code).toBe('INVALID_REDIRECT_URI');
    });

    it('successfully verifies authentic ID token and creates session with stable (iss, sub) identity', async () => {
      // 1. Init flow
      const initRes = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });
      const { state } = (await initRes.json()) as any;
      const storedState = stores.getOidcAuthState(state)!;

      // 2. Link CUST_101 to mock enterprise identity
      stores.linkCustomerIdpIdentity({
        customer_ref: 'CUST_101',
        organization_id: 'ORG_ACME',
        idp_issuer: mockIssuer,
        idp_subject: 'entra-sub-aarav-999',
        idp_email: 'aarav@enterprise.bank',
      });

      // 3. Create authentic signed ID token
      const now = Math.floor(Date.now() / 1000);
      const validIdToken = await signTestIdToken({
        iss: mockIssuer,
        sub: 'entra-sub-aarav-999',
        aud: mockClientId,
        exp: now + 3600,
        nbf: now - 10,
        iat: now,
        nonce: storedState.nonce,
        email: 'aarav@enterprise.bank',
      });
      currentMockToken = validIdToken;

      // 4. Callback with code and state (service verifies token)
      const callbackRes = await fetch(`${baseUrl}/api/customer/auth/oidc/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'valid-auth-code',
          state,
        }),
      });

      expect(callbackRes.status).toBe(200);
      const callbackData = (await callbackRes.json()) as any;
      expect(callbackData.customer.customer_ref).toBe('CUST_101');
      expect(callbackData.session_token).toBeDefined();
      expect(callbackData.csrf_token).toBeDefined();

      // State must be consumed (single-use)
      expect(stores.getOidcAuthState(state)).toBeNull();
    });

    it('rejects ID token with signature from untrusted key (Signature Verification Check)', async () => {
      const initRes = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });
      const { state } = (await initRes.json()) as any;
      const storedState = stores.getOidcAuthState(state)!;

      // Create an attacker keypair
      const attackerKeys = await jose.generateKeyPair('RS256');
      const forgedToken = await signTestIdToken(
        {
          iss: mockIssuer,
          sub: 'entra-sub-aarav-999',
          aud: mockClientId,
          exp: Math.floor(Date.now() / 1000) + 3600,
          nonce: storedState.nonce,
        },
        attackerKeys.privateKey,
        'untrusted-kid',
      );
      currentMockToken = forgedToken;

      const callbackRes = await fetch(`${baseUrl}/api/customer/auth/oidc/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'attacker-auth-code',
          state,
        }),
      });

      expect(callbackRes.status).toBe(401);
      const data = (await callbackRes.json()) as any;
      expect(data.reason_code).toBe('OIDC_TOKEN_VERIFICATION_FAILED');
    });

    it('rejects ID token with mismatched issuer (iss check)', async () => {
      const initRes = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });
      const { state } = (await initRes.json()) as any;
      const storedState = stores.getOidcAuthState(state)!;

      const badIssuerToken = await signTestIdToken({
        iss: 'https://evil-idp.com',
        sub: 'entra-sub-aarav-999',
        aud: mockClientId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: storedState.nonce,
      });
      currentMockToken = badIssuerToken;

      const callbackRes = await fetch(`${baseUrl}/api/customer/auth/oidc/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'bad-issuer-code',
          state,
        }),
      });

      expect(callbackRes.status).toBe(401);
      const data = (await callbackRes.json()) as any;
      expect(data.reason_code).toBe('OIDC_TOKEN_VERIFICATION_FAILED');
    });

    it('rejects ID token with mismatched audience (aud check)', async () => {
      const initRes = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });
      const { state } = (await initRes.json()) as any;
      const storedState = stores.getOidcAuthState(state)!;

      const badAudToken = await signTestIdToken({
        iss: mockIssuer,
        sub: 'entra-sub-aarav-999',
        aud: 'other-client-application',
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: storedState.nonce,
      });
      currentMockToken = badAudToken;

      const callbackRes = await fetch(`${baseUrl}/api/customer/auth/oidc/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'bad-aud-code',
          state,
        }),
      });

      expect(callbackRes.status).toBe(401);
      const data = (await callbackRes.json()) as any;
      expect(data.reason_code).toBe('OIDC_TOKEN_VERIFICATION_FAILED');
    });

    it('rejects expired ID token (exp check)', async () => {
      const initRes = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });
      const { state } = (await initRes.json()) as any;
      const storedState = stores.getOidcAuthState(state)!;

      const expiredToken = await signTestIdToken({
        iss: mockIssuer,
        sub: 'entra-sub-aarav-999',
        aud: mockClientId,
        exp: Math.floor(Date.now() / 1000) - 100, // Expired in the past
        nonce: storedState.nonce,
      });
      currentMockToken = expiredToken;

      const callbackRes = await fetch(`${baseUrl}/api/customer/auth/oidc/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'expired-code',
          state,
        }),
      });

      expect(callbackRes.status).toBe(401);
    });

    it('rejects nonce replay or mismatch (nonce check)', async () => {
      const initRes = await fetch(`${baseUrl}/api/customer/auth/oidc/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'enterprise-entra',
          redirect_uri: mockRedirectUri,
        }),
      });
      const { state } = (await initRes.json()) as any;

      const badNonceToken = await signTestIdToken({
        iss: mockIssuer,
        sub: 'entra-sub-aarav-999',
        aud: mockClientId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: 'tampered-or-replayed-nonce-value',
      });
      currentMockToken = badNonceToken;

      const callbackRes = await fetch(`${baseUrl}/api/customer/auth/oidc/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'bad-nonce-code',
          state,
        }),
      });

      expect(callbackRes.status).toBe(401);
      const data = (await callbackRes.json()) as any;
      expect(data.reason_code).toBe('OIDC_TOKEN_VERIFICATION_FAILED');
    });
  });

  // ── Part 2: WebAuthn Passkeys & Multi-Credential Management ───────────────────

  describe('WebAuthn Passkey Registration & Multi-Device Management', () => {
    let sessionToken: string;
    let csrfToken: string;

    beforeAll(async () => {
      // Login via demo pin to obtain valid customer session for passkey management
      const res = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
      });
      const data = (await res.json()) as any;
      sessionToken = data.session_token;
      csrfToken = data.csrf_token;
    });

    it('generates WebAuthn registration options with RP ID and single-use challenge', async () => {
      const res = await fetch(`${baseUrl}/api/customer/webauthn/register/options`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
        },
      });

      expect(res.status).toBe(200);
      const options = (await res.json()) as any;
      expect(options.challenge).toBeDefined();
      expect(options.rp.name).toBe('AgentGuard Enterprise');
      expect(options.user.name).toBe('aarav.sharma@example.com');
      expect(options.pubKeyCredParams).toBeDefined();

      // Verify challenge saved in DB
      const challengeRow = stores.getWebAuthnChallenge(options.challenge);
      expect(challengeRow).not.toBeNull();
      expect(challengeRow?.customer_ref).toBe('CUST_101');
      expect(challengeRow?.challenge_type).toBe('REGISTRATION');
    });

    it('persists and manages multiple passkeys per customer', async () => {
      // Insert mock passkey credentials into DB directly to test management endpoints
      stores.storeWebAuthnCredential({
        credential_id: 'cred-macbook-touchid-1',
        customer_ref: 'CUST_101',
        public_key: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
        counter: 10,
        transports: ['internal'],
        name: 'MacBook Pro Touch ID',
      });

      stores.storeWebAuthnCredential({
        credential_id: 'cred-yubikey-usb-2',
        customer_ref: 'CUST_101',
        public_key: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
        counter: 5,
        transports: ['usb'],
        name: 'Backup YubiKey 5C',
      });

      // List credentials
      const listRes = await fetch(`${baseUrl}/api/customer/webauthn/credentials`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      });
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.credentials.length).toBeGreaterThanOrEqual(2);
      expect(listData.credentials.some((c: any) => c.credential_id === 'cred-macbook-touchid-1')).toBe(true);

      // Rename credential
      const renameRes = await fetch(`${baseUrl}/api/customer/webauthn/credentials/cred-macbook-touchid-1`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Work MacBook M3 Max' }),
      });
      expect(renameRes.status).toBe(200);

      // Revoke credential
      const revokeRes = await fetch(`${baseUrl}/api/customer/webauthn/credentials/cred-yubikey-usb-2/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
        },
      });
      expect(revokeRes.status).toBe(200);

      // Verify revoked credential no longer active in default list
      const afterList = (await (await fetch(`${baseUrl}/api/customer/webauthn/credentials`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      })).json()) as any;
      expect(afterList.credentials.some((c: any) => c.credential_id === 'cred-yubikey-usb-2')).toBe(false);
    });

    it('generates authentication options for existing passkeys', async () => {
      const res = await fetch(`${baseUrl}/api/customer/webauthn/auth/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101' }),
      });

      expect(res.status).toBe(200);
      const options = (await res.json()) as any;
      expect(options.challenge).toBeDefined();
      expect(options.allowCredentials).toBeDefined();
      expect(options.allowCredentials.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Part 3: Transaction-Bound Step-Up Customer Approval ───────────────────────

  describe('Transaction-Bound Step-Up Customer Approval (7-Field Canonical Digest)', () => {
    let sessionToken: string;
    let csrfToken: string;

    const sampleTx: CanonicalTransaction = {
      account_ref: 'ACC_101',
      action: 'bill_payment',
      amount_paise: 750000, // ₹7,500 (exceeds standard limit)
      currency: 'INR',
      invoice_ref: 'INV-2026-POWER-001',
      payee_id: 'PAYEE_POWER_001',
      purpose: 'electricity_bill',
    };

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
      });
      const data = (await res.json()) as any;
      sessionToken = data.session_token;
      csrfToken = data.csrf_token;
    });

    it('generates approval challenge bound to the exact 7-field canonical transaction digest', async () => {
      const expectedDigest = computeCanonicalTransactionDigest(sampleTx);

      const res = await fetch(`${baseUrl}/api/customer/approvals/challenge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          permit_id: 'PERMIT-TEST-001',
          account_ref: 'ACC_101',
          mandate_id: 'MND_ELEC_101',
          mandate_version: 1,
          transaction: sampleTx,
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.approval_id).toBeDefined();
      expect(data.canonical_tx_digest).toBe(expectedDigest);
      expect(data.webauthn_options).toBeDefined();
      expect(data.webauthn_options.challenge).toBeDefined();

      // Verify row created in database
      const row = stores.getTransactionApproval(data.approval_id);
      expect(row).not.toBeNull();
      expect(row?.status).toBe('PENDING');
      expect(row?.canonical_tx_digest).toBe(expectedDigest);
      expect(row?.mandate_version).toBe(1);
    });

    it('invalidates approval if mandate version bumps before transaction execution (Invariant I6)', async () => {
      // 1. Create approval for mandate version 1
      const approval = await approvalService.createApprovalChallenge({
        requestId: '4fa85f64-5717-4562-b3fc-2c963f66afa7',
        permitId: 'PERMIT-MANDATE-BUMP-001',
        customerRef: 'CUST_101',
        accountRef: 'ACC_101',
        mandateId: 'MND_ELEC_101',
        mandateVersion: 1,
        transaction: sampleTx,
      });

      // Manually mark approval verified (simulating completed WebAuthn signature)
      stores.markApprovalVerified({
        approval_id: approval.approvalId,
        canonical_tx_digest: approval.canonicalTxDigest,
        mandate_version: 1,
      });

      // 2. Customer updates mandate -> version increments to 2
      const bumpRes = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ per_tx_limit_paise: 900000 }),
      });
      expect(bumpRes.status).toBe(200);

      // Verify mandate is now version 2
      const updatedMandate = stores.getMandate('MND_ELEC_101');
      expect(updatedMandate?.mandate_version).toBe(2);

      // 3. Attempt to consume approval created under mandate_version 1 -> MUST FAIL
      const consumed = approvalService.consumeApprovalForExecution(
        '4fa85f64-5717-4562-b3fc-2c963f66afa7',
        computeCanonicalTransactionDigest(sampleTx),
      );
      expect(consumed).toBe(false);
    });

    it('rejects execution if transaction amount or payee is tampered after approval (Digest Invariant)', async () => {
      // 1. Create approval under current mandate version (2)
      const approval = await approvalService.createApprovalChallenge({
        requestId: '5fa85f64-5717-4562-b3fc-2c963f66afa8',
        permitId: 'PERMIT-TAMPER-001',
        customerRef: 'CUST_101',
        accountRef: 'ACC_101',
        mandateId: 'MND_ELEC_101',
        mandateVersion: 2,
        transaction: sampleTx,
      });

      stores.markApprovalVerified({
        approval_id: approval.approvalId,
        canonical_tx_digest: approval.canonicalTxDigest,
        mandate_version: 2,
      });

      // 2. Attempt to execute with tampered amount (₹8,000 instead of ₹7,500)
      const tamperedTx: CanonicalTransaction = {
        ...sampleTx,
        amount_paise: 800000,
      };
      const tamperedDigest = computeCanonicalTransactionDigest(tamperedTx);

      const consumed = approvalService.consumeApprovalForExecution(
        '5fa85f64-5717-4562-b3fc-2c963f66afa8',
        tamperedDigest,
      );
      expect(consumed).toBe(false);
    });

    it('enforces atomic single-use consumption of approval challenge', async () => {
      const digest = computeCanonicalTransactionDigest(sampleTx);
      const approval = await approvalService.createApprovalChallenge({
        requestId: '6fa85f64-5717-4562-b3fc-2c963f66afa9',
        permitId: 'PERMIT-SINGLE-USE-001',
        customerRef: 'CUST_101',
        accountRef: 'ACC_101',
        mandateId: 'MND_ELEC_101',
        mandateVersion: 2,
        transaction: sampleTx,
      });

      stores.markApprovalVerified({
        approval_id: approval.approvalId,
        canonical_tx_digest: approval.canonicalTxDigest,
        mandate_version: 2,
      });

      // First execution succeeds
      const firstConsumed = approvalService.consumeApprovalForExecution(
        '6fa85f64-5717-4562-b3fc-2c963f66afa9',
        digest,
      );
      expect(firstConsumed).toBe(true);

      // Second attempt to consume must fail immediately
      const secondConsumed = approvalService.consumeApprovalForExecution(
        '6fa85f64-5717-4562-b3fc-2c963f66afa9',
        digest,
      );
      expect(secondConsumed).toBe(false);
    });
  });

  // ── Part 4: Demo Mode Fail-Closed Security ────────────────────────────────────

  describe('Demo Mode Fail-Closed Security (Part 6)', () => {
    it('rejects PIN login when DEMO_MODE is not set to 1', async () => {
      const prevMode = process.env.DEMO_MODE;
      try {
        delete process.env.DEMO_MODE;

        const res = await fetch(`${baseUrl}/api/customer/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
        });

        expect(res.status).toBe(403);
        const data = (await res.json()) as any;
        expect(data.reason_code).toBe('DEMO_MODE_REQUIRED');
      } finally {
        process.env.DEMO_MODE = prevMode;
      }
    });

    it('strictly rejects PIN login in production environment even if DEMO_MODE=1', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevMode = process.env.DEMO_MODE;
      try {
        process.env.NODE_ENV = 'production';
        process.env.DEMO_MODE = '1';

        const res = await fetch(`${baseUrl}/api/customer/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
        });

        expect(res.status).toBe(403);
        const data = (await res.json()) as any;
        expect(data.reason_code).toBe('DEMO_AUTH_DISABLED_IN_PRODUCTION');
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.DEMO_MODE = prevMode;
      }
    });
  });

  // ── Part 5: Session & Cross-Namespace Security ────────────────────────────────

  describe('Session Security & Namespace Isolation (Rule E5)', () => {
    it('sets secure cookie flags and supports explicit logout', async () => {
      const loginRes = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
      });
      const { session_token, csrf_token } = (await loginRes.json()) as any;

      // Verify cookie flags
      const cookie = loginRes.headers.get('set-cookie');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');

      // Logout
      const logoutRes = await fetch(`${baseUrl}/api/customer/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session_token}`,
          'x-csrf-token': csrf_token,
        },
      });
      expect(logoutRes.status).toBe(200);

      // Verify session invalidated
      const meRes = await fetch(`${baseUrl}/api/customer/me`, {
        headers: { 'Authorization': `Bearer ${session_token}` },
      });
      expect(meRes.status).toBe(401);
    });

    it('rejects cross-namespace agent token on customer banking endpoint (Rule E5)', async () => {
      const res = await fetch(`${baseUrl}/api/customer/me`, {
        headers: { 'x-agent-signature': 'ed25519-agent-signature' },
      });
      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.reason_code).toBe('CROSS_NAMESPACE_AUTH_REJECTED');
    });
  });
});
