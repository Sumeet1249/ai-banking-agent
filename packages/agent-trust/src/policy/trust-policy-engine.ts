import {
  InvocationRequest,
  TrustEvaluationDecision,
  AgentTrustIdentity,
  AgentDelegation,
  CustomerIntent,
  BehaviouralFeatures,
} from '@agentguard/core-schema';
import { TrustStore } from '../db/trust-store';
import { SignatureVerifier } from '../credentials/signature-verifier';
import { DelegationEngine } from '../delegation/delegation-engine';
import { CapabilityChecker } from '../capabilities/capability-checker';
import { FeatureExtractor } from '../behaviour/feature-extractor';
import { IntentDriftDetector } from '../anomaly/intent-drift-detector';
import { StatisticalAnomalyDetector } from '../anomaly/statistical-anomaly-detector';
import { QuarantineManager } from '../quarantine/quarantine-manager';

export class TrustPolicyEngine {
  private store: TrustStore;
  private signatureVerifier: SignatureVerifier;
  private delegationEngine: DelegationEngine;
  private featureExtractor: FeatureExtractor;
  private anomalyDetector: StatisticalAnomalyDetector;
  private quarantineManager: QuarantineManager;

  constructor(store: TrustStore) {
    this.store = store;
    this.signatureVerifier = new SignatureVerifier(store);
    this.delegationEngine = new DelegationEngine(store);
    this.featureExtractor = new FeatureExtractor(store);
    this.anomalyDetector = new StatisticalAnomalyDetector(store);
    this.quarantineManager = new QuarantineManager(store);
  }

  public evaluateInvocation(
    invocation: InvocationRequest,
    context?: {
      current_daily_spent_paise?: number;
      action_type?: string;
      resource_uri?: string;
    }
  ): TrustEvaluationDecision {
    try {
      if (!invocation) {
        throw new Error('Null or undefined invocation request received');
      }
      const now = invocation.timestamp_ms || Date.now();

      // 0. Global Emergency Stop Check
      if (QuarantineManager.isEmergencyStopActive()) {
        return this.createDecision(invocation, 'DENY', 'EMERGENCY_STOP', 'EMERGENCY_STOP_ACTIVE', [
          'GLOBAL_EMERGENCY_STOP is engaged across all agent operations',
        ]);
      }

      // 1. Agent Identity Verification
      const agent = this.store.getAgent(invocation.agent_id);
      if (!agent) {
        return this.createDecision(invocation, 'DENY', 'REVOKE', 'AGENT_UNREGISTERED', [
          `Agent '${invocation.agent_id}' is not registered in Trust Registry`,
        ]);
      }

      // 2. Quarantine Check
      const quarantineStatus = this.quarantineManager.isQuarantined(agent.agent_id);
      if (quarantineStatus.is_quarantined) {
        return this.createDecision(invocation, 'DENY', 'QUARANTINE', 'AGENT_QUARANTINED', [
          `Agent is under QUARANTINE: ${quarantineStatus.reason}`,
        ]);
      }

      if (agent.status !== 'ACTIVE') {
        return this.createDecision(invocation, 'DENY', 'REVOKE', 'AGENT_INACTIVE', [
          `Agent status is not ACTIVE (current status: ${agent.status})`,
        ]);
      }

      // 3. Detached Ed25519 Cryptographic Signature & Anti-Replay Verification
      const sigResult = this.signatureVerifier.verifyInvocation(invocation);
      if (!sigResult.valid) {
        this.quarantineManager.recordViolation(agent.agent_id, `Signature failure: ${sigResult.error}`);
        return this.createDecision(invocation, 'DENY', 'RESTRICT', sigResult.reasonCode || 'SIG_VERIFY_FAILED', [
          `Cryptographic signature verification failed: ${sigResult.error}`,
        ]);
      }

      // 4. Delegation Verification (if present)
      let delegation: AgentDelegation | null = null;
      if (invocation.delegation_id) {
        const delResult = this.delegationEngine.validateDelegation(invocation.delegation_id, now);
        if (!delResult.valid) {
          this.quarantineManager.recordViolation(agent.agent_id, `Delegation violation: ${delResult.reason}`);
          return this.createDecision(invocation, 'DENY', 'RESTRICT', 'DELEGATION_INVALID', [
            `Delegation validation failed: ${delResult.reason}`,
          ]);
        }
        delegation = delResult.delegation || null;
      }

      // 5. Capability Boundaries & Financial Limits Check (Hard Rule)
      const amountPaise =
        typeof invocation.arguments?.amount_paise === 'number' ? invocation.arguments.amount_paise : undefined;

      const capResult = CapabilityChecker.check({
        agent,
        delegation,
        tool_name: invocation.tool_name,
        action_type: context?.action_type || 'EXECUTE',
        resource_uri: context?.resource_uri,
        amount_paise: amountPaise,
        current_daily_spent_paise: context?.current_daily_spent_paise,
      });

      if (!capResult.allowed) {
        this.quarantineManager.recordViolation(agent.agent_id, `Capability breach: ${capResult.reason}`);
        return this.createDecision(invocation, 'DENY', 'RESTRICT', capResult.code || 'CAPABILITY_BREACH', [
          `Capability check failed [${capResult.code}]: ${capResult.reason}`,
        ]);
      }

      // 6. Intent Drift Detection
      let intent: CustomerIntent | null = null;
      if (invocation.customer_intent_id) {
        intent = this.store.getIntent(invocation.customer_intent_id);
      }
      const driftResult = IntentDriftDetector.evaluate(invocation, intent);

      if (driftResult.has_drift && driftResult.drift_score >= 80) {
        this.quarantineManager.recordViolation(agent.agent_id, `Intent drift score ${driftResult.drift_score}`);
        return this.createDecision(invocation, 'DENY', 'RESTRICT', 'INTENT_DRIFT_CRITICAL', [
          `Severe intent drift detected (score: ${driftResult.drift_score}): ${driftResult.violations.join('; ')}`,
        ]);
      }

      // 7. Behavioural Feature Extraction & Statistical Anomaly Detection
      const features = this.featureExtractor.extractFeatures(invocation, false);
      const anomalyResult = this.anomalyDetector.evaluate(agent.agent_id, features);

      if (driftResult.has_drift || anomalyResult.anomaly_flag) {
        const askReasons: string[] = [];
        if (driftResult.has_drift) {
          askReasons.push(`Customer intent verification required: ${driftResult.violations.join('; ')}`);
        }
        if (anomalyResult.anomaly_flag) {
          askReasons.push(`Statistical anomaly (Z-score ${anomalyResult.z_score})`);
        }

        return this.createDecision(invocation, 'ASK', 'REQUIRE_APPROVAL', 'STEP_UP_REQUIRED', askReasons, features);
      }

      // 8. All checks passed -> ALLOW
      this.quarantineManager.recordSuccessfulInvocation(agent.agent_id);
      if (invocation.delegation_id) {
        this.delegationEngine.incrementUsage(invocation.delegation_id);
      }

      return this.createDecision(invocation, 'ALLOW', 'ALLOW', 'POLICY_SATISFIED', [
        'Deterministic identity, capability, delegation, intent, and behavioural verification passed',
      ], features);
    } catch (err: unknown) {
      // Rule I8: Fail-Closed DEFER on unhandled errors
      const errorMsg = err instanceof Error ? err.message : String(err);
      return this.createDecision(invocation, 'DEFER', 'PAUSE', 'INTERNAL_KERNEL_DEFER', [
        `Fail-closed policy kernel exception: ${errorMsg}`,
      ]);
    }
  }

  private createDecision(
    req: InvocationRequest,
    verdict: 'ALLOW' | 'DENY' | 'ASK' | 'DEFER',
    action_response: 'ALLOW' | 'RESTRICT' | 'REQUIRE_APPROVAL' | 'PAUSE' | 'QUARANTINE' | 'REVOKE' | 'EMERGENCY_STOP',
    reason_code: string,
    reasons: string[],
    features?: BehaviouralFeatures
  ): TrustEvaluationDecision {
    const defaultFeatures: BehaviouralFeatures = {
      tool_call_rate_per_min: 1,
      unique_tools_in_session: 1,
      consecutive_denied_calls: verdict === 'DENY' ? 1 : 0,
      call_interval_ms: 1000,
      intent_divergence_score: verdict === 'ALLOW' ? 0 : 50,
      unusual_hours_detected: false,
      structuring_pattern_detected: false,
      burst_velocity_detected: false,
      delegation_depth_observed: 0,
      tenant_cross_attempted: false,
    };

    const decision: TrustEvaluationDecision = {
      decision_id: `DEC_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      request_id: req?.request_id || 'UNKNOWN',
      agent_id: req?.agent_id || 'UNKNOWN',
      tenant_id: req?.tenant_id || 'tenant-default',
      verdict,
      action_response,
      reason_code,
      violation_summary: reasons.join('; '),
      risk_score: verdict === 'ALLOW' ? 10 : 85,
      observed_features: features || defaultFeatures,
      evidence_references: [],
      evaluated_at: Date.now(),
      evaluator_version: 'TI-Engine-v1',
    };

    try {
      this.store.recordDecision(decision);
    } catch {}

    return decision;
  }
}
