/**
 * Bank Gate Durable Database Store
 *
 * Implements durable tracking for:
 *   - Atomic Nonce Consumption (T06 Single-Use Enforcement)
 *   - Transaction State Machine (PERMIT_VALIDATED -> PENDING_TRANSFER -> SETTLED | VOIDED | PENDING_RECONCILIATION)
 *   - Live Mandate Cache & Invalidation Events
 */

import Database from 'better-sqlite3';
import type { Logger } from 'pino';

export interface ConsumedNonceRow {
  nonce: string;
  permit_id: string;
  consumed_at: number;
}

export type TransactionStatus =
  | 'PERMIT_VALIDATED'
  | 'PENDING_TRANSFER'
  | 'SETTLED'
  | 'VOIDED'
  | 'PENDING_RECONCILIATION';

export interface BankTransactionRow {
  request_id: string;
  permit_id: string;
  nonce: string;
  transfer_id: string | null;
  customer_ref: string;
  account_ref: string;
  agent_id: string;
  amount_paise: number;
  payload_hash: string;
  status: TransactionStatus;
  status_reason: string | null;
  created_at: number;
  updated_at: number;
}

export class BankGateStore {
  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.init();
  }

  public init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bank_transactions (
        request_id TEXT PRIMARY KEY,
        permit_id TEXT NOT NULL,
        nonce TEXT NOT NULL UNIQUE,
        transfer_id TEXT,
        customer_ref TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        status_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_btx_permit ON bank_transactions(permit_id);
      CREATE INDEX IF NOT EXISTS idx_btx_status ON bank_transactions(status);

      CREATE TABLE IF NOT EXISTS consumed_nonces (
        nonce TEXT PRIMARY KEY,
        permit_id TEXT NOT NULL,
        consumed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cached_mandates (
        mandate_id TEXT PRIMARY KEY,
        mandate_version INTEGER NOT NULL,
        customer_ref TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        authorized_agent_id TEXT NOT NULL,
        allowed_payees TEXT NOT NULL,
        per_tx_limit_paise INTEGER NOT NULL,
        daily_limit_paise INTEGER NOT NULL,
        status TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  /**
   * Atomically consumes a nonce using SQLite UNIQUE constraint.
   * If the nonce has already been consumed, returns false.
   */
  public consumeNonceAtomically(nonce: string, permitId: string): boolean {
    const now = Date.now();
    try {
      this.db.prepare(`
        INSERT INTO consumed_nonces (nonce, permit_id, consumed_at)
        VALUES (?, ?, ?)
      `).run(nonce, permitId, now);
      return true;
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.message?.includes('UNIQUE')) {
        return false;
      }
      throw err;
    }
  }

  public createTransaction(tx: {
    request_id: string;
    permit_id: string;
    nonce: string;
    customer_ref: string;
    account_ref: string;
    agent_id: string;
    amount_paise: number;
    payload_hash: string;
    status: TransactionStatus;
    status_reason?: string | null;
  }): BankTransactionRow {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO bank_transactions (
        request_id, permit_id, nonce, transfer_id, customer_ref, account_ref,
        agent_id, amount_paise, payload_hash, status, status_reason, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tx.request_id,
      tx.permit_id,
      tx.nonce,
      tx.customer_ref,
      tx.account_ref,
      tx.agent_id,
      tx.amount_paise,
      tx.payload_hash,
      tx.status,
      tx.status_reason ?? null,
      now,
      now,
    );

    return this.getTransaction(tx.request_id)!;
  }

  public getTransaction(requestId: string): BankTransactionRow | null {
    const row = this.db.prepare('SELECT * FROM bank_transactions WHERE request_id = ?').get(requestId) as BankTransactionRow | undefined;
    return row ?? null;
  }

  public listUncertainTransactions(): BankTransactionRow[] {
    return this.db.prepare(`
      SELECT * FROM bank_transactions 
      WHERE status IN ('PENDING_RECONCILIATION', 'PENDING_TRANSFER')
      ORDER BY created_at ASC
    `).all() as BankTransactionRow[];
  }

  public updateTransactionStatus(
    requestId: string,
    status: TransactionStatus,
    opts?: { transferId?: string; statusReason?: string },
  ): boolean {
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE bank_transactions SET
        status = ?,
        transfer_id = COALESCE(?, transfer_id),
        status_reason = COALESCE(?, status_reason),
        updated_at = ?
      WHERE request_id = ?
    `).run(status, opts?.transferId ?? null, opts?.statusReason ?? null, now, requestId);
    return res.changes > 0;
  }

  // ── Mandate Cache ──────────────────────────────────────────────────────────

  public setCachedMandate(mandate: {
    mandate_id: string;
    mandate_version: number;
    customer_ref: string;
    account_ref: string;
    authorized_agent_id: string;
    allowed_payees: string[];
    per_tx_limit_paise: number;
    daily_limit_paise: number;
    status: string;
    expires_at: number;
  }): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO cached_mandates (
        mandate_id, mandate_version, customer_ref, account_ref, authorized_agent_id,
        allowed_payees, per_tx_limit_paise, daily_limit_paise, status, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mandate.mandate_id,
      mandate.mandate_version,
      mandate.customer_ref,
      mandate.account_ref,
      mandate.authorized_agent_id,
      JSON.stringify(mandate.allowed_payees),
      mandate.per_tx_limit_paise,
      mandate.daily_limit_paise,
      mandate.status,
      mandate.expires_at,
      now,
    );
  }

  public getCachedMandate(mandateId: string): any | null {
    const row = this.db.prepare('SELECT * FROM cached_mandates WHERE mandate_id = ?').get(mandateId) as any | undefined;
    if (!row) return null;
    return {
      ...row,
      allowed_payees: JSON.parse(row.allowed_payees),
    };
  }

  public evictMandate(mandateId: string): boolean {
    const res = this.db.prepare("UPDATE cached_mandates SET status = 'REVOKED' WHERE mandate_id = ?").run(mandateId);
    return res.changes > 0;
  }
}
