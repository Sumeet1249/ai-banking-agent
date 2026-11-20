import { z } from 'zod';

/**
 * Base Identifier Schemas
 */
export const CustomerRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid customer_ref format');

export const AccountRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid account_ref format');

export const AgentRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid agent_id format');

export const PayeeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid payee_id format');

export const MandateIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Invalid mandate_id format');

/**
 * Monetary Amount Schema
 * Rule E1: Strictly integer paise. Zero floats permitted.
 */
export const PaiseAmountSchema = z
  .number()
  .int('Amount must be an integer (paise)')
  .positive('Amount must be strictly positive (> 0 paise)')
  .max(Number.MAX_SAFE_INTEGER, 'Amount exceeds safe integer limit');

export const NonNegativePaiseSchema = z
  .number()
  .int('Amount must be an integer (paise)')
  .nonnegative('Amount must be non-negative')
  .max(Number.MAX_SAFE_INTEGER, 'Amount exceeds safe integer limit');

/**
 * Mandate Lifecycle Statuses
 */
export const MandateStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
  'EXPIRED',
]);
export type MandateStatus = z.infer<typeof MandateStatusSchema>;

/**
 * Customer Mandate Schema
 *
 * Defines the root delegated financial permissions granted by a customer
 * to an autonomous agent.
 */
export const CustomerMandateSchema = z
  .object({
    mandate_id: MandateIdSchema,
    mandate_version: z.number().int().positive().default(1),
    customer_ref: CustomerRefSchema,
    account_ref: AccountRefSchema,
    authorized_agent_id: AgentRefSchema,
    action: z.string().min(1).max(80),
    purpose: z.string().min(1).max(80),
    allowed_payees: z.array(PayeeIdSchema).min(1, 'At least one payee must be authorized'),
    per_tx_limit_paise: PaiseAmountSchema,
    daily_limit_paise: PaiseAmountSchema,
    status: MandateStatusSchema.default('ACTIVE'),
    created_at: z.number().int().positive('created_at must be an integer epoch ms'),
    updated_at: z.number().int().positive('updated_at must be an integer epoch ms'),
    expires_at: z.number().int().positive('expires_at must be an integer epoch ms'),
  })
  .strict();
export type CustomerMandate = z.infer<typeof CustomerMandateSchema>;

/**
 * Mandate Revocation Request Schema
 */
export const MandateRevocationRequestSchema = z
  .object({
    mandate_id: MandateIdSchema,
    customer_ref: CustomerRefSchema,
    revoked_at: z.number().int().positive(),
    reason: z.string().min(1).max(256).optional(),
  })
  .strict();
export type MandateRevocationRequest = z.infer<typeof MandateRevocationRequestSchema>;

/**
 * Sub-Agent Delegation Token Schema
 * Invariant I7: Child scope must be a strict subset of parent scope.
 */
export const SubAgentDelegationSchema = z
  .object({
    parent_agent_id: AgentRefSchema,
    child_agent_id: AgentRefSchema,
    mandate_id: MandateIdSchema,
    mandate_version: z.number().int().positive(),
    allowed_actions: z.array(z.string().min(1).max(80)).min(1),
    max_amount_paise: PaiseAmountSchema,
    delegation_ref: z.string().min(1).max(128),
    expires_at: z.number().int().positive(),
  })
  .strict();
export type SubAgentDelegation = z.infer<typeof SubAgentDelegationSchema>;
