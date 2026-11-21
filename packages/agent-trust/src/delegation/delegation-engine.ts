import { AgentDelegation, AgentTrustIdentity } from '@agentguard/core-schema';
import { TrustStore } from '../db/trust-store';

export interface DelegationValidationResult {
  valid: boolean;
  reason?: string;
  delegation?: AgentDelegation;
}

export class DelegationEngine {
  private store: TrustStore;

  constructor(store: TrustStore) {
    this.store = store;
  }

  /**
   * Issue a child delegation from parent agent to child agent with capability narrowing.
   */
  public createDelegation(params: {
    delegation_id: string;
    tenant_id: string;
    customer_ref: string;
    agent_id: string;
    parent_agent_id?: string;
    parent_delegation_id?: string;
    allowed_tools: string[];
    allowed_resources?: string[];
    permitted_actions?: string[];
    purpose: string;
    max_amount_paise?: number;
    daily_max_paise?: number;
    usage_quota?: number;
    expires_at: number;
  }): { success: boolean; delegation?: AgentDelegation; error?: string } {
    const now = Date.now();

    // 1. Verify target agent exists and is active
    const targetAgent = this.store.getAgent(params.agent_id);
    if (!targetAgent) {
      return { success: false, error: `Agent ${params.agent_id} not found` };
    }
    if (targetAgent.status !== 'ACTIVE') {
      return { success: false, error: `Agent ${params.agent_id} is not ACTIVE (status: ${targetAgent.status})` };
    }

    let calculatedDepth = 0;
    let parentDelegation: AgentDelegation | null = null;

    if (params.parent_delegation_id) {
      parentDelegation = this.store.getDelegation(params.parent_delegation_id);
      if (!parentDelegation) {
        return { success: false, error: `Parent delegation ${params.parent_delegation_id} not found` };
      }
      if (parentDelegation.status !== 'ACTIVE') {
        return { success: false, error: `Parent delegation is not ACTIVE` };
      }
      if (now > parentDelegation.expires_at) {
        return { success: false, error: `Parent delegation has expired` };
      }

      calculatedDepth = parentDelegation.delegation_depth + 1;
      if (calculatedDepth > parentDelegation.max_delegation_depth) {
        return {
          success: false,
          error: `Delegation depth ${calculatedDepth} exceeds max allowed depth ${parentDelegation.max_delegation_depth}`,
        };
      }

      if (params.expires_at > parentDelegation.expires_at) {
        return { success: false, error: `Child expiry cannot exceed parent delegation expiry (${parentDelegation.expires_at})` };
      }

      // Check financial cap narrowing (Rule E1: integer paise)
      if (
        params.max_amount_paise !== undefined &&
        parentDelegation.max_amount_paise !== undefined &&
        parentDelegation.max_amount_paise !== null &&
        params.max_amount_paise > parentDelegation.max_amount_paise
      ) {
        return {
          success: false,
          error: `Child max_amount_paise (${params.max_amount_paise}) exceeds parent limit (${parentDelegation.max_amount_paise})`,
        };
      }
      if (
        params.daily_max_paise !== undefined &&
        parentDelegation.daily_max_paise !== undefined &&
        parentDelegation.daily_max_paise !== null &&
        params.daily_max_paise > parentDelegation.daily_max_paise
      ) {
        return {
          success: false,
          error: `Child daily_max_paise (${params.daily_max_paise}) exceeds parent limit (${parentDelegation.daily_max_paise})`,
        };
      }

      // Check tool narrowing
      const parentTools = new Set(parentDelegation.allowed_tools);
      for (const tool of params.allowed_tools) {
        if (!parentTools.has(tool) && !parentTools.has('*')) {
          return { success: false, error: `Child requested tool '${tool}' which is not in parent allowed_tools` };
        }
      }
    }

    const delegation: AgentDelegation = {
      delegation_id: params.delegation_id,
      tenant_id: params.tenant_id,
      customer_ref: params.customer_ref,
      agent_id: params.agent_id,
      parent_delegation_id: params.parent_delegation_id || null,
      allowed_tools: params.allowed_tools,
      allowed_resources: params.allowed_resources || ['*'],
      permitted_actions: params.permitted_actions || ['*'],
      purpose: params.purpose,
      max_amount_paise: params.max_amount_paise ?? null,
      daily_max_paise: params.daily_max_paise ?? null,
      delegation_depth: calculatedDepth,
      max_delegation_depth: parentDelegation ? parentDelegation.max_delegation_depth : 2,
      usage_quota: params.usage_quota ?? 100,
      usage_count: 0,
      valid_from: now,
      expires_at: params.expires_at,
      status: 'ACTIVE',
    };

    this.store.insertDelegation(delegation);
    return { success: true, delegation };
  }

  /**
   * Validate if delegation is active, unexpired, within usage quota, and agent is active.
   */
  public validateDelegation(delegation_id: string, now: number = Date.now()): DelegationValidationResult {
    const delegation = this.store.getDelegation(delegation_id);
    if (!delegation) {
      return { valid: false, reason: `Delegation '${delegation_id}' not found` };
    }

    if (delegation.status !== 'ACTIVE') {
      return { valid: false, reason: `Delegation '${delegation_id}' is ${delegation.status}`, delegation };
    }

    if (now < delegation.valid_from) {
      return { valid: false, reason: `Delegation is not yet valid (valid from ${delegation.valid_from})`, delegation };
    }

    if (now > delegation.expires_at) {
      return { valid: false, reason: `Delegation has expired at ${delegation.expires_at}`, delegation };
    }

    if (delegation.usage_quota && delegation.usage_count >= delegation.usage_quota) {
      return {
        valid: false,
        reason: `Delegation usage quota exhausted (${delegation.usage_count}/${delegation.usage_quota})`,
        delegation,
      };
    }

    // Check agent status
    const agent = this.store.getAgent(delegation.agent_id);
    if (!agent || agent.status !== 'ACTIVE') {
      return {
        valid: false,
        reason: `Agent ${delegation.agent_id} is not ACTIVE (status: ${agent?.status || 'UNKNOWN'})`,
        delegation,
      };
    }

    // If there is a parent agent, check parent agent status
    if (agent.parent_agent_id) {
      const parentAgent = this.store.getAgent(agent.parent_agent_id);
      if (!parentAgent || parentAgent.status !== 'ACTIVE') {
        return {
          valid: false,
          reason: `Parent agent ${agent.parent_agent_id} is not ACTIVE (status: ${parentAgent?.status || 'UNKNOWN'})`,
          delegation,
        };
      }
    }

    return { valid: true, delegation };
  }

  public incrementUsage(delegation_id: string): void {
    this.store.incrementDelegationUsage(delegation_id);
  }

  public revokeDelegation(delegation_id: string, operatorRef: string): { revokedCount: number } {
    this.store.revokeDelegation(delegation_id, operatorRef);
    return { revokedCount: 1 };
  }
}
