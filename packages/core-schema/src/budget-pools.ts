/**
 * Canonical Category Budget Pool Data Model & Contracts (BP-1)
 *
 * Implements strict, production-oriented Zod contracts for:
 *   - Autonomy Modes (3 canonical + 2 backward-compatible legacy)
 *   - Versioned Category Budget Pool
 *   - Budget Period Model (Asia/Kolkata timezone support, period retention)
 *   - Category Budget Reservation Lifecycle (AVAILABLE -> RESERVED -> SETTLED)
 *   - Sourced Merchant Classification (Payment Rail MCC -> Verified -> Rule -> AI Advisory)
 *   - Shared Multi-Agent Budget Allocation
 *   - Category Spending Decision (ALLOW, ASK, DENY, DEFER)
 *
 * Adheres strictly to:
 *   - Rule E1: All amounts are positive integer paise (zero floats anywhere).
 *   - Rule E2: All timestamps are integer UTC epoch milliseconds.
 *   - Timezone calculations strictly use IANA identifiers (default 'Asia/Kolkata').
 */

import { z } from 'zod';

/**
 * Validates whether a string is a valid IANA timezone name.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── TASK 1: AUTONOMY MODES ──────────────────────────────────────────

export const CanonicalAutonomyModeSchema = z.enum([
  'AUTO_APPROVE_WITHIN_LIMITS',
  'ASK_BEFORE_EVERY_PAYMENT',
  'MANUAL_ONLY'
]);
export type CanonicalAutonomyMode = z.infer<typeof CanonicalAutonomyModeSchema>;

export const LegacyAutonomyModeSchema = z.enum([
  'ALWAYS_ASK',
  'PAY_WITHOUT_RESTRICTION'
]);
export type LegacyAutonomyMode = z.infer<typeof LegacyAutonomyModeSchema>;

/**
 * Universal Autonomy Mode Schema: accepts canonical modes as well as
 * legacy Cockpit modes, transforming legacy to canonical.
 */
export const AutonomyModeSchema = z.union([
  CanonicalAutonomyModeSchema,
  LegacyAutonomyModeSchema
]).transform((val): CanonicalAutonomyMode => {
  if (val === 'ALWAYS_ASK') return 'ASK_BEFORE_EVERY_PAYMENT';
  // Reviewer Item A: Do not silently escalate legacy unrestricted to auto-approve;
  // map to ASK_BEFORE_EVERY_PAYMENT until explicitly configured and confirmed.
  if (val === 'PAY_WITHOUT_RESTRICTION') return 'ASK_BEFORE_EVERY_PAYMENT';
  return val;
});
export type AutonomyMode = z.infer<typeof CanonicalAutonomyModeSchema>;

// Backward compatibility alias for existing code
export const AutonomousPoolPolicySchema = z.enum([
  'PAY_WITHOUT_RESTRICTION',
  'ALWAYS_ASK',
  'AUTO_APPROVE_WITHIN_LIMITS',
  'ASK_BEFORE_EVERY_PAYMENT',
  'MANUAL_ONLY'
]);
export type AutonomousPoolPolicy = z.infer<typeof AutonomousPoolPolicySchema>;

// ── SPENDING CATEGORIES ─────────────────────────────────────────────

export const SpendingCategorySchema = z.enum([
  'SHOPPING',
  'FOOD_DINING',
  'TRANSPORT',
  'FUEL',
  'UTILITIES',
  'SUBSCRIPTIONS',
  'HEALTHCARE',
  'TRAVEL',
  'EDUCATION',
  'BUSINESS_PROCUREMENT',
  'INVESTMENT_STOCK',
  'CUSTOM',
  // Legacy aliases for backward compatibility
  'TRANSPORT_PETROL',
  'UTILITIES_BILL',
  'ENTERTAINMENT',
  'MISCELLANEOUS'
]);
export type SpendingCategory = z.infer<typeof SpendingCategorySchema>;

// ── TASK 2: CATEGORY BUDGET POOL SCHEMA ─────────────────────────────

export const PoolStatusSchema = z.enum(['ACTIVE', 'EXHAUSTED', 'FROZEN', 'EXPIRED', 'REVOKED']);
export type PoolStatus = z.infer<typeof PoolStatusSchema>;

export const CanonicalCategoryBudgetPoolSchema = z.object({
  pool_id: z.string().min(1, 'pool_id is required'),
  tenant_id: z.string().min(1, 'tenant_id is required'),
  customer_ref: z.string().min(1, 'customer_ref is required'),
  category_id: SpendingCategorySchema,
  category_name: z.string().min(1, 'category_name is required'),
  currency: z.literal('INR'),
  monthly_limit_paise: z.number().int().positive('monthly_limit_paise must be a positive integer'),
  weekly_limit_paise: z.number().int().positive('weekly_limit_paise must be a positive integer').optional(),
  daily_limit_paise: z.number().int().positive('daily_limit_paise must be a positive integer').optional(),
  per_transaction_limit_paise: z.number().int().positive('per_transaction_limit_paise must be a positive integer'),
  autonomy_mode: CanonicalAutonomyModeSchema,
  status: PoolStatusSchema.default('ACTIVE'),
  policy_version: z.number().int().positive('policy_version must be a positive integer'),
  valid_from: z.number().int().nonnegative('valid_from must be a non-negative epoch ms'),
  valid_until: z.number().int().positive('valid_until must be a positive epoch ms'),
  timezone: z.string().default('Asia/Kolkata').refine(isValidIanaTimezone, {
    message: 'timezone must be a valid IANA timezone identifier'
  }),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
}).superRefine((data, ctx) => {
  if (data.valid_until <= data.valid_from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'valid_until must be strictly greater than valid_from',
      path: ['valid_until']
    });
  }
  // Check hierarchy where configured
  if (data.daily_limit_paise !== undefined && data.per_transaction_limit_paise > data.daily_limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'per_transaction_limit_paise cannot exceed daily_limit_paise',
      path: ['per_transaction_limit_paise']
    });
  }
  if (data.daily_limit_paise !== undefined && data.weekly_limit_paise !== undefined && data.daily_limit_paise > data.weekly_limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'daily_limit_paise cannot exceed weekly_limit_paise',
      path: ['daily_limit_paise']
    });
  }
  if (data.weekly_limit_paise !== undefined && data.weekly_limit_paise > data.monthly_limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'weekly_limit_paise cannot exceed monthly_limit_paise',
      path: ['weekly_limit_paise']
    });
  }
  if (data.per_transaction_limit_paise > data.monthly_limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'per_transaction_limit_paise cannot exceed monthly_limit_paise',
      path: ['per_transaction_limit_paise']
    });
  }
});
export type CanonicalCategoryBudgetPool = z.infer<typeof CanonicalCategoryBudgetPoolSchema>;

// Backward-compatible UI shape support
export const CategoryBudgetPoolSchema = z.object({
  id: z.string().optional(),
  pool_id: z.string().optional(),
  category: SpendingCategorySchema.optional(),
  category_id: SpendingCategorySchema.optional(),
  displayName: z.string().optional(),
  category_name: z.string().optional(),
  monthlyCapPaise: z.number().int().nonnegative().optional(),
  monthly_limit_paise: z.number().int().positive().optional(),
  spentPaise: z.number().int().nonnegative().optional(),
  singleTxCapPaise: z.number().int().nonnegative().optional(),
  per_transaction_limit_paise: z.number().int().positive().optional(),
  policyMode: AutonomousPoolPolicySchema.optional(),
  autonomy_mode: CanonicalAutonomyModeSchema.optional(),
  status: z.string().default('ACTIVE'),
  color: z.string().optional(),
  iconName: z.string().optional(),
});
export type CategoryBudgetPool = z.infer<typeof CategoryBudgetPoolSchema>;

// ── TASK 3: BUDGET PERIOD MODEL ─────────────────────────────────────

export const PeriodTypeSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export type PeriodType = z.infer<typeof PeriodTypeSchema>;

export const BudgetPeriodSchema = z.object({
  period_id: z.string().min(1, 'period_id is required'),
  pool_id: z.string().min(1, 'pool_id is required'),
  period_type: PeriodTypeSchema,
  period_start: z.number().int().nonnegative('period_start must be an epoch ms timestamp'),
  period_end: z.number().int().positive('period_end must be an epoch ms timestamp'),
  timezone: z.string().default('Asia/Kolkata').refine(isValidIanaTimezone, {
    message: 'timezone must be a valid IANA timezone identifier'
  }),
  limit_paise: z.number().int().positive('limit_paise must be a positive integer'),
  settled_amount_paise: z.number().int().nonnegative('settled_amount_paise must be non-negative').default(0),
  reserved_amount_paise: z.number().int().nonnegative('reserved_amount_paise must be non-negative').default(0),
  version: z.number().int().positive('version must be a positive integer').default(1),
}).superRefine((data, ctx) => {
  if (data.period_end <= data.period_start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'period_end must be strictly greater than period_start',
      path: ['period_end']
    });
  }
  if (data.settled_amount_paise + data.reserved_amount_paise > data.limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'settled_amount_paise + reserved_amount_paise cannot exceed limit_paise',
      path: ['settled_amount_paise']
    });
  }
});
export type BudgetPeriod = z.infer<typeof BudgetPeriodSchema>;

// ── TASK 4: RESERVATION CONTRACT ────────────────────────────────────

export const ReservationStatusSchema = z.enum([
  'RESERVED',
  'SETTLED',
  'RELEASED',
  'REVERSED'
]);
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

export const CategoryBudgetReservationSchema = z.object({
  reservation_id: z.string().min(1, 'reservation_id is required'),
  pool_id: z.string().min(1, 'pool_id is required'),
  tenant_id: z.string().min(1, 'tenant_id is required'),
  customer_ref: z.string().min(1, 'customer_ref is required'),
  agent_id: z.string().min(1, 'agent_id is required'),
  workflow_id: z.string().min(1, 'workflow_id is required'),
  request_id: z.string().min(1, 'request_id is required'),
  idempotency_key: z.string().min(1, 'idempotency_key is required'),
  transaction_digest: z.string().regex(/^[a-f0-9]{64}$/i, 'transaction_digest must be a 64-char hex SHA-256 string'),
  category_id: SpendingCategorySchema,
  amount_paise: z.number().int().positive('amount_paise must be a positive integer'),
  currency: z.literal('INR'),
  period_id: z.string().min(1, 'period_id is required'),
  pool_policy_version: z.number().int().positive(),
  status: ReservationStatusSchema.default('RESERVED'),
  created_at: z.number().int().nonnegative(),
  expires_at: z.number().int().positive(),
  settled_at: z.number().int().positive().nullable().optional(),
  released_at: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.expires_at <= data.created_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'expires_at must be strictly greater than created_at',
      path: ['expires_at']
    });
  }
  if (data.status === 'SETTLED' && !data.settled_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'settled_at timestamp is required when status is SETTLED',
      path: ['settled_at']
    });
  }
  if (data.status === 'RELEASED' && !data.released_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'released_at timestamp is required when status is RELEASED',
      path: ['released_at']
    });
  }
});
export type CategoryBudgetReservation = z.infer<typeof CategoryBudgetReservationSchema>;

/** Permitted lifecycle transitions for reservations */
export const ALLOWED_RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  RESERVED: ['SETTLED', 'RELEASED'],
  SETTLED: ['REVERSED'],
  RELEASED: [], // Terminal state
  REVERSED: [], // Terminal state
};

export function isValidReservationTransition(
  current: ReservationStatus,
  target: ReservationStatus
): boolean {
  return ALLOWED_RESERVATION_TRANSITIONS[current]?.includes(target) ?? false;
}

// ── TASK 5: MERCHANT CLASSIFICATION CONTRACT ────────────────────────

export const ClassificationMethodSchema = z.enum([
  'PAYMENT_RAIL',
  'VERIFIED_MERCHANT',
  'CUSTOMER_MAPPING',
  'DETERMINISTIC_RULE',
  'AI_ADVISORY'
]);
export type ClassificationMethod = z.infer<typeof ClassificationMethodSchema>;

export const EvidenceTierSchema = z.enum([
  'AUTHORITATIVE_RAIL',      // NPCI UPI, ISO 8583 settlement feed
  'REGULATORY_REGISTRY',     // Official bank / RBI merchant registry
  'CUSTOMER_OVERRIDE',       // Explicit customer-assigned rule
  'DETERMINISTIC_HEURISTIC', // Exact prefix / known rule
  'ADVISORY_HEURISTIC'       // LLM / prompt / unverified invoice string
]);
export type EvidenceTier = z.infer<typeof EvidenceTierSchema>;

export const MerchantClassificationSchema = z.object({
  merchant_id: z.string().min(1, 'merchant_id is required'),
  merchant_name: z.string().min(1, 'merchant_name is required'),
  mcc_code: z.string().regex(/^\d{4}$/, 'mcc_code must be exactly 4 numeric digits (ISO 18245)'),
  category_id: SpendingCategorySchema,
  verification_source: z.string().min(1, 'verification_source is required'),
  verification_reference: z.string().optional(),
  classification_method: ClassificationMethodSchema,
  evidence_tier: EvidenceTierSchema.default('AUTHORITATIVE_RAIL'),
  confidence_basis: z.string().min(1, 'confidence_basis is required'),
  verified_at: z.number().int().nonnegative(),
  status: z.enum(['VERIFIED', 'PROVISIONAL', 'FLAGGED', 'BLOCKED']).default('VERIFIED'),
  provenance_metadata: z.record(z.any()).optional(),
}).superRefine((data, ctx) => {
  // CRITICAL RULE: AI_ADVISORY / ADVISORY_HEURISTIC must never independently possess authoritative confidence
  if ((data.classification_method === 'AI_ADVISORY' || data.evidence_tier === 'ADVISORY_HEURISTIC') && data.status === 'VERIFIED') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'AI_ADVISORY and ADVISORY_HEURISTIC cannot be marked as VERIFIED without external payment rail or rule corroboration',
      path: ['status']
    });
  }
});
export type MerchantClassification = z.infer<typeof MerchantClassificationSchema>;

// ── TASK 6: AGENT ALLOCATION CONTRACT ───────────────────────────────

export const AgentBudgetAllocationSchema = z.object({
  allocation_id: z.string().min(1, 'allocation_id is required'),
  pool_id: z.string().min(1, 'pool_id is required'),
  agent_id: z.string().min(1, 'agent_id is required'),
  tenant_id: z.string().min(1, 'tenant_id is required'),
  customer_ref: z.string().min(1, 'customer_ref is required'),
  agent_limit_paise: z.number().int().positive('agent_limit_paise must be positive'),
  monthly_limit_paise: z.number().int().positive('monthly_limit_paise must be positive').optional(),
  weekly_limit_paise: z.number().int().positive('weekly_limit_paise must be positive').optional(),
  daily_limit_paise: z.number().int().positive('daily_limit_paise must be positive'),
  per_transaction_limit_paise: z.number().int().positive('per_transaction_limit_paise must be positive'),
  allowed_categories: z.array(SpendingCategorySchema).min(1, 'At least one allowed category is required'),
  blocked_categories: z.array(SpendingCategorySchema).default([]),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']).default('ACTIVE'),
  valid_from: z.number().int().nonnegative(),
  valid_until: z.number().int().positive(),
  version: z.number().int().positive().default(1),
}).superRefine((data, ctx) => {
  if (data.valid_until <= data.valid_from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'valid_until must be strictly greater than valid_from',
      path: ['valid_until']
    });
  }
  if (data.per_transaction_limit_paise > data.daily_limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'agent per_transaction_limit_paise cannot exceed daily_limit_paise',
      path: ['per_transaction_limit_paise']
    });
  }
  if (data.daily_limit_paise > data.agent_limit_paise) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'agent daily_limit_paise cannot exceed total agent_limit_paise',
      path: ['daily_limit_paise']
    });
  }
  // Conflict check: an allowed category cannot also be in blocked_categories
  const overlap = data.allowed_categories.filter(c => data.blocked_categories.includes(c));
  if (overlap.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Categories cannot be simultaneously allowed and blocked: ${overlap.join(', ')}`,
      path: ['blocked_categories']
    });
  }
});
export type AgentBudgetAllocation = z.infer<typeof AgentBudgetAllocationSchema>;

// ── TASK 7: DECISION CONTRACT ───────────────────────────────────────

export const CategorySpendingDecisionCodeSchema = z.enum([
  'ALLOW',
  'ASK',
  'DENY',
  'DEFER'
]);
export type CategorySpendingDecisionCode = z.infer<typeof CategorySpendingDecisionCodeSchema>;

export const CategorySpendingDecisionSchema = z.object({
  decision: CategorySpendingDecisionCodeSchema,
  decision_reason: z.string().min(1, 'decision_reason is required'),
  policy_version: z.number().int().positive(),
  pool_id: z.string().min(1, 'pool_id is required'),
  category_id: SpendingCategorySchema,
  request_id: z.string().min(1, 'request_id is required'),
  amount_paise: z.number().int().positive('amount_paise must be positive'),
  currency: z.literal('INR'),
  evaluated_at: z.number().int().nonnegative(),
  requires_human_approval: z.boolean(),
  reservation_id: z.string().optional(),
  violations: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  // CRITICAL RULE: Hard violations must NEVER produce ALLOW
  if (data.violations.length > 0 && data.decision === 'ALLOW') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Decision cannot be ALLOW when policy violations are present (Invariant I2)',
      path: ['decision']
    });
  }
});
export type CategorySpendingDecision = z.infer<typeof CategorySpendingDecisionSchema>;

// ── BP-3.2: EXTENDED MERCHANT INTELLIGENCE CONTRACTS ────────────────

export const MerchantRegistryEntrySchema = z.object({
  merchant_id: z.string().min(1),
  merchant_name: z.string().min(1),
  legal_name: z.string().optional(),
  brand_id: z.string().optional(),
  location_id: z.string().optional(),
  primary_mcc: z.string().regex(/^\d{4}$/, 'mcc must be exactly 4 digits'),
  secondary_mccs: z.array(z.string().regex(/^\d{4}$/)).default([]),
  category_id: SpendingCategorySchema,
  allowed_categories: z.array(SpendingCategorySchema).min(1),
  evidence_tier: EvidenceTierSchema,
  verification_source: z.string().min(1),
  status: z.enum(['VERIFIED', 'PROVISIONAL', 'FLAGGED', 'BLOCKED']).default('VERIFIED'),
  updated_at: z.number().int().nonnegative(),
});
export type MerchantRegistryEntry = z.infer<typeof MerchantRegistryEntrySchema>;

export const MerchantEvaluationInputSchema = z.object({
  merchant_id: z.string().min(1),
  merchant_name: z.string().min(1),
  claimed_mcc: z.string().regex(/^\d{4}$/).optional(),
  payment_rail_mcc: z.string().regex(/^\d{4}$/).optional(),
  claimed_category: SpendingCategorySchema.optional(),
  ai_inferred_category: SpendingCategorySchema.optional(),
  ai_confidence: z.number().min(0).max(1).optional(),
});
export type MerchantEvaluationInput = z.infer<typeof MerchantEvaluationInputSchema>;

export const MerchantEvaluationResultSchema = z.object({
  is_valid: z.boolean(),
  resolved_category: SpendingCategorySchema,
  resolved_mcc: z.string().regex(/^\d{4}$/),
  evidence_tier: EvidenceTierSchema,
  is_mismatch_detected: z.boolean(),
  is_ai_advisory_only: z.boolean(),
  status: z.enum(['VERIFIED', 'PROVISIONAL', 'FLAGGED', 'BLOCKED']),
  confidence_basis: z.string(),
  violations: z.array(z.string()).default([]),
});
export type MerchantEvaluationResult = z.infer<typeof MerchantEvaluationResultSchema>;

// ── BP-3.5: MERKLE TREE AUDIT & VERIFICATION CONTRACTS ──────────────

export const MerkleAlgorithmVersionSchema = z.enum([
  'AGENTGUARD_MERKLE_V1',
  'RFC6962_MTH_V1',
  'MERKLE_RFC6962_SHA256_V1', // backward compatibility alias
]);
export type MerkleAlgorithmVersion = z.infer<typeof MerkleAlgorithmVersionSchema>;

export const MerkleAuditBatchSchema = z.object({
  batch_id: z.string().min(1),
  merkle_root: z.string().regex(/^[a-f0-9]{64}$/i, 'merkle_root must be 64-char hex SHA-256'),
  start_sequence: z.number().int().positive(),
  end_sequence: z.number().int().positive(),
  leaf_count: z.number().int().positive(),
  algorithm_version: MerkleAlgorithmVersionSchema.default('AGENTGUARD_MERKLE_V1'),
  witness_checkpoint_id: z.string().optional(),
  witness_signature: z.string().optional(),
  witness_epoch: z.number().int().positive().optional(),
  created_at: z.number().int().nonnegative(),
}).superRefine((data, ctx) => {
  if (data.end_sequence < data.start_sequence) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'end_sequence must be greater than or equal to start_sequence',
      path: ['end_sequence']
    });
  }
});
export type MerkleAuditBatch = z.infer<typeof MerkleAuditBatchSchema>;

export const MerkleInclusionProofSchema = z.object({
  batch_id: z.string().min(1),
  event_id: z.string().min(1),
  sequence_number: z.number().int().positive(),
  leaf_index: z.number().int().nonnegative(),
  leaf_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  audit_path: z.array(z.string().regex(/^[a-f0-9]{64}$/i)),
  merkle_root: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type MerkleInclusionProof = z.infer<typeof MerkleInclusionProofSchema>;

export const MerkleVerificationRequestSchema = z.object({
  batch_id: z.string().min(1),
  event_id: z.string().min(1),
  leaf_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  merkle_proof: z.array(z.string().regex(/^[a-f0-9]{64}$/i)),
  merkle_root: z.string().regex(/^[a-f0-9]{64}$/i),
  leaf_index: z.number().int().nonnegative().optional(),
  event_payload: z.string().optional(),
});
export type MerkleVerificationRequest = z.infer<typeof MerkleVerificationRequestSchema>;

export const MerkleVerificationResponseSchema = z.object({
  valid: z.boolean(),
  event_included: z.boolean(),
  root_anchored: z.boolean(),
  verification_status: z.enum(['VERIFIED', 'TAMPER_DETECTED', 'ROOT_MISMATCH', 'INVALID_PROOF']),
  details: z.string(),
  witness_checkpoint_id: z.string().optional(),
  witness_epoch: z.number().int().optional(),
});
export type MerkleVerificationResponse = z.infer<typeof MerkleVerificationResponseSchema>;
