import { generateKeyPairSync, sign as cryptoSign, randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { MerkleTreeEngine } from '../services/merkle-engine';
import { EvidencePackService, HistoricalKeyMetadata } from '../services/evidence-service';
import { WitnessApp } from '../server';
import {
  ComplianceEvidencePack,
  EvidenceTransaction,
  EvidenceSettlementReceipt,
  EvidenceMerkleProof,
  computeCanonicalTransactionDigest,
} from '@agentguard/core-schema';

describe('Phase 8.3 & Audit: Compliance Evidence Pack & Offline Verification', () => {
  let gwPrivKey: any;
  let gwPubKeyPem: string;
  let witPrivKey: any;
  let witPubKeyPem: string;
  let bgPrivKey: any;
  let bgPubKeyPem: string;
  let evidenceService: EvidencePackService;
  let app: WitnessApp;

  beforeAll(() => {
    // Generate Gateway Ed25519 keypair
    const gw = generateKeyPairSync('ed25519');
    gwPrivKey = gw.privateKey;
    gwPubKeyPem = gw.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    // Generate Witness Ed25519 keypair
    const wit = generateKeyPairSync('ed25519');
    witPrivKey = wit.privateKey;
    witPubKeyPem = wit.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    // Generate Bank Gate Ed25519 keypair for settlement receipt signing
    const bg = generateKeyPairSync('ed25519');
    bgPrivKey = bg.privateKey;
    bgPubKeyPem = bg.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    evidenceService = new EvidencePackService();

    const memDb = new Database(':memory:');
    app = new WitnessApp(memDb, 0, gwPubKeyPem);
  });

  function buildValidEvidencePack(overrides?: {
    amountPaise?: number;
    tamperCanonicalDigest?: boolean;
    tamperGatewaySig?: boolean;
    tamperMerkleRoot?: boolean;
    tamperWitnessSig?: boolean;
    tamperSettlementSig?: boolean;
    settlementStatus?: 'COMMITTED' | 'SETTLED' | 'ABORTED' | 'PENDING';
    issuedAt?: number;
  }): ComplianceEvidencePack {
    const rawTx = {
      source_account: 'acc_corp_001',
      action: 'vendor_disbursement',
      amount_paise: overrides?.amountPaise !== undefined ? overrides.amountPaise : 5000000, // 50,000 INR
      currency: 'INR' as const,
      invoice_ref: 'INV-2026-HQ-0019',
      payee_id: 'payee_telecom_001',
      purpose: 'Monthly Data Center Interconnect Lease',
    };

    const recomputedDigest = computeCanonicalTransactionDigest({
      account_ref: rawTx.source_account,
      action: rawTx.action,
      amount_paise: rawTx.amount_paise,
      currency: rawTx.currency,
      invoice_ref: rawTx.invoice_ref,
      payee_id: rawTx.payee_id,
      purpose: rawTx.purpose,
    });

    const canonicalDigest = overrides?.tamperCanonicalDigest
      ? '0000000000000000000000000000000000000000000000000000000000000000'
      : recomputedDigest;

    const leafHash = MerkleTreeEngine.hashLeaf(canonicalDigest);

    // Build Merkle tree with 2 leaves
    const otherLeaf = MerkleTreeEngine.hashLeaf('other-tx-data-002');
    const rootHash = MerkleTreeEngine.computeRoot([leafHash, otherLeaf]);
    const auditPath = [otherLeaf];

    // Gateway signature over canonical digest
    const gwSig = cryptoSign(null, Buffer.from(canonicalDigest, 'utf8'), gwPrivKey).toString('base64');

    // Witness co-signature over checkpoint
    const epoch = 1;
    const seq = 10;
    const treeSize = 2;
    const canonicalCp = `agentguard-checkpoint\nepoch:${epoch}\nseq:${seq}\nsize:${treeSize}\nroot:${rootHash.toLowerCase()}\n`;
    const witSig = cryptoSign(null, Buffer.from(canonicalCp, 'utf8'), witPrivKey).toString('base64');

    const txNonce = randomUUID();
    const status = overrides?.settlementStatus || 'COMMITTED';
    const committedAt = Date.now() - 4000;
    const ledgerTransferId = 'tb_xfer_998877';

    // Compute Bank Gate settlement receipt digest and signature
    const settlementDigest = evidenceService.computeSettlementDigest({
      ledger_transfer_id: ledgerTransferId,
      execution_nonce: txNonce,
      amount_paise: rawTx.amount_paise,
      status,
      committed_at: committedAt,
    });
    const bgSig = cryptoSign(null, Buffer.from(settlementDigest, 'utf8'), bgPrivKey).toString('base64');

    const tx: EvidenceTransaction = {
      permit_id: randomUUID(),
      nonce: txNonce,
      mandate_id: randomUUID(),
      tenant_id: 'tenant_hdfc_01',
      agent_id: 'agent_procure_99',
      destination_account: 'acc_vendor_002',
      ...rawTx,
      issued_at: overrides?.issuedAt !== undefined ? overrides.issuedAt : Date.now() - 5000,
      expires_at: Date.now() + 85000,
      canonical_digest: canonicalDigest,
      gateway_key_id: 'gw_key_01',
      gateway_signature: overrides?.tamperGatewaySig ? Buffer.from('invalid-sig').toString('base64') : gwSig,
    };

    const settlement: EvidenceSettlementReceipt = {
      ledger_transfer_id: ledgerTransferId,
      status,
      settlement_engine: 'tigerbeetle',
      committed_at: committedAt,
      execution_nonce: tx.nonce,
      bank_gate_id: 'bank_gate_primary_node',
      settlement_digest: settlementDigest,
      bank_gate_signature: overrides?.tamperSettlementSig ? Buffer.from('invalid-bg-sig').toString('base64') : bgSig,
      bank_gate_public_key_pem: bgPubKeyPem,
    };

    const merkle_proof: EvidenceMerkleProof = {
      checkpoint_id: randomUUID(),
      epoch,
      sequence_number: seq,
      tree_size: treeSize,
      checkpoint_root: overrides?.tamperMerkleRoot ? '1111111111111111111111111111111111111111111111111111111111111111' : rootHash,
      leaf_index: 0,
      leaf_hash: leafHash,
      audit_path: auditPath,
      witness_key_id: 'wit_key_01',
      witness_signature: overrides?.tamperWitnessSig ? Buffer.from('invalid-wit-sig').toString('base64') : witSig,
      witness_public_key_pem: witPubKeyPem,
    };

    return evidenceService.generateEvidencePack({
      tenant_id: 'tenant_hdfc_01',
      transaction: tx,
      settlement,
      merkle_proof,
    });
  }

  test('1. Generates and successfully verifies an intact compliance evidence pack', () => {
    const pack = buildValidEvidencePack();
    const result = evidenceService.verifyEvidencePack(pack, {
      gatewayPublicKeyPem: gwPubKeyPem,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(true);
    expect(result.failure_reasons).toHaveLength(0);
    expect(result.checks.canonical_digest_recomputed).toBe(true);
    expect(result.checks.gateway_signature_valid).toBe(true);
    expect(result.checks.integer_paise_invariant).toBe(true);
    expect(result.checks.merkle_leaf_valid).toBe(true);
    expect(result.checks.merkle_inclusion_valid).toBe(true);
    expect(result.checks.witness_signature_valid).toBe(true);
    expect(result.checks.settlement_authenticated).toBe(true);
  });

  test('2. Fails verification when canonical digest is tampered (recomputation mismatch)', () => {
    const pack = buildValidEvidencePack({ tamperCanonicalDigest: true });
    const result = evidenceService.verifyEvidencePack(pack, {
      gatewayPublicKeyPem: gwPubKeyPem,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(false);
    expect(result.checks.canonical_digest_recomputed).toBe(false);
    expect(result.failure_reasons).toContainEqual(expect.stringContaining('CANONICAL_DIGEST_MISMATCH'));
  });

  test('3. Fails verification when Bank Gate settlement signature is invalid or forged', () => {
    const pack = buildValidEvidencePack({ tamperSettlementSig: true });
    const result = evidenceService.verifyEvidencePack(pack, {
      gatewayPublicKeyPem: gwPubKeyPem,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(false);
    expect(result.checks.settlement_authenticated).toBe(false);
    expect(result.failure_reasons).toContainEqual(expect.stringContaining('INVALID_BANK_GATE_SETTLEMENT_SIGNATURE'));
  });

  test('4. Historical key verification: permits signed by retired keys are accepted if issued before retirement', () => {
    const retiredAt = Date.now() - 10000;
    const pack = buildValidEvidencePack({ issuedAt: retiredAt - 2000 }); // Issued before retirement

    const trustedBundle: HistoricalKeyMetadata[] = [
      {
        key_id: 'gw_key_01',
        public_key_pem: gwPubKeyPem,
        status: 'RETIRED',
        activated_at: retiredAt - 100000,
        retired_at: retiredAt,
      },
    ];

    const result = evidenceService.verifyEvidencePack(pack, {
      trustedKeyBundle: trustedBundle,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(true);
    expect(result.checks.gateway_signature_valid).toBe(true);
  });

  test('5. Historical key verification: permits signed by retired keys are REJECTED if issued after retirement', () => {
    const retiredAt = Date.now() - 10000;
    const pack = buildValidEvidencePack({ issuedAt: retiredAt + 2000 }); // Issued after retirement

    const trustedBundle: HistoricalKeyMetadata[] = [
      {
        key_id: 'gw_key_01',
        public_key_pem: gwPubKeyPem,
        status: 'RETIRED',
        activated_at: retiredAt - 100000,
        retired_at: retiredAt,
      },
    ];

    const result = evidenceService.verifyEvidencePack(pack, {
      trustedKeyBundle: trustedBundle,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(false);
    expect(result.failure_reasons).toContainEqual(expect.stringContaining('PERMIT_ISSUED_AFTER_KEY_RETIREMENT'));
  });

  test('6. Fails verification when Gateway signature is forged or tampered', () => {
    const pack = buildValidEvidencePack({ tamperGatewaySig: true });
    const result = evidenceService.verifyEvidencePack(pack, {
      gatewayPublicKeyPem: gwPubKeyPem,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(false);
    expect(result.checks.gateway_signature_valid).toBe(false);
    expect(result.failure_reasons).toContainEqual(expect.stringContaining('INVALID_GATEWAY_SIGNATURE'));
  });

  test('7. Fails verification when Merkle inclusion proof or root is tampered', () => {
    const pack = buildValidEvidencePack({ tamperMerkleRoot: true });
    const result = evidenceService.verifyEvidencePack(pack, {
      gatewayPublicKeyPem: gwPubKeyPem,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(false);
    expect(result.checks.merkle_inclusion_valid).toBe(false);
    expect(result.failure_reasons).toContainEqual(expect.stringContaining('INVALID_MERKLE_INCLUSION_PROOF'));
  });

  test('8. Fails verification when Witness co-signature is invalid', () => {
    const pack = buildValidEvidencePack({ tamperWitnessSig: true });
    const result = evidenceService.verifyEvidencePack(pack, {
      gatewayPublicKeyPem: gwPubKeyPem,
      trustedWitnessPublicKeyPem: witPubKeyPem,
      trustedBankGatePublicKeyPem: bgPubKeyPem,
    });

    expect(result.verified).toBe(false);
    expect(result.checks.witness_signature_valid).toBe(false);
    expect(result.failure_reasons).toContainEqual(expect.stringContaining('INVALID_WITNESS_SIGNATURE'));
  });
});
