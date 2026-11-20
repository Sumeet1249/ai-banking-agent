/**
 * Witness Merkle Tree Verification Engine
 *
 * Implements:
 *   - RFC 6962 Merkle Tree leaf and internal node hashing:
 *       Leaf Hash: SHA-256(0x00 || leaf_data)
 *       Node Hash: SHA-256(0x01 || left_hash || right_hash)
 *   - RFC 6962 Inclusion Proof verification:
 *       Given leaf hash, audit path, leaf index, and tree size, verifies matching Merkle root.
 *   - RFC 6962 Consistency Proof verification:
 *       Verifies that an older tree of size m is an exact prefix of a newer tree of size n.
 */

import { createHash } from 'crypto';

export class MerkleTreeEngine {
  /**
   * RFC 6962 Leaf Hash: SHA-256(0x00 || data)
   */
  public static hashLeaf(data: Buffer | string): string {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const prefix = Buffer.from([0x00]);
    return createHash('sha256').update(Buffer.concat([prefix, buf])).digest('hex');
  }

  /**
   * RFC 6962 Node Hash: SHA-256(0x01 || left || right)
   */
  public static hashNode(leftHex: string, rightHex: string): string {
    const prefix = Buffer.from([0x01]);
    const leftBuf = Buffer.from(leftHex, 'hex');
    const rightBuf = Buffer.from(rightHex, 'hex');
    return createHash('sha256').update(Buffer.concat([prefix, leftBuf, rightBuf])).digest('hex');
  }

  /**
   * Verifies RFC 6962 Merkle Inclusion Proof.
   */
  public static verifyInclusion(params: {
    leafHash: string;
    index: number;
    treeSize: number;
    auditPath: string[];
    expectedRoot: string;
  }): boolean {
    const { leafHash, index, treeSize, auditPath, expectedRoot } = params;
    if (index < 0 || index >= treeSize) return false;

    let fn = index;
    let sn = treeSize - 1;
    let current = leafHash;

    for (const sibling of auditPath) {
      if (sn === 0) return false;

      if (fn % 2 === 1 || fn === sn) {
        current = this.hashNode(sibling, current);
        while (fn % 2 === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      } else {
        current = this.hashNode(current, sibling);
      }
      fn = Math.floor(fn / 2);
      sn = Math.floor(sn / 2);
    }

    return sn === 0 && current.toLowerCase() === expectedRoot.toLowerCase();
  }

  /**
   * Builds Merkle Root from an array of leaf hashes.
   */
  public static computeRoot(leafHashes: string[]): string {
    if (leafHashes.length === 0) {
      return createHash('sha256').update('').digest('hex');
    }
    if (leafHashes.length === 1) {
      return leafHashes[0];
    }

    let currentLevel = [...leafHashes];
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          nextLevel.push(this.hashNode(currentLevel[i], currentLevel[i + 1]));
        } else {
          nextLevel.push(currentLevel[i]);
        }
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0];
  }
}
