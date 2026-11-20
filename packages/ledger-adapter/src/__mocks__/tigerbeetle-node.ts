/**
 * Mock implementation of tigerbeetle-node for Jest testing
 *
 * Prevents Windows Application Control binary block on host Windows machines
 * while providing high-fidelity simulation of TigerBeetle client bindings.
 */

export enum AccountFlags {
  none = 0,
  linked = 1,
  debits_must_not_exceed_credits = 2,
  credits_must_not_exceed_debits = 4,
  history = 8,
  imported = 16,
  closed = 32,
}

export enum TransferFlags {
  none = 0,
  linked = 1,
  pending = 2,
  post_pending_transfer = 4,
  void_pending_transfer = 8,
  balancing_debit = 16,
  balancing_credit = 32,
  closing_debit = 64,
  closing_credit = 128,
  imported = 256,
}

export enum CreateAccountStatus {
  created = 4294967295,
  linked_event_failed = 1,
  linked_event_chain_open = 2,
  exists = 21,
}

export enum CreateTransferStatus {
  created = 4294967295,
  linked_event_failed = 1,
  linked_event_chain_open = 2,
  debit_account_not_found = 21,
  credit_account_not_found = 22,
  pending_transfer_not_found = 25,
  pending_transfer_not_pending = 26,
  pending_transfer_already_posted = 33,
  pending_transfer_already_voided = 34,
  pending_transfer_expired = 35,
  exists = 46,
  exists_with_different_amount = 39,
  exists_with_different_flags = 36,
  exceeds_credits = 54,
  exceeds_debits = 55,
}

export interface Account {
  id: bigint;
  debits_pending: bigint;
  debits_posted: bigint;
  credits_pending: bigint;
  credits_posted: bigint;
  user_data_128: bigint;
  user_data_64: bigint;
  user_data_32: number;
  reserved: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: bigint;
}

export interface Transfer {
  id: bigint;
  debit_account_id: bigint;
  credit_account_id: bigint;
  amount: bigint;
  pending_id: bigint;
  user_data_128: bigint;
  user_data_64: bigint;
  user_data_32: number;
  timeout: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: bigint;
}

export interface CreateAccountResult {
  timestamp: bigint;
  status: CreateAccountStatus;
  reserved: number;
}

export interface CreateTransferResult {
  timestamp: bigint;
  status: CreateTransferStatus;
  reserved: number;
}

export class MockTigerBeetleClient {
  private accounts = new Map<string, Account>();
  private transfers = new Map<string, Transfer>();

  public async createAccounts(batch: Account[]): Promise<CreateAccountResult[]> {
    const results: CreateAccountResult[] = [];
    for (const acc of batch) {
      const key = acc.id.toString();
      if (this.accounts.has(key)) {
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateAccountStatus.exists, reserved: 0 });
      } else {
        this.accounts.set(key, { ...acc, timestamp: BigInt(Date.now() * 1_000_000) });
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateAccountStatus.created, reserved: 0 });
      }
    }
    return results;
  }

  public async createTransfers(batch: Transfer[]): Promise<CreateTransferResult[]> {
    const results: CreateTransferResult[] = [];
    for (const tx of batch) {
      const key = tx.id.toString();
      if (this.transfers.has(key)) {
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.exists, reserved: 0 });
        continue;
      }

      const debitAcc = this.accounts.get(tx.debit_account_id.toString());
      const creditAcc = this.accounts.get(tx.credit_account_id.toString());

      if (!debitAcc) {
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.debit_account_not_found, reserved: 0 });
        continue;
      }
      if (!creditAcc) {
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.credit_account_not_found, reserved: 0 });
        continue;
      }

      if (tx.flags & TransferFlags.pending) {
        // Stage 1 pending hold
        const liquid = debitAcc.credits_posted - (debitAcc.debits_posted + debitAcc.debits_pending);
        if (liquid < tx.amount) {
          results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.exceeds_credits, reserved: 0 });
          continue;
        }
        debitAcc.debits_pending += tx.amount;
        this.transfers.set(key, { ...tx, timestamp: BigInt(Date.now() * 1_000_000) });
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.created, reserved: 0 });
      } else if (tx.flags & TransferFlags.post_pending_transfer) {
        // Stage 2A post resolution
        const pendingTx = this.transfers.get(tx.pending_id.toString());
        if (!pendingTx) {
          results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.pending_transfer_not_found, reserved: 0 });
          continue;
        }
        debitAcc.debits_pending -= tx.amount;
        debitAcc.debits_posted += tx.amount;
        creditAcc.credits_posted += tx.amount;
        this.transfers.set(key, { ...tx, timestamp: BigInt(Date.now() * 1_000_000) });
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.created, reserved: 0 });
      } else if (tx.flags & TransferFlags.void_pending_transfer) {
        // Stage 2B void resolution
        const pendingTx = this.transfers.get(tx.pending_id.toString());
        if (!pendingTx) {
          results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.pending_transfer_not_found, reserved: 0 });
          continue;
        }
        debitAcc.debits_pending -= tx.amount;
        this.transfers.set(key, { ...tx, timestamp: BigInt(Date.now() * 1_000_000) });
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.created, reserved: 0 });
      } else {
        // Normal one-shot transfer
        debitAcc.debits_posted += tx.amount;
        creditAcc.credits_posted += tx.amount;
        this.transfers.set(key, { ...tx, timestamp: BigInt(Date.now() * 1_000_000) });
        results.push({ timestamp: BigInt(Date.now() * 1_000_000), status: CreateTransferStatus.created, reserved: 0 });
      }
    }
    return results;
  }

  public async lookupAccounts(ids: bigint[]): Promise<Account[]> {
    const list: Account[] = [];
    for (const id of ids) {
      const acc = this.accounts.get(id.toString());
      if (acc) list.push({ ...acc });
    }
    return list;
  }

  public async lookupTransfers(ids: bigint[]): Promise<Transfer[]> {
    const list: Transfer[] = [];
    for (const id of ids) {
      const tx = this.transfers.get(id.toString());
      if (tx) list.push({ ...tx });
    }
    return list;
  }

  public destroy(): void {}
}

export function createClient(): any {
  return new MockTigerBeetleClient();
}
