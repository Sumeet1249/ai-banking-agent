-- AGENTGUARD AI — Phase 7.2: Banking Multi-Tenancy & Row-Level Security (RLS)
--
-- Enforces strict mathematical tenant isolation across all financial tables.
-- In accordance with banking architecture standards:
--   1. Every query executed against tenant-scoped tables MUST be bound to a tenant
--      via `SET LOCAL app.tenant_id = '<org_id>'` or `SELECT set_config('app.tenant_id', '<org_id>', true)`.
--   2. FORCE ROW LEVEL SECURITY ensures that even table owners and superusers
--      cannot bypass tenant partitioning, preventing cross-tenant data leakage.
--   3. All financial metrics (balances, limits, approval amounts) remain strict integer paise (Rule E1).

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Customers Table (Multi-Tenant) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  customer_ref TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED')),
  pin_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, customer_ref),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(org_id);

-- ── 2. Accounts Table (Multi-Tenant, Integer Paise) ───────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  account_ref TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  customer_ref TEXT NOT NULL,
  balance_paise BIGINT NOT NULL CHECK (balance_paise >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, account_ref),
  FOREIGN KEY (org_id, customer_ref) REFERENCES customers(org_id, customer_ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_accounts_org ON accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_accounts_cust ON accounts(org_id, customer_ref);

-- ── 3. Customer Mandates Table (Multi-Tenant, Version Bumping) ───────────────
CREATE TABLE IF NOT EXISTS mandates (
  mandate_id TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  mandate_version INTEGER NOT NULL DEFAULT 1,
  customer_ref TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  authorized_agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  purpose TEXT NOT NULL,
  allowed_payees JSONB NOT NULL,
  per_tx_limit_paise BIGINT NOT NULL CHECK (per_tx_limit_paise > 0),
  daily_limit_paise BIGINT NOT NULL CHECK (daily_limit_paise >= per_tx_limit_paise),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, mandate_id),
  FOREIGN KEY (org_id, customer_ref) REFERENCES customers(org_id, customer_ref) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, account_ref) REFERENCES accounts(org_id, account_ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_mandates_org ON mandates(org_id);
CREATE INDEX IF NOT EXISTS idx_mandates_cust ON mandates(org_id, customer_ref);
CREATE INDEX IF NOT EXISTS idx_mandates_agent ON mandates(org_id, authorized_agent_id);

-- ── 4. Customer Sessions Table (Multi-Tenant, HttpOnly Cookie Store) ─────────
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
  PRIMARY KEY (org_id, session_id),
  FOREIGN KEY (org_id, customer_ref) REFERENCES customers(org_id, customer_ref) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cust_sessions_org ON customer_sessions(org_id);
CREATE INDEX IF NOT EXISTS idx_cust_sessions_hash ON customer_sessions(token_hash);

-- ── 5. Enterprise OIDC Identities (Multi-Tenant Subject Mapping) ─────────────
CREATE TABLE IF NOT EXISTS customer_idp_identities (
  idp_issuer TEXT NOT NULL,
  idp_subject TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  customer_ref TEXT NOT NULL,
  idp_email TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, idp_issuer, idp_subject),
  FOREIGN KEY (org_id, customer_ref) REFERENCES customers(org_id, customer_ref) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_idp_identities_org ON customer_idp_identities(org_id);
CREATE INDEX IF NOT EXISTS idx_idp_cust ON customer_idp_identities(org_id, customer_ref);

-- ── 6. OIDC Auth States (Multi-Tenant PKCE S256 Verifier Store) ──────────────
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

-- ── 7. WebAuthn Passkey Credentials (Multi-Tenant FIDO2 Store) ───────────────
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  customer_ref TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB,
  aaguid TEXT,
  name TEXT NOT NULL DEFAULT 'My Passkey',
  created_at BIGINT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT,
  PRIMARY KEY (org_id, credential_id),
  FOREIGN KEY (org_id, customer_ref) REFERENCES customers(org_id, customer_ref) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_webauthn_org ON webauthn_credentials(org_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_cust ON webauthn_credentials(org_id, customer_ref);

-- ── 8. WebAuthn Ephemeral Challenges (Multi-Tenant Challenge Nonces) ─────────
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge TEXT NOT NULL,
  org_id TEXT NOT NULL DEFAULT 'org_default',
  customer_ref TEXT NOT NULL,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('REGISTRATION', 'AUTHENTICATION', 'TRANSACTION_APPROVAL')),
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, challenge)
);
CREATE INDEX IF NOT EXISTS idx_webauthn_chal_org ON webauthn_challenges(org_id);

-- ── 9. Transaction-Bound Approvals (Multi-Tenant 7-Field Canonical Digest) ───
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
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  payee_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  invoice_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONSUMED')),
  verified_at BIGINT,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (org_id, approval_id),
  UNIQUE (org_id, request_id),
  FOREIGN KEY (org_id, customer_ref) REFERENCES customers(org_id, customer_ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_approvals_org ON transaction_bound_approvals(org_id);
CREATE INDEX IF NOT EXISTS idx_approvals_req ON transaction_bound_approvals(org_id, request_id);
CREATE INDEX IF NOT EXISTS idx_approvals_cust ON transaction_bound_approvals(org_id, customer_ref);

-- ── 10. Enable & Force Row-Level Security (RLS) ──────────────────────────────
--
-- FORCE ROW LEVEL SECURITY ensures that even table owners and superusers
-- cannot execute cross-tenant queries unless explicitly bypassed or tenant is set.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'customers',
    'accounts',
    'mandates',
    'customer_sessions',
    'customer_idp_identities',
    'oidc_auth_states',
    'webauthn_credentials',
    'webauthn_challenges',
    'transaction_bound_approvals'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
      EXECUTE format(
        'DROP POLICY IF EXISTS tenant_isolation ON %I;
         CREATE POLICY tenant_isolation ON %I
           USING (org_id::text = current_setting(''app.tenant_id'', TRUE))
           WITH CHECK (org_id::text = current_setting(''app.tenant_id'', TRUE));',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;
