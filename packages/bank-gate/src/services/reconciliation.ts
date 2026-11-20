/**
 * Financial Reconciliation Service
 *
 * Implements Phase 3.3 Task B & Task C:
 *   - Resolves transactions in PENDING_RECONCILIATION state
 *   - Queries TigerBeetle / Ledger ground truth before taking any action
 *   - Prevents duplicate debits, double settlements, or duplicate voids
 *   - Enforces valid state machine transitions:
 *       PERMIT_VALIDATED -> PENDING_TRANSFER -> SETTLED | VOIDED | PENDING_RECONCILIATION
 *       PENDING_RECONCILIATION -> SETTLED | VOIDED
 *   - Recovers transactions after service restart / crash
 */

import type { Logger } from 'pino';
import { Clock, SystemClock } from '@agentguard/core-schema';
import { BankGateStore, BankTransactionRow, TransactionStatus } from '../db/bank-gate-store';
import { ILedgerClient } from '../adapters/ledger-client';

export interface ReconciliationResult {
  request_id: string;
  initial_status: TransactionStatus;
  resolved_status: TransactionStatus;
  transfer_id: string | null;
  action_taken: 'POSTED' | 'VOIDED' | 'ALREADY_SETTLED' | 'ALREADY_VOIDED' | 'NO_TRANSFER_VOIDED' | 'STILL_PENDING';
  reason?: string;
  transaction?: BankTransactionRow;
}

export class FinancialReconciliationService {
  constructor(
    private store: BankGateStore,
    private ledgerClient: ILedgerClient,
    private clock: Clock = new SystemClock(),
    private logger?: Logger,
  ) {}

  /**
   * Reconciles a specific transaction by request ID against the Ledger ground truth.
   */
  public async reconcileTransaction(requestId: string): Promise<ReconciliationResult> {
    const tx = this.store.getTransaction(requestId);
    if (!tx) {
      throw new Error(`Transaction ${requestId} not found`);
    }

    const initialStatus = tx.status;

    // Terminal states cannot be altered (settled is final, voided is final)
    if (initialStatus === 'SETTLED') {
      return {
        request_id: requestId,
        initial_status: initialStatus,
        resolved_status: 'SETTLED',
        transfer_id: tx.transfer_id,
        action_taken: 'ALREADY_SETTLED',
      };
    }

    if (initialStatus === 'VOIDED') {
      return {
        request_id: requestId,
        initial_status: initialStatus,
        resolved_status: 'VOIDED',
        transfer_id: tx.transfer_id,
        action_taken: 'ALREADY_VOIDED',
      };
    }

    // If transaction has no transfer_id assigned (e.g. timeout occurred during createPendingTransfer)
    // We compute the deterministic 128-bit transfer ID from requestId and query the ledger directly
    const transferId = tx.transfer_id || BigInt('0x' + requestId.replace(/-/g, '')).toString();

    const ledgerTransfer = await this.ledgerClient.getTransfer(transferId);

    // Case 1: Transfer never existed on the Ledger
    if (ledgerTransfer.status === 'NOT_FOUND') {
      this.store.updateTransactionStatus(requestId, 'VOIDED', {
        statusReason: 'RECONCILED_LEDGER_TRANSFER_NEVER_EXISTED',
      });
      return {
        request_id: requestId,
        initial_status: initialStatus,
        resolved_status: 'VOIDED',
        transfer_id: null,
        action_taken: 'NO_TRANSFER_VOIDED',
        reason: 'Transfer was never registered on the Ledger',
        transaction: this.store.getTransaction(requestId)!,
      };
    }

    // Case 2: Transfer already POSTED on the Ledger
    if (ledgerTransfer.status === 'POSTED') {
      this.store.updateTransactionStatus(requestId, 'SETTLED', {
        transferId,
        statusReason: 'RECONCILED_CONFIRMED_POSTED_ON_LEDGER',
      });
      return {
        request_id: requestId,
        initial_status: initialStatus,
        resolved_status: 'SETTLED',
        transfer_id: transferId,
        action_taken: 'ALREADY_SETTLED',
        transaction: this.store.getTransaction(requestId)!,
      };
    }

    // Case 3: Transfer already VOIDED on the Ledger
    if (ledgerTransfer.status === 'VOIDED') {
      this.store.updateTransactionStatus(requestId, 'VOIDED', {
        transferId,
        statusReason: 'RECONCILED_CONFIRMED_VOIDED_ON_LEDGER',
      });
      return {
        request_id: requestId,
        initial_status: initialStatus,
        resolved_status: 'VOIDED',
        transfer_id: transferId,
        action_taken: 'ALREADY_VOIDED',
        transaction: this.store.getTransaction(requestId)!,
      };
    }

    // Case 4: Transfer is currently PENDING on the Ledger
    if (ledgerTransfer.status === 'PENDING') {
      const now = this.clock.now();
      // Check if the 120s hold has expired
      if (ledgerTransfer.expires_at && ledgerTransfer.expires_at <= now) {
        // Void expired hold
        await this.ledgerClient.voidTransfer(transferId, 'RECONCILIATION_HOLD_EXPIRED');
        this.store.updateTransactionStatus(requestId, 'VOIDED', {
          transferId,
          statusReason: 'RECONCILED_HOLD_EXPIRED_AND_VOIDED',
        });
        return {
          request_id: requestId,
          initial_status: initialStatus,
          resolved_status: 'VOIDED',
          transfer_id: transferId,
          action_taken: 'VOIDED',
          reason: 'Pending transfer expired on Ledger',
          transaction: this.store.getTransaction(requestId)!,
        };
      }

      // If still within 120s TTL and was in PENDING_RECONCILIATION (e.g. stage-2 post timed out), post it
      const postResult = await this.ledgerClient.postTransfer(transferId);
      if (postResult.status === 'SETTLED') {
        this.store.updateTransactionStatus(requestId, 'SETTLED', {
          transferId,
          statusReason: 'RECONCILED_COMPLETED_POST',
        });
        return {
          request_id: requestId,
          initial_status: initialStatus,
          resolved_status: 'SETTLED',
          transfer_id: transferId,
          action_taken: 'POSTED',
          transaction: this.store.getTransaction(requestId)!,
        };
      } else {
        // If post failed, void it safely
        await this.ledgerClient.voidTransfer(transferId, `POST_FAILED: ${postResult.reason}`);
        this.store.updateTransactionStatus(requestId, 'VOIDED', {
          transferId,
          statusReason: `RECONCILED_POST_FAILED: ${postResult.reason}`,
        });
        return {
          request_id: requestId,
          initial_status: initialStatus,
          resolved_status: 'VOIDED',
          transfer_id: transferId,
          action_taken: 'VOIDED',
          reason: postResult.reason,
          transaction: this.store.getTransaction(requestId)!,
        };
      }
    }

    return {
      request_id: requestId,
      initial_status: initialStatus,
      resolved_status: initialStatus,
      transfer_id: transferId,
      action_taken: 'STILL_PENDING',
    };
  }

  /**
   * Recovers all uncertain transactions across the database on startup.
   */
  public async recoverUncertainTransactions(): Promise<ReconciliationResult[]> {
    const rows = this.store.listUncertainTransactions();
    const results: ReconciliationResult[] = [];
    for (const r of rows) {
      try {
        const res = await this.reconcileTransaction(r.request_id);
        results.push(res);
      } catch (err: any) {
        this.logger?.error({ err: err.message, request_id: r.request_id }, 'Failed to reconcile transaction during startup recovery');
      }
    }
    return results;
  }
}
