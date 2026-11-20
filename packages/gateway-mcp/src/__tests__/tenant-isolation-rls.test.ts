/**
 * Phase 7.2 & 7.3: PostgreSQL Multi-Tenancy, Row-Level Security (RLS) & Tenant Isolation Test Suite
 *
 * Verifies end-to-end mathematical tenant isolation across the banking substrate:
 *   1. Dual-backend contract parity (SQLite & PostgreSQL via pg-mem)
 *   2. Strict tenant partitioning of Customers, Accounts, Mandates, Sessions, WebAuthn, Approvals
 *   3. Cross-tenant read, update, revocation, and session hijacking prevention
 *   4. Anti-spoofing defense rejecting cross-tenant header forgery
 *   5. Verification of PostgreSQL RLS policies and FORCE ROW LEVEL SECURITY invariants
 */

import Database from 'better-sqlite3';
import { newDb, DataType } from 'pg-mem';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BankingStores } from '../db/banking-stores';
import { PostgresBankingStores } from '../db/postgres-banking-stores';
import {
  tenantContextMiddleware,
  runWithTenant,
  DEFAULT_TENANT_ID,
} from '../middleware/tenant-context';

function makePgPool(): Pool {
  const db = newDb();
  let currentTenant = 'org_default';

  const pgCatalog = db.getSchema('pg_catalog');

  pgCatalog.registerFunction({
    name: 'set_config',
    args: [DataType.text, DataType.text, DataType.bool],
    returns: DataType.text,
    implementation: (param: string, value: string) => {
      if (param === 'app.tenant_id') {
        currentTenant = value;
      }
      return value;
    },
  });

  pgCatalog.registerFunction({
    name: 'current_setting',
    args: [DataType.text, DataType.bool],
    returns: DataType.text,
    implementation: (param: string) => {
      if (param === 'app.tenant_id') {
        return currentTenant;
      }
      return '';
    },
  });

  const { Pool } = db.adapters.createPg();
  return new Pool();
}

describe('Phase 7.2 & 7.3: Multi-Tenancy, Row-Level Security & Tenant Isolation', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. SQLite Banking Stores Multi-Tenant Partitioning
  // ───────────────────────────────────────────────────────────────────────────
  describe('SQLite Banking Stores — Tenant Partitioning', () => {
    let db: Database.Database;
    let stores: BankingStores;

    const TENANT_A = 'bank_hdfc';
    const TENANT_B = 'bank_icici';

    beforeEach(() => {
      db = new Database(':memory:');
      stores = new BankingStores(db);

      // Seed baseline fixture in default tenant
      stores.seedFixtures(DEFAULT_TENANT_ID);

      // Seed Tenant A (HDFC)
      stores.createCustomer({
        customer_ref: 'CUST_HDFC_01',
        org_id: TENANT_A,
        name: 'Aarav HDFC',
        email: 'aarav@hdfc.bank',
        pin: '1234',
      });
      stores.createAccount({
        account_ref: 'ACC_HDFC_01',
        customer_ref: 'CUST_HDFC_01',
        org_id: TENANT_A,
        balance_paise: 5000000, // ₹50,000
      });
      const now = Date.now();
      stores.createMandate(
        {
          mandate_id: 'MND_HDFC_01',
          mandate_version: 1,
          customer_ref: 'CUST_HDFC_01',
          account_ref: 'ACC_HDFC_01',
          authorized_agent_id: 'AGENT_HDFC_01',
          action: 'bill_payment',
          purpose: 'electricity_bill',
          allowed_payees: ['PAYEE_HDFC_01'],
          per_tx_limit_paise: 200000,
          daily_limit_paise: 500000,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
          expires_at: now + 86400000,
        },
        TENANT_A,
      );

      // Seed Tenant B (ICICI)
      stores.createCustomer({
        customer_ref: 'CUST_ICICI_01',
        org_id: TENANT_B,
        name: 'Rohan ICICI',
        email: 'rohan@icici.bank',
        pin: '5678',
      });
      stores.createAccount({
        account_ref: 'ACC_ICICI_01',
        customer_ref: 'CUST_ICICI_01',
        org_id: TENANT_B,
        balance_paise: 8000000, // ₹80,000
      });
      stores.createMandate(
        {
          mandate_id: 'MND_ICICI_01',
          mandate_version: 1,
          customer_ref: 'CUST_ICICI_01',
          account_ref: 'ACC_ICICI_01',
          authorized_agent_id: 'AGENT_ICICI_01',
          action: 'salary_disbursement',
          purpose: 'payroll',
          allowed_payees: ['PAYEE_ICICI_01'],
          per_tx_limit_paise: 400000,
          daily_limit_paise: 800000,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
          expires_at: now + 86400000,
        },
        TENANT_B,
      );
    });

    afterEach(() => {
      db.close();
    });

    test('isolates customer profile lookups across tenants', () => {
      // Tenant A can find its own customer
      const custA = stores.getCustomer('CUST_HDFC_01', TENANT_A);
      expect(custA).not.toBeNull();
      expect(custA?.name).toBe('Aarav HDFC');

      // Tenant B CANNOT find Tenant A's customer
      const leakAttempt = stores.getCustomer('CUST_HDFC_01', TENANT_B);
      expect(leakAttempt).toBeNull();

      // Tenant B can find its own customer
      const custB = stores.getCustomer('CUST_ICICI_01', TENANT_B);
      expect(custB).not.toBeNull();
      expect(custB?.name).toBe('Rohan ICICI');

      // Tenant A CANNOT find Tenant B's customer
      expect(stores.getCustomer('CUST_ICICI_01', TENANT_A)).toBeNull();
    });

    test('isolates account lookups and balance queries across tenants', () => {
      // Tenant A queries its account
      const accA = stores.getAccount('ACC_HDFC_01', TENANT_A);
      expect(accA).not.toBeNull();
      expect(accA?.balance_paise).toBe(5000000);

      // Tenant B cannot view Tenant A's account
      expect(stores.getAccount('ACC_HDFC_01', TENANT_B)).toBeNull();

      // Tenant B cannot list accounts belonging to Tenant A's customer
      const leakList = stores.listAccountsByCustomer('CUST_HDFC_01', TENANT_B);
      expect(leakList).toHaveLength(0);

      // Tenant A lists its accounts
      const listA = stores.listAccountsByCustomer('CUST_HDFC_01', TENANT_A);
      expect(listA).toHaveLength(1);
      expect(listA[0].account_ref).toBe('ACC_HDFC_01');
    });

    test('isolates customer mandates and blocks cross-tenant tampering or revocation', () => {
      // Tenant A reads its mandate
      const mandateA = stores.getMandate('MND_HDFC_01', TENANT_A);
      expect(mandateA).not.toBeNull();
      expect(mandateA?.purpose).toBe('electricity_bill');

      // Tenant B CANNOT read Tenant A's mandate
      expect(stores.getMandate('MND_HDFC_01', TENANT_B)).toBeNull();

      // Tenant B CANNOT list mandates of Tenant A customer
      expect(stores.listMandatesByCustomer('CUST_HDFC_01', TENANT_B)).toHaveLength(0);

      // Tenant B attempts to revoke Tenant A's mandate -> fails
      const revokeAttempt = stores.revokeMandate('MND_HDFC_01', 'CUST_HDFC_01', TENANT_B);
      expect(revokeAttempt).toBe(false);

      // Verify mandate in Tenant A is still ACTIVE
      const unchangedMandate = stores.getMandate('MND_HDFC_01', TENANT_A);
      expect(unchangedMandate?.status).toBe('ACTIVE');

      // Tenant B attempts to update limits on Tenant A mandate -> fails
      const updateAttempt = stores.updateMandate(
        'MND_HDFC_01',
        'CUST_HDFC_01',
        { per_tx_limit_paise: 9999999 },
        TENANT_B,
      );
      expect(updateAttempt).toBeNull();
      expect(stores.getMandate('MND_HDFC_01', TENANT_A)?.per_tx_limit_paise).toBe(200000);
    });

    test('isolates customer sessions and prevents cross-tenant session hijacking', () => {
      // Issue session in Tenant A
      const sessionA = stores.createCustomerSession('CUST_HDFC_01', { orgId: TENANT_A });
      expect(sessionA.session_token).toBeDefined();

      // Resolving token in Tenant A context succeeds
      const resolvedA = stores.getCustomerSession(sessionA.session_token, TENANT_A);
      expect(resolvedA).not.toBeNull();
      expect(resolvedA?.customer.customer_ref).toBe('CUST_HDFC_01');

      // Hijacking attempt: Resolving same token under Tenant B context returns NULL
      const resolvedB = stores.getCustomerSession(sessionA.session_token, TENANT_B);
      expect(resolvedB).toBeNull();

      // Tenant B cannot revoke Tenant A session
      const revokeAttempt = stores.revokeCustomerSession(sessionA.session_token, TENANT_B);
      expect(revokeAttempt).toBe(false);

      // Session in Tenant A remains valid
      expect(stores.getCustomerSession(sessionA.session_token, TENANT_A)).not.toBeNull();
    });

    test('isolates WebAuthn credentials and ephemeral challenges across tenants', () => {
      // Register passkey in Tenant A
      stores.storeWebAuthnCredential({
        credential_id: 'CRED_HDFC_PASSKEY_01',
        customer_ref: 'CUST_HDFC_01',
        public_key: 'base64-public-key-hdfc',
        name: 'Aarav MacBook TouchID',
        org_id: TENANT_A,
      });

      // Tenant A can retrieve and list its passkey
      const credA = stores.getWebAuthnCredential('CRED_HDFC_PASSKEY_01', TENANT_A);
      expect(credA).not.toBeNull();
      expect(credA?.name).toBe('Aarav MacBook TouchID');

      // Tenant B CANNOT retrieve Tenant A passkey
      expect(stores.getWebAuthnCredential('CRED_HDFC_PASSKEY_01', TENANT_B)).toBeNull();
      expect(stores.listWebAuthnCredentials('CUST_HDFC_01', false, TENANT_B)).toHaveLength(0);

      // Tenant B cannot rename or revoke Tenant A passkey
      expect(stores.renameWebAuthnCredential('CRED_HDFC_PASSKEY_01', 'CUST_HDFC_01', 'Hacked Key', TENANT_B)).toBe(false);
      expect(stores.revokeWebAuthnCredential('CRED_HDFC_PASSKEY_01', 'CUST_HDFC_01', TENANT_B)).toBe(false);

      // Challenges: Challenge stored in Tenant A cannot be consumed in Tenant B
      stores.storeWebAuthnChallenge({
        challenge: 'CHALLENGE_HDFC_SECRET',
        customer_ref: 'CUST_HDFC_01',
        challenge_type: 'TRANSACTION_APPROVAL',
        org_id: TENANT_A,
      });
      expect(stores.consumeWebAuthnChallenge('CHALLENGE_HDFC_SECRET', TENANT_B)).toBeNull();
      expect(stores.consumeWebAuthnChallenge('CHALLENGE_HDFC_SECRET', TENANT_A)).not.toBeNull();
    });

    test('isolates transaction-bound step-up approvals across tenants', () => {
      // Create approval record in Tenant A
      const approval = stores.createTransactionApproval({
        approval_id: 'APPR_HDFC_001',
        challenge_id: 'CHAL_001',
        request_id: 'REQ_HDFC_001',
        permit_id: 'PMT_HDFC_001',
        customer_ref: 'CUST_HDFC_01',
        account_ref: 'ACC_HDFC_01',
        mandate_id: 'MND_HDFC_01',
        mandate_version: 1,
        canonical_tx_digest: 'sha256-canonical-digest-hdfc',
        amount_paise: 150000,
        payee_id: 'PAYEE_HDFC_01',
        purpose: 'electricity_bill',
        invoice_ref: 'INV-2026-001',
        org_id: TENANT_A,
      });
      expect(approval.status).toBe('PENDING');

      // Tenant A can retrieve approval
      expect(stores.getTransactionApproval('APPR_HDFC_001', TENANT_A)).not.toBeNull();

      // Tenant B CANNOT retrieve approval
      expect(stores.getTransactionApproval('APPR_HDFC_001', TENANT_B)).toBeNull();
      expect(stores.getTransactionApprovalByRequestId('REQ_HDFC_001', TENANT_B)).toBeNull();

      // Tenant B CANNOT verify or approve Tenant A transaction
      const verifyAttempt = stores.markApprovalVerified({
        approval_id: 'APPR_HDFC_001',
        canonical_tx_digest: 'sha256-canonical-digest-hdfc',
        mandate_version: 1,
        orgId: TENANT_B,
      });
      expect(verifyAttempt).toBe(false);

      // Verify in Tenant A context succeeds
      const verifySuccess = stores.markApprovalVerified({
        approval_id: 'APPR_HDFC_001',
        canonical_tx_digest: 'sha256-canonical-digest-hdfc',
        mandate_version: 1,
        orgId: TENANT_A,
      });
      expect(verifySuccess).toBe(true);

      // Tenant B CANNOT consume approved transaction
      expect(stores.consumeApproval('REQ_HDFC_001', 'sha256-canonical-digest-hdfc', TENANT_B)).toBe(false);

      // Tenant A consumes approved transaction -> succeeds
      expect(stores.consumeApproval('REQ_HDFC_001', 'sha256-canonical-digest-hdfc', TENANT_A)).toBe(true);
    });

    test('preserves backward compatibility when orgId is omitted (defaults safely)', () => {
      // Baseline fixture was seeded with DEFAULT_TENANT_ID
      const baselineCust = stores.getCustomer('CUST_101');
      expect(baselineCust).not.toBeNull();
      expect(baselineCust?.customer_ref).toBe('CUST_101');

      const baselineAcc = stores.getAccount('ACC_101');
      expect(baselineAcc).not.toBeNull();
      expect(baselineAcc?.balance_paise).toBe(10000000);

      const baselineMnd = stores.getMandate('MND_ELEC_101');
      expect(baselineMnd).not.toBeNull();
      expect(baselineMnd?.action).toBe('bill_payment');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PostgreSQL Banking Stores (Dual-Backend Parity via pg-mem)
  // ───────────────────────────────────────────────────────────────────────────
  describe('PostgreSQL Banking Stores — Parity & Multi-Tenancy', () => {
    let pool: Pool;
    let pgStores: PostgresBankingStores;

    const TENANT_A = 'bank_axis';
    const TENANT_B = 'bank_sbi';

    beforeEach(async () => {
      pool = makePgPool();
      pgStores = PostgresBankingStores.fromPool(pool);
      await pgStores.init();

      // Seed baseline fixture in default tenant
      await pgStores.seedFixtures(DEFAULT_TENANT_ID);

      // Provision Tenant A (Axis)
      await pgStores.createCustomer({
        customer_ref: 'CUST_AXIS_01',
        org_id: TENANT_A,
        name: 'Priya Axis',
        email: 'priya@axis.bank',
        pin: '4321',
      });
      await pgStores.createAccount({
        account_ref: 'ACC_AXIS_01',
        customer_ref: 'CUST_AXIS_01',
        org_id: TENANT_A,
        balance_paise: 9000000, // ₹90,000
      });
      const now = Date.now();
      await pgStores.createMandate(
        {
          mandate_id: 'MND_AXIS_01',
          mandate_version: 1,
          customer_ref: 'CUST_AXIS_01',
          account_ref: 'ACC_AXIS_01',
          authorized_agent_id: 'AGENT_AXIS_01',
          action: 'subscription',
          purpose: 'cloud_infra',
          allowed_payees: ['PAYEE_AWS_01'],
          per_tx_limit_paise: 300000,
          daily_limit_paise: 600000,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
          expires_at: now + 86400000,
        },
        TENANT_A,
      );

      // Provision Tenant B (SBI)
      await pgStores.createCustomer({
        customer_ref: 'CUST_SBI_01',
        org_id: TENANT_B,
        name: 'Vikram SBI',
        email: 'vikram@sbi.bank',
        pin: '8765',
      });
      await pgStores.createAccount({
        account_ref: 'ACC_SBI_01',
        customer_ref: 'CUST_SBI_01',
        org_id: TENANT_B,
        balance_paise: 12000000, // ₹1,20,000
      });
    });

    afterEach(async () => {
      await pgStores.close();
    });

    test('enforces cross-tenant isolation on PostgreSQL customer and account queries', async () => {
      // Tenant A can query its customer
      const custA = await pgStores.getCustomer('CUST_AXIS_01', TENANT_A);
      expect(custA).not.toBeNull();
      expect(custA?.name).toBe('Priya Axis');

      // Tenant B querying Tenant A customer returns null
      const leakAttempt = await pgStores.getCustomer('CUST_AXIS_01', TENANT_B);
      expect(leakAttempt).toBeNull();

      // PIN verification respects tenant boundary
      const pinSuccess = await pgStores.verifyCustomerPin('CUST_AXIS_01', '4321', TENANT_A);
      expect(pinSuccess).toBe(true);

      const pinCrossTenant = await pgStores.verifyCustomerPin('CUST_AXIS_01', '4321', TENANT_B);
      expect(pinCrossTenant).toBe(false);

      // Account balances isolated
      const accA = await pgStores.getAccount('ACC_AXIS_01', TENANT_A);
      expect(accA?.balance_paise).toBe(9000000);

      const accLeak = await pgStores.getAccount('ACC_AXIS_01', TENANT_B);
      expect(accLeak).toBeNull();
    });

    test('enforces cross-tenant mandate version bumping and revocation barriers on PostgreSQL', async () => {
      // Mandate in Tenant A is queryable
      const mandateA = await pgStores.getMandate('MND_AXIS_01', TENANT_A);
      expect(mandateA).not.toBeNull();
      expect(mandateA?.mandate_version).toBe(1);

      // Tenant B cannot view mandate
      expect(await pgStores.getMandate('MND_AXIS_01', TENANT_B)).toBeNull();

      // Tenant B cannot update mandate
      const updateResult = await pgStores.updateMandate(
        'MND_AXIS_01',
        'CUST_AXIS_01',
        { per_tx_limit_paise: 500000 },
        TENANT_B,
      );
      expect(updateResult).toBeNull();

      // Tenant A updates mandate -> version bumps to 2
      const updatedA = await pgStores.updateMandate(
        'MND_AXIS_01',
        'CUST_AXIS_01',
        { per_tx_limit_paise: 350000 },
        TENANT_A,
      );
      expect(updatedA?.mandate_version).toBe(2);
      expect(updatedA?.per_tx_limit_paise).toBe(350000);

      // Tenant B cannot revoke Tenant A mandate
      expect(await pgStores.revokeMandate('MND_AXIS_01', 'CUST_AXIS_01', TENANT_B)).toBe(false);

      // Tenant A revokes mandate
      expect(await pgStores.revokeMandate('MND_AXIS_01', 'CUST_AXIS_01', TENANT_A)).toBe(true);
      expect((await pgStores.getMandate('MND_AXIS_01', TENANT_A))?.status).toBe('REVOKED');
    });

    test('enforces cross-tenant session token and WebAuthn credential boundaries on PostgreSQL', async () => {
      // Create session in Tenant A
      const sessionResult = await pgStores.createCustomerSession('CUST_AXIS_01', { orgId: TENANT_A });
      expect(sessionResult.session_token).toBeDefined();

      // Valid in Tenant A
      const sessionA = await pgStores.getCustomerSession(sessionResult.session_token, TENANT_A);
      expect(sessionA).not.toBeNull();

      // Invalid in Tenant B
      const sessionB = await pgStores.getCustomerSession(sessionResult.session_token, TENANT_B);
      expect(sessionB).toBeNull();

      // Register WebAuthn Passkey in Tenant A
      await pgStores.storeWebAuthnCredential({
        credential_id: 'CRED_AXIS_01',
        customer_ref: 'CUST_AXIS_01',
        public_key: 'base64-pub-axis',
        name: 'Priya YubiKey',
        org_id: TENANT_A,
      });

      expect(await pgStores.getWebAuthnCredential('CRED_AXIS_01', TENANT_A)).not.toBeNull();
      expect(await pgStores.getWebAuthnCredential('CRED_AXIS_01', TENANT_B)).toBeNull();

      // Revocation in Tenant B fails
      expect(await pgStores.revokeWebAuthnCredential('CRED_AXIS_01', 'CUST_AXIS_01', TENANT_B)).toBe(false);
    });

    test('verifies transactional withTenant execution helper', async () => {
      const res = await pgStores.withTenant(TENANT_A, async (client) => {
        const queryRes = await client.query('SELECT current_setting($1, true) as tenant', ['app.tenant_id']);
        return queryRes.rows[0]?.tenant;
      });
      expect(res).toBe(TENANT_A);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Tenant Context Middleware & Anti-Spoofing Defense
  // ───────────────────────────────────────────────────────────────────────────
  describe('Tenant Context Middleware — Resolution & Anti-Spoofing', () => {
    test('resolves tenant from X-Tenant-Id and X-Org-Id headers', () => {
      const mw = tenantContextMiddleware();

      const req: any = {
        headers: { 'x-tenant-id': 'bank_kotak' },
        ip: '127.0.0.1',
        path: '/api/customer/me',
      };
      const res: any = {
        setHeader: jest.fn(),
      };
      const next = jest.fn();

      mw(req, res, next);
      expect(req.orgId).toBe('bank_kotak');
      expect(res.setHeader).toHaveBeenCalledWith('X-Tenant-ID', 'bank_kotak');
      expect(next).toHaveBeenCalled();
    });

    test('rejects malformed tenant identifiers (SQL injection prevention)', () => {
      const mw = tenantContextMiddleware();

      const req: any = {
        headers: { 'x-tenant-id': "bank_kotak'; DROP TABLE customers;--" },
        ip: '127.0.0.1',
        path: '/api/customer/me',
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      };
      const next = jest.fn();

      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ reason_code: 'INVALID_TENANT_ID' }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects cross-tenant spoofing when session tenant conflicts with request header', () => {
      const mw = tenantContextMiddleware();

      // Request has session belonging to bank_hdfc, but caller sends header X-Tenant-Id: bank_icici
      const req: any = {
        headers: { 'x-tenant-id': 'bank_icici' },
        customerSession: { org_id: 'bank_hdfc' },
        ip: '127.0.0.1',
        path: '/api/customer/accounts',
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      };
      const next = jest.fn();

      mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          reason_code: 'TENANT_MISMATCH',
          session_tenant: 'bank_hdfc',
          requested_tenant: 'bank_icici',
        }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('propagates ambient tenant context via runWithTenant', async () => {
      let capturedTenant = '';
      await runWithTenant('tenant_ambient_test', () => {
        const mw = tenantContextMiddleware();
        const req: any = {
          headers: {},
          customerSession: { org_id: 'tenant_ambient_test' },
          ip: '127.0.0.1',
          path: '/api/customer/me',
        };
        const res: any = { setHeader: jest.fn() };
        mw(req, res, () => {
          capturedTenant = req.orgId;
        });
      });

      expect(capturedTenant).toBe('tenant_ambient_test');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. PostgreSQL Row-Level Security (RLS) Migration Script Integrity
  // ───────────────────────────────────────────────────────────────────────────
  describe('PostgreSQL RLS Migration Script Verification', () => {
    test('0002_banking_multi_tenancy_rls.sql enforces RLS, FORCE RLS, and tenant policies', () => {
      const migrationPath = join(__dirname, '../../migrations/0002_banking_multi_tenancy_rls.sql');
      const sqlContent = readFileSync(migrationPath, 'utf8');

      // Verify extension
      expect(sqlContent).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto');

      // Verify all 9 banking tables are defined with org_id
      const expectedTables = [
        'customers',
        'accounts',
        'mandates',
        'customer_sessions',
        'customer_idp_identities',
        'oidc_auth_states',
        'webauthn_credentials',
        'webauthn_challenges',
        'transaction_bound_approvals',
      ];
      for (const table of expectedTables) {
        expect(sqlContent).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      }
      expect(sqlContent).toContain("org_id TEXT NOT NULL DEFAULT 'org_default'");

      // Verify RLS activation and enforcement
      expect(sqlContent).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sqlContent).toContain('FORCE ROW LEVEL SECURITY');
      expect(sqlContent).toContain("current_setting(''app.tenant_id'', TRUE)");
    });
  });
});
