import { ForensicIncidentRecord, TrustEvaluationDecision, InvocationRequest, AutonomousThreatResponse } from '@agentguard/core-schema';
import { TrustStore } from '../db/trust-store';
import crypto from 'crypto';

export class IncidentForensicsService {
  private store: TrustStore;

  constructor(store: TrustStore) {
    this.store = store;
  }

  public recordIncident(params: {
    incident_id?: string;
    tenant_id?: string;
    agent_id: string;
    session_id?: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    trigger_type: string;
    summary: string;
    root_cause_analysis?: string;
    containment_action?: AutonomousThreatResponse;
    evidence_pack?: Record<string, any>;
  }): ForensicIncidentRecord {
    const now = Date.now();
    const incident_id = params.incident_id || `INC_${now}_${crypto.randomBytes(3).toString('hex')}`;
    const tenant_id = params.tenant_id || 'tenant-default';
    const session_id = params.session_id || `SESS_${now}`;

    const eventHash = crypto.createHash('sha256').update(incident_id + params.agent_id + now).digest('hex');
    const witnessRef = `WITNESS_HASH_${eventHash.substring(0, 16)}`;

    const incident: ForensicIncidentRecord = {
      incident_id,
      tenant_id,
      agent_id: params.agent_id,
      session_id,
      severity: params.severity,
      status: 'OPEN',
      trigger_type: params.trigger_type,
      summary: params.summary,
      root_cause_analysis: params.root_cause_analysis || 'Automated detection via Trust Intelligence Policy Kernel',
      containment_action: params.containment_action || 'REQUIRE_APPROVAL',
      event_chain_hashes: [eventHash],
      witness_checkpoint_ref: witnessRef,
      evidence_pack: params.evidence_pack || {},
      detected_at: now,
    };

    this.store.saveIncident(incident);
    return incident;
  }

  public listIncidents(limit = 50): ForensicIncidentRecord[] {
    return this.store.listIncidents(limit);
  }
}
