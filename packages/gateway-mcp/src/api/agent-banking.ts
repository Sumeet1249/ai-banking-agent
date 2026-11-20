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

export class AgentBankingAPI {
  public router: Router;

  constructor(
    private agentIdentity: BankingAgentIdentityService,
    private permitEngine: PermitEngineService,
    private logger?: Logger,
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

    this.router.post('/evaluate', (req: AuthenticatedAgentRequest, res: Response) => {
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
