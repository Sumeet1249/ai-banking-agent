/**
 * AgentGuard Trust Intelligence Canonical Contracts & Schemas (Phases TI-2 to TI-6)
 *
 * Implements:
 *   - Agent Identity Registry & Ed25519 Cryptographic Verification
 *   - Dynamic Bounded Delegation Hierarchy & Capability Validation
 *   - Behavioural Feature Extraction & Explainable Anomaly Metrics
 *   - Structured Intent-Drift Constraints
 *   - Autonomous Threat Response States (ALLOW, RESTRICT, QUARANTINE, REVOKE, EMERGENCY_STOP)
 *   - Cryptographically Verifiable Forensic Incident Graphs
 */

import { z } from 'zod';

// ── AGENT IDENTITY & LIFECYCLE (TI-2) ───────────────────────────────────────

export const AgentTrustStateSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'RESTRICTED',
  'QUARANTINED',
  'REVOKED',
]);
export type AgentTrustState = z.infer<typeof AgentTrustStateSchema>;

export const AgentTrustIdentitySchema = z.object({
  agent_id: z.string().min(1).max(64),
  name: z.string().min(1),
  role: z.string().min(1),
  owner_ref: z.string().min(1),
  tenant_id: z.string().min(1),
  public_key_ed25519: z.string().min(32), // Hex or Base64 Ed25519 public key
  key_id: z.string().min(1),
  parent_agent_id: z.string().nullable().optional(),
  trust_score: z.number().int().min(0).max(1000).default(800),
  status: AgentTrustStateSchema.default('ACTIVE'),
  version: z.string().default('1.0.0'),
  created_at: z.number().int().positive(),
  updated_at: z.number().int().positive(),
  quarantine_reason: z.string().nullable().optional(),
  quarantined_at: z.number().int().positive().nullable().optional(),
  quarantined_by: z.string().nullable().optional(),
});
export type AgentTrustIdentity = z.infer<typeof AgentTrustIdentitySchema>;

export const AgentCredentialSchema = z.object({
  credential_id: z.string().min(1),
  agent_id: z.string().min(1),
  key_id: z.string().min(1),
  algorithm: z.literal('Ed25519').default('Ed25519'),
  public_key: z.string().min(32),
  valid_from: z.number().int().positive(),
  valid_to: z.number().int().positive(),
  revoked_at: z.number().int().positive().nullable().optional(),
  revocation_reason: z.string().nullable().optional(),
  rotation_history: z.array(z.string()).default([]),
});
export type AgentCredential = z.infer<typeof AgentCredentialSchema>;

// ── DYNAMIC DELEGATION & CAPABILITIES (TI-3) ───────────────────────────────

export const DelegationStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED']);
export type DelegationStatus = z.infer<typeof DelegationStatusSchema>;

export const AgentDelegationSchema = z.object({
  delegation_id: z.string().min(1),
  tenant_id: z.string().min(1),
  customer_ref: z.string().min(1),
  agent_id: z.string().min(1),
  parent_delegation_id: z.string().nullable().optional(),
  allowed_tools: z.array(z.string()).min(1),
  allowed_resources: z.array(z.string()).default(['*']),
  permitted_actions: z.array(z.string()).default(['*']),
  purpose: z.string().min(1),
  max_amount_paise: z.number().int().nonnegative().nullable().optional(),
  daily_max_paise: z.number().int().nonnegative().nullable().optional(),
  delegation_depth: z.number().int().nonnegative().default(0),
  max_delegation_depth: z.number().int().positive().default(2),
  usage_quota: z.number().int().positive().default(100),
  usage_count: z.number().int().nonnegative().default(0),
  valid_from: z.number().int().positive(),
  expires_at: z.number().int().positive(),
  status: DelegationStatusSchema.default('ACTIVE'),
  revoked_at: z.number().int().positive().nullable().optional(),
  revoked_by: z.string().nullable().optional(),
});
export type AgentDelegation = z.infer<typeof AgentDelegationSchema>;

// ── STRUCTURED CUSTOMER INTENT (TI-4) ───────────────────────────────────────

export const CustomerIntentSchema = z.object({
  intent_id: z.string().min(1),
  customer_ref: z.string().min(1),
  objective: z.string().min(1),
  approved_payees: z.array(z.string()).default([]),
  max_authorized_amount_paise: z.number().int().nonnegative().nullable().optional(),
  approved_account_ref: z.string().nullable().optional(),
  authorized_tools: z.array(z.string()).default([]),
  valid_from: z.number().int().positive(),
  valid_until: z.number().int().positive(),
  context_metadata: z.record(z.any()).default({}),
});
export type CustomerIntent = z.infer<typeof CustomerIntentSchema>;

// ── BEHAVIOURAL FEATURES & ANOMALY (TI-4) ───────────────────────────────────

export const BehaviouralFeaturesSchema = z.object({
  tool_call_rate_per_min: z.number().nonnegative(),
  unique_tools_in_session: z.number().int().nonnegative(),
  consecutive_denied_calls: z.number().int().nonnegative(),
  call_interval_ms: z.number().int().nonnegative(),
  intent_divergence_score: z.number().min(0).max(100), // 0: matches perfectly, 100: complete drift
  unusual_hours_detected: z.boolean(),
  structuring_pattern_detected: z.boolean(),
  burst_velocity_detected: z.boolean(),
  delegation_depth_observed: z.number().int().nonnegative(),
  tenant_cross_attempted: z.boolean(),
});
export type BehaviouralFeatures = z.infer<typeof BehaviouralFeaturesSchema>;

export const StatisticalAnomalyScoreSchema = z.object({
  z_score: z.number(),
  rolling_mean: z.number(),
  rolling_variance: z.number(),
  median_absolute_deviation: z.number(),
  baseline_samples_count: z.number().int().nonnegative(),
  is_cold_start: z.boolean(),
  anomaly_flag: z.boolean(),
  feature_name: z.string(),
});
export type StatisticalAnomalyScore = z.infer<typeof StatisticalAnomalyScoreSchema>;

// ── POLICY DECISIONS & AUTONOMOUS THREAT RESPONSE (TI-3, TI-5) ─────────────

export const PolicyVerdictSchema = z.enum(['ALLOW', 'DENY', 'ASK', 'DEFER']);
export type PolicyVerdict = z.infer<typeof PolicyVerdictSchema>;

export const AutonomousThreatResponseSchema = z.enum([
  'ALLOW',
  'RESTRICT',
  'REQUIRE_APPROVAL',
  'PAUSE',
  'QUARANTINE',
  'REVOKE',
  'EMERGENCY_STOP',
]);
export type AutonomousThreatResponse = z.infer<typeof AutonomousThreatResponseSchema>;

export const TrustEvaluationDecisionSchema = z.object({
  decision_id: z.string().min(1),
  request_id: z.string().min(1),
  agent_id: z.string().min(1),
  tenant_id: z.string().min(1),
  verdict: PolicyVerdictSchema,
  action_response: AutonomousThreatResponseSchema,
  reason_code: z.string().min(1),
  violation_summary: z.string(),
  risk_score: z.number().min(0).max(100),
  observed_features: BehaviouralFeaturesSchema,
  evidence_references: z.array(z.string()).default([]),
  evaluated_at: z.number().int().positive(),
  evaluator_version: z.string().default('TI-Engine-v1'),
});
export type TrustEvaluationDecision = z.infer<typeof TrustEvaluationDecisionSchema>;

// ── INVOCATION REQUEST (TI-2, TI-3) ────────────────────────────────────────

export const InvocationRequestSchema = z.object({
  request_id: z.string().min(1),
  session_id: z.string().min(1),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  credential_id: z.string().min(1),
  delegation_id: z.string().min(1),
  timestamp_ms: z.number().int().positive(),
  nonce: z.string().min(8),
  tool_name: z.string().min(1),
  arguments: z.record(z.any()),
  canonical_argument_digest: z.string().min(64), // SHA-256 hex
  agent_signature: z.string().min(32), // Detached Ed25519 signature
  customer_intent_id: z.string().nullable().optional(),
});
export type InvocationRequest = z.infer<typeof InvocationRequestSchema>;

// ── FORENSIC INCIDENT GRAPH (TI-6) ──────────────────────────────────────────

export const IncidentSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;

export const IncidentStatusSchema = z.enum(['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED']);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const ForensicIncidentRecordSchema = z.object({
  incident_id: z.string().min(1),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  session_id: z.string().min(1),
  severity: IncidentSeveritySchema,
  status: IncidentStatusSchema.default('OPEN'),
  trigger_type: z.string().min(1),
  summary: z.string().min(1),
  root_cause_analysis: z.string(),
  containment_action: AutonomousThreatResponseSchema,
  event_chain_hashes: z.array(z.string()).min(1),
  witness_checkpoint_ref: z.string().nullable().optional(),
  evidence_pack: z.record(z.any()),
  detected_at: z.number().int().positive(),
  resolved_at: z.number().int().positive().nullable().optional(),
  resolved_by: z.string().nullable().optional(),
});
export type ForensicIncidentRecord = z.infer<typeof ForensicIncidentRecordSchema>;
