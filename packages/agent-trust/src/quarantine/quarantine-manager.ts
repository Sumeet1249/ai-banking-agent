import { TrustStore } from '../db/trust-store';

export interface QuarantineStatus {
  is_quarantined: boolean;
  reason?: string;
  quarantined_at?: number;
  quarantined_by?: string;
  consecutive_violations: number;
}

export class QuarantineManager {
  private store: TrustStore;
  private static emergencyStopActive = false;

  constructor(store: TrustStore) {
    this.store = store;
  }

  public isQuarantined(agent_id: string): QuarantineStatus {
    if (QuarantineManager.emergencyStopActive) {
      return {
        is_quarantined: true,
        reason: 'GLOBAL_EMERGENCY_STOP is currently active across the system',
        consecutive_violations: 0,
      };
    }

    const agent = this.store.getAgent(agent_id);
    if (!agent) {
      return { is_quarantined: false, consecutive_violations: 0 };
    }

    if (agent.status === 'QUARANTINED') {
      return {
        is_quarantined: true,
        reason: agent.quarantine_reason || 'Security containment',
        quarantined_at: agent.quarantined_at ?? undefined,
        quarantined_by: agent.quarantined_by ?? undefined,
        consecutive_violations: 3,
      };
    }

    const baseline = this.store.getBaseline(agent_id);
    return {
      is_quarantined: false,
      consecutive_violations: baseline?.consecutiveDenials || 0,
    };
  }

  public recordViolation(agent_id: string, violationReason: string): { autoQuarantined: boolean; currentViolations: number } {
    const agent = this.store.getAgent(agent_id);
    if (!agent) return { autoQuarantined: false, currentViolations: 0 };

    const baseline = this.store.getBaseline(agent_id);
    const violations = (baseline?.consecutiveDenials || 0) + 1;

    this.store.updateBaseline(
      agent_id,
      (baseline?.sampleCount || 0) + 1,
      baseline?.rollingMeanRate || 5.0,
      baseline?.rollingVarRate || 2.0,
      Date.now(),
      violations
    );

    if (violations >= 3 && agent.status !== 'QUARANTINED' && agent.status !== 'REVOKED') {
      this.store.updateAgentStatus(
        agent_id,
        'QUARANTINED',
        `Auto-quarantined: 3 consecutive security violations. Last: ${violationReason}`,
        'CIRCUIT_BREAKER_AUTOMATED'
      );
      return { autoQuarantined: true, currentViolations: violations };
    }

    return { autoQuarantined: false, currentViolations: violations };
  }

  public recordSuccessfulInvocation(agent_id: string): void {
    const baseline = this.store.getBaseline(agent_id);
    if (baseline && baseline.consecutiveDenials > 0) {
      this.store.updateBaseline(
        agent_id,
        baseline.sampleCount + 1,
        baseline.rollingMeanRate,
        baseline.rollingVarRate,
        Date.now(),
        0
      );
    }
  }

  public releaseQuarantine(agent_id: string, supervisor_id: string, releaseNotes: string): { success: boolean; error?: string } {
    const agent = this.store.getAgent(agent_id);
    if (!agent) return { success: false, error: 'Agent not found' };
    if (agent.status !== 'QUARANTINED') {
      return { success: false, error: `Agent is not in QUARANTINED state (current: ${agent.status})` };
    }

    this.store.updateAgentStatus(agent_id, 'ACTIVE', releaseNotes, supervisor_id);
    this.recordSuccessfulInvocation(agent_id);
    return { success: true };
  }

  public static triggerEmergencyStop(initiator_id: string, reason: string): void {
    QuarantineManager.emergencyStopActive = true;
  }

  public static resetEmergencyStop(supervisor_id: string): void {
    QuarantineManager.emergencyStopActive = false;
  }

  public static isEmergencyStopActive(): boolean {
    return QuarantineManager.emergencyStopActive;
  }
}
