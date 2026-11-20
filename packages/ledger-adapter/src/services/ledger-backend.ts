/**
 * Ledger Backend Interface & Common Financial Data Types
 *
 * Implements the explicit backend-selection contract (Decision D19):
 *   - TIGERBEETLE: Distributed Viewstamped Replication cluster
 *   - SQLITE_DEV: High-fidelity local SQLite protocol emulation
 */

export interface LedgerAccountRow {
  account_ref: string;
  currency: string;
  posted_balance_paise: number;
  reserved_balance_paise: number;
  created_at: number;
  updated_at: number;
}

export interface LedgerTransferRow {
  transfer_id: string; // 128-bit BigInt string representation (Decision D15)
  request_id: string;
  debit_account_ref: string;
  credit_account_ref: string;
  amount_paise: number;
  currency: string;
  status: 'PENDING' | 'POSTED' | 'VOIDED';
  expires_at: number;
  created_at: number;
  settled_at: number | null;
  void_reason: string | null;
}

export interface PendingTransferResult {
  transfer: LedgerTransferRow;
  status: 'PENDING' | 'EXISTS' | 'INSUFFICIENT_FUNDS' | 'ACCOUNT_NOT_FOUND';
  error_code?: string;
}

export interface PostTransferResult {
  transfer: LedgerTransferRow | null;
  status: 'SETTLED' | 'NOT_FOUND' | 'ALREADY_SETTLED' | 'ALREADY_VOIDED' | 'EXPIRED';
  error_code?: string;
}

export interface VoidTransferResult {
  transfer: LedgerTransferRow | null;
  status: 'VOIDED' | 'NOT_FOUND' | 'ALREADY_POSTED' | 'ALREADY_VOIDED';
  error_code?: string;
}

export interface BalanceResult {
  posted_balance_paise: number;
  reserved_balance_paise: number;
  liquid_balance_paise: number;
}

export interface ILedgerBackend {
  readonly backendType: 'SQLITE_DEV' | 'TIGERBEETLE';
  init(): Promise<void>;
  getAccount(accountRef: string): Promise<LedgerAccountRow | null>;
  getBalance(accountRef: string): Promise<BalanceResult | null>;
  createPendingTransfer(params: {
    requestId: string;
    debitAccountRef: string;
    creditAccountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
  }): Promise<PendingTransferResult>;
  postTransfer(transferIdOrUuid: string): Promise<PostTransferResult>;
  voidTransfer(transferIdOrUuid: string, reason: string): Promise<VoidTransferResult>;
  getTransfer(transferIdOrUuid: string): Promise<LedgerTransferRow | null>;
  close(): Promise<void>;
}
