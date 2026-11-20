import { z } from 'zod';
import { CustomerRefSchema, AccountRefSchema, MandateIdSchema, PaiseAmountSchema, NonNegativePaiseSchema } from './mandate';
import { CurrencySchema } from './transaction';

/**
 * Account Status Schema
 */
export const AccountStatusSchema = z.enum(['ACTIVE', 'FROZEN', 'CLOSED']);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

/**
 * Double-Entry Ledger Account Schema
 * Tracks liquid balances in integer paise.
 */
export const LedgerAccountSchema = z
  .object({
    account_ref: AccountRefSchema,
    customer_ref: CustomerRefSchema,
    balance_paise: NonNegativePaiseSchema,
    currency: CurrencySchema,
    status: AccountStatusSchema.default('ACTIVE'),
    created_at: z.number().int().positive(),
    updated_at: z.number().int().positive(),
  })
  .strict();
export type LedgerAccount = z.infer<typeof LedgerAccountSchema>;

/**
 * Budget Reservation Status Schema
 *
 * Invariant I4 & Decision D8:
 * Reservations are held for 120s (outliving 90s permit TTL).
 */
export const BudgetReservationStatusSchema = z.enum([
  'RESERVED',
  'COMMITTED',
  'RELEASED',
  'EXPIRED',
]);
export type BudgetReservationStatus = z.infer<typeof BudgetReservationStatusSchema>;

export const BudgetReservationSchema = z
  .object({
    reservation_id: z.string().uuid(),
    mandate_id: MandateIdSchema,
    customer_ref: CustomerRefSchema,
    account_ref: AccountRefSchema,
    amount_paise: PaiseAmountSchema,
    currency: CurrencySchema,
    status: BudgetReservationStatusSchema.default('RESERVED'),
    created_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  })
  .strict();
export type BudgetReservation = z.infer<typeof BudgetReservationSchema>;

/**
 * Ledger Transfer State Schema
 *
 * Represents the two-stage execution lifecycle (Pending -> Post/Void)
 * and crash-recovery state (PENDING_RECONCILIATION).
 */
export const LedgerTransferStateSchema = z.enum([
  'PENDING',
  'POSTED',
  'VOIDED',
  'PENDING_RECONCILIATION',
]);
export type LedgerTransferState = z.infer<typeof LedgerTransferStateSchema>;

/**
 * Ledger Transfer Schema
 */
export const LedgerTransferSchema = z
  .object({
    transfer_id: z.string().uuid(),
    reservation_id: z.string().uuid(),
    permit_id: z.string().uuid(),
    request_id: z.string().uuid(),
    debit_account: AccountRefSchema,
    credit_account: AccountRefSchema,
    amount_paise: PaiseAmountSchema,
    currency: CurrencySchema,
    state: LedgerTransferStateSchema,
    created_at: z.number().int().positive(),
    settled_at: z.number().int().positive().nullable().default(null),
  })
  .strict();
export type LedgerTransfer = z.infer<typeof LedgerTransferSchema>;

/**
 * Execution Settlement Result Schema
 */
export const SettlementResultSchema = z
  .object({
    status: z.enum(['SETTLED', 'FAILED', 'PENDING_RECONCILIATION']),
    receipt: z.string().min(1).optional(),
    transfer_id: z.string().uuid().optional(),
    request_id: z.string().uuid(),
    amount_paise: PaiseAmountSchema,
    currency: CurrencySchema,
    settled_at: z.number().int().positive(),
    reason: z.string().optional(),
  })
  .strict();
export type SettlementResult = z.infer<typeof SettlementResultSchema>;

/**
 * Reconciliation Request Schema
 *
 * Used by recovery cron or operator to safely resolve PENDING_RECONCILIATION.
 */
export const ReconciliationRequestSchema = z
  .object({
    reservation_id: z.string().uuid(),
    outcome: z.enum(['COMMIT', 'RELEASE']),
    reason: z.string().min(1).max(256).optional(),
  })
  .strict();
export type ReconciliationRequest = z.infer<typeof ReconciliationRequestSchema>;

/**
 * Reconciliation Result Schema
 */
export const ReconciliationResultSchema = z
  .object({
    reservation_id: z.string().uuid(),
    outcome: z.enum(['COMMIT', 'RELEASE']),
    previous_state: LedgerTransferStateSchema,
    current_state: LedgerTransferStateSchema,
    reconciled_at: z.number().int().positive(),
  })
  .strict();
export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;
