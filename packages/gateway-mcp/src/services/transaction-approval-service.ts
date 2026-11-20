/**
 * Transaction-Bound Customer Step-Up Approval Service
 *
 * Implements Phase 7.1 Part 4:
 *   - Binds WebAuthn cryptographic assertion to the exact 7-field canonical transaction digest
 *   - Associated with: request_id, permit_id, customer_ref, account_ref, mandate_id,
 *     mandate_version, amount_paise, currency, payee_id, purpose, invoice_ref
 *   - Enforces single-use atomic challenge consumption
 *   - Invalidates approval if amount, payee, account, mandate version, or digest changes
 *   - Preserves Invariants I1-I9
 */

import { randomUUID } from 'crypto';
import type { Logger } from 'pino';
import {
  CanonicalTransaction,
  computeCanonicalTransactionDigest,
} from '@agentguard/core-schema';
import { BankingStores, TransactionBoundApprovalRow } from '../db/banking-stores';
import { WebAuthnService } from './webauthn-service';

export interface CreateApprovalChallengeParams {
  requestId: string;
  permitId: string;
  customerRef: string;
  accountRef: string;
  mandateId: string;
  mandateVersion: number;
  transaction: CanonicalTransaction;
  ttlSeconds?: number;
}

export class TransactionApprovalService {
  constructor(
    private stores: BankingStores,
    private webauthn: WebAuthnService,
    private logger?: Logger,
  ) {}

  /**
   * Stage 1: Initiates a transaction-bound approval challenge for Cockpit WebAuthn prompt
   */
  public async createApprovalChallenge(params: CreateApprovalChallengeParams): Promise<{
    approvalId: string;
    requestId: string;
    canonicalTxDigest: string;
    webauthnOptions: any;
    expiresAt: number;
  }> {
    // 1. Verify customer exists
    const customer = this.stores.getCustomer(params.customerRef);
    if (!customer) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    // 2. Verify customer has registered passkeys
    const creds = this.webauthn.listCredentials(params.customerRef);
    if (creds.length === 0) {
      throw new Error('NO_WEBAUTHN_PASSKEYS_REGISTERED');
    }

    // 3. Compute exact 7-field canonical transaction digest (Invariant I2)
    const canonicalTxDigest = computeCanonicalTransactionDigest(params.transaction);

    // 4. Verify mandate exists and version matches
    const mandate = this.stores.getMandate(params.mandateId);
    if (!mandate) {
      throw new Error('MANDATE_NOT_FOUND');
    }
    if (mandate.mandate_version !== params.mandateVersion) {
      throw new Error('MANDATE_VERSION_MISMATCH');
    }
    if (mandate.status !== 'ACTIVE') {
      throw new Error(`MANDATE_NOT_ACTIVE_${mandate.status}`);
    }

    // 5. Generate WebAuthn Authentication Options
    const webauthnOptions = await this.webauthn.generateAuthenticationOptions(params.customerRef);

    const approvalId = `APR_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const ttlSeconds = params.ttlSeconds ?? 120; // 120s TTL aligned with budget hold

    // 6. Persist approval record bound to exact transaction parameters
    const approval = this.stores.createTransactionApproval({
      approval_id: approvalId,
      challenge_id: webauthnOptions.challenge,
      request_id: params.requestId,
      permit_id: params.permitId,
      customer_ref: params.customerRef,
      account_ref: params.accountRef,
      mandate_id: params.mandateId,
      mandate_version: params.mandateVersion,
      canonical_tx_digest: canonicalTxDigest,
      amount_paise: params.transaction.amount_paise,
      currency: params.transaction.currency,
      payee_id: params.transaction.payee_id,
      purpose: params.transaction.purpose,
      invoice_ref: params.transaction.invoice_ref,
      ttlSeconds,
    });

    this.logger?.info(
      { approvalId, requestId: params.requestId, canonicalTxDigest },
      'Transaction-bound WebAuthn approval challenge created'
    );

    return {
      approvalId,
      requestId: params.requestId,
      canonicalTxDigest,
      webauthnOptions,
      expiresAt: approval.expires_at,
    };
  }

  /**
   * Stage 2: Verifies WebAuthn assertion and approves the bound transaction
   */
  public async verifyAndApprove(
    approvalId: string,
    webauthnResponse: any,
  ): Promise<{
    approved: boolean;
    approval: TransactionBoundApprovalRow;
  }> {
    // 1. Fetch approval record
    const approval = this.stores.getTransactionApproval(approvalId);
    if (!approval) {
      throw new Error('APPROVAL_NOT_FOUND');
    }

    if (approval.status !== 'PENDING') {
      throw new Error(`APPROVAL_ALREADY_${approval.status}`);
    }

    if (approval.expires_at <= Date.now()) {
      throw new Error('APPROVAL_EXPIRED');
    }

    // 2. Verify mandate version has not changed in the background
    const mandate = this.stores.getMandate(approval.mandate_id);
    if (!mandate || mandate.mandate_version !== approval.mandate_version) {
      this.logger?.warn({ approvalId }, 'Mandate version bumped during approval — invalidating approval');
      throw new Error('MANDATE_VERSION_BUMPED_INVALIDATED');
    }

    // 3. Cryptographically verify WebAuthn assertion
    await this.webauthn.verifyAuthentication(
      approval.customer_ref,
      approval.challenge_id,
      webauthnResponse,
    );

    // 4. Atomically transition approval to APPROVED
    const marked = this.stores.markApprovalVerified({
      approval_id: approvalId,
      canonical_tx_digest: approval.canonical_tx_digest,
      mandate_version: approval.mandate_version,
    });

    if (!marked) {
      throw new Error('FAILED_TO_MARK_APPROVAL_VERIFIED');
    }

    const updated = this.stores.getTransactionApproval(approvalId)!;
    this.logger?.info({ approvalId, requestId: updated.request_id }, 'Transaction approved via WebAuthn step-up');

    return {
      approved: true,
      approval: updated,
    };
  }

  /**
   * Validates and atomically consumes the approval at transaction execution time
   */
  public consumeApprovalForExecution(
    requestId: string,
    canonicalTxDigest: string,
  ): boolean {
    const approval = this.stores.getTransactionApprovalByRequestId(requestId);
    if (!approval) {
      return false; // No approval record
    }

    if (approval.status !== 'APPROVED') {
      return false; // Not in APPROVED state
    }

    if (approval.canonical_tx_digest !== canonicalTxDigest) {
      this.logger?.warn({ requestId }, 'Approval transaction digest mismatch!');
      return false;
    }

    // Check mandate version bump (Invariant I6)
    const currentMandate = this.stores.getMandate(approval.mandate_id);
    if (!currentMandate || currentMandate.mandate_version !== approval.mandate_version) {
      this.logger?.warn({
        requestId,
        mandateId: approval.mandate_id,
        currentVersion: currentMandate?.mandate_version,
        approvalVersion: approval.mandate_version,
      }, 'Mandate version bumped; approval invalidated!');
      return false;
    }

    if (approval.expires_at <= Date.now()) {
      return false; // Expired
    }

    // Atomic consumption
    return this.stores.consumeApproval(requestId, canonicalTxDigest);
  }
}
