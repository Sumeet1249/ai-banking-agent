/**
 * Customer REST API Handler
 *
 * Implements Phase 2.1 & Phase 7.1:
 *   - POST /api/customer/login: Demo PIN login (STRICTLY restricted to DEMO_MODE=1, fails in production)
 *   - POST /api/customer/logout: Revokes session token and clears cookie
 *   - GET  /api/customer/me: Returns authenticated customer profile
 *   - GET  /api/customer/accounts: Lists customer's financial accounts and balances (integer paise)
 *   - GET  /api/customer/mandates: Lists customer's active and historical mandates
 *   - POST /api/customer/mandates: Creates a new customer mandate
 *   - PATCH /api/customer/mandates/:id: Bumps mandate version and updates limits/payees
 *   - POST /api/customer/mandates/:id/revoke: Revokes a mandate
 *   - POST /api/customer/mandates/:id/suspend: Temporarily suspends a mandate
 *   - POST /api/customer/mandates/:id/reactivate: Reactivates a suspended mandate
 *
 * Phase 7.1 Enterprise Identity Endpoints:
 *   - POST /api/customer/auth/oidc/init: Initiates PKCE (S256) OIDC authorization flow
 *   - POST /api/customer/auth/oidc/callback: Verifies ID token signature and establishes session
 *   - POST /api/customer/webauthn/register/options: Generates WebAuthn passkey registration challenge
 *   - POST /api/customer/webauthn/register/verify: Verifies passkey registration and persists credential
 *   - POST /api/customer/webauthn/auth/options: Generates WebAuthn authentication challenge
 *   - POST /api/customer/webauthn/auth/verify: Verifies passkey assertion and logs customer in
 *   - GET  /api/customer/webauthn/credentials: Lists registered passkeys
 *   - POST /api/customer/webauthn/credentials/:id/revoke: Revokes a passkey
 *   - PATCH /api/customer/webauthn/credentials/:id: Renames a passkey
 *   - POST /api/customer/approvals/challenge: Creates transaction-bound WebAuthn approval challenge
 *   - POST /api/customer/approvals/:id/verify: Cryptographically verifies assertion and approves transaction
 *   - GET  /api/customer/approvals/:id: Inspects transaction approval status
 */

import { Router, Request, Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  CustomerMandateSchema,
  OidcLoginInitRequestSchema,
  OidcCallbackRequestSchema,
  WebAuthnRegistrationVerifyRequestSchema,
  WebAuthnAuthenticationVerifyRequestSchema,
  TransactionApprovalChallengeRequestSchema,
  TransactionApprovalVerifyRequestSchema,
} from '@agentguard/core-schema';
import { BankingStores } from '../db/banking-stores';
import { CustomerAuthService, AuthenticatedCustomerRequest } from '../services/customer-auth';
import { EnterpriseOidcService } from '../services/enterprise-oidc-service';
import { WebAuthnService } from '../services/webauthn-service';
import { TransactionApprovalService } from '../services/transaction-approval-service';
import { tenantContextMiddleware } from '../middleware/tenant-context';

const LoginSchema = z.object({
  customer_ref: z.string().min(1),
  pin: z.string().min(1),
});

const UpdateMandateSchema = z.object({
  per_tx_limit_paise: z.number().int().positive().optional(),
  daily_limit_paise: z.number().int().positive().optional(),
  allowed_payees: z.array(z.string().min(1)).min(1).optional(),
  expires_at: z.number().int().positive().optional(),
});

export interface CustomerApiOptions {
  oidcService?: EnterpriseOidcService;
  webauthnService?: WebAuthnService;
  approvalService?: TransactionApprovalService;
  logger?: Logger;
}

export class CustomerAPI {
  public router: Router;
  private oidcService?: EnterpriseOidcService;
  private webauthnService?: WebAuthnService;
  private approvalService?: TransactionApprovalService;
  private logger?: Logger;

  constructor(
    private stores: BankingStores,
    private auth: CustomerAuthService,
    optionsOrLogger?: CustomerApiOptions | Logger,
    logger?: Logger,
  ) {
    this.router = Router();

    if (optionsOrLogger && typeof (optionsOrLogger as any).info === 'function') {
      this.logger = optionsOrLogger as Logger;
    } else if (optionsOrLogger && typeof optionsOrLogger === 'object') {
      const opts = optionsOrLogger as CustomerApiOptions;
      this.oidcService = opts.oidcService;
      this.webauthnService = opts.webauthnService;
      this.approvalService = opts.approvalService;
      this.logger = opts.logger ?? logger;
    } else {
      this.logger = logger;
    }

    this.registerRoutes();
  }

  private establishSession(res: Response, customerRef: string, req: Request): any {
    const userAgent = req.headers['user-agent'] as string | undefined;
    const ipAddress = req.ip || (req.socket?.remoteAddress as string | undefined);
    const tenant = req.orgId;
    const sessionResult = this.stores.createCustomerSession(customerRef, {
      userAgent,
      ipAddress,
      ttlHours: 12,
      orgId: tenant,
    });

    const customer = this.stores.getCustomer(customerRef, tenant);

    // Set HttpOnly cookie for session token
    res.cookie('session_token', sessionResult.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 3600 * 1000,
      path: '/',
    });

    return {
      message: 'Authentication successful',
      customer: {
        customer_ref: customer?.customer_ref,
        name: customer?.name,
        email: customer?.email,
        phone: customer?.phone,
      },
      session_token: sessionResult.session_token,
      csrf_token: sessionResult.csrf_token,
      expires_at: sessionResult.session.expires_at,
      tenant_id: tenant,
    };
  }

  private registerRoutes(): void {
    // Phase 7.2: Tenant Context Resolution & Boundary Enforcement
    this.router.use(tenantContextMiddleware(this.logger));

    this.router.get('/tenant/info', (req: Request, res: Response) => {
      res.json({
        tenant_id: req.orgId,
        timestamp: Date.now(),
      });
    });

    // ── Public Authentication Endpoints ────────────────────────────────────────

    // PIN Login (Restricted strictly to non-production with DEMO_MODE=1)
    this.router.post('/login', (req: Request, res: Response) => {
      const isProduction = process.env.NODE_ENV === 'production';
      const isExplicitDemo = process.env.DEMO_MODE === '1';

      if (isProduction) {
        this.logger?.warn('PIN-based login rejected in production');
        res.status(403).json({
          error: 'PIN login is disabled in production. Use enterprise OIDC or WebAuthn.',
          reason_code: 'DEMO_AUTH_DISABLED_IN_PRODUCTION',
        });
        return;
      }

      if (!isExplicitDemo) {
        this.logger?.warn('PIN-based login rejected: DEMO_MODE=1 required');
        res.status(403).json({
          error: 'PIN-based login is only permitted when DEMO_MODE=1 is set in non-production environments.',
          reason_code: 'DEMO_MODE_REQUIRED',
        });
        return;
      }

      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid login request',
          details: parsed.error.issues,
        });
        return;
      }

      const { customer_ref, pin } = parsed.data;
      const valid = this.stores.verifyCustomerPin(customer_ref, pin, req.orgId);
      if (!valid) {
        this.logger?.warn({ customer_ref, tenant_id: req.orgId }, 'Customer login failed: invalid credentials');
        res.status(401).json({
          error: 'Invalid customer_ref or PIN',
          reason_code: 'INVALID_CREDENTIALS',
        });
        return;
      }

      const sessionResponse = this.establishSession(res, customer_ref, req);
      res.status(200).json(sessionResponse);
    });

    // ── Phase 7.1: Enterprise OIDC Endpoints ───────────────────────────────────

    this.router.post('/auth/oidc/init', async (req: Request, res: Response) => {
      if (!this.oidcService) {
        res.status(501).json({ error: 'OIDC service not configured', reason_code: 'OIDC_NOT_CONFIGURED' });
        return;
      }

      const parsed = OidcLoginInitRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Malformed OIDC init request', details: parsed.error.issues });
        return;
      }

      try {
        const result = await this.oidcService.initiateLogin(parsed.data.redirect_uri);
        res.status(200).json({
          authorization_url: result.authorizationUrl,
          state: result.state,
          expires_at: result.expiresAt,
        });
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'OIDC init failed');
        res.status(400).json({ error: err.message, reason_code: err.message || 'OIDC_INIT_FAILED' });
      }
    });

    this.router.post('/auth/oidc/callback', async (req: Request, res: Response) => {
      if (!this.oidcService) {
        res.status(501).json({ error: 'OIDC service not configured', reason_code: 'OIDC_NOT_CONFIGURED' });
        return;
      }

      const parsed = OidcCallbackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Malformed OIDC callback request', details: parsed.error.issues });
        return;
      }

      try {
        const result = await this.oidcService.handleCallback(parsed.data.code, parsed.data.state);
        const sessionResponse = this.establishSession(res, result.identity.customer_ref, req);
        res.status(200).json({
          ...sessionResponse,
          idp: {
            issuer: result.identity.idp_issuer,
            email: result.identity.idp_email,
            organization_id: result.identity.organization_id,
          },
        });
      } catch (err: any) {
        this.logger?.error({ err: err.message }, 'OIDC callback exchange failed');
        const reason_code = err.message?.includes('ID_TOKEN_')
          ? 'OIDC_TOKEN_VERIFICATION_FAILED'
          : 'OIDC_CALLBACK_FAILED';
        res.status(401).json({ error: err.message, reason_code });
      }
    });

    // ── Phase 7.1: Public WebAuthn Authentication ──────────────────────────────

    this.router.post('/webauthn/auth/options', async (req: Request, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured', reason_code: 'WEBAUTHN_NOT_CONFIGURED' });
        return;
      }

      const customerRef = req.body?.customer_ref as string | undefined;
      if (!customerRef) {
        res.status(400).json({ error: 'customer_ref is required to generate authentication options' });
        return;
      }

      try {
        const options = await this.webauthnService.generateAuthenticationOptions(customerRef);
        res.status(200).json(options);
      } catch (err: any) {
        res.status(400).json({ error: err.message, reason_code: 'WEBAUTHN_OPTIONS_FAILED' });
      }
    });

    this.router.post('/webauthn/auth/verify', async (req: Request, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured', reason_code: 'WEBAUTHN_NOT_CONFIGURED' });
        return;
      }

      const customerRef = req.body?.customer_ref as string | undefined;
      const parsed = WebAuthnAuthenticationVerifyRequestSchema.safeParse(req.body);
      if (!customerRef || !parsed.success) {
        res.status(400).json({ error: 'customer_ref and valid verification payload required' });
        return;
      }

      try {
        const result = await this.webauthnService.verifyAuthentication(
          customerRef,
          parsed.data.challenge,
          parsed.data.response as any,
        );

        const sessionResponse = this.establishSession(res, customerRef, req);
        res.status(200).json({
          ...sessionResponse,
          webauthn_verified: true,
          credential_id: result.credentialId,
        });
      } catch (err: any) {
        this.logger?.warn({ err: err.message }, 'WebAuthn authentication verification failed');
        res.status(401).json({ error: err.message, reason_code: 'WEBAUTHN_VERIFICATION_FAILED' });
      }
    });

    // Logout
    this.router.post('/logout', (req: Request, res: Response) => {
      const token = this.auth.extractSessionToken(req);
      if (token) {
        this.stores.revokeCustomerSession(token);
      }
      res.clearCookie('session_token', { path: '/' });
      res.status(200).json({ message: 'Logged out successfully' });
    });

    // ── Protected Customer Endpoints ───────────────────────────────────────────

    this.router.use(this.auth.requireCustomerAuth);

    this.router.get('/me', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      res.status(200).json({
        customer_ref: cust.customer_ref,
        name: cust.name,
        email: cust.email,
        phone: cust.phone,
        status: cust.status,
      });
    });

    this.router.get('/accounts', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const accounts = this.stores.listAccountsByCustomer(cust.customer_ref);
      res.status(200).json({
        customer_ref: cust.customer_ref,
        accounts: accounts.map((a) => ({
          account_ref: a.account_ref,
          balance_paise: a.balance_paise,
          currency: a.currency,
          status: a.status,
        })),
      });
    });

    // ── Phase 7.1: Protected WebAuthn Passkey Management ──────────────────────

    this.router.post('/webauthn/register/options', async (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured' });
        return;
      }
      try {
        const options = await this.webauthnService.generateRegistrationOptions(req.customer!.customer_ref);
        res.status(200).json(options);
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    });

    this.router.post('/webauthn/register/verify', async (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured' });
        return;
      }
      const parsed = WebAuthnRegistrationVerifyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid registration response payload', details: parsed.error.issues });
        return;
      }
      try {
        const cred = await this.webauthnService.verifyRegistration(
          req.customer!.customer_ref,
          parsed.data.challenge,
          parsed.data.response as any,
          parsed.data.name,
        );
        res.status(201).json({
          message: 'Passkey registered successfully',
          credential_id: cred.credential_id,
          name: cred.name,
          created_at: cred.created_at,
        });
      } catch (err: any) {
        res.status(400).json({ error: err.message, reason_code: 'REGISTRATION_VERIFICATION_FAILED' });
      }
    });

    this.router.get('/webauthn/credentials', (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured' });
        return;
      }
      const creds = this.webauthnService.listCredentials(req.customer!.customer_ref);
      res.status(200).json({
        customer_ref: req.customer!.customer_ref,
        credentials: creds.map((c) => ({
          credential_id: c.credential_id,
          name: c.name,
          created_at: c.created_at,
          last_used_at: c.last_used_at,
        })),
      });
    });

    this.router.post('/webauthn/credentials/:id/revoke', (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured' });
        return;
      }
      const success = this.webauthnService.revokeCredential(req.params.id, req.customer!.customer_ref);
      if (!success) {
        res.status(404).json({ error: 'Passkey credential not found or already revoked' });
        return;
      }
      res.status(200).json({ message: 'Passkey revoked successfully', credential_id: req.params.id });
    });

    this.router.patch('/webauthn/credentials/:id', (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.webauthnService) {
        res.status(501).json({ error: 'WebAuthn service not configured' });
        return;
      }
      const name = req.body?.name as string | undefined;
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const success = this.webauthnService.renameCredential(req.params.id, req.customer!.customer_ref, name);
      if (!success) {
        res.status(404).json({ error: 'Passkey credential not found' });
        return;
      }
      res.status(200).json({ message: 'Passkey renamed successfully', credential_id: req.params.id, name });
    });

    // ── Phase 7.1: Transaction-Bound Step-Up Customer Approval ─────────────────

    this.router.post('/approvals/challenge', async (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.approvalService) {
        res.status(501).json({ error: 'Transaction approval service not configured' });
        return;
      }

      const parsed = TransactionApprovalChallengeRequestSchema.safeParse({
        ...req.body,
        customer_ref: req.customer!.customer_ref,
      });
      if (!parsed.success) {
        res.status(400).json({ error: 'Malformed approval challenge request', details: parsed.error.issues });
        return;
      }

      try {
        const result = await this.approvalService.createApprovalChallenge({
          requestId: parsed.data.request_id,
          permitId: parsed.data.permit_id,
          customerRef: req.customer!.customer_ref,
          accountRef: parsed.data.account_ref,
          mandateId: parsed.data.mandate_id,
          mandateVersion: parsed.data.mandate_version,
          transaction: parsed.data.transaction,
          ttlSeconds: parsed.data.ttl_seconds,
        });

        res.status(201).json({
          approval_id: result.approvalId,
          request_id: result.requestId,
          canonical_tx_digest: result.canonicalTxDigest,
          webauthn_options: result.webauthnOptions,
          expires_at: result.expiresAt,
        });
      } catch (err: any) {
        this.logger?.warn({ err: err.message }, 'Failed to create transaction approval challenge');
        res.status(400).json({ error: err.message, reason_code: 'APPROVAL_CHALLENGE_FAILED' });
      }
    });

    this.router.post('/approvals/:approvalId/verify', async (req: AuthenticatedCustomerRequest, res: Response) => {
      if (!this.approvalService) {
        res.status(501).json({ error: 'Transaction approval service not configured' });
        return;
      }

      const parsed = TransactionApprovalVerifyRequestSchema.safeParse({
        approval_id: req.params.approvalId,
        response: req.body?.response,
      });

      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid approval verification request', details: parsed.error.issues });
        return;
      }

      try {
        const result = await this.approvalService.verifyAndApprove(
          req.params.approvalId,
          parsed.data.response,
        );

        res.status(200).json({
          approval_id: result.approval.approval_id,
          request_id: result.approval.request_id,
          status: result.approval.status,
          canonical_tx_digest: result.approval.canonical_tx_digest,
          mandate_version: result.approval.mandate_version,
          verified_at: result.approval.verified_at,
        });
      } catch (err: any) {
        this.logger?.warn({ err: err.message }, 'Approval verification failed');
        res.status(400).json({ error: err.message, reason_code: 'APPROVAL_VERIFICATION_FAILED' });
      }
    });

    this.router.get('/approvals/:approvalId', (req: AuthenticatedCustomerRequest, res: Response) => {
      const approval = this.stores.getTransactionApproval(req.params.approvalId);
      if (!approval || approval.customer_ref !== req.customer!.customer_ref) {
        res.status(404).json({ error: 'Approval record not found' });
        return;
      }
      res.status(200).json(approval);
    });

    // ── Mandate Lifecycle Endpoints ────────────────────────────────────────────

    this.router.get('/mandates', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const mandates = this.stores.listMandatesByCustomer(cust.customer_ref);
      res.status(200).json({
        customer_ref: cust.customer_ref,
        mandates,
      });
    });

    this.router.post('/mandates', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const now = Date.now();
      const candidate = {
        mandate_version: 1,
        status: 'ACTIVE',
        created_at: now,
        updated_at: now,
        ...req.body,
        customer_ref: cust.customer_ref,
      };

      const parsed = CustomerMandateSchema.safeParse(candidate);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid mandate payload',
          details: parsed.error.issues,
        });
        return;
      }

      // Verify account belongs to customer
      const account = this.stores.getAccount(parsed.data.account_ref);
      if (!account || account.customer_ref !== cust.customer_ref) {
        res.status(400).json({
          error: 'Account does not belong to authenticated customer',
          account_ref: parsed.data.account_ref,
        });
        return;
      }

      try {
        const created = this.stores.createMandate(parsed.data);
        res.status(201).json({
          message: 'Mandate created successfully',
          mandate: created,
        });
      } catch (err: any) {
        res.status(409).json({
          error: 'Failed to create mandate (possible duplicate mandate_id)',
          message: err.message,
        });
      }
    });

    this.router.patch('/mandates/:mandateId', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const mandateId = req.params.mandateId;

      const parsed = UpdateMandateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid update payload',
          details: parsed.error.issues,
        });
        return;
      }

      const updated = this.stores.updateMandate(mandateId, cust.customer_ref, parsed.data);
      if (!updated) {
        res.status(404).json({
          error: 'Mandate not found or cannot be updated (may be inactive/revoked)',
          mandate_id: mandateId,
        });
        return;
      }

      res.status(200).json({
        message: 'Mandate updated successfully (version incremented)',
        mandate: updated,
      });
    });

    this.router.post('/mandates/:mandateId/revoke', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const mandateId = req.params.mandateId;

      const success = this.stores.revokeMandate(mandateId, cust.customer_ref);
      if (!success) {
        res.status(404).json({
          error: 'Mandate not found or already revoked',
          mandate_id: mandateId,
        });
        return;
      }

      res.status(200).json({
        message: 'Mandate revoked successfully',
        mandate_id: mandateId,
        status: 'REVOKED',
      });
    });

    this.router.post('/mandates/:mandateId/suspend', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const mandateId = req.params.mandateId;

      const success = this.stores.suspendMandate(mandateId, cust.customer_ref);
      if (!success) {
        res.status(404).json({
          error: 'Mandate not found or not in ACTIVE state',
          mandate_id: mandateId,
        });
        return;
      }

      res.status(200).json({
        message: 'Mandate suspended successfully',
        mandate_id: mandateId,
        status: 'SUSPENDED',
      });
    });

    this.router.post('/mandates/:mandateId/reactivate', (req: AuthenticatedCustomerRequest, res: Response) => {
      const cust = req.customer!;
      const mandateId = req.params.mandateId;

      const success = this.stores.reactivateMandate(mandateId, cust.customer_ref);
      if (!success) {
        res.status(404).json({
          error: 'Mandate not found or not in SUSPENDED state',
          mandate_id: mandateId,
        });
        return;
      }

      res.status(200).json({
        message: 'Mandate reactivated successfully',
        mandate_id: mandateId,
        status: 'ACTIVE',
      });
    });
  }
}
