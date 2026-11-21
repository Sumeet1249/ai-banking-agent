import * as fs from 'fs';
import * as path from 'path';
import { TrustStore } from '../db/trust-store';
import { FeatureExtractor } from '../behaviour/feature-extractor';
import { IntentDriftDetector } from '../anomaly/intent-drift-detector';
import { StatisticalAnomalyDetector } from '../anomaly/statistical-anomaly-detector';
import { CustomerIntent, InvocationRequest } from '@agentguard/core-schema';

const TEST_DB = path.join(__dirname, 'test_behaviour_anomaly.db');

describe('TI-4: Behavioural Feature Extraction & Anomaly Detection', () => {
  let store: TrustStore;
  let extractor: FeatureExtractor;
  let anomalyDetector: StatisticalAnomalyDetector;

  beforeAll(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    store = new TrustStore(TEST_DB);
    extractor = new FeatureExtractor(store);
    anomalyDetector = new StatisticalAnomalyDetector(store);
  });

  afterAll(() => {
    store.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  test('TI-4.1: FeatureExtractor computes accurate metrics and detects unusual hours IST', () => {
    const now = Date.now();
    const req: InvocationRequest = {
      request_id: 'REQ_01',
      session_id: 'SESS_01',
      tenant_id: 'tenant-default',
      agent_id: 'AGENT_ELEC_01',
      credential_id: 'cred-01',
      delegation_id: 'DEL_ELEC_101',
      timestamp_ms: now,
      nonce: 'NONCE_TEST_1',
      tool_name: 'bank.pay_bill',
      arguments: { bill_id: 'BILL_123', amount_paise: 250000 },
      canonical_argument_digest: 'abc',
      agent_signature: 'sig',
    };

    const feat = extractor.extractFeatures(req, false);

    expect(feat.tool_call_rate_per_min).toBeGreaterThanOrEqual(1);

    // Verify unusual hours logic:
    // 01:00 UTC = 06:30 IST (Normal business morning)
    const morningUtc = new Date('2026-11-21T01:00:00Z').getTime();
    expect(extractor.checkUnusualHoursIST(morningUtc)).toBe(false);

    // 20:00 UTC = 01:30 IST next day (Night off-hours)
    const nightUtc = new Date('2026-11-21T20:00:00Z').getTime();
    expect(extractor.checkUnusualHoursIST(nightUtc)).toBe(true);
  });

  test('TI-4.2: IntentDriftDetector flags deviation from authorized payees and money caps', () => {
    const intent: CustomerIntent = {
      intent_id: 'INTENT_BESCOM',
      customer_ref: 'CUST_101',
      objective: 'Pay monthly electricity bill to BESCOM',
      authorized_tools: ['bank.pay_bill'],
      approved_payees: ['BESCOM'],
      max_authorized_amount_paise: 300000, // Rs 3,000
      approved_account_ref: 'ACC_MAIN_01',
      valid_from: Date.now() - 1000,
      valid_until: Date.now() + 3600000,
      context_metadata: {},
    };

    // Valid invocation matching intent
    const validInv: InvocationRequest = {
      request_id: 'REQ_01',
      agent_id: 'AGENT_ELEC_01',
      session_id: 'SESS_01',
      tenant_id: 'tenant-default',
      credential_id: 'cred-01',
      delegation_id: 'DEL_ELEC_101',
      tool_name: 'bank.pay_bill',
      arguments: { payee_name: 'BESCOM', amount_paise: 250000, account_ref: 'ACC_MAIN_01' },
      timestamp_ms: Date.now(),
      nonce: 'N1',
      canonical_argument_digest: 'abc',
      agent_signature: 'dummy',
      customer_intent_id: 'INTENT_BESCOM',
    };
    const validRes = IntentDriftDetector.evaluate(validInv, intent);
    expect(validRes.has_drift).toBe(false);
    expect(validRes.drift_score).toBe(0);

    // Divergent invocation: unauthorized payee
    const roguePayeeInv: InvocationRequest = {
      ...validInv,
      request_id: 'REQ_02',
      arguments: { payee_name: 'ATTACKER_WALLET', amount_paise: 250000, account_ref: 'ACC_MAIN_01' },
    };
    const payeeRes = IntentDriftDetector.evaluate(roguePayeeInv, intent);
    expect(payeeRes.has_drift).toBe(true);
    expect(payeeRes.violations[0]).toContain('ATTACKER_WALLET');

    // Divergent invocation: amount exceeds authorized max
    const excessiveAmtInv: InvocationRequest = {
      ...validInv,
      request_id: 'REQ_03',
      arguments: { payee_name: 'BESCOM', amount_paise: 9900000, account_ref: 'ACC_MAIN_01' },
    };
    const amtRes = IntentDriftDetector.evaluate(excessiveAmtInv, intent);
    expect(amtRes.has_drift).toBe(true);
    expect(amtRes.violations[0]).toContain('exceeds customer authorized max');
  });

  test('TI-4.3: StatisticalAnomalyDetector handles cold start gracefully and detects rate spikes', () => {
    // Cold start with normal rates
    const coldNormal = anomalyDetector.evaluate('AGENT_NEW_01', {
      tool_call_rate_per_min: 5,
      unique_tools_in_session: 1,
      consecutive_denied_calls: 0,
      call_interval_ms: 4000,
      intent_divergence_score: 0,
      unusual_hours_detected: false,
      structuring_pattern_detected: false,
      burst_velocity_detected: false,
      delegation_depth_observed: 0,
      tenant_cross_attempted: false,
    });
    expect(coldNormal.is_cold_start).toBe(true);
    expect(coldNormal.anomaly_flag).toBe(false);

    // Cold start exceeding rate ceiling
    const coldBurst = anomalyDetector.evaluate('AGENT_NEW_01', {
      tool_call_rate_per_min: 50,
      unique_tools_in_session: 3,
      consecutive_denied_calls: 4,
      call_interval_ms: 100,
      intent_divergence_score: 80,
      unusual_hours_detected: false,
      structuring_pattern_detected: false,
      burst_velocity_detected: true,
      delegation_depth_observed: 0,
      tenant_cross_attempted: false,
    });
    expect(coldBurst.anomaly_flag).toBe(true);
    expect(coldBurst.z_score).toBeGreaterThan(3.0);
  });
});
