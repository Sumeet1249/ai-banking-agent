import { BehaviouralFeatures, StatisticalAnomalyScore } from '@agentguard/core-schema';
import { TrustStore } from '../db/trust-store';

export class StatisticalAnomalyDetector {
  private store: TrustStore;

  constructor(store: TrustStore) {
    this.store = store;
  }

  public evaluate(agent_id: string, currentFeatures: BehaviouralFeatures): StatisticalAnomalyScore {
    const baseline = this.store.getBaseline(agent_id);

    if (!baseline || baseline.sampleCount < 10) {
      const isAnomaly = currentFeatures.burst_velocity_detected || currentFeatures.consecutive_denied_calls >= 3;
      return {
        z_score: isAnomaly ? 3.5 : 0.2,
        rolling_mean: 5.0,
        rolling_variance: 2.0,
        median_absolute_deviation: 1.0,
        baseline_samples_count: baseline ? baseline.sampleCount : 0,
        is_cold_start: true,
        anomaly_flag: isAnomaly,
        feature_name: 'tool_call_rate_per_min',
      };
    }

    const mean = baseline.rollingMeanRate;
    const stdDev = Math.sqrt(baseline.rollingVarRate || 1.0);
    const zScore = Math.abs((currentFeatures.tool_call_rate_per_min - mean) / stdDev);
    const isAnomaly = zScore > 3.0 || currentFeatures.consecutive_denied_calls >= 3;

    return {
      z_score: Math.round(zScore * 100) / 100,
      rolling_mean: mean,
      rolling_variance: baseline.rollingVarRate,
      median_absolute_deviation: 1.0,
      baseline_samples_count: baseline.sampleCount,
      is_cold_start: false,
      anomaly_flag: isAnomaly,
      feature_name: 'tool_call_rate_per_min',
    };
  }
}
