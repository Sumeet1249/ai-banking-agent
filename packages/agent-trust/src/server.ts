/**
 * AgentGuard Trust Intelligence HTTP Service (Port 4006)
 * Phase TI-2 to TI-6 Authoritative Engine Service
 */

import express, { Request, Response } from 'express';
import * as path from 'path';
import { TrustStore } from './db/trust-store';
import { AgentIdentityRegistry } from './identity/agent-identity-registry';
import { CredentialManager } from './credentials/credential-manager';
import { DelegationEngine } from './delegation/delegation-engine';
import { CapabilityChecker } from './capabilities/capability-checker';
import { FeatureExtractor } from './behaviour/feature-extractor';
import { IntentDriftDetector } from './anomaly/intent-drift-detector';
import { StatisticalAnomalyDetector } from './anomaly/statistical-anomaly-detector';
import { QuarantineManager } from './quarantine/quarantine-manager';
import { TrustPolicyEngine } from './policy/trust-policy-engine';
import { IncidentForensicsService } from './incidents/incident-forensics-service';
import { ForensicEvidencePack } from './evidence/forensic-evidence-pack';

const PORT = process.env.TRUST_ENGINE_PORT || 4006;
const DB_PATH = process.env.TRUST_DB_PATH || path.join(__dirname, '..', 'agent_trust.db');

export function createTrustServer(dbPath = DB_PATH) {
  const app = express();
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });
  app.use(express.json());

  const store = new TrustStore(dbPath);
  const identityRegistry = new AgentIdentityRegistry(store);
  const credentialManager = new CredentialManager(store);
  const delegationEngine = new DelegationEngine(store);
  const featureExtractor = new FeatureExtractor(store);
  const anomalyDetector = new StatisticalAnomalyDetector(store);
  const quarantineManager = new QuarantineManager(store);
  const policyEngine = new TrustPolicyEngine(store);
  const forensics = new IncidentForensicsService(store);

  // Health
  app.get('/api/trust/health', (req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'AgentGuard Trust Intelligence Engine',
      version: '1.0.0',
      port: PORT,
      timestamp: Date.now(),
      emergency_stop_active: QuarantineManager.isEmergencyStopActive(),
    });
  });

  // Overview Metrics
  app.get('/api/trust/overview', (req: Request, res: Response) => {
    const agents = identityRegistry.listAgents();
    const active = agents.filter((a) => a.status === 'ACTIVE').length;
    const quarantined = agents.filter((a) => a.status === 'QUARANTINED').length;
    const delegations = store.listDelegations();
    const decisions = store.listDecisions(50);
    const incidents = forensics.listIncidents(20);

    res.json({
      success: true,
      data: {
        total_agents: agents.length,
        active_agents: active,
        quarantined_agents: quarantined,
        active_delegations: delegations.filter((d) => d.status === 'ACTIVE').length,
        total_evaluations_24h: decisions.length,
        open_incidents: incidents.filter((i) => i.status === 'OPEN').length,
        emergency_stop_active: QuarantineManager.isEmergencyStopActive(),
        system_trust_index: 94.2,
      },
    });
  });

  // Agents
  app.get('/api/trust/agents', (req: Request, res: Response) => {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-default';
    const agents = identityRegistry.listAgents(tenantId);
    res.json({ success: true, data: agents });
  });

  app.post('/api/trust/agents', (req: Request, res: Response) => {
    try {
      const agent = identityRegistry.registerAgent(req.body);
      res.status(201).json({ success: true, data: agent });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/trust/agents/:id/status', (req: Request, res: Response) => {
    try {
      const { status, reason, operatorRef } = req.body;
      identityRegistry.setAgentStatus(req.params.id, status, reason || '', operatorRef || 'SUPERVISOR');
      const updated = identityRegistry.getAgent(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Delegations
  app.get('/api/trust/delegations', (req: Request, res: Response) => {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-default';
    const delegations = store.listDelegations(tenantId);
    res.json({ success: true, data: delegations });
  });

  app.post('/api/trust/delegations', (req: Request, res: Response) => {
    const result = delegationEngine.createDelegation(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.status(201).json(result);
  });

  app.post('/api/trust/delegations/:id/revoke', (req: Request, res: Response) => {
    const operator = req.body.operatorRef || 'SUPERVISOR';
    const result = delegationEngine.revokeDelegation(req.params.id, operator);
    res.json({ success: true, data: result });
  });

  // Decisions
  app.get('/api/trust/decisions', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const decisions = store.listDecisions(limit);
    res.json({ success: true, data: decisions });
  });

  // Policy Evaluation
  app.post('/api/trust/evaluate', (req: Request, res: Response) => {
    const { invocation, context } = req.body;
    const decision = policyEngine.evaluateInvocation(invocation, context);
    res.json({ success: true, data: decision });
  });

  // Quarantine Center
  app.get('/api/trust/quarantine', (req: Request, res: Response) => {
    const agents = identityRegistry.listAgents();
    const quarantined = agents.filter((a) => a.status === 'QUARANTINED');
    res.json({
      success: true,
      data: {
        emergency_stop_active: QuarantineManager.isEmergencyStopActive(),
        quarantined_agents: quarantined,
      },
    });
  });

  app.post('/api/trust/quarantine/:id/release', (req: Request, res: Response) => {
    const { supervisorId, releaseNotes } = req.body;
    const result = quarantineManager.releaseQuarantine(req.params.id, supervisorId || 'SUPERVISOR_SEC', releaseNotes || 'Approved release');
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  app.post('/api/trust/emergency-stop', (req: Request, res: Response) => {
    const { action, initiatorId, reason } = req.body;
    if (action === 'ENGAGE') {
      QuarantineManager.triggerEmergencyStop(initiatorId || 'ADMIN', reason || 'Emergency stop requested');
    } else {
      QuarantineManager.resetEmergencyStop(initiatorId || 'ADMIN');
    }
    res.json({
      success: true,
      emergency_stop_active: QuarantineManager.isEmergencyStopActive(),
    });
  });

  // Incidents
  app.get('/api/trust/incidents', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const incidents = forensics.listIncidents(limit);
    res.json({ success: true, data: incidents });
  });

  app.get('/api/trust/incidents/:id/evidence-pack', (req: Request, res: Response) => {
    const inc = store.getIncident(req.params.id);
    if (!inc) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }
    const pack = ForensicEvidencePack.createEvidencePack(inc, [
      { event_type: 'TRIGGER', timestamp: inc.detected_at, trigger: inc.trigger_type },
      { event_type: 'POLICY_EVAL', containment: inc.containment_action },
    ]);
    res.json({ success: true, data: pack });
  });

  app.post('/api/trust/verify-evidence-pack', (req: Request, res: Response) => {
    const isValid = ForensicEvidencePack.verifyEvidencePack(req.body);
    res.json({ success: true, verified: isValid });
  });

  return { app, store };
}

if (require.main === module) {
  const { app } = createTrustServer();
  app.listen(PORT, () => {
    console.log(`[TrustEngine] Running on http://localhost:${PORT}`);
  });
}
