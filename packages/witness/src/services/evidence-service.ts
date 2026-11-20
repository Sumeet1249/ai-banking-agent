/**
* Automated Cryptographic Compliance Evidence Pack Service
*
* Implements:
*   - Generation of portable, tamper-evident audit evidence packs
*   - Offline verification of 7 non-negotiable cryptographic & architectural boundaries:
*       1. Deterministic canonical transaction digest RECOMPUTATION (not trusted from input)
*       2. Gateway Ed25519 digital signature checked against authenticated historical key
*       3. Integer-paise financial math invariant (strictly positive integer paise, INR)
*       4. RFC 6962 Merkle leaf hash derivation (SHA-256(0x00 || canonical_digest))
*       5. RFC 6962 Merkle tree inclusion path verification to root
*       6. Independent Witness Ed25519 detached co-signature verification
*       7. Bank Gate authenticated settlement verification (cryptographic receipt digest & signature)
*/

import { createPublicKey, verify as cryptoVerify, createHash, randomUUID } from 'crypto';
import type { Logger } from 'pino';
import {
  ComplianceEvidencePack,
  ComplianceEvidencePackSchema,
  EvidenceVerificationResult,
  EvidenceTransaction,
  EvidenceSettlementReceipt,
  EvidenceMerkleProof,
  computeCanonicalTransactionDigest,
} from '@agentguard/core-schema';
import { MerkleTreeEngine } from './merkle-engine';

export interface HistoricalKeyMetadata {
  key_id: string;
  public_key_pem: string;
  status: 'ACTIVE' | 'RETIRED' | 'REVOKED' | 'DESTROYED';
  activated_at: number;
  retired_at?: number;
  revoked_at?: number;
}

export interface VerifyEvidenceOptions {
  gatewayPublicKeyPem?: string;
  trustedWitnessPublicKeyPem?: string;
  trustedBankGatePublicKeyPem?: string;
  trustedKeyBundle?: HistoricalKeyMetadata[];
}

export class EvidencePackService {
  constructor(private logger?: Logger) { }

  /**
   * Generates a validated, exportable compliance evidence pack.
   */
  public generateEvidencePack(params: {
    tenant_id: string;
    transaction: EvidenceTransaction;
    settlement: EvidenceSettlementReceipt;
    merkle_proof: EvidenceMerkleProof;
  }): ComplianceEvidencePack {
    const pack: ComplianceEvidencePack = {
      evidence_pack_id: randomUUID(),
      pack_version: 'agentguard-evidence-v1',
      generated_at: new Date().toISOString(),
      tenant_id: params.tenant_id,
      transaction: params.transaction,
      settlement: params.settlement,
      merkle_proof: params.merkle_proof,
    };

    // Validate schema
    const validated = ComplianceEvidencePackSchema.parse(pack);
    this.logger?.info({ evidence_pack_id: validated.evidence_pack_id }, 'Generated compliance evidence pack');
    return validated;
  }

  /**
   * Canonical checkpoint representation matching Witness specification
   */
  public canonicalCheckpointString(epoch: number, seq: number, treeSize: number, rootHash: string): string {
    return `agentguard-checkpoint\nepoch:${epoch}\nseq:${seq}\nsize:${treeSize}\nroot:${rootHash.toLowerCase()}\n`;
  }

  /**
   * Computes the canonical settlement receipt digest
   */
  public computeSettlementDigest(receipt: {
    ledger_transfer_id: string;
    execution_nonce: string;
    amount_paise: number;
    status: string;
    committed_at: number;
  }): string {
    const raw = `${receipt.ledger_transfer_id}|${receipt.execution_nonce}|${receipt.amount_paise}|${receipt.status}|${receipt.committed_at}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Performs complete, offline cryptographic verification of an evidence pack.
   * Completely self-contained: requires zero network access.
   */
  public verifyEvidencePack(
    pack: ComplianceEvidencePack,
    options: VerifyEvidenceOptions = {},
  ): EvidenceVerificationResult {
    const failure_reasons: string[] = [];

    // 1. Schema check
    const schemaValidation = ComplianceEvidencePackSchema.safeParse(pack);
    if (!schemaValidation.success) {
      return {
        verified: false,
        evidence_pack_id: pack.evidence_pack_id || randomUUID(),
        checks: {
          canonical_digest_recomputed: false,
          gateway_signature_valid: false,
          integer_paise_invariant: false,
          merkle_leaf_valid: false,
          merkle_inclusion_valid: false,
          witness_signature_valid: false,
          settlement_authenticated: false,
        },
        failure_reasons: schemaValidation.error.issues.map((i) => `SCHEMA_VIOLATION: ${i.path.join('.')}: ${i.message}`),
      };
    }

    // 2. Integer-paise invariant
    const integer_paise_invariant =
      Number.isInteger(pack.transaction.amount_paise) &&
      pack.transaction.amount_paise > 0 &&
      pack.transaction.currency === 'INR';
    if (!integer_paise_invariant) {
      failure_reasons.push('INVALID_INTEGER_PAISE_INVARIANT: amount_paise must be positive integer INR');
    }

    // 3. DETERMINISTIC RECOMPUTATION OF CANONICAL TRANSACTION DIGEST (Audited: Never trust input digest)
    let canonical_digest_recomputed = false;
    try {
      const recomputedDigest = computeCanonicalTransactionDigest({
        account_ref: pack.transaction.source_account,
        action: pack.transaction.action,
        amount_paise: pack.transaction.amount_paise,
        currency: pack.transaction.currency,
        invoice_ref: pack.transaction.invoice_ref,
        payee_id: pack.transaction.payee_id,
        purpose: pack.transaction.purpose,
      });

      if (recomputedDigest.toLowerCase() !== pack.transaction.canonical_digest.toLowerCase()) {
        failure_reasons.push(
          `CANONICAL_DIGEST_MISMATCH: recomputed ${recomputedDigest} != presented ${pack.transaction.canonical_digest}`,
        );
      } else {
        canonical_digest_recomputed = true;
      }
    } catch (err: any) {
      failure_reasons.push(`CANONICAL_DIGEST_RECOMPUTATION_ERROR: ${err.message}`);
    }

    // 4. Gateway digital signature & Historical Key Lifecycle Validation
    let gateway_signature_valid = false;
    let gwPubKeyPem = options.gatewayPublicKeyPem;

    if (options.trustedKeyBundle) {
      const keyEntry = options.trustedKeyBundle.find((k) => k.key_id === pack.transaction.gateway_key_id);
      if (!keyEntry) {
        failure_reasons.push(`UNKNOWN_GATEWAY_KEY: key_id ${pack.transaction.gateway_key_id} not found in trusted bundle`);
      } else {
        gwPubKeyPem = keyEntry.public_key_pem;

        // Check if key was revoked before permit issuance
        if (keyEntry.status === 'REVOKED' && keyEntry.revoked_at && pack.transaction.issued_at >= keyEntry.revoked_at) {
          failure_reasons.push(`PERMIT_ISSUED_AFTER_KEY_REVOCATION: key was revoked at ${keyEntry.revoked_at}`);
        }

        // Check if retired key signed new permit after retirement
        if (keyEntry.status === 'RETIRED' && keyEntry.retired_at && pack.transaction.issued_at > keyEntry.retired_at) {
          failure_reasons.push(`PERMIT_ISSUED_AFTER_KEY_RETIREMENT: key was retired at ${keyEntry.retired_at}`);
        }

        // Check key activation
        if (pack.transaction.issued_at < keyEntry.activated_at) {
          failure_reasons.push(`PERMIT_ISSUED_BEFORE_KEY_ACTIVATION: key activated at ${keyEntry.activated_at}`);
        }
      }
    }

    // Only verify signature if no key lifecycle failure occurred
    const keyLifecycleFailed = failure_reasons.some(
      (r) =>
        r.includes('PERMIT_ISSUED_AFTER_KEY_REVOCATION') ||
        r.includes('PERMIT_ISSUED_AFTER_KEY_RETIREMENT') ||
        r.includes('PERMIT_ISSUED_BEFORE_KEY_ACTIVATION') ||
        r.includes('UNKNOWN_GATEWAY_KEY'),
    );

    if (gwPubKeyPem && !keyLifecycleFailed) {
      try {
        const gwKey = createPublicKey(gwPubKeyPem);
        const sigValid = cryptoVerify(
          null,
          Buffer.from(pack.transaction.canonical_digest, 'utf8'),
          gwKey,
          Buffer.from(pack.transaction.gateway_signature, 'base64'),
        );
        if (!sigValid) {
          failure_reasons.push('INVALID_GATEWAY_SIGNATURE: signature does not match canonical digest');
        } else {
          gateway_signature_valid = true;
        }
      } catch (err: any) {
        failure_reasons.push(`GATEWAY_SIGNATURE_VERIFICATION_ERROR: ${err.message}`);
      }
    } else if (!options.trustedKeyBundle && !gwPubKeyPem) {
      // Fail closed: without public key or bundle, signature cannot be verified
      failure_reasons.push('GATEWAY_PUBLIC_KEY_REQUIRED: verifier requires gatewayPublicKeyPem or trustedKeyBundle');
    }

    // 5. Merkle leaf hash derivation (RFC 6962: SHA-256(0x00 || data))
    const expectedLeaf = MerkleTreeEngine.hashLeaf(pack.transaction.canonical_digest);
    const merkle_leaf_valid = expectedLeaf.toLowerCase() === pack.merkle_proof.leaf_hash.toLowerCase();
    if (!merkle_leaf_valid) {
      failure_reasons.push(`INVALID_MERKLE_LEAF: expected ${expectedLeaf}, got ${pack.merkle_proof.leaf_hash}`);
    }

    // 6. Merkle inclusion proof verification to root
    const merkle_inclusion_valid = MerkleTreeEngine.verifyInclusion({
      leafHash: pack.merkle_proof.leaf_hash,
      index: pack.merkle_proof.leaf_index,
      treeSize: pack.merkle_proof.tree_size,
      auditPath: pack.merkle_proof.audit_path,
      expectedRoot: pack.merkle_proof.checkpoint_root,
    });
    if (!merkle_inclusion_valid) {
      failure_reasons.push('INVALID_MERKLE_INCLUSION_PROOF: audit path does not resolve to checkpoint root');
    }

    // 7. Witness detached Ed25519 co-signature verification
    let witness_signature_valid = false;
    const witnessKeyPem = options.trustedWitnessPublicKeyPem || pack.merkle_proof.witness_public_key_pem;
    try {
      const witKey = createPublicKey(witnessKeyPem);
      const canonicalCp = this.canonicalCheckpointString(
        pack.merkle_proof.epoch,
        pack.merkle_proof.sequence_number,
        pack.merkle_proof.tree_size,
        pack.merkle_proof.checkpoint_root,
      );
      const witSigValid = cryptoVerify(
        null,
        Buffer.from(canonicalCp, 'utf8'),
        witKey,
        Buffer.from(pack.merkle_proof.witness_signature, 'base64'),
      );
      if (!witSigValid) {
        failure_reasons.push('INVALID_WITNESS_SIGNATURE: witness co-signature verification failed');
      } else {
        witness_signature_valid = true;
      }
    } catch (err: any) {
      failure_reasons.push(`WITNESS_SIGNATURE_VERIFICATION_ERROR: ${err.message}`);
    }

    // 8. Bank Gate Authenticated Settlement Verification (Audited: Unsigned status prohibited)
    let settlement_authenticated = false;
    const isCommitted = pack.settlement.status === 'COMMITTED' || pack.settlement.status === 'SETTLED';
    if (!isCommitted) {
      failure_reasons.push(`SETTLEMENT_NOT_COMMITTED: status is ${pack.settlement.status}`);
    } else {
      // Recompute settlement digest
      const expectedSettlementDigest = this.computeSettlementDigest({
        ledger_transfer_id: pack.settlement.ledger_transfer_id,
        execution_nonce: pack.settlement.execution_nonce,
        amount_paise: pack.transaction.amount_paise,
        status: pack.settlement.status,
        committed_at: pack.settlement.committed_at,
      });

      if (expectedSettlementDigest.toLowerCase() !== pack.settlement.settlement_digest.toLowerCase()) {
        failure_reasons.push(
          `SETTLEMENT_DIGEST_MISMATCH: expected ${expectedSettlementDigest} != ${pack.settlement.settlement_digest}`,
        );
      } else {
        // Verify Bank Gate signature
        const bgKeyPem = options.trustedBankGatePublicKeyPem || pack.settlement.bank_gate_public_key_pem;
        try {
          const bgKey = createPublicKey(bgKeyPem);
          const bgSigValid = cryptoVerify(
            null,
            Buffer.from(pack.settlement.settlement_digest, 'utf8'),
            bgKey,
            Buffer.from(pack.settlement.bank_gate_signature, 'base64'),
          );
          if (!bgSigValid) {
            failure_reasons.push('INVALID_BANK_GATE_SETTLEMENT_SIGNATURE: Bank Gate signature rejected');
          } else {
            settlement_authenticated = true;
          }
        } catch (err: any) {
          failure_reasons.push(`BANK_GATE_SIGNATURE_VERIFICATION_ERROR: ${err.message}`);
        }
      }
    }

    const verified =
      failure_reasons.length === 0 &&
      integer_paise_invariant &&
      canonical_digest_recomputed &&
      gateway_signature_valid &&
      merkle_leaf_valid &&
      merkle_inclusion_valid &&
      witness_signature_valid &&
      settlement_authenticated;

    return {
      verified,
      evidence_pack_id: pack.evidence_pack_id,
      checks: {
        canonical_digest_recomputed,
        gateway_signature_valid,
        integer_paise_invariant,
        merkle_leaf_valid,
        merkle_inclusion_valid,
        witness_signature_valid,
        settlement_authenticated,
      },
      failure_reasons,
    };
  }
}
