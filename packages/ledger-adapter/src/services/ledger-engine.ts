/**
 * Ledger Engine & TigerBeetle Protocol Emulation
 *
 * Implements:
 *   - 128-bit unsigned integer (u128) transfer IDs derived from UUIDv4 (Decision D15)
 *   - Integer-paise double-entry accounting (Rule E1)
 *   - Two-phase transfers:
 *       Stage 1: PENDING (debit balance held in reserved_paise with 120s TTL)
 *       Stage 2: POST (committed permanently to payee) or VOID (funds returned to liquid)
 *   - Idempotent duplicate rejection (transfer_exists)
 */

import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import { LedgerAccountRow, LedgerTransferRow } from './ledger-backend';
export { LedgerAccountRow, LedgerTransferRow };

export class LedgerEngine {
  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.initTables();
    this.seedBaselineAccounts();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        account_ref TEXT PRIMARY KEY,
        currency TEXT NOT NULL DEFAULT 'INR',
        posted_balance_paise INTEGER NOT NULL,
        reserved_balance_paise INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger_transfers (
        transfer_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        debit_account_ref TEXT NOT NULL,
        credit_account_ref TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        settled_at INTEGER,
        void_reason TEXT,
        FOREIGN KEY(debit_account_ref) REFERENCES ledger_accounts(account_ref),
        FOREIGN KEY(credit_account_ref) REFERENCES ledger_accounts(account_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_ltx_status ON ledger_transfers(status);
    `);
  }

  private seedBaselineAccounts(): void {
    const existing = this.db.prepare('SELECT account_ref FROM ledger_accounts WHERE account_ref = ?').get('ACC_101');
    if (existing) return;

    const now = Date.now();
    const insert = this.db.prepare(`
      INSERT INTO ledger_accounts (account_ref, currency, posted_balance_paise, reserved_balance_paise, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Customer Account ACC_101: ₹1,00,000 liquid (10,000,000 paise)
    insert.run('ACC_101', 'INR', 10000000, 0, now, now);
    // Utility Payee Accounts: ₹0 initially
    insert.run('PAYEE_CESC_001', 'INR', 0, 0, now, now);
    insert.run('PAYEE_TATA_POWER_001', 'INR', 0, 0, now, now);
  }

  /**
   * Converts UUIDv4 string into 128-bit unsigned integer string (Decision D15).
   */
  public uuidToU128(uuid: string): string {
    const hex = uuid.replace(/-/g, '');
    return BigInt('0x' + hex).toString();
  }

  public getAccount(accountRef: string): LedgerAccountRow | null {
    const row = this.db.prepare('SELECT * FROM ledger_accounts WHERE account_ref = ?').get(accountRef) as LedgerAccountRow | undefined;
    return row ?? null;
  }

  public getBalance(accountRef: string): { liquid_balance_paise: number; reserved_balance_paise: number; posted_balance_paise: number } | null {
    const acc = this.getAccount(accountRef);
    if (!acc) return null;
    return {
      posted_balance_paise: acc.posted_balance_paise,
      reserved_balance_paise: acc.reserved_balance_paise,
      liquid_balance_paise: acc.posted_balance_paise - acc.reserved_balance_paise,
    };
  }

  /**
   * Stage 1: Create Two-Phase Pending Transfer (120s TTL lock)
   */
  public createPendingTransfer(params: {
    requestId: string;
    debitAccountRef: string;
    creditAccountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
  }): { transfer: LedgerTransferRow; status: 'PENDING' | 'EXISTS' | 'INSUFFICIENT_FUNDS' | 'ACCOUNT_NOT_FOUND' } {
    const debitAcc = this.getAccount(params.debitAccountRef);
    if (!debitAcc) return { transfer: null as any, status: 'ACCOUNT_NOT_FOUND' };

    const creditAcc = this.getAccount(params.creditAccountRef);
    if (!creditAcc) return { transfer: null as any, status: 'ACCOUNT_NOT_FOUND' };

    const transferId = this.uuidToU128(params.requestId);

    // Check if transfer already exists (Idempotency / transfer_exists)
    const existing = this.getTransfer(transferId);
    if (existing) {
      return { transfer: existing, status: 'EXISTS' };
    }

    const availablePaise = debitAcc.posted_balance_paise - debitAcc.reserved_balance_paise;
    if (availablePaise < params.amountPaise) {
      return { transfer: null as any, status: 'INSUFFICIENT_FUNDS' };
    }

    const now = Date.now();
    const expiresAt = now + (params.ttlSeconds ?? 120) * 1000;

    const tx = this.db.transaction(() => {
      // Hold funds in reserved balance
      this.db.prepare(`
        UPDATE ledger_accounts
        SET reserved_balance_paise = reserved_balance_paise + ?, updated_at = ?
        WHERE account_ref = ?
      `).run(params.amountPaise, now, params.debitAccountRef);

      // Insert pending transfer record
      this.db.prepare(`
        INSERT INTO ledger_transfers (
          transfer_id, request_id, debit_account_ref, credit_account_ref,
          amount_paise, currency, status, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'INR', 'PENDING', ?, ?)
      `).run(
        transferId,
        params.requestId,
        params.debitAccountRef,
        params.creditAccountRef,
        params.amountPaise,
        expiresAt,
        now,
      );
    });

    tx();
    return { transfer: this.getTransfer(transferId)!, status: 'PENDING' };
  }

  /**
   * Stage 2: Post (Commit) Pending Transfer
   */
  public postTransfer(transferIdOrUuid: string): { transfer: LedgerTransferRow | null; status: 'SETTLED' | 'NOT_FOUND' | 'ALREADY_SETTLED' | 'ALREADY_VOIDED' | 'EXPIRED' } {
    const transferId = transferIdOrUuid.includes('-') ? this.uuidToU128(transferIdOrUuid) : transferIdOrUuid;
    const transfer = this.getTransfer(transferId);
    if (!transfer) return { transfer: null, status: 'NOT_FOUND' };

    if (transfer.status === 'POSTED') return { transfer, status: 'ALREADY_SETTLED' };
    if (transfer.status === 'VOIDED') return { transfer, status: 'ALREADY_VOIDED' };

    const now = Date.now();
    if (transfer.expires_at <= now) {
      this.voidTransfer(transferId, 'TRANSFER_HOLD_EXPIRED');
      return { transfer: this.getTransfer(transferId), status: 'EXPIRED' };
    }

    const tx = this.db.transaction(() => {
      // 1. Debit account: reduce posted balance and clear reserved hold
      this.db.prepare(`
        UPDATE ledger_accounts
        SET posted_balance_paise = posted_balance_paise - ?,
            reserved_balance_paise = reserved_balance_paise - ?,
            updated_at = ?
        WHERE account_ref = ?
      `).run(transfer.amount_paise, transfer.amount_paise, now, transfer.debit_account_ref);

      // 2. Credit account: increase posted balance
      this.db.prepare(`
        UPDATE ledger_accounts
        SET posted_balance_paise = posted_balance_paise + ?,
            updated_at = ?
        WHERE account_ref = ?
      `).run(transfer.amount_paise, now, transfer.credit_account_ref);

      // 3. Mark transfer as POSTED
      this.db.prepare(`
        UPDATE ledger_transfers
        SET status = 'POSTED', settled_at = ?
        WHERE transfer_id = ?
      `).run(now, transferId);
    });

    tx();
    return { transfer: this.getTransfer(transferId), status: 'SETTLED' };
  }

  /**
   * Stage 2: Void (Cancel) Pending Transfer
   */
  public voidTransfer(transferIdOrUuid: string, reason: string): { transfer: LedgerTransferRow | null; status: 'VOIDED' | 'NOT_FOUND' | 'ALREADY_POSTED' | 'ALREADY_VOIDED' } {
    const transferId = transferIdOrUuid.includes('-') ? this.uuidToU128(transferIdOrUuid) : transferIdOrUuid;
    const transfer = this.getTransfer(transferId);
    if (!transfer) return { transfer: null, status: 'NOT_FOUND' };

    if (transfer.status === 'POSTED') return { transfer, status: 'ALREADY_POSTED' };
    if (transfer.status === 'VOIDED') return { transfer, status: 'ALREADY_VOIDED' };

    const now = Date.now();
    const tx = this.db.transaction(() => {
      // Release held funds back to liquid balance
      this.db.prepare(`
        UPDATE ledger_accounts
        SET reserved_balance_paise = reserved_balance_paise - ?,
            updated_at = ?
        WHERE account_ref = ?
      `).run(transfer.amount_paise, now, transfer.debit_account_ref);

      this.db.prepare(`
        UPDATE ledger_transfers
        SET status = 'VOIDED', void_reason = ?
        WHERE transfer_id = ?
      `).run(reason, transferId);
    });

    tx();
    return { transfer: this.getTransfer(transferId), status: 'VOIDED' };
  }

  public getTransfer(transferIdOrUuid: string): LedgerTransferRow | null {
    const transferId = transferIdOrUuid.includes('-') ? this.uuidToU128(transferIdOrUuid) : transferIdOrUuid;
    const row = this.db.prepare('SELECT * FROM ledger_transfers WHERE transfer_id = ?').get(transferId) as LedgerTransferRow | undefined;
    return row ?? null;
  }
}
