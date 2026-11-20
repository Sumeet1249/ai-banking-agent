/**
 * HttpLedgerClient Implementation
 *
 * Implements ILedgerClient by calling the real Ledger Adapter HTTP service on Port 4001.
 */

import {
  ILedgerClient,
  LedgerBalance,
  PendingTransferResult,
  SettlementResult,
} from './ledger-client';

export class HttpLedgerClient implements ILedgerClient {
  constructor(private baseUrl: string = 'http://127.0.0.1:4001') {}

  public async getAccountBalance(accountRef: string): Promise<LedgerBalance | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/accounts/${accountRef}/balance`);
      if (!res.ok) return null;
      const data = (await res.json()) as any;
      return {
        account_ref: accountRef,
        liquid_balance_paise: data.liquid_balance_paise,
        reserved_balance_paise: data.reserved_balance_paise,
      };
    } catch {
      return null;
    }
  }

  public async createPendingTransfer(params: {
    requestId: string;
    accountRef: string;
    amountPaise: number;
    ttlSeconds?: number;
    creditAccountRef?: string;
  }): Promise<PendingTransferResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/transfers/pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: params.requestId,
        debit_account_ref: params.accountRef,
        credit_account_ref: params.creditAccountRef ?? 'PAYEE_CESC_001',
        amount_paise: params.amountPaise,
        currency: 'INR',
        ttl_seconds: params.ttlSeconds ?? 120,
      }),
    });

    const data = (await res.json()) as any;
    if (res.status === 201) {
      return {
        transfer_id: data.transfer_id,
        status: 'PENDING',
        expires_at: data.expires_at,
      };
    }

    return {
      transfer_id: data.transfer?.transfer_id ?? '',
      status: 'REJECTED',
      reason: data.error ?? data.reason_code ?? 'REJECTED',
      expires_at: 0,
    };
  }

  public async postTransfer(transferId: string): Promise<SettlementResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/transfers/${transferId}/post`, {
      method: 'POST',
    });
    const data = (await res.json()) as any;
    if (res.ok) {
      return { transfer_id: transferId, status: 'SETTLED' };
    }
    return { transfer_id: transferId, status: 'FAILED', reason: data.error };
  }

  public async voidTransfer(transferId: string, reason: string): Promise<SettlementResult> {
    const res = await fetch(`${this.baseUrl}/api/v1/transfers/${transferId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = (await res.json()) as any;
    if (res.ok) {
      return { transfer_id: transferId, status: 'VOIDED' };
    }
    return { transfer_id: transferId, status: 'FAILED', reason: data.error };
  }

  public async getTransfer(transferId: string): Promise<{
    transfer_id: string;
    status: 'PENDING' | 'POSTED' | 'VOIDED' | 'NOT_FOUND';
    amount_paise?: number;
    debit_account_ref?: string;
    credit_account_ref?: string;
    expires_at?: number;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/transfers/${transferId}`);
      if (res.status === 404) {
        return { transfer_id: transferId, status: 'NOT_FOUND' };
      }
      const data = (await res.json()) as any;
      return {
        transfer_id: data.transfer_id,
        status: data.status,
        amount_paise: data.amount_paise,
        debit_account_ref: data.debit_account_ref,
        credit_account_ref: data.credit_account_ref,
        expires_at: data.expires_at,
      };
    } catch {
      return { transfer_id: transferId, status: 'NOT_FOUND' };
    }
  }
}
