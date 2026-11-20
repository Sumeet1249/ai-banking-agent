/**
 * Phase 2.1: Customer Identity & Mandate Lifecycle Test Suite
 */

import express = require('express');
import * as http from 'http';
import { AddressInfo } from 'net';
import Database = require('better-sqlite3');
import { BankingStores } from '../db/banking-stores';
import { CustomerAuthService } from '../services/customer-auth';
import { CustomerAPI } from '../api/customer';

describe('Phase 2.1: Customer Identity & Mandate Lifecycle', () => {
  let db: Database.Database;
  let stores: BankingStores;
  let authService: CustomerAuthService;
  let customerApi: CustomerAPI;
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.DEMO_MODE = '1';
    db = new Database(':memory:');
    stores = new BankingStores(db);
    authService = new CustomerAuthService(stores);
    customerApi = new CustomerAPI(stores, authService);

    app = express();
    app.use(express.json());
    app.use('/api/customer', customerApi.router);

    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  describe('Authentication & Session Management', () => {
    it('seeds baseline CUST_101 and mandate MND_ELEC_101 automatically', () => {
      const cust = stores.getCustomer('CUST_101');
      expect(cust).not.toBeNull();
      expect(cust?.name).toBe('Aarav Sharma');

      const accounts = stores.listAccountsByCustomer('CUST_101');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].account_ref).toBe('ACC_101');
      expect(accounts[0].balance_paise).toBe(10000000); // ₹1,00,000

      const mandates = stores.listMandatesByCustomer('CUST_101');
      expect(mandates).toHaveLength(1);
      expect(mandates[0].mandate_id).toBe('MND_ELEC_101');
      expect(mandates[0].mandate_version).toBe(1);
      expect(mandates[0].per_tx_limit_paise).toBe(500000); // ₹5,000
    });

    it('rejects login with invalid PIN or unknown customer', async () => {
      const res = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '0000' }),
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.reason_code).toBe('INVALID_CREDENTIALS');
    });

    it('successfully authenticates with demo PIN 2468 and returns tokens and cookie', async () => {
      const res = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.customer.customer_ref).toBe('CUST_101');
      expect(data.csrf_token).toBeDefined();
      expect(data.session_token).toBeDefined();

      const cookie = res.headers.get('set-cookie');
      expect(cookie).toMatch(/session_token=[^;]+/);
    });

    it('rejects cross-namespace agent credentials on customer endpoint (Rule E5)', async () => {
      const res = await fetch(`${baseUrl}/api/customer/me`, {
        headers: { 'x-agent-signature': 'fake-signature' },
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.reason_code).toBe('CROSS_NAMESPACE_AUTH_REJECTED');
    });

    it('rejects mutating requests without valid CSRF header', async () => {
      const loginRes = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
      });
      const loginData = (await loginRes.json()) as any;
      const sessionToken = loginData.session_token;

      // POST without x-csrf-token
      const res = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(403);
      const data = (await res.json()) as any;
      expect(data.reason_code).toBe('CSRF_VALIDATION_FAILED');
    });
  });

  describe('Customer Accounts & Mandates', () => {
    let sessionToken: string;
    let csrfToken: string;

    beforeEach(async () => {
      const loginRes = await fetch(`${baseUrl}/api/customer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_ref: 'CUST_101', pin: '2468' }),
      });
      const data = (await loginRes.json()) as any;
      sessionToken = data.session_token;
      csrfToken = data.csrf_token;
    });

    it('returns customer profile and accounts in integer paise', async () => {
      const meRes = await fetch(`${baseUrl}/api/customer/me`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      });
      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as any;
      expect(meData.customer_ref).toBe('CUST_101');

      const accountsRes = await fetch(`${baseUrl}/api/customer/accounts`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      });
      expect(accountsRes.status).toBe(200);
      const accountsData = (await accountsRes.json()) as any;
      expect(accountsData.accounts[0].balance_paise).toBe(10000000);
    });

    it('creates a new mandate with integer paise limits', async () => {
      const res = await fetch(`${baseUrl}/api/customer/mandates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mandate_id: 'MND_WATER_101',
          account_ref: 'ACC_101',
          authorized_agent_id: 'AGENT_WATER_01',
          action: 'bill_payment',
          purpose: 'water_bill',
          allowed_payees: ['PAYEE_WATER_001'],
          per_tx_limit_paise: 200000, // ₹2,000
          daily_limit_paise: 400000,  // ₹4,000
          expires_at: Date.now() + 86400000 * 30,
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as any;
      expect(data.mandate.mandate_id).toBe('MND_WATER_101');
      expect(data.mandate.mandate_version).toBe(1);
    });

    it('rejects floating-point currency in mandate creation (Rule E1)', async () => {
      const res = await fetch(`${baseUrl}/api/customer/mandates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mandate_id: 'MND_FLOAT_TEST',
          account_ref: 'ACC_101',
          authorized_agent_id: 'AGENT_ELEC_01',
          action: 'bill_payment',
          purpose: 'electricity_bill',
          allowed_payees: ['PAYEE_CESC_001'],
          per_tx_limit_paise: 50.75, // Invalid float!
          daily_limit_paise: 10000,
          expires_at: Date.now() + 86400000,
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe('Invalid mandate payload');
    });

    it('updates mandate and automatically increments mandate_version (Invariant I6)', async () => {
      const res = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          per_tx_limit_paise: 600000, // ₹6,000
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.mandate.mandate_version).toBe(2);
      expect(data.mandate.per_tx_limit_paise).toBe(600000);

      // Verify in DB directly
      const updated = stores.getMandate('MND_ELEC_101');
      expect(updated?.mandate_version).toBe(2);
      expect(updated?.per_tx_limit_paise).toBe(600000);
    });

    it('suspends, reactivates, and revokes a mandate', async () => {
      // Suspend
      const suspendRes = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101/suspend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
        },
      });
      expect(suspendRes.status).toBe(200);
      const suspendData = (await suspendRes.json()) as any;
      expect(suspendData.status).toBe('SUSPENDED');

      // Reactivate
      const reactivateRes = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101/reactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
        },
      });
      expect(reactivateRes.status).toBe(200);
      const reactivateData = (await reactivateRes.json()) as any;
      expect(reactivateData.status).toBe('ACTIVE');

      // Revoke
      const revokeRes = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
        },
      });
      expect(revokeRes.status).toBe(200);
      const revokeData = (await revokeRes.json()) as any;
      expect(revokeData.status).toBe('REVOKED');

      // Updating a revoked mandate should return 404
      const updateRes = await fetch(`${baseUrl}/api/customer/mandates/MND_ELEC_101`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'x-csrf-token': csrfToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ per_tx_limit_paise: 700000 }),
      });
      expect(updateRes.status).toBe(404);
    });

    it('logs out and invalidates the session token', async () => {
      const logoutRes = await fetch(`${baseUrl}/api/customer/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      });
      expect(logoutRes.status).toBe(200);

      const meRes = await fetch(`${baseUrl}/api/customer/me`, {
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      });
      expect(meRes.status).toBe(401);
    });
  });
});
