/**
 * AgentGuard Agent Identity Registry (Phase TI-2)
 * Manages verified agent cryptographic identities, roles, trust scoring,
 * and parent-child hierarchical trust relationships.
 */

import crypto from 'crypto';
import { AgentTrustIdentity, AgentTrustState } from '@agentguard/core-schema';
import { TrustDataStore } from '../db/trust-store';

export interface RegisterAgentParams {
  agentId: string;
  name: string;
  role: string;
  ownerRef: string;
  tenantId: string;
  publicKeyEd25519: string;
  keyId?: string;
  parentAgentId?: string | null;
  trustScore?: number;
  version?: string;
}

export class AgentIdentityRegistry {
  constructor(private readonly store: TrustDataStore) {}

  /**
   * Register a new agent with verified Ed25519 public key.
   * Enforces that child agents can only be registered if parent exists and is ACTIVE.
   */
  public registerAgent(params: RegisterAgentParams): AgentTrustIdentity {
    // 1. Verify parent agent if specified
    if (params.parentAgentId) {
      const parent = this.store.getAgentIdentity(params.parentAgentId);
      if (!parent) {
        throw new Error(`Parent agent ${params.parentAgentId} not found`);
      }
      if (parent.status !== 'ACTIVE') {
        throw new Error(`Cannot register child under inactive or quarantined parent ${params.parentAgentId}`);
      }
      if (parent.tenant_id !== params.tenantId) {
        throw new Error(`Tenant mismatch between parent (${parent.tenant_id}) and child (${params.tenantId})`);
      }
    }

    const now = Date.now();
    const keyId = params.keyId || `key-${params.agentId}-${now}`;

    const agent: AgentTrustIdentity = {
      agent_id: params.agentId,
      name: params.name,
      role: params.role,
      owner_ref: params.ownerRef,
      tenant_id: params.tenantId,
      public_key_ed25519: params.publicKeyEd25519,
      key_id: keyId,
      parent_agent_id: params.parentAgentId || null,
      trust_score: params.trustScore ?? 800,
      status: 'ACTIVE',
      version: params.version || '1.0.0',
      created_at: now,
      updated_at: now,
    };

    this.store.saveAgentIdentity(agent);

    // Save initial credential
    this.store.saveCredential({
      credential_id: `cred-${keyId}`,
      agent_id: params.agentId,
      key_id: keyId,
      algorithm: 'Ed25519',
      public_key: params.publicKeyEd25519,
      valid_from: now,
      valid_to: now + 86400000 * 365, // 1 year default
      rotation_history: [],
    });

    return agent;
  }

  public updateTrustScore(agentId: string, delta: number, reason?: string): AgentTrustIdentity {
    this.adjustTrustScore(agentId, delta);
    return this.store.getAgentIdentity(agentId)!;
  }

  public updateStatus(agentId: string, status: AgentTrustState, reason?: string): AgentTrustIdentity {
    this.setAgentStatus(agentId, status, reason || '', 'OPERATOR');
    return this.store.getAgentIdentity(agentId)!;
  }

  public getAgent(agentId: string): AgentTrustIdentity | null {
    return this.store.getAgentIdentity(agentId);
  }

  public listAgents(tenantId?: string): AgentTrustIdentity[] {
    return this.store.listAgentIdentities(tenantId);
  }

  /**
   * Transition agent trust status (ACTIVE -> RESTRICTED -> QUARANTINED -> REVOKED)
   * If an agent is quarantined or revoked, all child sub-agents are cascaded in the same operation (Rule I7).
   */
  public setAgentStatus(
    agentId: string,
    status: AgentTrustState,
    reason: string,
    operatorRef: string
  ): void {
    const agent = this.store.getAgentIdentity(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.store.updateAgentStatus(agentId, status as any, reason, operatorRef);

    // Cascade to children if non-active state
    if (status === 'QUARANTINED' || status === 'REVOKED' || status === 'RESTRICTED') {
      const allAgents = this.store.listAgentIdentities(agent.tenant_id);
      const children = allAgents.filter((a) => a.parent_agent_id === agentId);
      for (const child of children) {
        this.store.updateAgentStatus(
          child.agent_id,
          status as any,
          `Cascaded from parent ${agentId}: ${reason}`,
          operatorRef
        );
      }
    }
  }

  /**
   * Adjust trust score dynamically based on positive execution or detected violations
   */
  public adjustTrustScore(agentId: string, delta: number): number {
    const agent = this.store.getAgentIdentity(agentId);
    if (!agent) return 0;

    const newScore = Math.max(0, Math.min(1000, agent.trust_score + delta));
    const updated: AgentTrustIdentity = {
      ...agent,
      trust_score: newScore,
      updated_at: Date.now(),
    };
    this.store.saveAgentIdentity(updated);
    return newScore;
  }
}
