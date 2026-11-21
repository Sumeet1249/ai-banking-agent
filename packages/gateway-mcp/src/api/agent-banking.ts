/**
 * Agent Payment & Evaluation REST API Handler
 *
 * Implements Phase 2.3:
 *   - POST /api/agent/evaluate: Evaluates agent payment request and mints 22-field TBP permit
 *   - POST /api/agent/nonce: Mints a fresh single-use UUIDv4 nonce
 *   - GET /api/agent/delegations/:id: Inspects active delegation status
 */

import { Router, Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { PaymentRequestSchema } from '@agentguard/core-schema';
import { BankingAgentIdentityService, AuthenticatedAgentRequest } from '../services/banking-agent-identity';
import { PermitEngineService } from '../services/permit-engine';
import { BankGateClient } from '../services/bank-gate-client';

export class AgentBankingAPI {
  public router: Router;

  constructor(
    private agentIdentity: BankingAgentIdentityService,
    private permitEngine: PermitEngineService,
    private logger?: Logger,
    private bankGateClient: BankGateClient = new BankGateClient(),
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // Enforce Ed25519 agent identity & reject customer sessions
    this.router.use(this.agentIdentity.requireAgentAuth);

    this.router.post('/nonce', (req: AuthenticatedAgentRequest, res: Response) => {
      const agent = req.agent!;
      const nonce = this.permitEngine.mintNonce(agent.agent_id);
      res.status(201).json({
        agent_id: agent.agent_id,
        nonce,
        issued_at: Date.now(),
      });
    });

    this.router.post('/evaluate', async (req: AuthenticatedAgentRequest, res: Response) => {
      const parsed = PaymentRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          decision: 'DENY',
          reason: 'MALFORMED_REQUEST',
          details: parsed.error.issues,
        });
        return;
      }

      const payment = parsed.data;
      const delegationRef = (req.headers['x-delegation-ref'] as string) || (req.body?.delegation_ref as string | undefined);

      // Phase BP-3.3: Authoritative Category Budget Coordination with Bank Gate (:4000)
      if (req.body.pool_id || req.body.category_id) {
        const poolId = req.body.pool_id || `pool_${payment.purpose?.toLowerCase() || 'general'}`;
        const categoryId = req.body.category_id || 'SHOPPING';

        const categoryResult = await this.bankGateClient.evaluateCategoryReservation({
          tenant_id: (req.headers['x-tenant-id'] as string) || 'tenant-default',
          customer_ref: payment.customer_ref,
          pool_id: poolId,
          agent_id: payment.agent_id,
          workflow_id: payment.request_id,
          request_id: payment.request_id,
          idempotency_key: `idem_${payment.request_id}`,
          transaction_digest: payment.request_id.repeat(4).slice(0, 64),
          category_id: categoryId,
          amount_paise: payment.amount_paise,
          merchant_input: req.body.merchant_input,
        });

        if (categoryResult.decision === 'DENY') {
          res.status(403).json({
            decision: 'DENY',
            reason: categoryResult.reason,
            violations: categoryResult.violations,
          });
          return;
        }

        if (categoryResult.decision === 'DEFER') {
          res.status(503).json({
            decision: 'DEFER',
            reason: categoryResult.reason,
            violations: categoryResult.violations,
          });
          return;
        }

        if (categoryResult.decision === 'ASK') {
          res.status(202).json({
            decision: 'ASK',
            reason: categoryResult.reason,
            reservation_id: categoryResult.reservation_id,
            requires_human_approval: true,
            violations: categoryResult.violations,
          });
          return;
        }
      }

      const evaluation = this.permitEngine.evaluateAndMintPermit({
        agent_id: payment.agent_id,
        customer_ref: payment.customer_ref,
        mandate_id: payment.mandate_id,
        account_ref: payment.account_ref,
        action: payment.action,
        purpose: payment.purpose,
        amount_paise: payment.amount_paise,
        currency: payment.currency,
        payee_id: payment.payee_id,
        invoice_ref: payment.invoice_ref,
        request_id: payment.request_id,
        delegation_ref: delegationRef,
        approval_ref: payment.approval_ref,
      });

      if (evaluation.decision === 'ALLOW') {
        res.status(200).json({
          decision: 'ALLOW',
          permit_envelope: evaluation.permit_envelope,
        });
      } else if (evaluation.decision === 'ASK') {
        res.status(202).json({
          decision: 'ASK',
          reason: evaluation.reason ?? 'STEP_UP_APPROVAL_REQUIRED',
        });
      } else {
        res.status(403).json({
          decision: 'DENY',
          reason: evaluation.reason ?? 'POLICY_VIOLATION',
        });
      }
    });

    this.router.get('/delegations/:delegationRef', (req: AuthenticatedAgentRequest, res: Response) => {
      const delegationRef = req.params.delegationRef;
      const delegation = this.agentIdentity.getDelegation(delegationRef);
      if (!delegation) {
        res.status(404).json({ error: 'Delegation not found', delegation_ref: delegationRef });
        return;
      }

      res.status(200).json({ delegation });
    });
  }
}
