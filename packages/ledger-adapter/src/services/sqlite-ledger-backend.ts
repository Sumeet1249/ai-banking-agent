/**
 * SQLite Local Development Ledger Backend
 *
 * Provides high-fidelity double-entry protocol emulation for unit testing
 * and offline development. Explicitly identified as SQLITE_DEV.
 */

import Database from 'better-sqlite3';
import type { Logger } from 'pino';
import {
  ILedgerBackend,
  LedgerAccountRow,
  LedgerTransferRow,
  PendingTransferResult,
  PostTransferResult,
  VoidTransferResult,
  BalanceResult,
} from './ledger-backend';
import { LedgerEngine } from './ledger-engine';

export class SqliteLedgerBackend implements ILedgerBackend {
  public readonly backendType = 'SQLITE_DEV' as const;
  private engine: LedgerEngine;

  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.engine = new LedgerEngine(this.db, this.logger);
  }

  public async init(): Promise<void> {
    // Already initialized in LedgerEngine constructor
  }

  public async getAccount(accountRef: string): Promise<LedgerAccountRow | null> {
    return this.engine.getAccount(accountRef);
  }

  public async getBalance(accountRef: string): Promise<BalanceResult | null> {
    return this.engine.getBalance(accountRef);
  }

  public async createPendingTransfer(params: {
    requestId: string;
    debitAccountRef: string;
    creditAccountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
  }): Promise<PendingTransferResult> {
    const res = this.engine.createPendingTransfer(params);
    return {
      transfer: res.transfer,
      status: res.status,
    };
  }

  public async postTransfer(transferIdOrUuid: string): Promise<PostTransferResult> {
    const res = this.engine.postTransfer(transferIdOrUuid);
    return {
      transfer: res.transfer,
      status: res.status,
    };
  }

  public async voidTransfer(transferIdOrUuid: string, reason: string): Promise<VoidTransferResult> {
    const res = this.engine.voidTransfer(transferIdOrUuid, reason);
    return {
      transfer: res.transfer,
      status: res.status,
    };
  }

  public async getTransfer(transferIdOrUuid: string): Promise<LedgerTransferRow | null> {
    return this.engine.getTransfer(transferIdOrUuid);
  }

  public async close(): Promise<void> {
    // SQLite connection is managed by caller
  }
}
