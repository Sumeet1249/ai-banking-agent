/**
 * Authoritative Bank Gate Client for Gateway MCP (Phase BP-3.3)
 *
 * Implements:
 *   - Gateway MCP to Bank Gate (:4000) Category Budget Delegation
 *   - Invariant I1: Gateway never mints permits if Bank Gate denies or defers
 *   - Invariant I8: Fail-closed DEFER on network socket errors or timeout
 *   - Binds authoritative Bank Gate reservation_id to minted permits
 */

import type { Logger } from 'pino';
import {
  SpendingCategory,
  MerchantEvaluationInput,
  CategorySpendingDecisionCode,
} from '@agentguard/core-schema';

export interface BankGateReservationRequest {
  tenant_id: string;
  customer_ref: string;
  pool_id: string;
  agent_id: string;
  workflow_id: string;
  request_id: string;
  idempotency_key: string;
  transaction_digest: string;
  category_id: SpendingCategory;
  amount_paise: number;
  merchant_input?: MerchantEvaluationInput;
}

export interface BankGateReservationResponse {
  decision: CategorySpendingDecisionCode;
  reason: string;
  reservation_id?: string;
  transfer_id?: string;
  saga_state: string;
  requires_human_approval: boolean;
  violations: string[];
}

export class BankGateClient {
  constructor(
    private bankGateUrl: string = process.env.BANK_GATE_URL || 'http://localhost:4000',
    private logger?: Logger,
  ) {}

  public async evaluateCategoryReservation(
    params: BankGateReservationRequest,
  ): Promise<BankGateReservationResponse> {
    try {
      const url = `${this.bankGateUrl}/api/v1/category-reservations`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': params.tenant_id,
          'x-customer-ref': params.customer_ref,
        },
        body: JSON.stringify(params),
      });

      const data = (await res.json()) as BankGateReservationResponse;

      if (!res.ok && res.status !== 403 && res.status !== 503) {
        return {
          decision: 'DEFER',
          reason: data.reason || `BANK_GATE_HTTP_${res.status}`,
          saga_state: 'REQUEST_RECEIVED',
          requires_human_approval: false,
          violations: data.violations || ['Bank Gate returned an unexpected HTTP response'],
        };
      }

      return data;
    } catch (err: any) {
      this.logger?.error({ err }, 'Bank Gate connection failure; failing closed (Rule I8)');
      return {
        decision: 'DEFER',
        reason: `BANK_GATE_CONNECTION_FAILED: ${err.message}`,
        saga_state: 'REQUEST_RECEIVED',
        requires_human_approval: false,
        violations: ['Bank Gate authoritative budget service unreachable - fail closed into DEFER'],
      };
    }
  }
}
