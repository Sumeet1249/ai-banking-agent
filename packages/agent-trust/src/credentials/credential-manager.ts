/**
 * AgentGuard Credential Manager (Phase TI-2)
 * Manages Ed25519 public keys, key rotation with zero-downtime grace period,
 * and key revocation. Historical keys are preserved for audit verification.
 */

import { AgentCredential } from '@agentguard/core-schema';
import { TrustDataStore } from '../db/trust-store';

export class CredentialManager {
  constructor(private readonly store: TrustDataStore) {}

  public registerKey(params: {
    agentId: string;
    keyId: string;
    publicKeyEd25519: string;
    validityMs?: number;
  }): AgentCredential {
    const now = Date.now();
    const cred: AgentCredential = {
      credential_id: `cred-${params.keyId}`,
      agent_id: params.agentId,
      key_id: params.keyId,
      algorithm: 'Ed25519',
      public_key: params.publicKeyEd25519,
      valid_from: now,
      valid_to: now + (params.validityMs || 86400000 * 365),
      rotation_history: [],
    };
    this.store.saveCredential(cred);
    return cred;
  }

  /**
   * Rotate agent key without downtime.
   * Old key is preserved for historical audit log verification, but active signing is switched.
   */
  public rotateKey(params: {
    agentId: string;
    oldKeyId: string;
    newKeyId: string;
    newPublicKeyEd25519: string;
    gracePeriodMs?: number;
  }): { oldCredential: AgentCredential; newCredential: AgentCredential } {
    const old = this.store.getCredential(params.oldKeyId);
    if (!old) {
      throw new Error(`Old credential ${params.oldKeyId} not found`);
    }

    const now = Date.now();
    const gracePeriod = params.gracePeriodMs || 3600000; // 1 hour grace period

    // 1. Update old credential valid_to to expire after grace period
    const updatedOld: AgentCredential = {
      ...old,
      valid_to: now + gracePeriod,
      rotation_history: [...old.rotation_history, `Rotated to ${params.newKeyId} at ${now}`],
    };
    this.store.saveCredential(updatedOld);

    // 2. Create new credential
    const newCred: AgentCredential = {
      credential_id: `cred-${params.newKeyId}`,
      agent_id: params.agentId,
      key_id: params.newKeyId,
      algorithm: 'Ed25519',
      public_key: params.newPublicKeyEd25519,
      valid_from: now,
      valid_to: now + 86400000 * 365,
      rotation_history: [`Rotated from ${params.oldKeyId} at ${now}`],
    };
    this.store.saveCredential(newCred);

    // 3. Update agent's active key_id in identity registry
    const agent = this.store.getAgentIdentity(params.agentId);
    if (agent) {
      this.store.saveAgentIdentity({
        ...agent,
        key_id: params.newKeyId,
        public_key_ed25519: params.newPublicKeyEd25519,
        updated_at: now,
      });
    }

    return { oldCredential: updatedOld, newCredential: newCred };
  }

  public getCredential(keyId: string): AgentCredential | null {
    return this.store.getCredential(keyId);
  }

  public revokeKey(keyId: string, reason: string): void {
    this.store.revokeCredential(keyId, reason);
  }

  public getActiveCredentials(agentId: string): AgentCredential[] {
    const db = (this.store as any).getDb ? (this.store as any).getDb() : (this.store as any).db;
    const now = Date.now();
    const rows = db.prepare('SELECT * FROM agent_credentials WHERE agent_id = ? AND valid_to > ? AND revoked_at IS NULL').all(agentId, now) as any[];
    return rows.map((r: any) => ({
      ...r,
      rotation_history: JSON.parse(r.rotation_history || '[]'),
    }));
  }
}
