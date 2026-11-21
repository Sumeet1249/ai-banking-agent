import { CustomerIntent, InvocationRequest } from '@agentguard/core-schema';

export interface IntentDriftCheckResult {
  has_drift: boolean;
  drift_score: number; // 0 (exact match) to 100 (complete divergence)
  violations: string[];
  intent_id?: string;
}

export class IntentDriftDetector {
  public static evaluate(invocation: InvocationRequest, intent?: CustomerIntent | null): IntentDriftCheckResult {
    if (!intent) {
      if (invocation.tool_name.startsWith('bank.') || invocation.tool_name.startsWith('broker.')) {
        return {
          has_drift: true,
          drift_score: 85,
          violations: ['No registered CustomerIntent found for high-privilege execution'],
        };
      }
      return {
        has_drift: false,
        drift_score: 0,
        violations: [],
      };
    }

    const violations: string[] = [];
    let score = 0;
    const now = invocation.timestamp_ms || Date.now();

    // 1. Expiration
    if (now > intent.valid_until) {
      violations.push(`Customer intent ${intent.intent_id} expired at ${intent.valid_until}`);
      score += 40;
    }

    // 2. Tool authorization
    if (
      intent.authorized_tools &&
      intent.authorized_tools.length > 0 &&
      !intent.authorized_tools.includes(invocation.tool_name) &&
      !intent.authorized_tools.includes('*')
    ) {
      violations.push(`Tool '${invocation.tool_name}' not authorized by intent [${intent.authorized_tools.join(', ')}]`);
      score += 35;
    }

    // 3. Extract transaction details
    const args = invocation.arguments || {};
    const amountPaise = typeof args.amount_paise === 'number' ? args.amount_paise : undefined;
    const payee = (args.payee_id || args.payee_name || args.payee) as string | undefined;
    const accountRef = (args.account_ref || args.account_id) as string | undefined;

    // 4. Financial amount check (Rule E1: integer paise)
    if (amountPaise !== undefined && intent.max_authorized_amount_paise !== undefined && intent.max_authorized_amount_paise !== null) {
      if (amountPaise > intent.max_authorized_amount_paise) {
        violations.push(
          `Requested amount ${amountPaise} paise exceeds customer authorized max ${intent.max_authorized_amount_paise} paise`
        );
        score += 85;
      }
    }

    // 5. Payee restriction check
    if (payee && intent.approved_payees && intent.approved_payees.length > 0) {
      const isApproved = intent.approved_payees.some(
        (auth) => auth.toLowerCase() === payee.toLowerCase() || auth === '*'
      );
      if (!isApproved) {
        violations.push(
          `Payee '${payee}' is not in customer authorized payees list [${intent.approved_payees.join(', ')}]`
        );
        score += 85;
      }
    }

    // 6. Account reference check
    if (accountRef && intent.approved_account_ref && intent.approved_account_ref !== '*' && accountRef !== intent.approved_account_ref) {
      violations.push(`Target account '${accountRef}' does not match customer authorized account '${intent.approved_account_ref}'`);
      score += 30;
    }

    const clampedScore = Math.min(100, score);
    const hasDrift = clampedScore > 0;

    return {
      has_drift: hasDrift,
      drift_score: clampedScore,
      violations,
      intent_id: intent.intent_id,
    };
  }
}
