/**
 * AgentGuard Upstox Read-Only Broker Adapter (Phase MI-5)
 * Indian Stock Market & Wealth Broker Integration: Customer-consented Read-Only Access
 * strictly limited to holdings, mutual fund SIPs, gold ETFs, sovereign bonds, and portfolio P&L.
 *
 * ABSOLUTE SECURITY INVARIANT:
 * - NO order placement
 * - NO order modification / cancellation
 * - NO funds transfer or withdrawal
 * - Verified read-only scopes only
 */

import {
  PortfolioSnapshot,
  PortfolioHolding,
  BrokerConnection,
} from '@agentguard/core-schema';
import { IBrokerProvider } from '../provider-interface';
import { MarketDataStore } from '../../db/market-store';
import { MarketReadOnlyPolicy } from '../../security/read-only-policy';

export class UpstoxReadOnlyAdapter implements IBrokerProvider {
  readonly brokerName = 'Upstox';

  constructor(
    private readonly store: MarketDataStore,
    private readonly readOnlyPolicy: MarketReadOnlyPolicy
  ) {}

  /**
   * Authorize / connect customer broker with strict read-only scopes.
   * Throws if write scopes or trading access are detected.
   */
  async connectBroker(params: {
    tenantId: string;
    customerRef: string;
    brokerUserId: string;
    accessToken: string;
    scopes: string[];
    expiresAt?: number;
  }): Promise<BrokerConnection> {
    // 1. Verify read-only policy
    const policyCheck = this.readOnlyPolicy.checkConsentScopes(params.scopes);
    if (!policyCheck.allowed) {
      throw new Error(`Security Violation: Prohibited broker scopes detected: ${policyCheck.violations.join(', ')}`);
    }

    // 2. Validate token is not empty
    if (!params.accessToken || params.accessToken.trim().length === 0) {
      throw new Error('Invalid broker access token');
    }

    // 3. Save connection record in store
    const connection: BrokerConnection = {
      connection_id: `conn-upstox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: params.tenantId,
      customer_ref: params.customerRef,
      broker: 'UPSTOX',
      status: 'CONNECTED',
      read_only_verified: true,
      allowed_scopes: params.scopes,
      connected_at: Date.now(),
      last_synced_at: Date.now(),
      expires_at: params.expiresAt || null,
    };

    this.store.saveBrokerConnection(connection);

    // Record audit event
    this.store.recordAuditEvent({
      event_id: `aud-conn-${Date.now()}`,
      tenant_id: params.tenantId,
      customer_ref: params.customerRef,
      event_type: 'BROKER_CONNECTION_CREATED',
      actor: 'UpstoxBrokerAdapter',
      resource_ref: 'broker_connection',
      status: 'SUCCESS',
      metadata_redacted: { broker: 'UPSTOX', scopes: params.scopes },
      timestamp: Date.now(),
    });

    return connection;
  }

  /**
   * Get overall portfolio snapshot (equity + mutual funds + gold + bonds + insurance)
   */
  async getPortfolioSnapshot(tenantId: string, customerRef: string): Promise<PortfolioSnapshot | null> {
    return this.store.getPortfolioSnapshot(tenantId, customerRef);
  }

  /**
   * Get granular holdings list
   */
  async getHoldings(tenantId: string, customerRef: string): Promise<PortfolioHolding[]> {
    return this.store.getHoldings(tenantId, customerRef);
  }

  /**
   * Get active fixed monthly SIP schedules (Mutual Funds, Gold ETFs, Blue-chip equity)
   */
  async getSipSchedules(
    tenantId: string,
    customerRef: string
  ): Promise<
    Array<{
      holding_id: string;
      symbol: string;
      instrument_name: string;
      monthly_amount_inr: number;
      sip_day: number;
      asset_class: string;
      status: 'ACTIVE' | 'PAUSED';
    }>
  > {
    const holdings = this.store.getHoldings(tenantId, customerRef);
    return holdings
      .filter((h: PortfolioHolding) => h.is_sip && h.sip_monthly_amount)
      .map((h: PortfolioHolding) => ({
        holding_id: h.holding_id,
        symbol: h.symbol,
        instrument_name: h.instrument_name,
        monthly_amount_inr: h.sip_monthly_amount || 0,
        sip_day: h.sip_day_of_month || 5,
        asset_class: h.asset_class,
        status: 'ACTIVE',
      }));
  }

  /**
   * Verify read-only status and active consent
   */
  async verifyReadOnlyStatus(
    tenantId: string,
    customerRef: string
  ): Promise<{ isReadOnly: boolean; scopes: string[] }> {
    const conn = this.store.getBrokerConnection(tenantId, customerRef);
    if (!conn) {
      return { isReadOnly: true, scopes: [] };
    }

    const check = this.readOnlyPolicy.checkConsentScopes(conn.allowed_scopes);
    return {
      isReadOnly: conn.read_only_verified && check.allowed,
      scopes: conn.allowed_scopes,
    };
  }

  /**
   * Disconnect broker connection and revoke read-only consent
   */
  async disconnect(tenantId: string, customerRef: string): Promise<boolean> {
    this.store.disconnectBroker(tenantId, customerRef);

    this.store.recordAuditEvent({
      event_id: `aud-disconn-${Date.now()}`,
      tenant_id: tenantId,
      customer_ref: customerRef,
      event_type: 'BROKER_CONNECTION_REVOKED',
      actor: 'UpstoxBrokerAdapter',
      resource_ref: 'broker_connection',
      status: 'SUCCESS',
      metadata_redacted: { broker: 'UPSTOX' },
      timestamp: Date.now(),
    });

    return true;
  }
}
