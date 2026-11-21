import { BehaviouralFeatures, InvocationRequest } from '@agentguard/core-schema';
import { TrustStore } from '../db/trust-store';

export class FeatureExtractor {
  private store: TrustStore;

  constructor(store: TrustStore) {
    this.store = store;
  }

  public extractFeatures(request: InvocationRequest, wasDenied = false): BehaviouralFeatures {
    const db = this.store.getDb();
    const now = request.timestamp_ms || Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    // Check recent decisions
    const recent = db
      .prepare(`SELECT * FROM trust_decisions WHERE agent_id = ? AND evaluated_at >= ?`)
      .all(request.agent_id, oneMinuteAgo) as any[];

    const toolCallRatePerMin = recent.length + 1;

    const hourRows = db
      .prepare(`SELECT observed_features FROM trust_decisions WHERE agent_id = ? AND evaluated_at >= ?`)
      .all(request.agent_id, oneHourAgo) as any[];

    const uniqueTools = new Set<string>();
    uniqueTools.add(request.tool_name);
    for (const r of hourRows) {
      try {
        const feat = JSON.parse(r.observed_features || '{}');
        // fallback
      } catch {}
    }

    // Call interval
    const lastDecision = db
      .prepare(`SELECT evaluated_at FROM trust_decisions WHERE agent_id = ? ORDER BY evaluated_at DESC LIMIT 1`)
      .get(request.agent_id) as any;

    const callIntervalMs = lastDecision ? Math.max(0, now - lastDecision.evaluated_at) : 5000;

    // Consecutive denials
    let consecutiveDenials = wasDenied ? 1 : 0;
    const pastDenials = db
      .prepare(`SELECT verdict FROM trust_decisions WHERE agent_id = ? ORDER BY evaluated_at DESC LIMIT 5`)
      .all(request.agent_id) as any[];
    for (const d of pastDenials) {
      if (d.verdict === 'DENY') {
        consecutiveDenials++;
      } else {
        break;
      }
    }

    const unusualHours = this.checkUnusualHoursIST(now);

    return {
      tool_call_rate_per_min: toolCallRatePerMin,
      unique_tools_in_session: uniqueTools.size,
      consecutive_denied_calls: consecutiveDenials,
      call_interval_ms: callIntervalMs,
      intent_divergence_score: 0,
      unusual_hours_detected: unusualHours,
      structuring_pattern_detected: false,
      burst_velocity_detected: toolCallRatePerMin > 30 || callIntervalMs < 200,
      delegation_depth_observed: 0,
      tenant_cross_attempted: false,
    };
  }

  public checkUnusualHoursIST(epochMs: number): boolean {
    const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
    const istDate = new Date(epochMs + istOffsetMs);
    const hour = istDate.getUTCHours();
    return hour >= 23 || hour < 6;
  }
}
