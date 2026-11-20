/**
 * Transaction Executor & State Machine Service
 *
 * Implements Bank Gate Section 8:
 *   - Verifies permit and current mandate standing
 *   - Atomically consumes nonce to prevent replay
 *   - Interacts with Ledger Adapter (:4001) for two-phase transfers
 *   - Advances state machine: PERMIT_VALIDATED -> PENDING_TRANSFER -> SETTLED | VOIDED | PENDING_RECONCILIATION
 */

import type { Logger } from 'pino';
import {
  CanonicalTransaction,
  PermitEnvelope,
  Clock,
  SystemClock,
} from '@agentguard/core-schema';
import { BankGateStore, BankTransactionRow } from '../db/bank-gate-store';
import { PermitVerifierService } from './permit-verifier';
import { ILedgerClient } from '../adapters/ledger-client';

export interface ExecutionResult {
  decision: 'ALLOW' | 'DENY' | 'DEFER' | 'ASK';
  status?: string;
  transfer_id?: string;
  reason?: string;
  transaction?: BankTransactionRow;
}

export class TransactionExecutorService {
  constructor(
    private store: BankGateStore,
    private permitVerifier: PermitVerifierService,
    private ledgerClient: ILedgerClient,
    private clock: Clock = new SystemClock(),
    private logger?: Logger,
  ) {}

  public async executeTransaction(params: {
    envelope: PermitEnvelope;
    transaction: CanonicalTransaction;
  }): Promise<ExecutionResult> {
    const { envelope, transaction } = params;

    // 1. Independent Permit Verification
    const verification = this.permitVerifier.verifyPermit(envelope, transaction);
    if (!verification.valid || !verification.permit) {
      return {
        decision: 'DENY',
        reason: verification.reason ?? 'PERMIT_VERIFICATION_FAILED',
      };
    }

    const permit = verification.permit;

    // 2. Validate Live Mandate Standing if cached
    const cachedMandate = this.store.getCachedMandate(permit.mandate_id);
    if (cachedMandate) {
      if (cachedMandate.status !== 'ACTIVE') {
        return { decision: 'DENY', reason: `MANDATE_STATUS_${cachedMandate.status}` };
      }
      if (cachedMandate.mandate_version !== permit.mandate_version) {
        return { decision: 'DENY', reason: 'MANDATE_VERSION_MISMATCH' };
      }
      if (cachedMandate.expires_at <= this.clock.now()) {
        return { decision: 'DENY', reason: 'MANDATE_EXPIRED' };
      }
    }

    // 3. Atomic Nonce Consumption (T06 Single-Use Replay Protection)
    const nonceConsumed = this.store.consumeNonceAtomically(permit.nonce, permit.permit_id);
    if (!nonceConsumed) {
      return {
        decision: 'DENY',
        reason: 'NONCE_ALREADY_CONSUMED',
      };
    }

    // 4. Create Initial Transaction Record (PERMIT_VALIDATED)
    let txRecord: BankTransactionRow;
    try {
      txRecord = this.store.createTransaction({
        request_id: permit.request_id,
        permit_id: permit.permit_id,
        nonce: permit.nonce,
        customer_ref: permit.customer_ref,
        account_ref: permit.account_ref,
        agent_id: permit.agent_id,
        amount_paise: permit.amount_paise,
        payload_hash: permit.payload_hash,
        status: 'PERMIT_VALIDATED',
      });
    } catch (err: any) {
      return {
        decision: 'DENY',
        reason: 'DUPLICATE_REQUEST_ID',
      };
    }

    // 5. Stage 1: Create Pending Transfer on Ledger Adapter
    let pendingResult;
    try {
      pendingResult = await this.ledgerClient.createPendingTransfer({
        requestId: permit.request_id,
        accountRef: permit.account_ref,
        amountPaise: permit.amount_paise,
        ttlSeconds: 120, // 120s TTL lock on TigerBeetle
      });
    } catch (err: any) {
      this.store.updateTransactionStatus(permit.request_id, 'PENDING_RECONCILIATION', {
        statusReason: `LEDGER_SOCKET_ERROR: ${err.message}`,
      });
      return {
        decision: 'DEFER',
        status: 'PENDING_RECONCILIATION',
        reason: 'LEDGER_TIMEOUT_PENDING_RECONCILIATION',
      };
    }

    if (pendingResult.status !== 'PENDING') {
      this.store.updateTransactionStatus(permit.request_id, 'VOIDED', {
        statusReason: pendingResult.reason ?? 'FUNDS_RESERVATION_REJECTED',
      });
      return {
        decision: 'DENY',
        status: 'VOIDED',
        reason: pendingResult.reason ?? 'INSUFFICIENT_FUNDS',
      };
    }

    // Transition: PENDING_TRANSFER
    this.store.updateTransactionStatus(permit.request_id, 'PENDING_TRANSFER', {
      transferId: pendingResult.transfer_id,
    });

    // 6. Stage 2: Post Transfer (Final Settlement)
    let settlementResult;
    try {
      settlementResult = await this.ledgerClient.postTransfer(pendingResult.transfer_id);
    } catch (err: any) {
      this.store.updateTransactionStatus(permit.request_id, 'PENDING_RECONCILIATION', {
        statusReason: `SETTLEMENT_TIMEOUT: ${err.message}`,
      });
      return {
        decision: 'DEFER',
        status: 'PENDING_RECONCILIATION',
        transfer_id: pendingResult.transfer_id,
        reason: 'SETTLEMENT_TIMEOUT_PENDING_RECONCILIATION',
      };
    }

    if (settlementResult.status === 'SETTLED') {
      this.store.updateTransactionStatus(permit.request_id, 'SETTLED', {
        transferId: pendingResult.transfer_id,
      });
      return {
        decision: 'ALLOW',
        status: 'SETTLED',
        transfer_id: pendingResult.transfer_id,
        transaction: this.store.getTransaction(permit.request_id)!,
      };
    } else {
      this.store.updateTransactionStatus(permit.request_id, 'VOIDED', {
        statusReason: settlementResult.reason ?? 'SETTLEMENT_FAILED',
      });
      return {
        decision: 'DENY',
        status: 'VOIDED',
        transfer_id: pendingResult.transfer_id,
        reason: settlementResult.reason ?? 'SETTLEMENT_FAILED',
      };
    }
  }

  public getTransaction(requestId: string): BankTransactionRow | null {
    return this.store.getTransaction(requestId);
  }
}
