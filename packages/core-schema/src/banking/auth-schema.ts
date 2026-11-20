/**
 * Enterprise Authentication & WebAuthn Zod Schemas
 *
 * Implements Phase 7.1:
 *   - Provider-neutral OIDC configuration & token schemas
 *   - Customer Identity Mapping ((iss, sub) tuple)
 *   - WebAuthn / Passkey registration & authentication schemas
 *   - Transaction-Bound Step-Up Customer Approval schemas
 */

import { z } from 'zod';
import { CanonicalTransactionSchema } from './transaction';

// ── OIDC Identity Schemas ─────────────────────────────────────────────────────

export const OidcProviderConfigSchema = z.object({
  provider_id: z.string().min(1),
  issuer: z.string().url(),
  client_id: z.string().min(1),
  client_secret: z.string().min(1).optional(), // Optional on public client
  authorization_endpoint: z.string().url().optional(),
  token_endpoint: z.string().url().optional(),
  userinfo_endpoint: z.string().url().optional(),
  jwks_uri: z.string().url().optional(),
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
  allowed_redirect_uris: z.array(z.string().url()).min(1),
});
export type OidcProviderConfig = z.infer<typeof OidcProviderConfigSchema>;

export const OidcLoginInitRequestSchema = z.object({
  provider_id: z.string().min(1).default('entra-id'),
  redirect_uri: z.string().url(),
});
export type OidcLoginInitRequest = z.infer<typeof OidcLoginInitRequestSchema>;

export const OidcLoginInitResponseSchema = z.object({
  authorization_url: z.string().url(),
  state: z.string().min(16),
  expires_at: z.number().int().positive(),
});
export type OidcLoginInitResponse = z.infer<typeof OidcLoginInitResponseSchema>;

export const OidcCallbackRequestSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});
export type OidcCallbackRequest = z.infer<typeof OidcCallbackRequestSchema>;

export const CustomerIdentityMappingSchema = z.object({
  customer_ref: z.string().min(1),
  idp_issuer: z.string().url(),
  idp_subject: z.string().min(1),
  idp_email: z.string().email(),
  organization_id: z.string().min(1),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
});
export type CustomerIdentityMapping = z.infer<typeof CustomerIdentityMappingSchema>;

// ── WebAuthn / Passkey Schemas ───────────────────────────────────────────────

export const WebAuthnCredentialRecordSchema = z.object({
  credential_id: z.string().min(1), // Base64URL string
  customer_ref: z.string().min(1),
  public_key: z.string().min(1),    // Base64URL string representation of COSE key
  counter: z.number().int().nonnegative().default(0),
  transports: z.array(z.string()).optional(),
  aaguid: z.string().optional(),
  name: z.string().min(1).default('My Passkey'),
  created_at: z.number().int().positive(),
  last_used_at: z.number().int().positive().nullable().default(null),
  revoked_at: z.number().int().positive().nullable().default(null),
});
export type WebAuthnCredentialRecord = z.infer<typeof WebAuthnCredentialRecordSchema>;

export const WebAuthnRegistrationVerifyRequestSchema = z.object({
  challenge: z.string().min(1),
  response: z.record(z.any()), // WebAuthn RegistrationResponseJSON
  name: z.string().min(1).optional(),
});
export type WebAuthnRegistrationVerifyRequest = z.infer<typeof WebAuthnRegistrationVerifyRequestSchema>;

export const WebAuthnAuthenticationVerifyRequestSchema = z.object({
  challenge: z.string().min(1),
  response: z.record(z.any()), // WebAuthn AuthenticationResponseJSON
});
export type WebAuthnAuthenticationVerifyRequest = z.infer<typeof WebAuthnAuthenticationVerifyRequestSchema>;

// ── Transaction-Bound Step-Up Approval Schemas ───────────────────────────────

export const TransactionApprovalChallengeRequestSchema = z.object({
  request_id: z.string().uuid(),
  permit_id: z.string().min(1),
  customer_ref: z.string().min(1),
  account_ref: z.string().min(1),
  mandate_id: z.string().min(1),
  mandate_version: z.number().int().positive(),
  transaction: CanonicalTransactionSchema,
  ttl_seconds: z.number().int().positive().default(120),
});
export type TransactionApprovalChallengeRequest = z.infer<typeof TransactionApprovalChallengeRequestSchema>;

export const TransactionApprovalChallengeResponseSchema = z.object({
  approval_id: z.string().min(1),
  request_id: z.string().uuid(),
  canonical_tx_digest: z.string().length(64),
  webauthn_options: z.record(z.any()), // PublicKeyCredentialRequestOptionsJSON
  expires_at: z.number().int().positive(),
});
export type TransactionApprovalChallengeResponse = z.infer<typeof TransactionApprovalChallengeResponseSchema>;

export const TransactionApprovalVerifyRequestSchema = z.object({
  approval_id: z.string().min(1),
  response: z.record(z.any()), // WebAuthn AuthenticationResponseJSON
});
export type TransactionApprovalVerifyRequest = z.infer<typeof TransactionApprovalVerifyRequestSchema>;

export const TransactionApprovalVerifyResponseSchema = z.object({
  approval_id: z.string().min(1),
  request_id: z.string().uuid(),
  status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED']),
  canonical_tx_digest: z.string().length(64),
  mandate_version: z.number().int().positive(),
  verified_at: z.number().int().positive(),
});
export type TransactionApprovalVerifyResponse = z.infer<typeof TransactionApprovalVerifyResponseSchema>;
