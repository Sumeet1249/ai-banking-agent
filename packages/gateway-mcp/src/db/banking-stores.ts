/**
 * Banking Stores — Customer Identity, Accounts, Mandates, and Sessions
 *
 * Implements the persistence substrate for Phase 2.1:
 *   - Customers: Customer profiles and hashed credentials (PIN / SSO)
 *   - Accounts: Liquid account balances in integer paise (Rule E1)
 *   - Mandates: Customer-defined delegated financial authorities with versioning
 *   - Customer Sessions: HttpOnly session tracking with CSRF tokens (Rule E5)
 */

import Database from 'better-sqlite3';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Logger } from 'pino';
import {
  CustomerMandate,
  CustomerMandateSchema,
} from '@agentguard/core-schema';
import { DEFAULT_TENANT_ID, getCurrentTenantId } from '../middleware/tenant-context';

export interface CustomerRow {
  customer_ref: string;
  org_id?: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  pin_hash: string;
  created_at: number;
  updated_at: number;
}

export interface AccountRow {
  account_ref: string;
  org_id?: string;
  customer_ref: string;
  balance_paise: number;
  currency: string;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  created_at: number;
  updated_at: number;
}

export interface CustomerMandateRow {
  mandate_id: string;
  org_id?: string;
  mandate_version: number;
  customer_ref: string;
  account_ref: string;
  authorized_agent_id: string;
  action: string;
  purpose: string;
  allowed_payees: string; // JSON string array
  per_tx_limit_paise: number;
  daily_limit_paise: number;
  status: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
}

export interface CustomerSessionRow {
  session_id: string;
  org_id?: string;
  customer_ref: string;
  token_hash: string;
  csrf_token: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: number;
  created_at: number;
}

export interface CustomerIdpIdentityRow {
  idp_issuer: string;
  idp_subject: string;
  org_id?: string;
  customer_ref: string;
  idp_email: string;
  organization_id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  created_at: number;
  updated_at: number;
}

export interface OidcAuthStateRow {
  state: string;
  org_id?: string;
  nonce: string;
  code_verifier: string;
  redirect_uri: string;
  idp_issuer: string;
  expires_at: number;
  created_at: number;
}

export interface WebAuthnCredentialRow {
  credential_id: string;
  org_id?: string;
  customer_ref: string;
  public_key: string;
  counter: number;
  transports: string | null;
  aaguid: string | null;
  name: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface WebAuthnChallengeRow {
  challenge: string;
  org_id?: string;
  customer_ref: string;
  challenge_type: 'REGISTRATION' | 'AUTHENTICATION' | 'TRANSACTION_APPROVAL';
  context_json: string;
  expires_at: number;
  created_at: number;
}

export interface TransactionBoundApprovalRow {
  approval_id: string;
  org_id?: string;
  challenge_id: string;
  request_id: string;
  permit_id: string;
  customer_ref: string;
  account_ref: string;
  mandate_id: string;
  mandate_version: number;
  canonical_tx_digest: string;
  amount_paise: number;
  currency: string;
  payee_id: string;
  purpose: string;
  invoice_ref: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED';
  verified_at: number | null;
  expires_at: number;
  created_at: number;
}

export class BankingStores {
  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.init();
    this.seedFixtures();
  }

  public init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_ref TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        pin_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(org_id);

      CREATE TABLE IF NOT EXISTS accounts (
        account_ref TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        balance_paise INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(customer_ref) REFERENCES customers(customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_org ON accounts(org_id);

      CREATE TABLE IF NOT EXISTS mandates (
        mandate_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        mandate_version INTEGER NOT NULL DEFAULT 1,
        customer_ref TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        authorized_agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        purpose TEXT NOT NULL,
        allowed_payees TEXT NOT NULL,
        per_tx_limit_paise INTEGER NOT NULL,
        daily_limit_paise INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(customer_ref) REFERENCES customers(customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_mandates_org ON mandates(org_id);
      CREATE INDEX IF NOT EXISTS idx_mandates_customer ON mandates(customer_ref);
      CREATE INDEX IF NOT EXISTS idx_mandates_agent ON mandates(authorized_agent_id);

      CREATE TABLE IF NOT EXISTS customer_sessions (
        session_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(customer_ref) REFERENCES customers(customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_cust_sessions_org ON customer_sessions(org_id);
      CREATE INDEX IF NOT EXISTS idx_cust_sessions_hash ON customer_sessions(token_hash);

      -- Phase 7.1: Enterprise OIDC Identity Mapping
      CREATE TABLE IF NOT EXISTS customer_idp_identities (
        idp_issuer TEXT NOT NULL,
        idp_subject TEXT NOT NULL,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        idp_email TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (idp_issuer, idp_subject),
        FOREIGN KEY(customer_ref) REFERENCES customers(customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_idp_identities_org ON customer_idp_identities(org_id);
      CREATE INDEX IF NOT EXISTS idx_idp_cust ON customer_idp_identities(customer_ref);

      -- Phase 7.1: OIDC Auth States (PKCE S256 + State + Nonce)
      CREATE TABLE IF NOT EXISTS oidc_auth_states (
        state TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        nonce TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        idp_issuer TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oidc_states_org ON oidc_auth_states(org_id);

      -- Phase 7.1: WebAuthn Passkey Credentials
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        credential_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT,
        aaguid TEXT,
        name TEXT NOT NULL DEFAULT 'My Passkey',
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER,
        FOREIGN KEY(customer_ref) REFERENCES customers(customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_org ON webauthn_credentials(org_id);
      CREATE INDEX IF NOT EXISTS idx_webauthn_cust ON webauthn_credentials(customer_ref);

      -- Phase 7.1: Ephemeral WebAuthn Challenges
      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        challenge TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        customer_ref TEXT NOT NULL,
        challenge_type TEXT NOT NULL,
        context_json TEXT NOT NULL DEFAULT '{}',
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_chal_org ON webauthn_challenges(org_id);

      -- Phase 7.1: Transaction-Bound Step-Up Approvals
      CREATE TABLE IF NOT EXISTS transaction_bound_approvals (
        approval_id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL DEFAULT 'org_default',
        challenge_id TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        permit_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        mandate_id TEXT NOT NULL,
        mandate_version INTEGER NOT NULL,
        canonical_tx_digest TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        payee_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        invoice_ref TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        verified_at INTEGER,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(customer_ref) REFERENCES customers(customer_ref)
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_org ON transaction_bound_approvals(org_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_req ON transaction_bound_approvals(request_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_cust ON transaction_bound_approvals(customer_ref);
    `);

    // Schema upgrade for existing SQLite files
    const tablesToUpgrade = [
      'customers', 'accounts', 'mandates', 'customer_sessions',
      'customer_idp_identities', 'oidc_auth_states',
      'webauthn_credentials', 'webauthn_challenges', 'transaction_bound_approvals'
    ];
    for (const tbl of tablesToUpgrade) {
      try {
        this.db.exec(`ALTER TABLE ${tbl} ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_default'`);
      } catch {
        // column already exists
      }
    }
  }

  private resolveTenant(explicitTenant?: string): string {
    return explicitTenant || getCurrentTenantId() || DEFAULT_TENANT_ID;
  }

  /**
   * Seeds required baseline fixtures from Section 7 of CONTRACTS.md if empty.
   */
  public seedFixtures(orgId: string = DEFAULT_TENANT_ID): void {
    const existing = this.db.prepare('SELECT customer_ref FROM customers WHERE customer_ref = ? AND org_id = ?').get('CUST_101', orgId);
    if (existing) return;

    const now = Date.now();
    const pinHash = this.hashSecret('2468');

    const insertCustomer = this.db.prepare(`
      INSERT INTO customers (customer_ref, org_id, name, email, phone, status, pin_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAccount = this.db.prepare(`
      INSERT INTO accounts (account_ref, org_id, customer_ref, balance_paise, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMandate = this.db.prepare(`
      INSERT INTO mandates (
        mandate_id, org_id, mandate_version, customer_ref, account_ref, authorized_agent_id,
        action, purpose, allowed_payees, per_tx_limit_paise, daily_limit_paise,
        status, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      // Customer: CUST_101
      const email = orgId === DEFAULT_TENANT_ID ? 'aarav.sharma@example.com' : `aarav.${orgId}@example.com`;
      insertCustomer.run(
        'CUST_101',
        orgId,
        'Aarav Sharma',
        email,
        '+919876543210',
        'ACTIVE',
        pinHash,
        now,
        now,
      );

      // Account: ACC_101 (₹1,00,000 = 10,000,000 paise)
      insertAccount.run('ACC_101', orgId, 'CUST_101', 10000000, 'INR', 'ACTIVE', now, now);

      // Mandate: MND_ELEC_101 (CESC + Tata Power, ₹5k/tx, ₹8k/day)
      const expiry = Math.max(new Date('2026-12-31T23:59:59+05:30').getTime(), now + 30 * 86400 * 1000);
      insertMandate.run(
        'MND_ELEC_101',
        orgId,
        1,
        'CUST_101',
        'ACC_101',
        'AGENT_ELEC_01',
        'bill_payment',
        'electricity_bill',
        JSON.stringify(['PAYEE_CESC_001', 'PAYEE_TATA_POWER_001']),
        500000, // ₹5,000 in paise
        800000, // ₹8,000 in paise
        'ACTIVE',
        now,
        now,
        expiry,
      );
    });

    tx();
    this.logger?.info({ org_id: orgId }, 'Seeded baseline banking customer CUST_101 and mandate MND_ELEC_101');
  }

  // ── Customer & Account Operations ──────────────────────────────────────────

  public getCustomer(customerRef: string, orgId?: string): CustomerRow | null {
    if (orgId) {
      const row = this.db.prepare('SELECT * FROM customers WHERE org_id = ? AND customer_ref = ?').get(orgId, customerRef) as CustomerRow | undefined;
      return row ?? null;
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare('SELECT * FROM customers WHERE org_id = ? AND customer_ref = ?').get(ambient, customerRef) as CustomerRow | undefined;
      return row ?? null;
    }
    const row = this.db.prepare('SELECT * FROM customers WHERE customer_ref = ?').get(customerRef) as CustomerRow | undefined;
    return row ?? null;
  }

  public createCustomer(params: {
    customer_ref: string;
    org_id?: string;
    name: string;
    email: string;
    phone?: string;
    pin: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  }): CustomerRow {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const pinHash = this.hashSecret(params.pin);
    const status = params.status ?? 'ACTIVE';

    this.db.prepare(`
      INSERT INTO customers (customer_ref, org_id, name, email, phone, status, pin_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(customer_ref) DO UPDATE SET
        org_id = excluded.org_id,
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        status = excluded.status,
        pin_hash = excluded.pin_hash,
        updated_at = excluded.updated_at
    `).run(params.customer_ref, tenant, params.name, params.email, params.phone ?? null, status, pinHash, now, now);

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

  public getAccount(accountRef: string, orgId?: string): AccountRow | null {
    if (orgId) {
      const row = this.db.prepare('SELECT * FROM accounts WHERE org_id = ? AND account_ref = ?').get(orgId, accountRef) as AccountRow | undefined;
      return row ?? null;
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare('SELECT * FROM accounts WHERE org_id = ? AND account_ref = ?').get(ambient, accountRef) as AccountRow | undefined;
      return row ?? null;
    }
    const row = this.db.prepare('SELECT * FROM accounts WHERE account_ref = ?').get(accountRef) as AccountRow | undefined;
    return row ?? null;
  }

  public createAccount(params: {
    account_ref: string;
    customer_ref: string;
    balance_paise: number;
    currency?: string;
    status?: 'ACTIVE' | 'FROZEN' | 'CLOSED';
    org_id?: string;
  }): AccountRow {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const currency = params.currency ?? 'INR';
    const status = params.status ?? 'ACTIVE';

    this.db.prepare(`
      INSERT INTO accounts (account_ref, org_id, customer_ref, balance_paise, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_ref) DO UPDATE SET
        org_id = excluded.org_id,
        balance_paise = excluded.balance_paise,
        currency = excluded.currency,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(params.account_ref, tenant, params.customer_ref, params.balance_paise, currency, status, now, now);

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

  public listAccountsByCustomer(customerRef: string, orgId?: string): AccountRow[] {
    if (orgId) {
      return this.db.prepare('SELECT * FROM accounts WHERE org_id = ? AND customer_ref = ?').all(orgId, customerRef) as AccountRow[];
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      return this.db.prepare('SELECT * FROM accounts WHERE org_id = ? AND customer_ref = ?').all(ambient, customerRef) as AccountRow[];
    }
    return this.db.prepare('SELECT * FROM accounts WHERE customer_ref = ?').all(customerRef) as AccountRow[];
  }

  public verifyCustomerPin(customerRef: string, pin: string, orgId?: string): boolean {
    const cust = this.getCustomer(customerRef, orgId);
    if (!cust || cust.status !== 'ACTIVE') return false;
    const incomingHash = this.hashSecret(pin);
    try {
      return timingSafeEqual(Buffer.from(incomingHash, 'hex'), Buffer.from(cust.pin_hash, 'hex'));
    } catch {
      return false;
    }
  }

  // ── Session Operations ─────────────────────────────────────────────────────

  public createCustomerSession(
    customerRef: string,
    opts?: { userAgent?: string; ipAddress?: string; ttlHours?: number; orgId?: string },
  ): { session_token: string; csrf_token: string; session: CustomerSessionRow } {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashSecret(rawToken);
    const csrfToken = randomBytes(24).toString('base64url');
    const sessionId = randomBytes(16).toString('hex');
    const now = Date.now();
    const ttlMs = (opts?.ttlHours ?? 12) * 3600 * 1000;
    const expiresAt = now + ttlMs;
    const tenant = this.resolveTenant(opts?.orgId);

    this.db.prepare(`
      INSERT INTO customer_sessions (session_id, org_id, customer_ref, token_hash, csrf_token, user_agent, ip_address, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      tenant,
      customerRef,
      tokenHash,
      csrfToken,
      opts?.userAgent ?? null,
      opts?.ipAddress ?? null,
      expiresAt,
      now,
    );

    const session = this.db.prepare('SELECT * FROM customer_sessions WHERE session_id = ?').get(sessionId) as CustomerSessionRow;
    return { session_token: rawToken, csrf_token: csrfToken, session };
  }

  public getCustomerSession(token: string, orgId?: string): { session: CustomerSessionRow; customer: CustomerRow } | null {
    const tokenHash = this.hashSecret(token);
    const now = Date.now();
    let query = 'SELECT * FROM customer_sessions WHERE token_hash = ? AND expires_at > ?';
    const params: any[] = [tokenHash, now];

    const targetOrg = orgId || (getCurrentTenantId() !== DEFAULT_TENANT_ID ? getCurrentTenantId() : undefined);
    if (targetOrg) {
      query += ' AND org_id = ?';
      params.push(targetOrg);
    }

    const session = this.db.prepare(query).get(...params) as CustomerSessionRow | undefined;
    if (!session) return null;
    const customer = this.getCustomer(session.customer_ref, session.org_id);
    if (!customer || customer.status !== 'ACTIVE') return null;

    return { session, customer };
  }

  public revokeCustomerSession(token: string, orgId?: string): boolean {
    const tokenHash = this.hashSecret(token);
    let query = 'DELETE FROM customer_sessions WHERE token_hash = ?';
    const params: any[] = [tokenHash];
    if (orgId) {
      query += ' AND org_id = ?';
      params.push(orgId);
    }
    const res = this.db.prepare(query).run(...params);
    return res.changes > 0;
  }

  // ── Mandate Operations ─────────────────────────────────────────────────────

  public getMandate(mandateId: string, orgId?: string): CustomerMandate | null {
    if (orgId) {
      const row = this.db.prepare('SELECT * FROM mandates WHERE org_id = ? AND mandate_id = ?').get(orgId, mandateId) as CustomerMandateRow | undefined;
      if (!row) return null;
      return this.hydrateMandate(row);
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare('SELECT * FROM mandates WHERE org_id = ? AND mandate_id = ?').get(ambient, mandateId) as CustomerMandateRow | undefined;
      if (!row) return null;
      return this.hydrateMandate(row);
    }
    const row = this.db.prepare('SELECT * FROM mandates WHERE mandate_id = ?').get(mandateId) as CustomerMandateRow | undefined;
    if (!row) return null;
    return this.hydrateMandate(row);
  }

  public listMandatesByCustomer(customerRef: string, orgId?: string): CustomerMandate[] {
    if (orgId) {
      const rows = this.db.prepare('SELECT * FROM mandates WHERE org_id = ? AND customer_ref = ? ORDER BY created_at DESC').all(orgId, customerRef) as CustomerMandateRow[];
      return rows.map((r) => this.hydrateMandate(r));
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const rows = this.db.prepare('SELECT * FROM mandates WHERE org_id = ? AND customer_ref = ? ORDER BY created_at DESC').all(ambient, customerRef) as CustomerMandateRow[];
      return rows.map((r) => this.hydrateMandate(r));
    }
    const rows = this.db.prepare('SELECT * FROM mandates WHERE customer_ref = ? ORDER BY created_at DESC').all(customerRef) as CustomerMandateRow[];
    return rows.map((r) => this.hydrateMandate(r));
  }

  public createMandate(mandate: CustomerMandate, orgId?: string): CustomerMandate {
    // Validate schema
    const validated = CustomerMandateSchema.parse(mandate);
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO mandates (
        mandate_id, org_id, mandate_version, customer_ref, account_ref, authorized_agent_id,
        action, purpose, allowed_payees, per_tx_limit_paise, daily_limit_paise,
        status, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    return validated;
  }

  /**
   * Version-bumping update of a mandate.
   * Invariant I6: Any update increments mandate_version so older permits fail.
   */
  public updateMandate(
    mandateId: string,
    customerRef: string,
    updates: {
      per_tx_limit_paise?: number;
      daily_limit_paise?: number;
      allowed_payees?: string[];
      expires_at?: number;
    },
    orgId?: string,
  ): CustomerMandate | null {
    const tenant = this.resolveTenant(orgId);
    const current = this.getMandate(mandateId, tenant);
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

    // Re-validate complete object
    CustomerMandateSchema.parse(updated);

    this.db.prepare(`
      UPDATE mandates SET
        mandate_version = ?,
        per_tx_limit_paise = ?,
        daily_limit_paise = ?,
        allowed_payees = ?,
        expires_at = ?,
        updated_at = ?
      WHERE mandate_id = ? AND customer_ref = ? AND org_id = ?
    `).run(
      updated.mandate_version,
      updated.per_tx_limit_paise,
      updated.daily_limit_paise,
      JSON.stringify(updated.allowed_payees),
      updated.expires_at,
      now,
      mandateId,
      customerRef,
      tenant,
    );

    return updated;
  }

  public revokeMandate(mandateId: string, customerRef: string, orgId?: string): boolean {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE mandates SET status = 'REVOKED', updated_at = ?
      WHERE mandate_id = ? AND customer_ref = ? AND org_id = ? AND status != 'REVOKED'
    `).run(now, mandateId, customerRef, tenant);
    return res.changes > 0;
  }

  public suspendMandate(mandateId: string, customerRef: string, orgId?: string): boolean {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE mandates SET status = 'SUSPENDED', updated_at = ?
      WHERE mandate_id = ? AND customer_ref = ? AND org_id = ? AND status = 'ACTIVE'
    `).run(now, mandateId, customerRef, tenant);
    return res.changes > 0;
  }

  public reactivateMandate(mandateId: string, customerRef: string, orgId?: string): boolean {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE mandates SET status = 'ACTIVE', updated_at = ?
      WHERE mandate_id = ? AND customer_ref = ? AND org_id = ? AND status = 'SUSPENDED'
    `).run(now, mandateId, customerRef, tenant);
    return res.changes > 0;
  }

  // ── Phase 7.1: Enterprise OIDC Identity Mapping ───────────────────────────

  public linkCustomerIdpIdentity(mapping: {
    idp_issuer: string;
    idp_subject: string;
    customer_ref: string;
    idp_email: string;
    organization_id: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  }): CustomerIdpIdentityRow {
    const now = Date.now();
    const status = mapping.status ?? 'ACTIVE';
    this.db.prepare(`
      INSERT INTO customer_idp_identities (
        idp_issuer, idp_subject, customer_ref, idp_email, organization_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idp_issuer, idp_subject) DO UPDATE SET
        customer_ref = excluded.customer_ref,
        idp_email = excluded.idp_email,
        organization_id = excluded.organization_id,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      mapping.idp_issuer,
      mapping.idp_subject,
      mapping.customer_ref,
      mapping.idp_email,
      mapping.organization_id,
      status,
      now,
      now,
    );

    return {
      idp_issuer: mapping.idp_issuer,
      idp_subject: mapping.idp_subject,
      customer_ref: mapping.customer_ref,
      idp_email: mapping.idp_email,
      organization_id: mapping.organization_id,
      status,
      created_at: now,
      updated_at: now,
    };
  }

  public findCustomerByIdp(issuer: string, subject: string): CustomerIdpIdentityRow | null {
    const row = this.db.prepare(`
      SELECT * FROM customer_idp_identities
      WHERE idp_issuer = ? AND idp_subject = ?
    `).get(issuer, subject) as CustomerIdpIdentityRow | undefined;
    return row ?? null;
  }

  public listIdpIdentities(customerRef: string): CustomerIdpIdentityRow[] {
    return this.db.prepare(`
      SELECT * FROM customer_idp_identities WHERE customer_ref = ?
    `).all(customerRef) as CustomerIdpIdentityRow[];
  }

  // ── Phase 7.1: OIDC Auth States (State + Nonce + PKCE) ────────────────────

  public storeOidcAuthState(params: {
    state: string;
    nonce: string;
    codeVerifier: string;
    redirectUri: string;
    idpIssuer: string;
    ttlSeconds?: number;
  }): void {
    const now = Date.now();
    const ttl = params.ttlSeconds ?? 600; // 10 minutes
    const expiresAt = now + ttl * 1000;

    this.db.prepare(`
      INSERT INTO oidc_auth_states (state, nonce, code_verifier, redirect_uri, idp_issuer, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.state,
      params.nonce,
      params.codeVerifier,
      params.redirectUri,
      params.idpIssuer,
      expiresAt,
      now,
    );
  }

  public getOidcAuthState(state: string): OidcAuthStateRow | null {
    const row = this.db.prepare(`
      SELECT * FROM oidc_auth_states WHERE state = ?
    `).get(state) as OidcAuthStateRow | undefined;
    return row ?? null;
  }

  public consumeOidcAuthState(state: string): OidcAuthStateRow | null {
    const now = Date.now();
    // Atomic fetch and delete to enforce single-use
    const row = this.db.prepare(`
      SELECT * FROM oidc_auth_states WHERE state = ?
    `).get(state) as OidcAuthStateRow | undefined;

    if (!row) return null;

    this.db.prepare('DELETE FROM oidc_auth_states WHERE state = ?').run(state);

    if (row.expires_at <= now) {
      return null; // Expired
    }

    return row;
  }

  // ── Phase 7.1: WebAuthn Passkey Credentials ───────────────────────────────

  public storeWebAuthnCredential(params: {
    credential_id: string;
    customer_ref: string;
    public_key: string;
    counter?: number;
    transports?: string[];
    aaguid?: string;
    name?: string;
    org_id?: string;
  }): WebAuthnCredentialRow {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const counter = params.counter ?? 0;
    const name = params.name ?? 'My Passkey';
    const transports = params.transports ? JSON.stringify(params.transports) : null;

    this.db.prepare(`
      INSERT INTO webauthn_credentials (
        credential_id, org_id, customer_ref, public_key, counter, transports, aaguid, name, created_at, last_used_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
      ON CONFLICT(credential_id) DO UPDATE SET
        org_id = excluded.org_id,
        public_key = excluded.public_key,
        counter = excluded.counter,
        transports = excluded.transports,
        name = excluded.name
    `).run(
      params.credential_id,
      tenant,
      params.customer_ref,
      params.public_key,
      counter,
      transports,
      params.aaguid ?? null,
      name,
      now,
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

  public getWebAuthnCredential(credentialId: string, orgId?: string): WebAuthnCredentialRow | null {
    if (orgId) {
      const row = this.db.prepare(`
        SELECT * FROM webauthn_credentials WHERE org_id = ? AND credential_id = ?
      `).get(orgId, credentialId) as WebAuthnCredentialRow | undefined;
      return row ?? null;
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare(`
        SELECT * FROM webauthn_credentials WHERE org_id = ? AND credential_id = ?
      `).get(ambient, credentialId) as WebAuthnCredentialRow | undefined;
      return row ?? null;
    }
    const row = this.db.prepare(`
      SELECT * FROM webauthn_credentials WHERE credential_id = ?
    `).get(credentialId) as WebAuthnCredentialRow | undefined;
    return row ?? null;
  }

  public listWebAuthnCredentials(customerRef: string, includeRevoked: boolean = false, orgId?: string): WebAuthnCredentialRow[] {
    const targetOrg = orgId || (getCurrentTenantId() !== DEFAULT_TENANT_ID ? getCurrentTenantId() : undefined);
    let query = 'SELECT * FROM webauthn_credentials WHERE customer_ref = ?';
    const params: any[] = [customerRef];

    if (targetOrg) {
      query += ' AND org_id = ?';
      params.push(targetOrg);
    }
    if (!includeRevoked) {
      query += ' AND revoked_at IS NULL';
    }
    query += ' ORDER BY created_at DESC';

    return this.db.prepare(query).all(...params) as WebAuthnCredentialRow[];
  }

  public updateWebAuthnCredentialCounter(credentialId: string, counter: number, orgId?: string): void {
    const now = Date.now();
    let query = 'UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE credential_id = ?';
    const params: any[] = [counter, now, credentialId];
    if (orgId) {
      query += ' AND org_id = ?';
      params.push(orgId);
    }
    this.db.prepare(query).run(...params);
  }

  public revokeWebAuthnCredential(credentialId: string, customerRef: string, orgId?: string): boolean {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE webauthn_credentials SET revoked_at = ?
      WHERE credential_id = ? AND customer_ref = ? AND org_id = ? AND revoked_at IS NULL
    `).run(now, credentialId, customerRef, tenant);
    return res.changes > 0;
  }

  public renameWebAuthnCredential(credentialId: string, customerRef: string, name: string, orgId?: string): boolean {
    const tenant = this.resolveTenant(orgId);
    const res = this.db.prepare(`
      UPDATE webauthn_credentials SET name = ?
      WHERE credential_id = ? AND customer_ref = ? AND org_id = ? AND revoked_at IS NULL
    `).run(name, credentialId, customerRef, tenant);
    return res.changes > 0;
  }

  // ── Phase 7.1: WebAuthn Challenges ────────────────────────────────────────

  public storeWebAuthnChallenge(params: {
    challenge: string;
    customer_ref: string;
    challenge_type: 'REGISTRATION' | 'AUTHENTICATION' | 'TRANSACTION_APPROVAL';
    context?: Record<string, any>;
    ttlSeconds?: number;
    org_id?: string;
  }): void {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const ttl = params.ttlSeconds ?? 300; // 5 minutes
    const expiresAt = now + ttl * 1000;
    const contextJson = params.context ? JSON.stringify(params.context) : '{}';

    this.db.prepare(`
      INSERT INTO webauthn_challenges (challenge, org_id, customer_ref, challenge_type, context_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.challenge,
      tenant,
      params.customer_ref,
      params.challenge_type,
      contextJson,
      expiresAt,
      now,
    );
  }

  public getWebAuthnChallenge(challenge: string, orgId?: string): WebAuthnChallengeRow | null {
    if (orgId) {
      const row = this.db.prepare(`
        SELECT * FROM webauthn_challenges WHERE org_id = ? AND challenge = ?
      `).get(orgId, challenge) as WebAuthnChallengeRow | undefined;
      return row ?? null;
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare(`
        SELECT * FROM webauthn_challenges WHERE org_id = ? AND challenge = ?
      `).get(ambient, challenge) as WebAuthnChallengeRow | undefined;
      return row ?? null;
    }
    const row = this.db.prepare(`
      SELECT * FROM webauthn_challenges WHERE challenge = ?
    `).get(challenge) as WebAuthnChallengeRow | undefined;
    return row ?? null;
  }

  public consumeWebAuthnChallenge(challenge: string, orgId?: string): WebAuthnChallengeRow | null {
    const now = Date.now();
    const targetOrg = orgId || (getCurrentTenantId() !== DEFAULT_TENANT_ID ? getCurrentTenantId() : undefined);
    let selectQuery = 'SELECT * FROM webauthn_challenges WHERE challenge = ?';
    let deleteQuery = 'DELETE FROM webauthn_challenges WHERE challenge = ?';
    const params = [challenge];
    if (targetOrg) {
      selectQuery += ' AND org_id = ?';
      deleteQuery += ' AND org_id = ?';
      params.push(targetOrg);
    }

    const row = this.db.prepare(selectQuery).get(...params) as WebAuthnChallengeRow | undefined;
    if (!row) return null;

    this.db.prepare(deleteQuery).run(...params);

    if (row.expires_at <= now) {
      return null;
    }

    return row;
  }

  // ── Phase 7.1: Transaction-Bound Customer Approvals ───────────────────────

  public createTransactionApproval(params: {
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
  }): TransactionBoundApprovalRow {
    const tenant = this.resolveTenant(params.org_id);
    const now = Date.now();
    const ttl = params.ttlSeconds ?? 120;
    const expiresAt = now + ttl * 1000;
    const currency = params.currency ?? 'INR';

    this.db.prepare(`
      INSERT INTO transaction_bound_approvals (
        approval_id, org_id, challenge_id, request_id, permit_id, customer_ref, account_ref,
        mandate_id, mandate_version, canonical_tx_digest, amount_paise, currency,
        payee_id, purpose, invoice_ref, status, verified_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, ?, ?)
    `).run(
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

  public getTransactionApproval(approvalId: string, orgId?: string): TransactionBoundApprovalRow | null {
    if (orgId) {
      const row = this.db.prepare(`
        SELECT * FROM transaction_bound_approvals WHERE org_id = ? AND approval_id = ?
      `).get(orgId, approvalId) as TransactionBoundApprovalRow | undefined;
      return row ?? null;
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare(`
        SELECT * FROM transaction_bound_approvals WHERE org_id = ? AND approval_id = ?
      `).get(ambient, approvalId) as TransactionBoundApprovalRow | undefined;
      return row ?? null;
    }
    const row = this.db.prepare(`
      SELECT * FROM transaction_bound_approvals WHERE approval_id = ?
    `).get(approvalId) as TransactionBoundApprovalRow | undefined;
    return row ?? null;
  }

  public getTransactionApprovalByRequestId(requestId: string, orgId?: string): TransactionBoundApprovalRow | null {
    if (orgId) {
      const row = this.db.prepare(`
        SELECT * FROM transaction_bound_approvals WHERE org_id = ? AND request_id = ?
      `).get(orgId, requestId) as TransactionBoundApprovalRow | undefined;
      return row ?? null;
    }
    const ambient = getCurrentTenantId();
    if (ambient && ambient !== DEFAULT_TENANT_ID) {
      const row = this.db.prepare(`
        SELECT * FROM transaction_bound_approvals WHERE org_id = ? AND request_id = ?
      `).get(ambient, requestId) as TransactionBoundApprovalRow | undefined;
      return row ?? null;
    }
    const row = this.db.prepare(`
      SELECT * FROM transaction_bound_approvals WHERE request_id = ?
    `).get(requestId) as TransactionBoundApprovalRow | undefined;
    return row ?? null;
  }

  public markApprovalVerified(params: {
    approval_id: string;
    canonical_tx_digest: string;
    mandate_version: number;
    orgId?: string;
  }): boolean {
    const tenant = this.resolveTenant(params.orgId);
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE transaction_bound_approvals
      SET status = 'APPROVED', verified_at = ?
      WHERE org_id = ?
        AND approval_id = ?
        AND canonical_tx_digest = ?
        AND mandate_version = ?
        AND status = 'PENDING'
        AND expires_at > ?
    `).run(
      now,
      tenant,
      params.approval_id,
      params.canonical_tx_digest,
      params.mandate_version,
      now,
    );
    return res.changes > 0;
  }

  public consumeApproval(requestId: string, canonicalTxDigest: string, orgId?: string): boolean {
    const tenant = this.resolveTenant(orgId);
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE transaction_bound_approvals
      SET status = 'CONSUMED'
      WHERE org_id = ?
        AND request_id = ?
        AND canonical_tx_digest = ?
        AND status = 'APPROVED'
        AND expires_at > ?
    `).run(tenant, requestId, canonicalTxDigest, now);
    return res.changes > 0;
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  private hydrateMandate(row: CustomerMandateRow): CustomerMandate {
    let payees: string[] = [];
    try {
      payees = JSON.parse(row.allowed_payees);
    } catch {
      payees = [row.allowed_payees];
    }

    return {
      mandate_id: row.mandate_id,
      mandate_version: row.mandate_version,
      customer_ref: row.customer_ref,
      account_ref: row.account_ref,
      authorized_agent_id: row.authorized_agent_id,
      action: row.action,
      purpose: row.purpose,
      allowed_payees: payees,
      per_tx_limit_paise: row.per_tx_limit_paise,
      daily_limit_paise: row.daily_limit_paise,
      status: row.status as CustomerMandate['status'],
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
    };
  }
}
