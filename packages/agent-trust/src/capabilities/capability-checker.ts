import { AgentTrustIdentity, AgentDelegation } from '@agentguard/core-schema';

export interface CapabilityCheckResult {
  allowed: boolean;
  reason?: string;
  code?: 'TOOL_NOT_ALLOWED' | 'ACTION_NOT_PERMITTED' | 'RESOURCE_DENIED' | 'TX_LIMIT_EXCEEDED' | 'DAILY_LIMIT_EXCEEDED' | 'DELEGATION_RESTRICTION';
}

export interface CapabilityCheckRequest {
  agent: AgentTrustIdentity;
  delegation?: AgentDelegation | null;
  tool_name: string;
  action_type?: string;
  resource_uri?: string;
  amount_paise?: number; // Integer paise (Rule E1)
  current_daily_spent_paise?: number; // Integer paise (Rule E1)
}

export class CapabilityChecker {
  public static check(req: CapabilityCheckRequest): CapabilityCheckResult {
    const { agent, delegation, tool_name, action_type, resource_uri, amount_paise, current_daily_spent_paise } = req;

    // 1. Tool allowlist check
    if (delegation) {
      const allowedTools = delegation.allowed_tools;
      if (!allowedTools.includes(tool_name) && !allowedTools.includes('*')) {
        return {
          allowed: false,
          code: 'TOOL_NOT_ALLOWED',
          reason: `Tool '${tool_name}' is not allowed in delegation [${allowedTools.join(', ')}]`,
        };
      }

      // Action permission
      if (action_type) {
        const permittedActions = delegation.permitted_actions;
        if (!permittedActions.includes(action_type) && !permittedActions.includes('*')) {
          return {
            allowed: false,
            code: 'ACTION_NOT_PERMITTED',
            reason: `Action '${action_type}' is not in permitted actions [${permittedActions.join(', ')}]`,
          };
        }
      }

      // Resource URI check
      if (resource_uri) {
        const allowedResources = delegation.allowed_resources;
        const isAllowed = allowedResources.some((pattern) => {
          if (pattern === '*') return true;
          if (pattern.endsWith('*')) return resource_uri.startsWith(pattern.slice(0, -1));
          return resource_uri === pattern;
        });

        if (!isAllowed) {
          return {
            allowed: false,
            code: 'RESOURCE_DENIED',
            reason: `Resource '${resource_uri}' does not match allowed resources [${allowedResources.join(', ')}]`,
          };
        }
      }

      // Financial limits (Integer paise Rule E1)
      if (amount_paise !== undefined && amount_paise > 0) {
        if (delegation.max_amount_paise !== null && delegation.max_amount_paise !== undefined) {
          if (amount_paise > delegation.max_amount_paise) {
            return {
              allowed: false,
              code: 'TX_LIMIT_EXCEEDED',
              reason: `Transaction amount ${amount_paise} paise exceeds delegation per-transaction limit of ${delegation.max_amount_paise} paise`,
            };
          }
        }

        if (delegation.daily_max_paise !== null && delegation.daily_max_paise !== undefined) {
          const projectedDaily = (current_daily_spent_paise || 0) + amount_paise;
          if (projectedDaily > delegation.daily_max_paise) {
            return {
              allowed: false,
              code: 'DAILY_LIMIT_EXCEEDED',
              reason: `Projected daily spend ${projectedDaily} paise exceeds daily limit of ${delegation.daily_max_paise} paise`,
            };
          }
        }
      }
    }

    return { allowed: true };
  }
}
