/**
 * Witness Co-Signing & Audit Checkpoint Service
 *
 * Implements:
 *   - Autonomous Ed25519 keypair generation and management (isolated from Gateway keys)
 *   - Independent verification of incoming Gateway checkpoint root & signature
 *   - Monotonic epoch & sequence number enforcement (sequence regression rejection)
 *   - RFC 6962 inclusion proof verification
 *   - Ed25519 co-signature generation over canonical checkpoint representation
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  KeyObject,
  randomUUID,
} from 'crypto';
import type { Logger } from 'pino';
import { WitnessStore, WitnessCheckpointRow } from '../db/witness-store';
import { MerkleTreeEngine } from './merkle-engine';

export interface SubmitCheckpointParams {
  epoch: number;
  sequence_number: number;
  tree_size: number;
  root_hash: string;
  gateway_signature: string;
}

export class WitnessCoSigningService {
  private witnessPrivateKey!: KeyObject;
  private witnessPublicKey!: KeyObject;
  private witnessPublicKeyPem!: string;
  private witnessKeyId!: string;

  constructor(
    private store: WitnessStore,
    private gatewayPublicKeyPem?: string,
    private logger?: Logger,
  ) {
    this.initKeys();
  }

  private initKeys(): void {
    const privPem = this.store.getConfig('witness_private_key');
    const pubPem = this.store.getConfig('witness_public_key');
    const keyId = this.store.getConfig('witness_key_id');

    if (privPem && pubPem && keyId) {
      this.witnessPrivateKey = createPrivateKey(privPem);
      this.witnessPublicKey = createPublicKey(pubPem);
      this.witnessPublicKeyPem = pubPem;
      this.witnessKeyId = keyId;
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.witnessPrivateKey = privateKey;
      this.witnessPublicKey = publicKey;

      const newPrivPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const newPubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const newKeyId = 'wit_key_' + randomUUID().substring(0, 8);

      this.witnessPublicKeyPem = newPubPem;
      this.witnessKeyId = newKeyId;

      this.store.setConfig('witness_private_key', newPrivPem);
      this.store.setConfig('witness_public_key', newPubPem);
      this.store.setConfig('witness_key_id', newKeyId);
    }
  }

  public getPublicKeyPem(): string {
    return this.witnessPublicKeyPem;
  }

  public getKeyId(): string {
    return this.witnessKeyId;
  }

  /**
   * Rotates Witness Ed25519 co-signing key and stores prior key in historical ledger.
   */
  public rotateWitnessKey(reason: string = 'Scheduled rotation'): { newKeyId: string; newPublicKeyPem: string } {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const newPrivPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const newPubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    const newKeyId = 'wit_key_' + randomUUID().substring(0, 8);

    // Save previous active key in history
    const historyJson = this.store.getConfig('witness_key_history') || '[]';
    let history: any[] = [];
    try {
      history = JSON.parse(historyJson);
    } catch {
      history = [];
    }
    history.push({
      key_id: this.witnessKeyId,
      public_key_pem: this.witnessPublicKeyPem,
      retired_at: Date.now(),
      reason,
    });
    this.store.setConfig('witness_key_history', JSON.stringify(history));

    this.witnessPrivateKey = privateKey;
    this.witnessPublicKey = publicKey;
    this.witnessPublicKeyPem = newPubPem;
    this.witnessKeyId = newKeyId;

    this.store.setConfig('witness_private_key', newPrivPem);
    this.store.setConfig('witness_public_key', newPubPem);
    this.store.setConfig('witness_key_id', newKeyId);

    this.logger?.info({ new_key_id: newKeyId, reason }, 'Witness rotated co-signing key');
    return { newKeyId, newPublicKeyPem: newPubPem };
  }

  public getWitnessKeyHistory(): any[] {
    const historyJson = this.store.getConfig('witness_key_history') || '[]';
    try {
      return JSON.parse(historyJson);
    } catch {
      return [];
    }
  }

  /**
   * Canonically formats a checkpoint string for signature:
   *   "agentguard-checkpoint\nepoch:<n>\nseq:<n>\nsize:<n>\nroot:<hex>\n"
   */
  public canonicalCheckpointString(epoch: number, seq: number, treeSize: number, rootHash: string): string {
    return `agentguard-checkpoint\nepoch:${epoch}\nseq:${seq}\nsize:${treeSize}\nroot:${rootHash.toLowerCase()}\n`;
  }

  /**
   * Verifies Gateway submission, checks monotonic sequence, and attaches Witness co-signature.
   */
  public submitAndCoSign(params: SubmitCheckpointParams): {
    success: boolean;
    reason?: string;
    checkpoint?: WitnessCheckpointRow;
  } {
    const { epoch, sequence_number, tree_size, root_hash, gateway_signature } = params;

    // 1. Monotonic sequence check against latest checkpoint
    const latest = this.store.getLatestCheckpoint();
    if (latest) {
      if (epoch < latest.epoch) {
        return { success: false, reason: 'EPOCH_REGRESSION' };
      }
      if (epoch === latest.epoch && sequence_number <= latest.sequence_number) {
        return { success: false, reason: 'SEQUENCE_REGRESSION' };
      }
      if (tree_size < latest.tree_size) {
        return { success: false, reason: 'TREE_SIZE_REGRESSION' };
      }
    }

    // 2. Gateway signature verification if gateway public key is configured
    const canonicalString = this.canonicalCheckpointString(epoch, sequence_number, tree_size, root_hash);
    if (this.gatewayPublicKeyPem) {
      try {
        const gwKey = createPublicKey(this.gatewayPublicKeyPem);
        const validGwSig = cryptoVerify(
          null,
          Buffer.from(canonicalString, 'utf8'),
          gwKey,
          Buffer.from(gateway_signature, 'base64'),
        );
        if (!validGwSig) {
          return { success: false, reason: 'INVALID_GATEWAY_SIGNATURE' };
        }
      } catch (err: any) {
        return { success: false, reason: `GATEWAY_SIG_VERIFY_ERROR: ${err.message}` };
      }
    }

    // 3. Compute Witness detached Ed25519 co-signature
    const witnessSigBuf = cryptoSign(
      null,
      Buffer.from(canonicalString, 'utf8'),
      this.witnessPrivateKey,
    );
    const witnessSignature = witnessSigBuf.toString('base64');

    const checkpointId = randomUUID();
    const row: WitnessCheckpointRow = {
      checkpoint_id: checkpointId,
      epoch,
      sequence_number,
      tree_size,
      root_hash,
      gateway_signature,
      witness_signature: witnessSignature,
      witness_key_id: this.witnessKeyId,
      created_at: Date.now(),
    };

    this.store.recordCheckpoint(row);
    return { success: true, checkpoint: row };
  }

  /**
   * Verifies RFC 6962 audit proof against a co-signed checkpoint root.
   */
  public verifyProof(params: {
    checkpointId: string;
    leafHash: string;
    index: number;
    auditPath: string[];
  }): { valid: boolean; reason?: string } {
    const cp = this.store.getCheckpoint(params.checkpointId);
    if (!cp) {
      return { valid: false, reason: 'CHECKPOINT_NOT_FOUND' };
    }

    const matches = MerkleTreeEngine.verifyInclusion({
      leafHash: params.leafHash,
      index: params.index,
      treeSize: cp.tree_size,
      auditPath: params.auditPath,
      expectedRoot: cp.root_hash,
    });

    return { valid: matches, reason: matches ? undefined : 'INCLUSION_PROOF_MISMATCH' };
  }
}
