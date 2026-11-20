import { z } from 'zod';

export const WorkflowStatusSchema = z.enum([
  'CREATED',
  'VALIDATING',
  'RUNNING',
  'WAITING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'RECONCILING',
  'COMPLETED',
  'DENIED',
  'HELD',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REQUIRES_REVIEW'
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const WorkflowDecisionSchema = z.enum(['ALLOW', 'ASK', 'DENY', 'HOLD', 'DEFER']);
export type WorkflowDecision = z.infer<typeof WorkflowDecisionSchema>;

export const WorkflowRequestSchema = z.object({
  workflow_id: z.string(),
  tenant_id: z.string(),
  customer_ref: z.string(),
  account_ref: z.string(),
  agent_id: z.string(),
  request_id: z.string(),
  action: z.enum(['PAYMENT', 'TRANSFER', 'BALANCE_CHECK', 'MANDATE_UPDATE']),
  purpose: z.string(),
  amount_paise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  payee_id: z.string(),
  payee_name: z.string().optional(),
  invoice_ref: z.string().optional(),
  mandate_id: z.string().optional(),
  source: z.enum(['NATURAL_LANGUAGE', 'STRUCTURED_FORM', 'INVOICE_UPLOAD', 'API_MCP']),
  created_at: z.number().int(),
  idempotency_key: z.string()
});
export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;

export const AgentExecutionStepSchema = z.object({
  step_number: z.number().int().min(1).max(8),
  agent_id: z.string(),
  agent_name: z.string(),
  role_description: z.string(),
  status: z.enum(['WAITING', 'RUNNING', 'COMPLETED', 'BLOCKED', 'PAUSED_APPROVAL', 'FAILED']),
  decision: WorkflowDecisionSchema.optional(),
  input_summary: z.string().optional(),
  output_summary: z.string().optional(),
  evidence_references: z.array(z.string()).default([]),
  duration_ms: z.number().int().default(0),
  started_at: z.number().int().optional(),
  completed_at: z.number().int().optional(),
  error: z.string().nullable().optional()
});
export type AgentExecutionStep = z.infer<typeof AgentExecutionStepSchema>;

export const AutonomousWorkflowSessionSchema = z.object({
  workflow_id: z.string(),
  request: WorkflowRequestSchema,
  status: WorkflowStatusSchema,
  current_step: z.number().int().min(1).max(8),
  steps: z.array(AgentExecutionStepSchema),
  overall_decision: WorkflowDecisionSchema.optional(),
  permit_id: z.string().optional(),
  bank_tx_id: z.string().optional(),
  merkle_root: z.string().optional(),
  witness_signature: z.string().optional(),
  updated_at: z.number().int()
});
export type AutonomousWorkflowSession = z.infer<typeof AutonomousWorkflowSessionSchema>;
