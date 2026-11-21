/**
 * AgentGuard Trust Durable Database Store (Phase TI-2 to TI-6)
 * SQLite WAL-mode transactional persistence for Agent Identities, Delegations,
 * Replay Nonces, Anomaly Baselines, and Forensic Incident Records.
 */

import Database from 'better-sqlite3';
import { Logger } from 'pino';
import {
  AgentTrustIdentity,
  AgentCredential,
  AgentDelegation,
  CustomerIntent,
  TrustEvaluationDecision,
  ForensicIncidentRecord,
} from '@agentguard/core-schema';

export class TrustDataStore {
  private db: Database.Database;

  constructor(dbOrPath: Database.Database | string, private logger?: Logger) {
    if (typeof dbOrPath === 'string') {
      this.db = new Database(dbOrPath);
    } else {
      this.db = dbOrPath;
    }
    this.init();
    this.seedBaselineSecurityFixtures();
  }

  public init(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_identities (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        owner_ref TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        public_key_ed25519 TEXT NOT NULL,
        key_id TEXT NOT NULL,
        parent_agent_id TEXT,
        trust_score INTEGER NOT NULL DEFAULT 800,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        version TEXT NOT NULL DEFAULT '1.0.0',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        quarantine_reason TEXT,
        quarantined_at INTEGER,
        quarantined_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ai_tenant ON agent_identities(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_ai_status ON agent_identities(status);

      CREATE TABLE IF NOT EXISTS agent_credentials (
        credential_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        key_id TEXT NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'Ed25519',
        public_key TEXT NOT NULL,
        valid_from INTEGER NOT NULL,
        valid_to INTEGER NOT NULL,
        revoked_at INTEGER,
        revocation_reason TEXT,
        rotation_history TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (agent_id) REFERENCES agent_identities(agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ac_agent ON agent_credentials(agent_id);
      CREATE INDEX IF NOT EXISTS idx_ac_key ON agent_credentials(key_id);

      CREATE TABLE IF NOT EXISTS agent_delegations (
        delegation_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        parent_delegation_id TEXT,
        allowed_tools TEXT NOT NULL,
        allowed_resources TEXT NOT NULL,
        permitted_actions TEXT NOT NULL,
        purpose TEXT NOT NULL,
        max_amount_paise INTEGER,
        daily_max_paise INTEGER,
        delegation_depth INTEGER NOT NULL DEFAULT 0,
        max_delegation_depth INTEGER NOT NULL DEFAULT 2,
        usage_quota INTEGER NOT NULL DEFAULT 100,
        usage_count INTEGER NOT NULL DEFAULT 0,
        valid_from INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        revoked_at INTEGER,
        revoked_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ad_agent ON agent_delegations(agent_id);
      CREATE INDEX IF NOT EXISTS idx_ad_status ON agent_delegations(status);

      CREATE TABLE IF NOT EXISTS customer_intents (
        intent_id TEXT PRIMARY KEY,
        customer_ref TEXT NOT NULL,
        objective TEXT NOT NULL,
        approved_payees TEXT NOT NULL DEFAULT '[]',
        max_authorized_amount_paise INTEGER,
        approved_account_ref TEXT,
        authorized_tools TEXT NOT NULL DEFAULT '[]',
        valid_from INTEGER NOT NULL,
        valid_until INTEGER NOT NULL,
        context_metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_ci_cust ON customer_intents(customer_ref);

      CREATE TABLE IF NOT EXISTS trust_decisions (
        decision_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        verdict TEXT NOT NULL,
        action_response TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        violation_summary TEXT NOT NULL,
        risk_score REAL NOT NULL,
        observed_features TEXT NOT NULL,
        evidence_references TEXT NOT NULL DEFAULT '[]',
        evaluated_at INTEGER NOT NULL,
        evaluator_version TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_td_agent ON trust_decisions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_td_time ON trust_decisions(evaluated_at DESC);

      CREATE TABLE IF NOT EXISTS forensic_incidents (
        incident_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        trigger_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        root_cause_analysis TEXT NOT NULL,
        containment_action TEXT NOT NULL,
        event_chain_hashes TEXT NOT NULL,
        witness_checkpoint_ref TEXT,
        evidence_pack TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        resolved_at INTEGER,
        resolved_by TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_fi_tenant ON forensic_incidents(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_fi_status ON forensic_incidents(status);

      CREATE TABLE IF NOT EXISTS agent_nonces (
        nonce TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        PRIMARY KEY (nonce, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_an_time ON agent_nonces(timestamp_ms);

      CREATE TABLE IF NOT EXISTS agent_behaviour_baselines (
        agent_id TEXT PRIMARY KEY,
        sample_count INTEGER NOT NULL DEFAULT 0,
        rolling_mean_rate REAL NOT NULL DEFAULT 0.0,
        rolling_var_rate REAL NOT NULL DEFAULT 0.0,
        last_call_timestamp INTEGER NOT NULL DEFAULT 0,
        consecutive_denials INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // ── AGENT IDENTITY ────────────────────────────────────────────────────────

  public saveAgentIdentity(agent: AgentTrustIdentity): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_identities (
        agent_id, name, role, owner_ref, tenant_id, public_key_ed25519, key_id,
        parent_agent_id, trust_score, status, version, created_at, updated_at,
        quarantine_reason, quarantined_at, quarantined_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agent.agent_id,
      agent.name,
      agent.role,
      agent.owner_ref,
      agent.tenant_id,
      agent.public_key_ed25519,
      agent.key_id,
      agent.parent_agent_id || null,
      agent.trust_score,
      agent.status,
      agent.version,
      agent.created_at,
      agent.updated_at,
      agent.quarantine_reason || null,
      agent.quarantined_at || null,
      agent.quarantined_by || null,
    );
  }

  public getAgentIdentity(agentId: string): AgentTrustIdentity | null {
    const row = this.db.prepare('SELECT * FROM agent_identities WHERE agent_id = ? LIMIT 1').get(agentId) as any;
    if (!row) return null;
    return {
      agent_id: row.agent_id,
      name: row.name,
      role: row.role,
      owner_ref: row.owner_ref,
      tenant_id: row.tenant_id,
      public_key_ed25519: row.public_key_ed25519,
      key_id: row.key_id,
      parent_agent_id: row.parent_agent_id,
      trust_score: row.trust_score,
      status: row.status,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      quarantine_reason: row.quarantine_reason,
      quarantined_at: row.quarantined_at,
      quarantined_by: row.quarantined_by,
    };
  }

  public listAgentIdentities(tenantId?: string): AgentTrustIdentity[] {
    let sql = 'SELECT * FROM agent_identities';
    const params: any[] = [];
    if (tenantId) {
      sql += ' WHERE tenant_id = ?';
      params.push(tenantId);
    }
    sql += ' ORDER BY created_at DESC';
    return (this.db.prepare(sql).all(...params) as any[]).map((r) => ({
      ...r,
      parent_agent_id: r.parent_agent_id || null,
    }));
  }

  public updateAgentStatus(
    agentId: string,
    status: 'ACTIVE' | 'RESTRICTED' | 'QUARANTINED' | 'REVOKED',
    reason?: string,
    operatorRef?: string
  ): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE agent_identities SET
        status = ?,
        updated_at = ?,
        quarantine_reason = ?,
        quarantined_at = ?,
        quarantined_by = ?
      WHERE agent_id = ?
    `).run(
      status,
      now,
      reason || null,
      status === 'QUARANTINED' ? now : null,
      operatorRef || null,
      agentId,
    );
  }

  // ── CREDENTIALS ───────────────────────────────────────────────────────────

  public saveCredential(cred: AgentCredential): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_credentials (
        credential_id, agent_id, key_id, algorithm, public_key,
        valid_from, valid_to, revoked_at, revocation_reason, rotation_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cred.credential_id,
      cred.agent_id,
      cred.key_id,
      cred.algorithm,
      cred.public_key,
      cred.valid_from,
      cred.valid_to,
      cred.revoked_at || null,
      cred.revocation_reason || null,
      JSON.stringify(cred.rotation_history || []),
    );
  }

  public getCredential(keyId: string): AgentCredential | null {
    const row = this.db.prepare('SELECT * FROM agent_credentials WHERE key_id = ? LIMIT 1').get(keyId) as any;
    if (!row) return null;
    return {
      credential_id: row.credential_id,
      agent_id: row.agent_id,
      key_id: row.key_id,
      algorithm: row.algorithm,
      public_key: row.public_key,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      revoked_at: row.revoked_at,
      revocation_reason: row.revocation_reason,
      rotation_history: JSON.parse(row.rotation_history || '[]'),
    };
  }

  public revokeCredential(keyId: string, reason: string): void {
    this.db.prepare(`
      UPDATE agent_credentials SET revoked_at = ?, revocation_reason = ? WHERE key_id = ?
    `).run(Date.now(), reason, keyId);
  }

  // ── NONCE & REPLAY PROTECTION ─────────────────────────────────────────────

  public recordNonceAtomic(nonce: string, agentId: string, timestampMs: number): boolean {
    try {
      this.db.prepare(`
        INSERT INTO agent_nonces (nonce, agent_id, timestamp_ms) VALUES (?, ?, ?)
      `).run(nonce, agentId, timestampMs);
      return true;
    } catch {
      return false; // Constraint violation = duplicate nonce replay attack
    }
  }

  // ── DELEGATIONS ───────────────────────────────────────────────────────────

  public saveDelegation(del: AgentDelegation): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_delegations (
        delegation_id, tenant_id, customer_ref, agent_id, parent_delegation_id,
        allowed_tools, allowed_resources, permitted_actions, purpose,
        max_amount_paise, daily_max_paise, delegation_depth, max_delegation_depth,
        usage_quota, usage_count, valid_from, expires_at, status, revoked_at, revoked_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      del.delegation_id,
      del.tenant_id,
      del.customer_ref,
      del.agent_id,
      del.parent_delegation_id || null,
      JSON.stringify(del.allowed_tools),
      JSON.stringify(del.allowed_resources),
      JSON.stringify(del.permitted_actions),
      del.purpose,
      del.max_amount_paise ?? null,
      del.daily_max_paise ?? null,
      del.delegation_depth,
      del.max_delegation_depth,
      del.usage_quota,
      del.usage_count,
      del.valid_from,
      del.expires_at,
      del.status,
      del.revoked_at || null,
      del.revoked_by || null,
    );
  }

  public getDelegation(delegationId: string): AgentDelegation | null {
    const row = this.db.prepare('SELECT * FROM agent_delegations WHERE delegation_id = ? LIMIT 1').get(delegationId) as any;
    if (!row) return null;
    return {
      delegation_id: row.delegation_id,
      tenant_id: row.tenant_id,
      customer_ref: row.customer_ref,
      agent_id: row.agent_id,
      parent_delegation_id: row.parent_delegation_id,
      allowed_tools: JSON.parse(row.allowed_tools || '[]'),
      allowed_resources: JSON.parse(row.allowed_resources || '[]'),
      permitted_actions: JSON.parse(row.permitted_actions || '[]'),
      purpose: row.purpose,
      max_amount_paise: row.max_amount_paise,
      daily_max_paise: row.daily_max_paise,
      delegation_depth: row.delegation_depth,
      max_delegation_depth: row.max_delegation_depth,
      usage_quota: row.usage_quota,
      usage_count: row.usage_count,
      valid_from: row.valid_from,
      expires_at: row.expires_at,
      status: row.status,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
    };
  }

  public listDelegations(tenantId?: string): AgentDelegation[] {
    let sql = 'SELECT * FROM agent_delegations';
    const params: any[] = [];
    if (tenantId) {
      sql += ' WHERE tenant_id = ?';
      params.push(tenantId);
    }
    sql += ' ORDER BY valid_from DESC';
    return (this.db.prepare(sql).all(...params) as any[]).map((r) => ({
      ...r,
      allowed_tools: JSON.parse(r.allowed_tools || '[]'),
      allowed_resources: JSON.parse(r.allowed_resources || '[]'),
      permitted_actions: JSON.parse(r.permitted_actions || '[]'),
    }));
  }

  public revokeDelegation(delegationId: string, operatorRef: string): void {
    const now = Date.now();
    this.db.transaction(() => {
      // 1. Revoke targeted delegation
      this.db.prepare(`
        UPDATE agent_delegations SET status = 'REVOKED', revoked_at = ?, revoked_by = ? WHERE delegation_id = ?
      `).run(now, operatorRef, delegationId);

      // 2. Cascading revocation to all child delegations (Rule I7 / TI-3)
      this.db.prepare(`
        UPDATE agent_delegations SET status = 'REVOKED', revoked_at = ?, revoked_by = ? WHERE parent_delegation_id = ?
      `).run(now, `CASCADED_FROM_${delegationId}`, delegationId);
    })();
  }

  public incrementDelegationUsage(delegationId: string): void {
    this.db.prepare(`
      UPDATE agent_delegations SET usage_count = usage_count + 1 WHERE delegation_id = ?
    `).run(delegationId);
  }

  // ── CUSTOMER INTENTS ──────────────────────────────────────────────────────

  public saveCustomerIntent(intent: CustomerIntent): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO customer_intents (
        intent_id, customer_ref, objective, approved_payees,
        max_authorized_amount_paise, approved_account_ref, authorized_tools,
        valid_from, valid_until, context_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      intent.intent_id,
      intent.customer_ref,
      intent.objective,
      JSON.stringify(intent.approved_payees || []),
      intent.max_authorized_amount_paise ?? null,
      intent.approved_account_ref || null,
      JSON.stringify(intent.authorized_tools || []),
      intent.valid_from,
      intent.valid_until,
      JSON.stringify(intent.context_metadata || {}),
    );
  }

  public getCustomerIntent(intentId: string): CustomerIntent | null {
    const row = this.db.prepare('SELECT * FROM customer_intents WHERE intent_id = ? LIMIT 1').get(intentId) as any;
    if (!row) return null;
    return {
      intent_id: row.intent_id,
      customer_ref: row.customer_ref,
      objective: row.objective,
      approved_payees: JSON.parse(row.approved_payees || '[]'),
      max_authorized_amount_paise: row.max_authorized_amount_paise,
      approved_account_ref: row.approved_account_ref,
      authorized_tools: JSON.parse(row.authorized_tools || '[]'),
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      context_metadata: JSON.parse(row.context_metadata || '{}'),
    };
  }

  // ── TRUST DECISIONS ───────────────────────────────────────────────────────

  public recordDecision(dec: TrustEvaluationDecision): void {
    this.db.prepare(`
      INSERT INTO trust_decisions (
        decision_id, request_id, agent_id, tenant_id, verdict,
        action_response, reason_code, violation_summary, risk_score,
        observed_features, evidence_references, evaluated_at, evaluator_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dec.decision_id,
      dec.request_id,
      dec.agent_id,
      dec.tenant_id,
      dec.verdict,
      dec.action_response,
      dec.reason_code,
      dec.violation_summary,
      dec.risk_score,
      JSON.stringify(dec.observed_features),
      JSON.stringify(dec.evidence_references),
      dec.evaluated_at,
      dec.evaluator_version,
    );
  }

  public listDecisions(limit = 50): TrustEvaluationDecision[] {
    const rows = this.db.prepare('SELECT * FROM trust_decisions ORDER BY evaluated_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => ({
      ...r,
      observed_features: JSON.parse(r.observed_features || '{}'),
      evidence_references: JSON.parse(r.evidence_references || '[]'),
    }));
  }

  // ── FORENSIC INCIDENTS ────────────────────────────────────────────────────

  public saveIncident(inc: ForensicIncidentRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO forensic_incidents (
        incident_id, tenant_id, agent_id, session_id, severity, status,
        trigger_type, summary, root_cause_analysis, containment_action,
        event_chain_hashes, witness_checkpoint_ref, evidence_pack,
        detected_at, resolved_at, resolved_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inc.incident_id,
      inc.tenant_id,
      inc.agent_id,
      inc.session_id,
      inc.severity,
      inc.status,
      inc.trigger_type,
      inc.summary,
      inc.root_cause_analysis,
      inc.containment_action,
      JSON.stringify(inc.event_chain_hashes),
      inc.witness_checkpoint_ref || null,
      JSON.stringify(inc.evidence_pack),
      inc.detected_at,
      inc.resolved_at || null,
      inc.resolved_by || null,
    );
  }

  public getIncident(incidentId: string): ForensicIncidentRecord | null {
    const row = this.db.prepare('SELECT * FROM forensic_incidents WHERE incident_id = ? LIMIT 1').get(incidentId) as any;
    if (!row) return null;
    return {
      incident_id: row.incident_id,
      tenant_id: row.tenant_id,
      agent_id: row.agent_id,
      session_id: row.session_id,
      severity: row.severity,
      status: row.status,
      trigger_type: row.trigger_type,
      summary: row.summary,
      root_cause_analysis: row.root_cause_analysis,
      containment_action: row.containment_action,
      event_chain_hashes: JSON.parse(row.event_chain_hashes || '[]'),
      witness_checkpoint_ref: row.witness_checkpoint_ref,
      evidence_pack: JSON.parse(row.evidence_pack || '{}'),
      detected_at: row.detected_at,
      resolved_at: row.resolved_at,
      resolved_by: row.resolved_by,
    };
  }

  public listIncidents(limit = 50): ForensicIncidentRecord[] {
    const rows = this.db.prepare('SELECT * FROM forensic_incidents ORDER BY detected_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r) => ({
      ...r,
      event_chain_hashes: JSON.parse(r.event_chain_hashes || '[]'),
      evidence_pack: JSON.parse(r.evidence_pack || '{}'),
    }));
  }

  // ── BEHAVIOUR BASELINES ───────────────────────────────────────────────────

  public getBaseline(agentId: string): {
    sampleCount: number;
    rollingMeanRate: number;
    rollingVarRate: number;
    lastCallTimestamp: number;
    consecutiveDenials: number;
  } | null {
    const row = this.db.prepare('SELECT * FROM agent_behaviour_baselines WHERE agent_id = ?').get(agentId) as any;
    if (!row) return null;
    return {
      sampleCount: row.sample_count,
      rollingMeanRate: row.rolling_mean_rate,
      rollingVarRate: row.rolling_var_rate,
      lastCallTimestamp: row.last_call_timestamp,
      consecutiveDenials: row.consecutive_denials,
    };
  }

  public updateBaseline(
    agentId: string,
    sampleCount: number,
    mean: number,
    variance: number,
    lastCallTs: number,
    consecutiveDenials: number
  ): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_behaviour_baselines (
        agent_id, sample_count, rolling_mean_rate, rolling_var_rate,
        last_call_timestamp, consecutive_denials, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(agentId, sampleCount, mean, variance, lastCallTs, consecutiveDenials, Date.now());
  }

  // ── BASELINE FIXTURES ─────────────────────────────────────────────────────

  private seedBaselineSecurityFixtures(): void {
    const count = (this.db.prepare('SELECT count(*) as c FROM agent_identities').get() as any)?.c || 0;
    if (count > 0) return;

    const now = Date.now();

    // 1. Primary Utility Agent
    this.saveAgentIdentity({
      agent_id: 'AGENT_ELEC_01',
      name: 'Electricity Utility Assistant',
      role: 'BILL_PAYMENT_AGENT',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      key_id: 'key-elec-01',
      trust_score: 920,
      status: 'ACTIVE',
      version: '1.2.0',
      created_at: now - 86400000 * 30,
      updated_at: now,
    });

    // 2. Sub-agent Bill Verifier
    this.saveAgentIdentity({
      agent_id: 'AGENT_BILL_VERIFY_01',
      name: 'Invoice Verification Sub-agent',
      role: 'SUB_AGENT_VERIFIER',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      key_id: 'key-verify-01',
      parent_agent_id: 'AGENT_ELEC_01',
      trust_score: 850,
      status: 'ACTIVE',
      version: '1.0.0',
      created_at: now - 86400000 * 15,
      updated_at: now,
    });

    // 3. Quarantined Rogue Agent (for Threat Response & Quarantine testing)
    this.saveAgentIdentity({
      agent_id: 'AGENT_ROGUE_TEST_99',
      name: 'Compromised Travel Agent',
      role: 'TRAVEL_BOOKING_AGENT',
      owner_ref: 'CUST_101',
      tenant_id: 'tenant-default',
      public_key_ed25519: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      key_id: 'key-rogue-99',
      trust_score: 220,
      status: 'QUARANTINED',
      version: '1.0.1',
      created_at: now - 86400000 * 5,
      updated_at: now,
      quarantine_reason: 'Automated Circuit Breaker: 3 consecutive prompt-injection payee diversion attempts.',
      quarantined_at: now - 3600000 * 2,
      quarantined_by: 'TI_AUTONOMOUS_CIRCUIT_BREAKER',
    });

    // Baseline Delegations
    this.saveDelegation({
      delegation_id: 'DEL_ELEC_101',
      tenant_id: 'tenant-default',
      customer_ref: 'CUST_101',
      agent_id: 'AGENT_ELEC_01',
      allowed_tools: ['bank.pay_bill', 'bank.check_balance', 'bank.verify_invoice'],
      allowed_resources: ['ACC_101', 'PAYEE_CESC_001', 'PAYEE_TATA_POWER_001'],
      permitted_actions: ['bill_payment', 'inquiry'],
      purpose: 'Monthly electricity bill payment under customer mandate MND_ELEC_101',
      max_amount_paise: 500000, // ₹5,000 per transaction
      daily_max_paise: 800000, // ₹8,000 daily
      delegation_depth: 0,
      max_delegation_depth: 1,
      usage_quota: 200,
      usage_count: 14,
      valid_from: now - 86400000 * 30,
      expires_at: now + 86400000 * 60,
      status: 'ACTIVE',
    });
  }

  public getDb(): Database.Database {
    return this.db;
  }

  public close(): void {
    this.db.close();
  }

  public getAgent(agentId: string): AgentTrustIdentity | null {
    return this.getAgentIdentity(agentId);
  }

  public insertAgent(agent: AgentTrustIdentity): void {
    this.saveAgentIdentity(agent);
  }

  public insertDelegation(delegation: AgentDelegation): void {
    this.saveDelegation(delegation);
  }

  public getIntent(intentId: string): CustomerIntent | null {
    return this.getCustomerIntent(intentId);
  }

  public insertIntent(intent: CustomerIntent): void {
    this.saveCustomerIntent(intent);
  }

  public insertSnapshot(snapshot: { agent_id: string; session_id: string; features: Record<string, unknown> }): void {
    // no-op or record in baseline
  }

  public logAudit(entry: { event_type: string; entity_id: string; entity_type: string; details: Record<string, unknown> }): void {
    // audit log tracking
  }
}

export { TrustDataStore as TrustStore };

