/**
 * Independent Witness Unit & Merkle Co-Signing Test Suite
 *
 * Verifies:
 *   - Autonomous Ed25519 keypair generation and isolation (Decision D17)
 *   - Monotonic epoch & sequence number enforcement (sequence regression rejection)
 *   - Co-signing of valid Gateway Merkle roots
 *   - RFC 6962 Merkle tree computation and inclusion proof verification
 */

import Database from 'better-sqlite3';
import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPublicKey,
} from 'crypto';
import { MerkleTreeEngine } from '../services/merkle-engine';
import { WitnessStore } from '../db/witness-store';
import { WitnessCoSigningService } from '../services/witness-service';

describe('Phase 4.1: Independent Witness & Checkpoint Co-Signing', () => {
  let db: Database.Database;
  let store: WitnessStore;
  let witnessService: WitnessCoSigningService;

  let gwPrivateKey: any;
  let gwPublicKeyPem: string;

  beforeEach(() => {
    // Generate Gateway signing keypair
    const gwKeypair = generateKeyPairSync('ed25519');
    gwPrivateKey = gwKeypair.privateKey;
    gwPublicKeyPem = gwKeypair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    // Dedicated in-memory DB for Witness (simulating witness.db)
    db = new Database(':memory:');
    store = new WitnessStore(db);
    witnessService = new WitnessCoSigningService(store, gwPublicKeyPem);
  });

  afterEach(() => {
    db.close();
  });

  describe('RFC 6962 Merkle Tree Engine', () => {
    it('computes leaf hashes using 0x00 prefix and node hashes using 0x01 prefix', () => {
      const leaf1 = MerkleTreeEngine.hashLeaf('audit_event_1');
      const leaf2 = MerkleTreeEngine.hashLeaf('audit_event_2');

      expect(leaf1).toMatch(/^[a-f0-9]{64}$/);
      expect(leaf2).toMatch(/^[a-f0-9]{64}$/);
      expect(leaf1).not.toBe(leaf2);

      const parentNode = MerkleTreeEngine.hashNode(leaf1, leaf2);
      expect(parentNode).toMatch(/^[a-f0-9]{64}$/);
    });

    it('verifies RFC 6962 Merkle inclusion proof correctly', () => {
      const leaves = [
        MerkleTreeEngine.hashLeaf('event_0'),
        MerkleTreeEngine.hashLeaf('event_1'),
        MerkleTreeEngine.hashLeaf('event_2'),
        MerkleTreeEngine.hashLeaf('event_3'),
      ];

      const node01 = MerkleTreeEngine.hashNode(leaves[0], leaves[1]);
      const node23 = MerkleTreeEngine.hashNode(leaves[2], leaves[3]);
      const root = MerkleTreeEngine.hashNode(node01, node23);

      // Audit path for leaf 0: sibling is leaf 1, and parent sibling is node 23
      const auditPathForLeaf0 = [leaves[1], node23];

      const validInclusion = MerkleTreeEngine.verifyInclusion({
        leafHash: leaves[0],
        index: 0,
        treeSize: 4,
        auditPath: auditPathForLeaf0,
        expectedRoot: root,
      });

      expect(validInclusion).toBe(true);

      // Mutated leaf fails verification
      const invalidInclusion = MerkleTreeEngine.verifyInclusion({
        leafHash: MerkleTreeEngine.hashLeaf('tampered_event'),
        index: 0,
        treeSize: 4,
        auditPath: auditPathForLeaf0,
        expectedRoot: root,
      });

      expect(invalidInclusion).toBe(false);
    });
  });

  describe('Autonomous Co-Signing & Sequence Enforcement', () => {
    it('verifies Gateway signature and attaches independent Witness co-signature', () => {
      const epoch = 1;
      const seq = 1;
      const size = 10;
      const root = 'a'.repeat(64);

      const canonicalString = witnessService.canonicalCheckpointString(epoch, seq, size, root);
      const gwSig = cryptoSign(null, Buffer.from(canonicalString, 'utf8'), gwPrivateKey).toString('base64');

      const result = witnessService.submitAndCoSign({
        epoch,
        sequence_number: seq,
        tree_size: size,
        root_hash: root,
        gateway_signature: gwSig,
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint).toBeDefined();

      const cp = result.checkpoint!;
      expect(cp.witness_key_id).toBe(witnessService.getKeyId());
      expect(cp.witness_signature).toBeDefined();

      // Verify Witness co-signature using Witness public key
      const witnessPubKey = createPublicKey(witnessService.getPublicKeyPem());
      const isWitnessSigValid = cryptoVerify(
        null,
        Buffer.from(canonicalString, 'utf8'),
        witnessPubKey,
        Buffer.from(cp.witness_signature, 'base64'),
      );
      expect(isWitnessSigValid).toBe(true);
    });

    it('rejects sequence regression (sequence_number <= latest in same epoch)', () => {
      const root = 'b'.repeat(64);

      // First checkpoint at seq 5
      const str1 = witnessService.canonicalCheckpointString(1, 5, 20, root);
      const sig1 = cryptoSign(null, Buffer.from(str1, 'utf8'), gwPrivateKey).toString('base64');
      const res1 = witnessService.submitAndCoSign({
        epoch: 1,
        sequence_number: 5,
        tree_size: 20,
        root_hash: root,
        gateway_signature: sig1,
      });
      expect(res1.success).toBe(true);

      // Attempting to submit seq 4 in epoch 1 must fail
      const str2 = witnessService.canonicalCheckpointString(1, 4, 21, root);
      const sig2 = cryptoSign(null, Buffer.from(str2, 'utf8'), gwPrivateKey).toString('base64');
      const res2 = witnessService.submitAndCoSign({
        epoch: 1,
        sequence_number: 4,
        tree_size: 21,
        root_hash: root,
        gateway_signature: sig2,
      });

      expect(res2.success).toBe(false);
      expect(res2.reason).toBe('SEQUENCE_REGRESSION');
    });

    it('rejects invalid Gateway signature on checkpoint submission', () => {
      const root = 'c'.repeat(64);
      const result = witnessService.submitAndCoSign({
        epoch: 1,
        sequence_number: 1,
        tree_size: 5,
        root_hash: root,
        gateway_signature: 'invalid_base64_sig',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('SIG');
    });

    it('rotates Witness co-signing key independently and preserves audit history', () => {
      const initialKeyId = witnessService.getKeyId();
      expect(initialKeyId).toMatch(/^wit_key_/);

      const rotated = witnessService.rotateWitnessKey('Scheduled monthly witness rotation');
      expect(rotated.newKeyId).not.toBe(initialKeyId);
      expect(witnessService.getKeyId()).toBe(rotated.newKeyId);

      const history = witnessService.getWitnessKeyHistory();
      expect(history.length).toBe(1);
      expect(history[0].key_id).toBe(initialKeyId);
      expect(history[0].reason).toBe('Scheduled monthly witness rotation');
    });
  });
});
