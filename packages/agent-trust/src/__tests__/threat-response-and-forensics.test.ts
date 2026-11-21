import * as fs from 'fs';
import * as path from 'path';
import { TrustStore } from '../db/trust-store';
import { QuarantineManager } from '../quarantine/quarantine-manager';
import { IncidentForensicsService } from '../incidents/incident-forensics-service';
import { ForensicEvidencePack } from '../evidence/forensic-evidence-pack';

const TEST_DB = path.join(__dirname, 'test_threat_forensics.db');

describe('TI-5 & TI-6: Threat Containment, Circuit Breaker & Forensic Evidence', () => {
  let store: TrustStore;
  let quarantineManager: QuarantineManager;
  let forensics: IncidentForensicsService;

  beforeAll(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    store = new TrustStore(TEST_DB);
    quarantineManager = new QuarantineManager(store);
    forensics = new IncidentForensicsService(store);
  });

  afterAll(() => {
    store.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('TI-5.1: Circuit breaker auto-quarantines agent after 3 consecutive security violations', () => {
    const agentId = 'AGENT_ELEC_01';
    expect(quarantineManager.isQuarantined(agentId).is_quarantined).toBe(false);

    // Violation 1
    const v1 = quarantineManager.recordViolation(agentId, 'Unauthorized tool call');
    expect(v1.autoQuarantined).toBe(false);
    expect(v1.currentViolations).toBe(1);

    // Violation 2
    const v2 = quarantineManager.recordViolation(agentId, 'Exceeded per_tx limit');
    expect(v2.autoQuarantined).toBe(false);
    expect(v2.currentViolations).toBe(2);

    // Violation 3 -> triggers auto-quarantine
    const v3 = quarantineManager.recordViolation(agentId, 'Signature replay detected');
    expect(v3.autoQuarantined).toBe(true);
    expect(v3.currentViolations).toBe(3);

    const status = quarantineManager.isQuarantined(agentId);
    expect(status.is_quarantined).toBe(true);
    expect(status.reason).toContain('Auto-quarantined: 3 consecutive security violations');
  });

  test('TI-5.2: Authenticated supervisor release workflow restores active status', () => {
    const agentId = 'AGENT_ELEC_01';
    const releaseRes = quarantineManager.releaseQuarantine(
      agentId,
      'SUPERVISOR_SEC_OPS',
      'Investigation complete: agent credentials rotated and policy verified'
    );

    expect(releaseRes.success).toBe(true);

    const postStatus = quarantineManager.isQuarantined(agentId);
    expect(postStatus.is_quarantined).toBe(false);
  });

  test('TI-5.3: Global Emergency Stop halts operations across all agents', () => {
    QuarantineManager.triggerEmergencyStop('OPERATOR_1', 'Suspected widespread prompt injection campaign');
    expect(QuarantineManager.isEmergencyStopActive()).toBe(true);

    const check = quarantineManager.isQuarantined('ANY_AGENT');
    expect(check.is_quarantined).toBe(true);
    expect(check.reason).toContain('GLOBAL_EMERGENCY_STOP');

    QuarantineManager.resetEmergencyStop('OPERATOR_1');
    expect(QuarantineManager.isEmergencyStopActive()).toBe(false);
  });

  test('TI-6.1: Records correlated forensic incident with tamper-evident witness hash', () => {
    const incident = forensics.recordIncident({
      trigger_type: 'INTENT_DRIFT',
      severity: 'HIGH',
      agent_id: 'AGENT_ELEC_01',
      summary: 'Prompt injection diversion attempt',
      evidence_pack: { attempted_payee: 'SHADY_EXCHANGE', requested_amount: 500000 },
    });

    expect(incident.incident_id).toBeDefined();
    expect(incident.witness_checkpoint_ref).toBeDefined();

    const listed = forensics.listIncidents();
    expect(listed.length).toBeGreaterThan(0);
    expect(listed[0].incident_id).toBe(incident.incident_id);
  });

  test('TI-6.2: Generates and cryptographically verifies Forensic Evidence Pack', () => {
    const incidents = forensics.listIncidents(1);
    const inc = incidents[0];

    const logs = [
      { log_id: 'L1', tool: 'bank.pay_bill', timestamp: Date.now() - 500 },
      { log_id: 'L2', tool: 'bank.pay_bill', timestamp: Date.now() },
    ];

    const pack = ForensicEvidencePack.createEvidencePack(inc, logs);
    expect(pack.tamper_evident_root_hash).toBeDefined();

    const valid = ForensicEvidencePack.verifyEvidencePack(pack);
    expect(valid).toBe(true);

    // Tampering with log corrupts evidence pack
    const tamperedPack = {
      ...pack,
      logs: [{ ...logs[0], tool: 'tampered_tool' }, logs[1]],
    };
    const tamperedValid = ForensicEvidencePack.verifyEvidencePack(tamperedPack);
    expect(tamperedValid).toBe(false);
  });
});
