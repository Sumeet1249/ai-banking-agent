/**
 * Ledger Adapter Interface & Test Fake
 *
 * Implements Rule E4: packages/bank-gate never imports tigerbeetle-node.
 * Connects to Ledger Adapter on Port 4001 or uses FakeLedgerClient for in-memory testing.
 */

export interface PendingTransferResult {
  transfer_id: string; // 128-bit BigInt string representation
  status: 'PENDING' | 'REJECTED';
  reason?: string;
  expires_at: number;
}

export interface SettlementResult {
  transfer_id: string;
  status: 'SETTLED' | 'VOIDED' | 'FAILED';
  reason?: string;
}

export interface LedgerBalance {
  account_ref: string;
  liquid_balance_paise: number;
  reserved_balance_paise: number;
}

export interface TransferLookupResult {
  transfer_id: string;
  status: 'PENDING' | 'POSTED' | 'VOIDED' | 'NOT_FOUND';
  amount_paise?: number;
  debit_account_ref?: string;
  credit_account_ref?: string;
  expires_at?: number;
}

export interface ILedgerClient {
  getAccountBalance(accountRef: string): Promise<LedgerBalance | null>;
  createPendingTransfer(params: {
    requestId: string;
    accountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
    creditAccountRef?: string;
  }): Promise<PendingTransferResult>;
  postTransfer(transferId: string): Promise<SettlementResult>;
  voidTransfer(transferId: string, reason: string): Promise<SettlementResult>;
  getTransfer(transferId: string): Promise<TransferLookupResult>;
}

export class FakeLedgerClient implements ILedgerClient {
  private balances = new Map<string, { liquid: number; reserved: number }>();
  private transfers = new Map<string, { accountRef: string; amount: number; status: 'PENDING' | 'SETTLED' | 'VOIDED'; expiresAt: number }>();

  constructor() {
    // Seed baseline account ACC_101 with ₹1,00,000 (10,000,000 paise)
    this.balances.set('ACC_101', { liquid: 10000000, reserved: 0 });
  }

  public async getAccountBalance(accountRef: string): Promise<LedgerBalance | null> {
    const bal = this.balances.get(accountRef);
    if (!bal) return null;
    return {
      account_ref: accountRef,
      liquid_balance_paise: bal.liquid,
      reserved_balance_paise: bal.reserved,
    };
  }

  public async createPendingTransfer(params: {
    requestId: string;
    accountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
  }): Promise<PendingTransferResult> {
    const bal = this.balances.get(params.accountRef);
    if (!bal) {
      return { transfer_id: '', status: 'REJECTED', reason: 'ACCOUNT_NOT_FOUND', expires_at: 0 };
    }

    if (bal.liquid < params.amountPaise) {
      return { transfer_id: '', status: 'REJECTED', reason: 'INSUFFICIENT_FUNDS', expires_at: 0 };
    }

    // Convert UUIDv4 to BigInt transferId (Decision D15)
    const transferId = BigInt('0x' + params.requestId.replace(/-/g, '')).toString();
    const expiresAt = Date.now() + (params.ttlSeconds ?? 120) * 1000;

    // Atomically hold liquid funds into reserved
    bal.liquid -= params.amountPaise;
    bal.reserved += params.amountPaise;

    this.transfers.set(transferId, {
      accountRef: params.accountRef,
      amount: params.amountPaise,
      status: 'PENDING',
      expiresAt,
    });

    return {
      transfer_id: transferId,
      status: 'PENDING',
      expires_at: expiresAt,
    };
  }

  public async postTransfer(transferId: string): Promise<SettlementResult> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { transfer_id: transferId, status: 'FAILED', reason: 'TRANSFER_NOT_FOUND' };
    }

    if (transfer.status !== 'PENDING') {
      return { transfer_id: transferId, status: 'FAILED', reason: `TRANSFER_ALREADY_${transfer.status}` };
    }

    const bal = this.balances.get(transfer.accountRef)!;
    bal.reserved -= transfer.amount; // Cleared from reserved
    transfer.status = 'SETTLED';

    return { transfer_id: transferId, status: 'SETTLED' };
  }

  public async voidTransfer(transferId: string, reason: string): Promise<SettlementResult> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { transfer_id: transferId, status: 'FAILED', reason: 'TRANSFER_NOT_FOUND' };
    }

    if (transfer.status !== 'PENDING') {
      return { transfer_id: transferId, status: 'FAILED', reason: `TRANSFER_ALREADY_${transfer.status}` };
    }

    const bal = this.balances.get(transfer.accountRef)!;
    bal.liquid += transfer.amount;   // Returned to liquid
    bal.reserved -= transfer.amount;
    transfer.status = 'VOIDED';

    return { transfer_id: transferId, status: 'VOIDED', reason };
  }

  public async getTransfer(transferId: string): Promise<TransferLookupResult> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { transfer_id: transferId, status: 'NOT_FOUND' };
    }
    const statusMapped = transfer.status === 'SETTLED' ? 'POSTED' : transfer.status;
    return {
      transfer_id: transferId,
      status: statusMapped,
      amount_paise: transfer.amount,
      debit_account_ref: transfer.accountRef,
      expires_at: transfer.expiresAt,
    };
  }
}
