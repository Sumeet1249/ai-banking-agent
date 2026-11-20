/**
 * Native TigerBeetle Distributed Consensus Ledger Backend
 *
 * Implements Phase 6.2:
 *   - Official tigerbeetle-node client driver
 *   - Native 128-bit unsigned integer (u128) transfer and account IDs
 *   - Viewstamped Replication (VSR) consensus
 *   - Real Two-Phase Commit transfers:
 *       Stage 1: TransferFlags.pending (2) with 120s TTL
 *       Stage 2A: TransferFlags.post_pending_transfer (4)
 *       Stage 2B: TransferFlags.void_pending_transfer (8)
 *   - Deterministic resolution IDs across node crashes/restarts
 *   - Fail-Closed semantics: No automatic silent SQLite fallback (Decision D19)
 */

import { createHash } from 'crypto';
import type { Logger } from 'pino';
import {
  createClient,
  Client,
  TransferFlags,
  AccountFlags,
  CreateAccountStatus,
  CreateTransferStatus,
} from 'tigerbeetle-node';
import {
  ILedgerBackend,
  LedgerAccountRow,
  LedgerTransferRow,
  PendingTransferResult,
  PostTransferResult,
  VoidTransferResult,
  BalanceResult,
} from './ledger-backend';

export interface TigerBeetleBackendConfig {
  clusterId: bigint;
  replicaAddresses: string[];
  logger?: Logger;
}

export class TigerBeetleLedgerBackend implements ILedgerBackend {
  public readonly backendType = 'TIGERBEETLE' as const;
  private client: Client;
  private initialized = false;
  private logger?: Logger;

  // Local metadata registry to preserve string account/request mappings
  private accountRefMap = new Map<string, string>(); // u128 str -> account_ref
  private transferMetaMap = new Map<string, {
    requestId: string;
    debitAccountRef: string;
    creditAccountRef: string;
    amountPaise: number;
    status: 'PENDING' | 'POSTED' | 'VOIDED';
    expiresAt: number;
    createdAt: number;
    settledAt: number | null;
    voidReason: string | null;
  }>();

  constructor(config: TigerBeetleBackendConfig) {
    this.logger = config.logger;
    this.client = createClient({
      cluster_id: config.clusterId,
      replica_addresses: config.replicaAddresses,
    });
  }

  /**
   * Deterministically maps an alphanumeric account ref (e.g. ACC_101) to 128-bit unsigned integer.
   */
  public accountRefToU128(ref: string): bigint {
    if (/^\d+$/.test(ref)) return BigInt(ref);
    const hex = createHash('sha256').update(ref).digest('hex').slice(0, 32);
    return BigInt('0x' + hex);
  }

  /**
   * Deterministically maps a UUIDv4 string to a 128-bit unsigned integer (Decision D15).
   */
  public uuidToU128(uuidStr: string): bigint {
    const hex = uuidStr.replace(/-/g, '');
    return BigInt('0x' + hex);
  }

  /**
   * Generates a deterministic resolution transfer ID for a two-phase POST or VOID.
   */
  private generateResolutionId(pendingId: bigint, resolutionType: 'POST' | 'VOID'): bigint {
    const hex = createHash('sha256')
      .update(`${pendingId.toString()}:${resolutionType}`)
      .digest('hex')
      .slice(0, 32);
    return BigInt('0x' + hex);
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.seedBaselineAccounts();
      this.initialized = true;
      this.logger?.info('TigerBeetle Ledger Backend initialized with baseline accounts');
    } catch (err: any) {
      this.logger?.error({ err: err.message }, 'Failed to initialize TigerBeetle accounts');
      throw new Error(`TIGERBEETLE_INIT_FAILED: ${err.message}`);
    }
  }

  private async seedBaselineAccounts(): Promise<void> {
    const treasuryId = 1n; // Bank Master Treasury Account
    const customerId = this.accountRefToU128('ACC_101');
    const cescId = this.accountRefToU128('PAYEE_CESC_001');
    const tataId = this.accountRefToU128('PAYEE_TATA_POWER_001');

    this.accountRefMap.set(treasuryId.toString(), 'BANK_TREASURY');
    this.accountRefMap.set(customerId.toString(), 'ACC_101');
    this.accountRefMap.set(cescId.toString(), 'PAYEE_CESC_001');
    this.accountRefMap.set(tataId.toString(), 'PAYEE_TATA_POWER_001');

    // Check if customer account already exists
    const existing = await this.client.lookupAccounts([customerId]);
    if (existing.length > 0) {
      return; // Already seeded
    }

    // 1. Create baseline accounts
    const createResults = await this.client.createAccounts([
      {
        id: treasuryId,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1,
        code: 1,
        flags: AccountFlags.none,
        timestamp: 0n,
      },
      {
        id: customerId,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1,
        code: 1,
        // Enforce that debits do not exceed credits (no overdrafts)
        flags: AccountFlags.debits_must_not_exceed_credits,
        timestamp: 0n,
      },
      {
        id: cescId,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1,
        code: 1,
        flags: AccountFlags.none,
        timestamp: 0n,
      },
      {
        id: tataId,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1,
        code: 1,
        flags: AccountFlags.none,
        timestamp: 0n,
      },
    ]);

    const realErrors = createResults.filter(
      (r) => r.status !== CreateAccountStatus.created && r.status !== CreateAccountStatus.exists
    );
    if (realErrors.length > 0) {
      this.logger?.warn({ errors: realErrors }, 'Some baseline accounts reported creation errors');
    }

    // 2. Fund Customer Account ACC_101 with ₹1,00,000 (10,000,000 paise) from Treasury
    const fundingTransferId = this.accountRefToU128('INITIAL_SEED_TRANSFER_ACC_101');
    const existingFunding = await this.client.lookupTransfers([fundingTransferId]);
    if (existingFunding.length === 0) {
      const fundResults = await this.client.createTransfers([
        {
          id: fundingTransferId,
          debit_account_id: treasuryId,
          credit_account_id: customerId,
          amount: 10000000n, // ₹1,00,000 in integer paise
          pending_id: 0n,
          user_data_128: 0n,
          user_data_64: 0n,
          user_data_32: 0,
          timeout: 0,
          ledger: 1,
          code: 1,
          flags: TransferFlags.none,
          timestamp: 0n,
        },
      ]);
      const fundErrors = fundResults.filter(
        (r) => r.status !== CreateTransferStatus.created && r.status !== CreateTransferStatus.exists
      );
      if (fundErrors.length > 0) {
        this.logger?.error({ errors: fundErrors }, 'Failed to seed funding transfer');
      }
    }
  }

  public async getAccount(accountRef: string): Promise<LedgerAccountRow | null> {
    const accountId = this.accountRefToU128(accountRef);
    const accounts = await this.client.lookupAccounts([accountId]);
    if (accounts.length === 0) return null;

    const acc = accounts[0];
    const postedPaise = Number(acc.credits_posted - acc.debits_posted);
    const reservedPaise = Number(acc.debits_pending);

    return {
      account_ref: accountRef,
      currency: 'INR',
      posted_balance_paise: postedPaise,
      reserved_balance_paise: reservedPaise,
      created_at: Number(acc.timestamp / 1_000_000n), // Nanoseconds to ms
      updated_at: Date.now(),
    };
  }

  public async getBalance(accountRef: string): Promise<BalanceResult | null> {
    const accountId = this.accountRefToU128(accountRef);
    const accounts = await this.client.lookupAccounts([accountId]);
    if (accounts.length === 0) return null;

    const acc = accounts[0];
    const postedPaise = Number(acc.credits_posted - acc.debits_posted);
    const reservedPaise = Number(acc.debits_pending);

    return {
      posted_balance_paise: postedPaise,
      reserved_balance_paise: reservedPaise,
      liquid_balance_paise: postedPaise - reservedPaise,
    };
  }

  /**
   * Stage 1: Create Two-Phase Pending Transfer (120s TTL lock on TigerBeetle)
   */
  public async createPendingTransfer(params: {
    requestId: string;
    debitAccountRef: string;
    creditAccountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
  }): Promise<PendingTransferResult> {
    const debitId = this.accountRefToU128(params.debitAccountRef);
    const creditId = this.accountRefToU128(params.creditAccountRef);
    const transferId = this.uuidToU128(params.requestId);

    // 1. Verify Accounts Exist
    const accounts = await this.client.lookupAccounts([debitId, creditId]);
    if (accounts.length < 2) {
      return {
        transfer: null as any,
        status: 'ACCOUNT_NOT_FOUND',
      };
    }

    // 2. Idempotency Check: lookup if transfer already exists
    const existing = await this.client.lookupTransfers([transferId]);
    if (existing.length > 0) {
      const row = await this.getTransfer(transferId.toString());
      return {
        transfer: row!,
        status: 'EXISTS',
      };
    }

    // 3. Liquid Balance Pre-Check
    const debitAcc = accounts.find((a) => a.id === debitId)!;
    const liquidBalance = debitAcc.credits_posted - (debitAcc.debits_posted + debitAcc.debits_pending);
    if (liquidBalance < BigInt(params.amountPaise)) {
      return {
        transfer: null as any,
        status: 'INSUFFICIENT_FUNDS',
      };
    }

    const ttl = params.ttlSeconds ?? 120;
    const now = Date.now();
    const expiresAt = now + ttl * 1000;

    // 4. Create TigerBeetle Pending Transfer
    const results = await this.client.createTransfers([
      {
        id: transferId,
        debit_account_id: debitId,
        credit_account_id: creditId,
        amount: BigInt(params.amountPaise),
        pending_id: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: ttl,
        ledger: 1,
        code: 1,
        flags: TransferFlags.pending,
        timestamp: 0n,
      },
    ]);

    const realErrors = results.filter(
      (r) => r.status !== CreateTransferStatus.created
    );

    if (realErrors.length > 0) {
      const err = realErrors[0];
      this.logger?.warn({ err }, 'TigerBeetle createPendingTransfer error');

      if (
        err.status === CreateTransferStatus.exceeds_credits ||
        err.status === CreateTransferStatus.exceeds_debits
      ) {
        return { transfer: null as any, status: 'INSUFFICIENT_FUNDS' };
      }
      if (
        err.status === CreateTransferStatus.exists ||
        err.status === CreateTransferStatus.exists_with_different_amount ||
        err.status === CreateTransferStatus.exists_with_different_flags
      ) {
        const row = await this.getTransfer(transferId.toString());
        return { transfer: row!, status: 'EXISTS' };
      }
      if (
        err.status === CreateTransferStatus.debit_account_not_found ||
        err.status === CreateTransferStatus.credit_account_not_found
      ) {
        return { transfer: null as any, status: 'ACCOUNT_NOT_FOUND' };
      }
      throw new Error(`TIGERBEETLE_TRANSFER_FAILED: code ${err.status}`);
    }

    // Record in local metadata registry
    this.transferMetaMap.set(transferId.toString(), {
      requestId: params.requestId,
      debitAccountRef: params.debitAccountRef,
      creditAccountRef: params.creditAccountRef,
      amountPaise: params.amountPaise,
      status: 'PENDING',
      expiresAt,
      createdAt: now,
      settledAt: null,
      voidReason: null,
    });

    const transferRow: LedgerTransferRow = {
      transfer_id: transferId.toString(),
      request_id: params.requestId,
      debit_account_ref: params.debitAccountRef,
      credit_account_ref: params.creditAccountRef,
      amount_paise: params.amountPaise,
      currency: 'INR',
      status: 'PENDING',
      expires_at: expiresAt,
      created_at: now,
      settled_at: null,
      void_reason: null,
    };

    return { transfer: transferRow, status: 'PENDING' };
  }

  /**
   * Stage 2: Post (Commit) Pending Transfer on TigerBeetle
   */
  public async postTransfer(transferIdOrUuid: string): Promise<PostTransferResult> {
    const pendingId = transferIdOrUuid.includes('-')
      ? this.uuidToU128(transferIdOrUuid)
      : BigInt(transferIdOrUuid);

    // Lookup pending transfer in TigerBeetle
    const pendingTransfers = await this.client.lookupTransfers([pendingId]);
    if (pendingTransfers.length === 0) {
      return { transfer: null, status: 'NOT_FOUND' };
    }

    const pendingTx = pendingTransfers[0];
    const postResId = this.generateResolutionId(pendingId, 'POST');
    const voidResId = this.generateResolutionId(pendingId, 'VOID');

    // Check if already resolved
    const resolutions = await this.client.lookupTransfers([postResId, voidResId]);
    if (resolutions.some((r) => r.id === postResId)) {
      const row = await this.getTransfer(pendingId.toString());
      return { transfer: row, status: 'ALREADY_SETTLED' };
    }
    if (resolutions.some((r) => r.id === voidResId)) {
      const row = await this.getTransfer(pendingId.toString());
      return { transfer: row, status: 'ALREADY_VOIDED' };
    }

    const now = Date.now();

    // Create TigerBeetle Post Transfer
    const results = await this.client.createTransfers([
      {
        id: postResId,
        debit_account_id: pendingTx.debit_account_id,
        credit_account_id: pendingTx.credit_account_id,
        amount: pendingTx.amount,
        pending_id: pendingId,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger: 1,
        code: 1,
        flags: TransferFlags.post_pending_transfer,
        timestamp: 0n,
      },
    ]);

    const realErrors = results.filter(
      (r) => r.status !== CreateTransferStatus.created
    );

    if (realErrors.length > 0) {
      const err = realErrors[0];
      if (err.status === CreateTransferStatus.pending_transfer_already_posted) {
        const row = await this.getTransfer(pendingId.toString());
        return { transfer: row, status: 'ALREADY_SETTLED' };
      }
      if (err.status === CreateTransferStatus.pending_transfer_already_voided) {
        const row = await this.getTransfer(pendingId.toString());
        return { transfer: row, status: 'ALREADY_VOIDED' };
      }
      if (err.status === CreateTransferStatus.pending_transfer_expired) {
        return { transfer: null, status: 'EXPIRED' };
      }
      if (err.status === CreateTransferStatus.pending_transfer_not_found) {
        return { transfer: null, status: 'NOT_FOUND' };
      }
      this.logger?.warn({ err }, 'TigerBeetle postTransfer resolution error');
    }

    const meta = this.transferMetaMap.get(pendingId.toString());
    if (meta) {
      meta.status = 'POSTED';
      meta.settledAt = now;
    }

    const updated = await this.getTransfer(pendingId.toString());
    return { transfer: updated, status: 'SETTLED' };
  }

  /**
   * Stage 2: Void (Cancel / Release) Pending Transfer on TigerBeetle
   */
  public async voidTransfer(transferIdOrUuid: string, reason: string): Promise<VoidTransferResult> {
    const pendingId = transferIdOrUuid.includes('-')
      ? this.uuidToU128(transferIdOrUuid)
      : BigInt(transferIdOrUuid);

    const pendingTransfers = await this.client.lookupTransfers([pendingId]);
    if (pendingTransfers.length === 0) {
      return { transfer: null, status: 'NOT_FOUND' };
    }

    const pendingTx = pendingTransfers[0];
    const postResId = this.generateResolutionId(pendingId, 'POST');
    const voidResId = this.generateResolutionId(pendingId, 'VOID');

    // Check if already resolved
    const resolutions = await this.client.lookupTransfers([postResId, voidResId]);
    if (resolutions.some((r) => r.id === postResId)) {
      const row = await this.getTransfer(pendingId.toString());
      return { transfer: row, status: 'ALREADY_POSTED' };
    }
    if (resolutions.some((r) => r.id === voidResId)) {
      const row = await this.getTransfer(pendingId.toString());
      return { transfer: row, status: 'ALREADY_VOIDED' };
    }

    const now = Date.now();

    // Create TigerBeetle Void Transfer
    const results = await this.client.createTransfers([
      {
        id: voidResId,
        debit_account_id: pendingTx.debit_account_id,
        credit_account_id: pendingTx.credit_account_id,
        amount: pendingTx.amount,
        pending_id: pendingId,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        timeout: 0,
        ledger: 1,
        code: 1,
        flags: TransferFlags.void_pending_transfer,
        timestamp: 0n,
      },
    ]);

    const realErrors = results.filter(
      (r) => r.status !== CreateTransferStatus.created
    );

    if (realErrors.length > 0) {
      const err = realErrors[0];
      if (err.status === CreateTransferStatus.pending_transfer_already_posted) {
        const row = await this.getTransfer(pendingId.toString());
        return { transfer: row, status: 'ALREADY_POSTED' };
      }
      if (err.status === CreateTransferStatus.pending_transfer_already_voided) {
        const row = await this.getTransfer(pendingId.toString());
        return { transfer: row, status: 'ALREADY_VOIDED' };
      }
      if (err.status === CreateTransferStatus.pending_transfer_not_found) {
        return { transfer: null, status: 'NOT_FOUND' };
      }
      this.logger?.warn({ err }, 'TigerBeetle voidTransfer resolution error');
    }

    const meta = this.transferMetaMap.get(pendingId.toString());
    if (meta) {
      meta.status = 'VOIDED';
      meta.voidReason = reason;
    }

    const updated = await this.getTransfer(pendingId.toString());
    return { transfer: updated, status: 'VOIDED' };
  }

  public async getTransfer(transferIdOrUuid: string): Promise<LedgerTransferRow | null> {
    const transferId = transferIdOrUuid.includes('-')
      ? this.uuidToU128(transferIdOrUuid)
      : BigInt(transferIdOrUuid);

    const transfers = await this.client.lookupTransfers([transferId]);
    if (transfers.length === 0) return null;

    const tx = transfers[0];
    const meta = this.transferMetaMap.get(transferId.toString());

    let status: 'PENDING' | 'POSTED' | 'VOIDED' = 'PENDING';
    if (meta) {
      status = meta.status;
    } else {
      // Check deterministic resolution transfers directly in TigerBeetle
      const postResId = this.generateResolutionId(transferId, 'POST');
      const voidResId = this.generateResolutionId(transferId, 'VOID');
      const resolutions = await this.client.lookupTransfers([postResId, voidResId]);
      if (resolutions.some((r) => r.id === postResId)) {
        status = 'POSTED';
      } else if (resolutions.some((r) => r.id === voidResId)) {
        status = 'VOIDED';
      } else if (tx.flags & TransferFlags.pending) {
        status = 'PENDING';
      } else {
        status = 'POSTED';
      }
    }

    return {
      transfer_id: transferId.toString(),
      request_id: meta ? meta.requestId : transferId.toString(),
      debit_account_ref: meta
        ? meta.debitAccountRef
        : (this.accountRefMap.get(tx.debit_account_id.toString()) ?? tx.debit_account_id.toString()),
      credit_account_ref: meta
        ? meta.creditAccountRef
        : (this.accountRefMap.get(tx.credit_account_id.toString()) ?? tx.credit_account_id.toString()),
      amount_paise: Number(tx.amount),
      currency: 'INR',
      status,
      expires_at: meta ? meta.expiresAt : Number(tx.timestamp / 1_000_000n) + tx.timeout * 1000,
      created_at: Number(tx.timestamp / 1_000_000n),
      settled_at: meta ? meta.settledAt : null,
      void_reason: meta ? meta.voidReason : null,
    };
  }

  public async close(): Promise<void> {
    this.client.destroy();
  }
}
