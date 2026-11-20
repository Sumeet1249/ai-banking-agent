/**
 * PostgresBankingStores — Multi-Tenant PostgreSQL Persistence for Banking Subsystem
 *
 * Implements Phase 7.2 & 7.3:
 *   - Native PostgreSQL adapter using parameterised queries ($1, $2, ...)
 *   - Strict tenant isolation via `org_id` filtering & RLS session configuration (`app.tenant_id`)
 *   - Integer paise representation for financial safety (Rule E1)
 *   - Fully compatible with `pg-mem` for fast unit and integration testing
 *   - Contract-identical parity with SQLite `BankingStores`
 */

import { Pool, PoolClient } from 'pg';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Logger } from 'pino';
import {
  CustomerMandate,
  CustomerMandateSchema,
} from '@agentguard/core-schema';
import {
  CustomerRow,
  AccountRow,
  CustomerMandateRow,
  CustomerSessionRow,
  CustomerIdpIdentityRow,
  OidcAuthStateRow,
  WebAuthnCredentialRow,
  WebAuthnChallengeRow,
  TransactionBoundApprovalRow,
} from './banking-stores';
import { DEFAULT_TENANT_ID, getCurrentTenantId } from '../middleware/tenant-context';

export class PostgresBankingStores {
  private pool: Pool;

  constructor(
    connectionStringOrPool: string | Pool,
    private logger?: Logger,
  ) {
    if (typeof connectionStringOrPool === 'string') {
      this.pool = new Pool({
        connectionString: connectionStringOrPool,
        max: 10,
        idleTimeoutMillis: 30_000,
      });
    } else {
      this.pool = connectionStringOrPool;
    }
  }

  public static fromPool(pool: Pool, logger?: Logger): PostgresBankingStores {
    return new PostgresBankingStores(pool, logger);
  }

  public async init(): Promise<void> {
    // 1. Customers
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_ref TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        pin_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(org_id);
    `);

    // 2. Accounts
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        account_ref TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        balance_paise BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, account_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_org ON accounts(org_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_cust ON accounts(org_id, customer_ref);
    `);

    // 3. Mandates
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mandates (
        mandate_id TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        mandate_version INTEGER NOT NULL DEFAULT 1,
        customer_ref TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        authorized_agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        purpose TEXT NOT NULL,
        allowed_payees TEXT NOT NULL,
        per_tx_limit_paise BIGINT NOT NULL,
        daily_limit_paise BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, mandate_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mandates_org ON mandates(org_id);
      CREATE INDEX IF NOT EXISTS idx_mandates_cust ON mandates(org_id, customer_ref);
      CREATE INDEX IF NOT EXISTS idx_mandates_agent ON mandates(org_id, authorized_agent_id);
    `);

    // 4. Customer Sessions
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS customer_sessions (
        session_id TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, session_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cust_sessions_org ON customer_sessions(org_id);
      CREATE INDEX IF NOT EXISTS idx_cust_sessions_hash ON customer_sessions(token_hash);
    `);

    // 5. Customer IDP Identities
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS customer_idp_identities (
        idp_issuer TEXT NOT NULL,
        idp_subject TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        idp_email TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, idp_issuer, idp_subject)
      );
      CREATE INDEX IF NOT EXISTS idx_idp_identities_org ON customer_idp_identities(org_id);
    `);

    // 6. OIDC Auth States
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS oidc_auth_states (
        state TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        nonce TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        idp_issuer TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, state)
      );
      CREATE INDEX IF NOT EXISTS idx_oidc_states_org ON oidc_auth_states(org_id);
    `);

    // 7. WebAuthn Passkey Credentials
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        credential_id TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        transports TEXT,
        aaguid TEXT,
        name TEXT NOT NULL DEFAULT 'My Passkey',
        created_at BIGINT NOT NULL,
        last_used_at BIGINT,
        revoked_at BIGINT,
        PRIMARY KEY (org_id, credential_id)
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_org ON webauthn_credentials(org_id);
      CREATE INDEX IF NOT EXISTS idx_webauthn_cust ON webauthn_credentials(org_id, customer_ref);
    `);

    // 8. WebAuthn Challenges
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        challenge TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        challenge_type TEXT NOT NULL,
        context_json TEXT NOT NULL DEFAULT '{}',
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, challenge)
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_chal_org ON webauthn_challenges(org_id);
    `);

    // 9. Transaction-Bound Approvals
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transaction_bound_approvals (
        approval_id TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        challenge_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        permit_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        mandate_id TEXT NOT NULL,
        mandate_version INTEGER NOT NULL,
        canonical_tx_digest TEXT NOT NULL,
        amount_paise BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        payee_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        invoice_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        verified_at BIGINT,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (org_id, approval_id)
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_org ON transaction_bound_approvals(org_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_req ON transaction_bound_approvals(org_id, request_id);
    `);
  }

  /**
   * Helper to resolve the authoritative tenant ID.
   */
  private resolveTenant(explicitTenant?: string): string {
    return explicitTenant || getCurrentTenantId() || DEFAULT_TENANT_ID;
  }

  /**
   * Runs work inside a tenant-scoped connection with RLS session setting set.
   */
  public async withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      } catch {
        // Fallback for mock environments
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Baseline Fixtures ───────────────────────────────────────────────────────

  public async seedFixtures(orgId: string = DEFAULT_TENANT_ID): Promise<void> {
    const existing = await this.pool.query(
      'SELECT customer_ref FROM customers WHERE org_id = $1 AND customer_ref = $2',
      [orgId, 'CUST_101'],
    );
    if (existing.rowCount && existing.rowCount > 0) return;

    const now = Date.now();
    const pinHash = this.hashSecret('2468');

    const email = orgId === DEFAULT_TENANT_ID ? 'aarav.sharma@example.com' : `aarav.${orgId}@example.com`;
    // Customer
    await this.pool.query(
      `INSERT INTO customers (customer_ref, org_id, name, email, phone, status, pin_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['CUST_101', orgId, 'Aarav Sharma', email, '+919876543210', 'ACTIVE', pinHash, now, now],
    );

    // Account (₹1,00,000 = 10,000,000 paise)
    await this.pool.query(
      `INSERT INTO accounts (account_ref, org_id, customer_ref, balance_paise, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['ACC_101', orgId, 'CUST_101', 10000000, 'INR', 'ACTIVE', now, now],
    );

    // Mandate
    const expiry = Math.max(new Date('2026-12-31T23:59:59+05:30').getTime(), now + 30 * 86400 * 1000);
    await this.pool.query(
      `INSERT INTO mandates (
        mandate_id, org_id, mandate_version, customer_ref, account_ref, authorized_agent_id,
        action, purpose, allowed_payees, per_tx_limit_paise, daily_limit_paise,
        status, created_at, updated_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        'MND_ELEC_101',
        orgId,
        1,
        'CUST_101',
        'ACC_101',
        'AGENT_ELEC_01',
        'bill_payment',
        'electricity_bill',
        JSON.stringify(['PAYEE_CESC_001', 'PAYEE_TATA_POWER_001']),
        500000,
        800000,
        'ACTIVE',
        now,
        now,
        expiry,
      ],
    );
  }

  // ── Customer Operations ───────────────────────────────────────────────────

  public async getCustomer(customerRef: string, orgId?: string): Promise<CustomerRow | null> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM customers WHERE org_id = $1 AND customer_ref = $2',
      [tenant, customerRef],
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      created_at: Number(r.created_at),
      updated_at: Number(r.updated_at),
    };
  }

  public async createCustomer(params: {
    customer_ref: string;
    org_id?: string;
    name: string;
    email: string;
    phone?: string;
    pin: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  }): Promise<CustomerRow> {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const pinHash = this.hashSecret(params.pin);
    const status = params.status ?? 'ACTIVE';

    await this.pool.query(
      `INSERT INTO customers (customer_ref, org_id, name, email, phone, status, pin_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (org_id, customer_ref) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         status = EXCLUDED.status,
         pin_hash = EXCLUDED.pin_hash,
         updated_at = EXCLUDED.updated_at`,
      [params.customer_ref, tenant, params.name, params.email, params.phone ?? null, status, pinHash, now, now],
    );

    return {
      customer_ref: params.customer_ref,
      org_id: tenant,
      name: params.name,
      email: params.email,
      phone: params.phone ?? null,
      status,
      pin_hash: pinHash,
      created_at: now,
      updated_at: now,
    };
  }

  public async verifyCustomerPin(customerRef: string, pin: string, orgId?: string): Promise<boolean> {
    const cust = await this.getCustomer(customerRef, orgId);
    if (!cust || cust.status !== 'ACTIVE') return false;
    const incomingHash = this.hashSecret(pin);
    try {
      return timingSafeEqual(Buffer.from(incomingHash, 'hex'), Buffer.from(cust.pin_hash, 'hex'));
    } catch {
      return false;
    }
  }

  // ── Account Operations ────────────────────────────────────────────────────

  public async getAccount(accountRef: string, orgId?: string): Promise<AccountRow | null> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM accounts WHERE org_id = $1 AND account_ref = $2',
      [tenant, accountRef],
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      balance_paise: Number(r.balance_paise),
      created_at: Number(r.created_at),
      updated_at: Number(r.updated_at),
    };
  }

  public async createAccount(params: {
    account_ref: string;
    customer_ref: string;
    balance_paise: number;
    currency?: string;
    status?: 'ACTIVE' | 'FROZEN' | 'CLOSED';
    org_id?: string;
  }): Promise<AccountRow> {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const currency = params.currency ?? 'INR';
    const status = params.status ?? 'ACTIVE';

    await this.pool.query(
      `INSERT INTO accounts (account_ref, org_id, customer_ref, balance_paise, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (org_id, account_ref) DO UPDATE SET
         balance_paise = EXCLUDED.balance_paise,
         currency = EXCLUDED.currency,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [params.account_ref, tenant, params.customer_ref, params.balance_paise, currency, status, now, now],
    );

    return {
      account_ref: params.account_ref,
      org_id: tenant,
      customer_ref: params.customer_ref,
      balance_paise: params.balance_paise,
      currency,
      status,
      created_at: now,
      updated_at: now,
    };
  }

  public async listAccountsByCustomer(customerRef: string, orgId?: string): Promise<AccountRow[]> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM accounts WHERE org_id = $1 AND customer_ref = $2 ORDER BY created_at ASC',
      [tenant, customerRef],
    );
    return rows.map((r) => ({
      ...r,
      balance_paise: Number(r.balance_paise),
      created_at: Number(r.created_at),
      updated_at: Number(r.updated_at),
    }));
  }

  // ── Session Operations ─────────────────────────────────────────────────────

  public async createCustomerSession(
    customerRef: string,
    opts?: { userAgent?: string; ipAddress?: string; ttlHours?: number; orgId?: string },
  ): Promise<{ session_token: string; csrf_token: string; session: CustomerSessionRow }> {
    const tenant = this.resolveTenant(opts?.orgId);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashSecret(rawToken);
    const csrfToken = randomBytes(24).toString('base64url');
    const sessionId = randomBytes(16).toString('hex');
    const now = Date.now();
    const ttlMs = (opts?.ttlHours ?? 12) * 3600 * 1000;
    const expiresAt = now + ttlMs;

    await this.pool.query(
      `INSERT INTO customer_sessions (session_id, org_id, customer_ref, token_hash, csrf_token, user_agent, ip_address, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [sessionId, tenant, customerRef, tokenHash, csrfToken, opts?.userAgent ?? null, opts?.ipAddress ?? null, expiresAt, now],
    );

    const session: CustomerSessionRow = {
      session_id: sessionId,
      org_id: tenant,
      customer_ref: customerRef,
      token_hash: tokenHash,
      csrf_token: csrfToken,
      user_agent: opts?.userAgent ?? null,
      ip_address: opts?.ipAddress ?? null,
      expires_at: expiresAt,
      created_at: now,
    };

    return { session_token: rawToken, csrf_token: csrfToken, session };
  }

  public async getCustomerSession(token: string, orgId?: string): Promise<{ session: CustomerSessionRow; customer: CustomerRow } | null> {
    const tokenHash = this.hashSecret(token);
    const now = Date.now();

    let query = 'SELECT * FROM customer_sessions WHERE token_hash = $1 AND expires_at > $2';
    const params: any[] = [tokenHash, now];

    if (orgId) {
      query += ' AND org_id = $3';
      params.push(orgId);
    }

    const { rows } = await this.pool.query(query, params);
    if (!rows || rows.length === 0) return null;
    const s = rows[0];

    const customer = await this.getCustomer(s.customer_ref, s.org_id);
    if (!customer || customer.status !== 'ACTIVE') return null;

    return {
      session: {
        ...s,
        expires_at: Number(s.expires_at),
        created_at: Number(s.created_at),
      },
      customer,
    };
  }

  public async revokeCustomerSession(token: string, orgId?: string): Promise<boolean> {
    const tokenHash = this.hashSecret(token);
    let query = 'DELETE FROM customer_sessions WHERE token_hash = $1';
    const params: any[] = [tokenHash];
    if (orgId) {
      query += ' AND org_id = $2';
      params.push(orgId);
    }
    const res = await this.pool.query(query, params);
    return (res.rowCount ?? 0) > 0;
  }

  // ── Mandate Operations ─────────────────────────────────────────────────────

  public async getMandate(mandateId: string, orgId?: string): Promise<CustomerMandate | null> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM mandates WHERE org_id = $1 AND mandate_id = $2',
      [tenant, mandateId],
    );
    if (!rows || rows.length === 0) return null;
    return this.hydrateMandate(rows[0]);
  }

  public async listMandatesByCustomer(customerRef: string, orgId?: string): Promise<CustomerMandate[]> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM mandates WHERE org_id = $1 AND customer_ref = $2 ORDER BY created_at DESC',
      [tenant, customerRef],
    );
    return rows.map((r) => this.hydrateMandate(r));
  }

  public async createMandate(mandate: CustomerMandate, orgId?: string): Promise<CustomerMandate> {
    const validated = CustomerMandateSchema.parse(mandate);
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();

    await this.pool.query(
      `INSERT INTO mandates (
        mandate_id, org_id, mandate_version, customer_ref, account_ref, authorized_agent_id,
        action, purpose, allowed_payees, per_tx_limit_paise, daily_limit_paise,
        status, created_at, updated_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        validated.mandate_id,
        tenant,
        validated.mandate_version,
        validated.customer_ref,
        validated.account_ref,
        validated.authorized_agent_id,
        validated.action,
        validated.purpose,
        JSON.stringify(validated.allowed_payees),
        validated.per_tx_limit_paise,
        validated.daily_limit_paise,
        validated.status,
        validated.created_at ?? now,
        validated.updated_at ?? now,
        validated.expires_at,
      ],
    );

    return validated;
  }

  public async updateMandate(
    mandateId: string,
    customerRef: string,
    updates: {
      per_tx_limit_paise?: number;
      daily_limit_paise?: number;
      allowed_payees?: string[];
      expires_at?: number;
    },
    orgId?: string,
  ): Promise<CustomerMandate | null> {
    const tenant = this.resolveTenant(orgId);
    const current = await this.getMandate(mandateId, tenant);
    if (!current || current.customer_ref !== customerRef) return null;
    if (current.status !== 'ACTIVE') return null;

    const newVersion = current.mandate_version + 1;
    const now = Date.now();

    const updated: CustomerMandate = {
      ...current,
      mandate_version: newVersion,
      per_tx_limit_paise: updates.per_tx_limit_paise ?? current.per_tx_limit_paise,
      daily_limit_paise: updates.daily_limit_paise ?? current.daily_limit_paise,
      allowed_payees: updates.allowed_payees ?? current.allowed_payees,
      expires_at: updates.expires_at ?? current.expires_at,
      updated_at: now,
    };

    CustomerMandateSchema.parse(updated);

    await this.pool.query(
      `UPDATE mandates SET
        mandate_version = $1,
        per_tx_limit_paise = $2,
        daily_limit_paise = $3,
        allowed_payees = $4,
        expires_at = $5,
        updated_at = $6
       WHERE org_id = $7 AND mandate_id = $8 AND customer_ref = $9`,
      [
        updated.mandate_version,
        updated.per_tx_limit_paise,
        updated.daily_limit_paise,
        JSON.stringify(updated.allowed_payees),
        updated.expires_at,
        now,
        tenant,
        mandateId,
        customerRef,
      ],
    );

    return updated;
  }

  public async revokeMandate(mandateId: string, customerRef: string, orgId?: string): Promise<boolean> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = await this.pool.query(
      `UPDATE mandates SET status = 'REVOKED', updated_at = $1
       WHERE org_id = $2 AND mandate_id = $3 AND customer_ref = $4 AND status != 'REVOKED'`,
      [now, tenant, mandateId, customerRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async suspendMandate(mandateId: string, customerRef: string, orgId?: string): Promise<boolean> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = await this.pool.query(
      `UPDATE mandates SET status = 'SUSPENDED', updated_at = $1
       WHERE org_id = $2 AND mandate_id = $3 AND customer_ref = $4 AND status = 'ACTIVE'`,
      [now, tenant, mandateId, customerRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async reactivateMandate(mandateId: string, customerRef: string, orgId?: string): Promise<boolean> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = await this.pool.query(
      `UPDATE mandates SET status = 'ACTIVE', updated_at = $1
       WHERE org_id = $2 AND mandate_id = $3 AND customer_ref = $4 AND status = 'SUSPENDED'`,
      [now, tenant, mandateId, customerRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // ── WebAuthn Passkey Credentials ───────────────────────────────────────────

  public async storeWebAuthnCredential(params: {
    credential_id: string;
    customer_ref: string;
    public_key: string;
    counter?: number;
    transports?: string[];
    aaguid?: string;
    name?: string;
    org_id?: string;
  }): Promise<WebAuthnCredentialRow> {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const counter = params.counter ?? 0;
    const name = params.name ?? 'My Passkey';
    const transports = params.transports ? JSON.stringify(params.transports) : null;

    await this.pool.query(
      `INSERT INTO webauthn_credentials (
        credential_id, org_id, customer_ref, public_key, counter, transports, aaguid, name, created_at, last_used_at, revoked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL)
      ON CONFLICT(org_id, credential_id) DO UPDATE SET
        public_key = EXCLUDED.public_key,
        counter = EXCLUDED.counter,
        transports = EXCLUDED.transports,
        name = EXCLUDED.name`,
      [params.credential_id, tenant, params.customer_ref, params.public_key, counter, transports, params.aaguid ?? null, name, now],
    );

    return {
      credential_id: params.credential_id,
      org_id: tenant,
      customer_ref: params.customer_ref,
      public_key: params.public_key,
      counter,
      transports,
      aaguid: params.aaguid ?? null,
      name,
      created_at: now,
      last_used_at: null,
      revoked_at: null,
    };
  }

  public async getWebAuthnCredential(credentialId: string, orgId?: string): Promise<WebAuthnCredentialRow | null> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM webauthn_credentials WHERE org_id = $1 AND credential_id = $2',
      [tenant, credentialId],
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      counter: Number(r.counter),
      created_at: Number(r.created_at),
      last_used_at: r.last_used_at ? Number(r.last_used_at) : null,
      revoked_at: r.revoked_at ? Number(r.revoked_at) : null,
    };
  }

  public async listWebAuthnCredentials(customerRef: string, includeRevoked: boolean = false, orgId?: string): Promise<WebAuthnCredentialRow[]> {
    const tenant = this.resolveTenant(orgId);
    let query = 'SELECT * FROM webauthn_credentials WHERE org_id = $1 AND customer_ref = $2';
    if (!includeRevoked) {
      query += ' AND revoked_at IS NULL';
    }
    query += ' ORDER BY created_at DESC';

    const { rows } = await this.pool.query(query, [tenant, customerRef]);
    return rows.map((r) => ({
      ...r,
      counter: Number(r.counter),
      created_at: Number(r.created_at),
      last_used_at: r.last_used_at ? Number(r.last_used_at) : null,
      revoked_at: r.revoked_at ? Number(r.revoked_at) : null,
    }));
  }

  public async updateWebAuthnCredentialCounter(credentialId: string, counter: number, orgId?: string): Promise<void> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    await this.pool.query(
      'UPDATE webauthn_credentials SET counter = $1, last_used_at = $2 WHERE org_id = $3 AND credential_id = $4',
      [counter, now, tenant, credentialId],
    );
  }

  public async revokeWebAuthnCredential(credentialId: string, customerRef: string, orgId?: string): Promise<boolean> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = await this.pool.query(
      `UPDATE webauthn_credentials SET revoked_at = $1
       WHERE org_id = $2 AND credential_id = $3 AND customer_ref = $4 AND revoked_at IS NULL`,
      [now, tenant, credentialId, customerRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async renameWebAuthnCredential(credentialId: string, customerRef: string, name: string, orgId?: string): Promise<boolean> {
    const tenant = this.resolveTenant(orgId);
    const res = await this.pool.query(
      `UPDATE webauthn_credentials SET name = $1
       WHERE org_id = $2 AND credential_id = $3 AND customer_ref = $4 AND revoked_at IS NULL`,
      [name, tenant, credentialId, customerRef],
    );
    return (res.rowCount ?? 0) > 0;
  }

  // ── WebAuthn Ephemeral Challenges ──────────────────────────────────────────

  public async storeWebAuthnChallenge(params: {
    challenge: string;
    customer_ref: string;
    challenge_type: 'REGISTRATION' | 'AUTHENTICATION' | 'TRANSACTION_APPROVAL';
    context?: Record<string, any>;
    ttlSeconds?: number;
    org_id?: string;
  }): Promise<void> {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const ttl = params.ttlSeconds ?? 300;
    const expiresAt = now + ttl * 1000;
    const contextJson = params.context ? JSON.stringify(params.context) : '{}';

    await this.pool.query(
      `INSERT INTO webauthn_challenges (challenge, org_id, customer_ref, challenge_type, context_json, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [params.challenge, tenant, params.customer_ref, params.challenge_type, contextJson, expiresAt, now],
    );
  }

  public async consumeWebAuthnChallenge(challenge: string, orgId?: string): Promise<WebAuthnChallengeRow | null> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const { rows } = await this.pool.query(
      'SELECT * FROM webauthn_challenges WHERE org_id = $1 AND challenge = $2',
      [tenant, challenge],
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];

    await this.pool.query('DELETE FROM webauthn_challenges WHERE org_id = $1 AND challenge = $2', [tenant, challenge]);

    if (Number(r.expires_at) <= now) {
      return null;
    }

    return {
      ...r,
      expires_at: Number(r.expires_at),
      created_at: Number(r.created_at),
    };
  }

  // ── Transaction-Bound Approvals ────────────────────────────────────────────

  public async createTransactionApproval(params: {
    approval_id: string;
    challenge_id: string;
    request_id: string;
    permit_id: string;
    customer_ref: string;
    account_ref: string;
    mandate_id: string;
    mandate_version: number;
    canonical_tx_digest: string;
    amount_paise: number;
    currency?: string;
    payee_id: string;
    purpose: string;
    invoice_ref: string;
    ttlSeconds?: number;
    org_id?: string;
  }): Promise<TransactionBoundApprovalRow> {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const ttl = params.ttlSeconds ?? 120;
    const expiresAt = now + ttl * 1000;
    const currency = params.currency ?? 'INR';

    await this.pool.query(
      `INSERT INTO transaction_bound_approvals (
        approval_id, org_id, challenge_id, request_id, permit_id, customer_ref, account_ref,
        mandate_id, mandate_version, canonical_tx_digest, amount_paise, currency,
        payee_id, purpose, invoice_ref, status, verified_at, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING', NULL, $16, $17)`,
      [
        params.approval_id,
        tenant,
        params.challenge_id,
        params.request_id,
        params.permit_id,
        params.customer_ref,
        params.account_ref,
        params.mandate_id,
        params.mandate_version,
        params.canonical_tx_digest,
        params.amount_paise,
        currency,
        params.payee_id,
        params.purpose,
        params.invoice_ref,
        expiresAt,
        now,
      ],
    );

    return {
      approval_id: params.approval_id,
      org_id: tenant,
      challenge_id: params.challenge_id,
      request_id: params.request_id,
      permit_id: params.permit_id,
      customer_ref: params.customer_ref,
      account_ref: params.account_ref,
      mandate_id: params.mandate_id,
      mandate_version: params.mandate_version,
      canonical_tx_digest: params.canonical_tx_digest,
      amount_paise: params.amount_paise,
      currency,
      payee_id: params.payee_id,
      purpose: params.purpose,
      invoice_ref: params.invoice_ref,
      status: 'PENDING',
      verified_at: null,
      expires_at: expiresAt,
      created_at: now,
    };
  }

  public async getTransactionApproval(approvalId: string, orgId?: string): Promise<TransactionBoundApprovalRow | null> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM transaction_bound_approvals WHERE org_id = $1 AND approval_id = $2',
      [tenant, approvalId],
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      amount_paise: Number(r.amount_paise),
      verified_at: r.verified_at ? Number(r.verified_at) : null,
      expires_at: Number(r.expires_at),
      created_at: Number(r.created_at),
    };
  }

  public async getTransactionApprovalByRequestId(requestId: string, orgId?: string): Promise<TransactionBoundApprovalRow | null> {
    const tenant = this.resolveTenant(orgId);
    const { rows } = await this.pool.query(
      'SELECT * FROM transaction_bound_approvals WHERE org_id = $1 AND request_id = $2',
      [tenant, requestId],
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      amount_paise: Number(r.amount_paise),
      verified_at: r.verified_at ? Number(r.verified_at) : null,
      expires_at: Number(r.expires_at),
      created_at: Number(r.created_at),
    };
  }

  public async markApprovalVerified(params: {
    approval_id: string;
    canonical_tx_digest: string;
    mandate_version: number;
    orgId?: string;
  }): Promise<boolean> {
    const tenant = this.resolveTenant(params.orgId);
    const now = Date.now();
    const res = await this.pool.query(
      `UPDATE transaction_bound_approvals
       SET status = 'APPROVED', verified_at = $1
       WHERE org_id = $2
         AND approval_id = $3
         AND canonical_tx_digest = $4
         AND mandate_version = $5
         AND status = 'PENDING'
         AND expires_at > $6`,
      [now, tenant, params.approval_id, params.canonical_tx_digest, params.mandate_version, now],
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async consumeApproval(requestId: string, canonicalTxDigest: string, orgId?: string): Promise<boolean> {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = await this.pool.query(
      `UPDATE transaction_bound_approvals
       SET status = 'CONSUMED'
       WHERE org_id = $1
         AND request_id = $2
         AND canonical_tx_digest = $3
         AND status = 'APPROVED'
         AND expires_at > $4`,
      [tenant, requestId, canonicalTxDigest, now],
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  private hydrateMandate(row: any): CustomerMandate {
    let payees: string[] = [];
    try {
      payees = JSON.parse(row.allowed_payees);
    } catch {
      payees = [row.allowed_payees];
    }

    return {
      mandate_id: row.mandate_id,
      mandate_version: Number(row.mandate_version),
      customer_ref: row.customer_ref,
      account_ref: row.account_ref,
      authorized_agent_id: row.authorized_agent_id,
      action: row.action,
      purpose: row.purpose,
      allowed_payees: payees,
      per_tx_limit_paise: Number(row.per_tx_limit_paise),
      daily_limit_paise: Number(row.daily_limit_paise),
      status: row.status as CustomerMandate['status'],
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      expires_at: Number(row.expires_at),
    };
  }
}
