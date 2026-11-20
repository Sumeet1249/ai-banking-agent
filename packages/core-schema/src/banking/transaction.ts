import { z } from 'zod';
import { createHash } from 'crypto';
import {
  CustomerRefSchema,
  AccountRefSchema,
  AgentRefSchema,
  PayeeIdSchema,
  MandateIdSchema,
  PaiseAmountSchema,
} from './mandate';

/**
 * Currency Standard
 * Rule E1 & CONTRACTS.md: Strictly INR for all banking settlements.
 */
export const CurrencySchema = z.literal('INR');
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Section 1: Canonical PaymentRequest Schema (Signed by Agent)
 *
 * Wire format submitted by agent SDKs to Gateway POST /api/agent/evaluate.
 */
export const PaymentRequestSchema = z
  .object({
    request_id: z.string().uuid('request_id must be a valid UUIDv4'),
    agent_id: AgentRefSchema,
    customer_ref: CustomerRefSchema,
    mandate_id: MandateIdSchema,
    account_ref: AccountRefSchema,
    action: z.string().min(1).max(80),
    purpose: z.string().min(1).max(80),
    payee_id: PayeeIdSchema,
    amount_paise: PaiseAmountSchema,
    currency: CurrencySchema,
    invoice_ref: z.string().min(1).max(128),
    timestamp_ms: z.number().int().positive('timestamp_ms must be integer epoch ms'),
    approval_ref: z.string().min(1).max(128).nullable().default(null),
    task_ref: z.string().min(1).max(128).nullable().default(null),
    agent_signature: z.string().min(1, 'agent_signature is required'),
  })
  .strict();
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

/**
 * Section 2: Canonical Transaction Digest Schema (7 fields)
 *
 * Exactly 7 fields sorted alphabetically, serialized to canonical JSON,
 * and hashed with SHA-256 to produce `payload_hash`.
 */
export const CanonicalTransactionSchema = z
  .object({
    account_ref: AccountRefSchema,
    action: z.string().min(1).max(80),
    amount_paise: PaiseAmountSchema,
    currency: CurrencySchema,
    invoice_ref: z.string().min(1).max(128),
    payee_id: PayeeIdSchema,
    purpose: z.string().min(1).max(80),
  })
  .strict();
export type CanonicalTransaction = z.infer<typeof CanonicalTransactionSchema>;

export const CanonicalDigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, 'payload_hash must be a 64-character lowercase SHA-256 hex string');
export type CanonicalDigest = z.infer<typeof CanonicalDigestSchema>;

/**
 * Deterministic Canonical JSON Stringifier
 * Ensures identical key order and zero unnecessary whitespace.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes the 7-field canonical transaction digest.
 */
export function computeCanonicalTransactionDigest(tx: CanonicalTransaction): string {
  const canonicalString = canonicalJson({
    account_ref: tx.account_ref,
    action: tx.action,
    amount_paise: tx.amount_paise,
    currency: tx.currency,
    invoice_ref: tx.invoice_ref,
    payee_id: tx.payee_id,
    purpose: tx.purpose,
  });
  return createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Section 3: Permit v1 Signed Payload Schema (Strictly 22 fields)
 *
 * Minted by Gateway using Ed25519 private key; verified by Bank Gate
 * using Gateway public key only (Invariant I1, I6).
 */
export const TransactionBoundPermitPayloadSchema = z
  .object({
    permit_version: z.literal('1'),
    customer_ref: CustomerRefSchema,
    agent_id: AgentRefSchema,
    delegation_ref: z.string().min(1).max(128),
    mandate_id: MandateIdSchema,
    mandate_version: z.number().int().positive(),
    account_ref: AccountRefSchema,
    action: z.string().min(1).max(80),
    purpose: z.string().min(1).max(80),
    amount_paise: PaiseAmountSchema,
    currency: CurrencySchema,
    payee_id: PayeeIdSchema,
    invoice_ref: z.string().min(1).max(128),
    request_id: z.string().uuid(),
    permit_id: z.string().uuid(),
    nonce: z.string().uuid(),
    payload_hash: CanonicalDigestSchema,
    policy_version: z.string().min(1).max(64),
    reservation_id: z.string().uuid(),
    issued_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
    approval_ref: z.string().min(1).max(128).nullable().default(null),
  })
  .strict();
export type TransactionBoundPermitPayload = z.infer<typeof TransactionBoundPermitPayloadSchema>;

/**
 * Transaction-Bound Permit Envelope Schema
 */
export const PermitEnvelopeSchema = z
  .object({
    permit: TransactionBoundPermitPayloadSchema,
    signature: z.string().min(1, 'signature is required'),
    gateway_key_id: z.string().min(1).optional(),
    algorithm: z.literal('ed25519').optional(),
  })
  .strict();
export type PermitEnvelope = z.infer<typeof PermitEnvelopeSchema>;

/**
 * Section 5: Fixed Reason Codes & Decision Outcomes
 */
export const BankDecisionOutcomeSchema = z.enum(['ALLOW', 'DENY', 'ASK', 'DEFER']);
export type BankDecisionOutcome = z.infer<typeof BankDecisionOutcomeSchema>;

export const GatewayDenyReasonSchema = z.enum([
  'MALFORMED_REQUEST',
  'INVALID_AMOUNT',
  'INVALID_CURRENCY',
  'UNKNOWN_AGENT',
  'INVALID_SIGNATURE',
  'STALE_REQUEST',
  'REQUEST_ID_REUSE_MISMATCH',
  'AGENT_SUSPENDED',
  'AGENT_EXPIRED',
  'SUBAGENT_SCOPE_EXCEEDED',
  'PARENT_REVOKED',
  'MANDATE_NOT_FOUND',
  'MANDATE_REVOKED',
  'MANDATE_EXPIRED',
  'ACCOUNT_MISMATCH',
  'ACTION_NOT_PERMITTED',
  'PURPOSE_MISMATCH',
  'UNKNOWN_PAYEE',
  'EXCEEDS_PER_TX_LIMIT',
  'DAILY_LIMIT_EXCEEDED',
  'UNKNOWN_INVOICE',
  'INVOICE_AMOUNT_MISMATCH',
  'INVOICE_PAYEE_MISMATCH',
  'DUPLICATE_INVOICE_ALREADY_PAID',
  'AGENT_TRUST_SUSPENDED',
  'APPROVAL_INVALID_OR_EXPIRED',
]);
export type GatewayDenyReason = z.infer<typeof GatewayDenyReasonSchema>;

export const BankDenyReasonSchema = z.enum([
  'MISSING_PERMIT',
  'INVALID_PERMIT_SIGNATURE',
  'UNSUPPORTED_PERMIT_VERSION',
  'PAYLOAD_DIGEST_MISMATCH',
  'IDENTITY_BINDING_MISMATCH',
  'PERMIT_EXPIRED',
  'MANDATE_REVOKED',
  'MANDATE_VERSION_CHANGED',
  'MANDATE_EXPIRED',
  'AGENT_NOT_ACTIVE',
  'INSUFFICIENT_FUNDS',
  'PERMIT_ALREADY_CONSUMED',
  'BUDGET_RESERVATION_LOST',
]);
export type BankDenyReason = z.infer<typeof BankDenyReasonSchema>;

export const DeferReasonSchema = z.literal('SECURITY_SERVICE_UNAVAILABLE');
export type DeferReason = z.infer<typeof DeferReasonSchema>;

export const AskSignalSchema = z.enum([
  'HIGH_RATIO_PAYMENT',
  'UNUSUAL_HOURS_IST',
  'VELOCITY_BURST',
  'UNCERTAIN_DUPLICATE_PATTERN',
  'AEGIS_BEHAVIOR_DRIFT',
  'LIMIT_SPLITTING',
  'NEW_PAYEE_FOR_AGENT',
  'UNREGISTERED_TASK_REF',
  'TRUST_BELOW_500',
]);
export type AskSignal = z.infer<typeof AskSignalSchema>;

/**
 * Bank Gate Evaluation Decision Response Schema
 */
export const EvaluationDecisionResponseSchema = z
  .object({
    decision: BankDecisionOutcomeSchema,
    request_id: z.string().uuid(),
    reason_code: z.string().optional(),
    reason_message: z.string().optional(),
    permit_envelope: PermitEnvelopeSchema.optional(),
    approval_ref: z.string().nullable().optional(),
    ask_signals: z.array(AskSignalSchema).optional(),
    decided_at: z.number().int().positive(),
  })
  .strict();
export type EvaluationDecisionResponse = z.infer<typeof EvaluationDecisionResponseSchema>;
