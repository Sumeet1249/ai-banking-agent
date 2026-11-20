import { z } from 'zod';
import { PaiseAmountSchema, PayeeIdSchema } from './mandate';

const UUIDSchema = z.string().uuid();
const Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/i);

/**
 * Transaction details within a Compliance Evidence Pack
 * Contains complete 7 canonical transaction fields to enable deterministic digest recomputation.
 */
export const EvidenceTransactionSchema = z.object({
  permit_id: UUIDSchema,
  nonce: UUIDSchema,
  mandate_id: UUIDSchema,
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  source_account: z.string().min(1),
  destination_account: z.string().min(1),
  action: z.string().min(1).max(80),
  purpose: z.string().min(1).max(80),
  payee_id: PayeeIdSchema,
  invoice_ref: z.string().min(1).max(128),
  amount_paise: PaiseAmountSchema,
  currency: z.literal('INR'),
  issued_at: z.number().int().positive(),
  expires_at: z.number().int().positive(),
  canonical_digest: Sha256HexSchema,
  gateway_key_id: z.string().min(1),
  gateway_signature: z.string().min(1),
});
export type EvidenceTransaction = z.infer<typeof EvidenceTransactionSchema>;

/**
 * Ledger / Bank Gate cryptographically authenticated execution receipt.
 * Enforces authenticated settlement proof: an unsigned status field is prohibited.
 */
export const EvidenceSettlementReceiptSchema = z.object({
  ledger_transfer_id: z.string().min(1),
  status: z.enum(['COMMITTED', 'SETTLED', 'ABORTED', 'PENDING']),
  settlement_engine: z.enum(['tigerbeetle', 'postgresql']),
  committed_at: z.number().int().positive(),
  execution_nonce: UUIDSchema,
  bank_gate_id: z.string().min(1),
  settlement_digest: Sha256HexSchema,
  bank_gate_signature: z.string().min(1),
  bank_gate_public_key_pem: z.string().min(1),
});
export type EvidenceSettlementReceipt = z.infer<typeof EvidenceSettlementReceiptSchema>;

/**
 * Merkle Tree inclusion proof referencing Witness checkpoint
 */
export const EvidenceMerkleProofSchema = z.object({
  checkpoint_id: UUIDSchema,
  epoch: z.number().int().positive(),
  sequence_number: z.number().int().positive(),
  tree_size: z.number().int().positive(),
  checkpoint_root: Sha256HexSchema,
  leaf_index: z.number().int().nonnegative(),
  leaf_hash: Sha256HexSchema,
  audit_path: z.array(Sha256HexSchema),
  witness_key_id: z.string().min(1),
  witness_signature: z.string().min(1),
  witness_public_key_pem: z.string().min(1),
});
export type EvidenceMerkleProof = z.infer<typeof EvidenceMerkleProofSchema>;

/**
 * Complete exportable Compliance Evidence Pack
 */
export const ComplianceEvidencePackSchema = z.object({
  evidence_pack_id: UUIDSchema,
  pack_version: z.literal('agentguard-evidence-v1'),
  generated_at: z.string().datetime(),
  tenant_id: z.string().min(1),
  transaction: EvidenceTransactionSchema,
  settlement: EvidenceSettlementReceiptSchema,
  merkle_proof: EvidenceMerkleProofSchema,
});
export type ComplianceEvidencePack = z.infer<typeof ComplianceEvidencePackSchema>;

/**
 * Result of offline or independent audit verification
 */
export const EvidenceVerificationResultSchema = z.object({
  verified: z.boolean(),
  evidence_pack_id: UUIDSchema,
  checks: z.object({
    canonical_digest_recomputed: z.boolean(),
    gateway_signature_valid: z.boolean(),
    integer_paise_invariant: z.boolean(),
    merkle_leaf_valid: z.boolean(),
    merkle_inclusion_valid: z.boolean(),
    witness_signature_valid: z.boolean(),
    settlement_authenticated: z.boolean(),
  }),
  details: z.string().optional(),
  failure_reasons: z.array(z.string()),
});
export type EvidenceVerificationResult = z.infer<typeof EvidenceVerificationResultSchema>;
