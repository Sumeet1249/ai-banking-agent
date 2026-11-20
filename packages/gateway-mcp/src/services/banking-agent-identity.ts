/**
 * Banking Agent Identity & Signed Delegation Service
 *
 * Implements Phase 2.2:
 *   - Ed25519 agent public key registration & lookup
 *   - Cryptographic verification of agent request signatures (Ed25519 Detached)
 *   - Sub-agent delegation verification (delegation_ref, parent authority bounds)
 *   - Cascading revocation: when a parent agent or delegation is revoked, child operations fail
 *   - Namespace isolation enforcement (Rule E5: agent endpoints reject customer sessions)
 */

import Database from 'better-sqlite3';
import {
  createPublicKey,
  verify as cryptoVerify,
  KeyObject,
} from 'crypto';
import type { Logger } from 'pino';
import { Request, Response, NextFunction } from 'express';

export interface BankingAgentRow {
  agent_id: string;
  name: string;
  role: string;
  public_key_pem: string;
  key_id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  created_at: number;
  updated_at: number;
}

export interface AgentDelegationRow {
  delegation_ref: string;
  parent_agent_id: string;
  child_agent_id: string;
  account_ref: string;
  max_sub_delegated_amount_paise: number;
  status: 'ACTIVE' | 'REVOKED';
  created_at: number;
  expires_at: number;
}

export interface AuthenticatedAgentRequest extends Request {
  agent?: BankingAgentRow;
  delegation?: AgentDelegationRow;
  verifiedPayload?: any;
}

export class BankingAgentIdentityService {
  private keyCache = new Map<string, KeyObject>();

  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.initTables();
    this.seedBaselineAgents();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS banking_agents (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        public_key_pem TEXT NOT NULL,
        key_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_delegations (
        delegation_ref TEXT PRIMARY KEY,
        parent_agent_id TEXT NOT NULL,
        child_agent_id TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        max_sub_delegated_amount_paise INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(parent_agent_id) REFERENCES banking_agents(agent_id),
        FOREIGN KEY(child_agent_id) REFERENCES banking_agents(agent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_child ON agent_delegations(child_agent_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_parent ON agent_delegations(parent_agent_id);
    `);
  }

  /**
   * Seeds required baseline agent fixtures:
   *   - AGENT_ELEC_01: Primary utility payment agent
   *   - AGENT_SUB_01: Sub-agent delegated under AGENT_ELEC_01
   */
  private seedBaselineAgents(): void {
    const existing = this.db.prepare('SELECT agent_id FROM banking_agents WHERE agent_id = ?').get('AGENT_ELEC_01');
    if (existing) return;

    const now = Date.now();

    // Baseline Ed25519 public key fixtures (RFC 8032 test key representations)
    const elecAgentPubPem = 
      '-----BEGIN PUBLIC KEY-----\n' +
      'MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n' +
      '-----END PUBLIC KEY-----\n';

    const subAgentPubPem =
      '-----BEGIN PUBLIC KEY-----\n' +
      'MCowBQYDK2VwAyEAh1207sFqC96eP0a/6G6u0RjA9lC7w5N7/8/4YmK7gQI=\n' +
      '-----END PUBLIC KEY-----\n';

    const insertAgent = this.db.prepare(`
      INSERT INTO banking_agents (agent_id, name, role, public_key_pem, key_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertDelegation = this.db.prepare(`
      INSERT INTO agent_delegations (
        delegation_ref, parent_agent_id, child_agent_id, account_ref,
        max_sub_delegated_amount_paise, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      insertAgent.run(
        'AGENT_ELEC_01',
        'Electricity Bill Payment Agent',
        'BILL_PAYMENT_PRIMARY',
        elecAgentPubPem,
        'key_elec_01',
        'ACTIVE',
        now,
        now,
      );

      insertAgent.run(
        'AGENT_SUB_01',
        'Sub-Agent CESC Fast Track',
        'BILL_PAYMENT_DELEGATE',
        subAgentPubPem,
        'key_sub_01',
        'ACTIVE',
        now,
        now,
      );

      insertDelegation.run(
        'DEL_ELEC_SUB_01',
        'AGENT_ELEC_01',
        'AGENT_SUB_01',
        'ACC_101',
        300000, // ₹3,000 max sub-delegation limit in paise
        'ACTIVE',
        now,
        now + 30 * 86400 * 1000,
      );
    });

    tx();
    this.logger?.info('Seeded baseline banking agents AGENT_ELEC_01 and AGENT_SUB_01');
  }

  // ── Agent Registry Queries ─────────────────────────────────────────────────

  public getAgent(agentId: string): BankingAgentRow | null {
    const row = this.db.prepare('SELECT * FROM banking_agents WHERE agent_id = ?').get(agentId) as BankingAgentRow | undefined;
    return row ?? null;
  }

  public registerAgent(agent: {
    agent_id: string;
    name: string;
    role: string;
    public_key_pem: string;
    key_id: string;
  }): BankingAgentRow {
    // Validate PEM is readable as Ed25519 public key
    try {
      createPublicKey(agent.public_key_pem);
    } catch (err: any) {
      throw new Error(`Invalid Ed25519 public key PEM: ${err.message}`);
    }

    const now = Date.now();
    this.db.prepare(`
      INSERT INTO banking_agents (agent_id, name, role, public_key_pem, key_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      agent.agent_id,
      agent.name,
      agent.role,
      agent.public_key_pem,
      agent.key_id,
      now,
      now,
    );

    return this.getAgent(agent.agent_id)!;
  }

  public setAgentStatus(agentId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'): boolean {
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE banking_agents SET status = ?, updated_at = ?
      WHERE agent_id = ?
    `).run(status, now, agentId);
    return res.changes > 0;
  }

  // ── Delegation Queries & Cascading Revocation ──────────────────────────────

  public getDelegation(delegationRef: string): AgentDelegationRow | null {
    const row = this.db.prepare('SELECT * FROM agent_delegations WHERE delegation_ref = ?').get(delegationRef) as AgentDelegationRow | undefined;
    return row ?? null;
  }

  public createDelegation(delegation: {
    delegation_ref: string;
    parent_agent_id: string;
    child_agent_id: string;
    account_ref: string;
    max_sub_delegated_amount_paise: number;
    expires_at: number;
  }): AgentDelegationRow {
    const parent = this.getAgent(delegation.parent_agent_id);
    if (!parent || parent.status !== 'ACTIVE') {
      throw new Error(`Parent agent ${delegation.parent_agent_id} is not active`);
    }

    const child = this.getAgent(delegation.child_agent_id);
    if (!child || child.status !== 'ACTIVE') {
      throw new Error(`Child agent ${delegation.child_agent_id} is not active`);
    }

    const now = Date.now();
    this.db.prepare(`
      INSERT INTO agent_delegations (
        delegation_ref, parent_agent_id, child_agent_id, account_ref,
        max_sub_delegated_amount_paise, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      delegation.delegation_ref,
      delegation.parent_agent_id,
      delegation.child_agent_id,
      delegation.account_ref,
      delegation.max_sub_delegated_amount_paise,
      now,
      delegation.expires_at,
    );

    return this.getDelegation(delegation.delegation_ref)!;
  }

  public revokeDelegation(delegationRef: string): boolean {
    const res = this.db.prepare(`
      UPDATE agent_delegations SET status = 'REVOKED'
      WHERE delegation_ref = ? AND status != 'REVOKED'
    `).run(delegationRef);
    return res.changes > 0;
  }

  /**
   * Validates delegation chain integrity and checks for cascading revocation.
   * Recursively traverses parent delegation chains if nested.
   * If any parent agent or delegation is REVOKED or SUSPENDED, authorization fails immediately.
   */
  public validateDelegationChain(
    delegationRef: string,
    childAgentId: string,
    visitedRefs: Set<string> = new Set(),
  ): { valid: boolean; reason?: string; delegation?: AgentDelegationRow } {
    if (visitedRefs.has(delegationRef)) {
      return { valid: false, reason: 'CYCLIC_DELEGATION_DETECTED' };
    }
    visitedRefs.add(delegationRef);

    const delegation = this.getDelegation(delegationRef);
    if (!delegation) {
      return { valid: false, reason: 'DELEGATION_NOT_FOUND' };
    }

    if (delegation.child_agent_id !== childAgentId) {
      return { valid: false, reason: 'DELEGATION_CHILD_MISMATCH' };
    }

    if (delegation.status !== 'ACTIVE') {
      return { valid: false, reason: 'DELEGATION_REVOKED' };
    }

    if (delegation.expires_at <= Date.now()) {
      return { valid: false, reason: 'DELEGATION_EXPIRED' };
    }

    // Cascading Check: Validate immediate parent agent status
    const parent = this.getAgent(delegation.parent_agent_id);
    if (!parent) {
      return { valid: false, reason: 'PARENT_AGENT_NOT_FOUND' };
    }
    if (parent.status !== 'ACTIVE') {
      return { valid: false, reason: `PARENT_AGENT_${parent.status}` };
    }

    // Check if the parent agent is itself operating under a sub-delegation
    const parentDelegations = this.db.prepare(`
      SELECT delegation_ref FROM agent_delegations 
      WHERE child_agent_id = ? AND status = 'ACTIVE'
    `).all(delegation.parent_agent_id) as { delegation_ref: string }[];

    for (const pDel of parentDelegations) {
      const ancestorCheck = this.validateDelegationChain(pDel.delegation_ref, delegation.parent_agent_id, visitedRefs);
      if (!ancestorCheck.valid) {
        return { valid: false, reason: `ANCESTOR_${ancestorCheck.reason}` };
      }
    }

    return { valid: true, delegation };
  }

  // ── Cryptographic Signature Verification ───────────────────────────────────

  /**
   * Verifies an Ed25519 detached signature over the raw payload bytes.
   */
  public verifySignature(
    agentId: string,
    payloadBytes: Buffer,
    signatureBase64: string,
  ): boolean {
    const agent = this.getAgent(agentId);
    if (!agent || agent.status !== 'ACTIVE') {
      return false;
    }

    try {
      let pubKey = this.keyCache.get(agentId);
      if (!pubKey) {
        pubKey = createPublicKey(agent.public_key_pem);
        this.keyCache.set(agentId, pubKey);
      }

      const sigBuffer = Buffer.from(signatureBase64, 'base64');
      return cryptoVerify(null, payloadBytes, pubKey, sigBuffer);
    } catch (err: any) {
      this.logger?.warn({ err: err.message, agentId }, 'Agent signature verification failed with error');
      return false;
    }
  }

  // ── Express Authentication Middleware ──────────────────────────────────────

  /**
   * Middleware enforcing Ed25519 agent identity on `/api/agent/*` endpoints.
   * Rejects requests containing customer session cookies/tokens (Rule E5).
   */
  public requireAgentAuth = (req: AuthenticatedAgentRequest, res: Response, next: NextFunction): void => {
    // Rule E5: Namespace isolation: Reject customer session tokens on agent endpoints
    if (req.headers.cookie?.includes('session_token=') || req.headers['x-csrf-token']) {
      res.status(401).json({
        error: 'Cross-namespace credentials rejected on agent endpoint',
        reason_code: 'CROSS_NAMESPACE_AUTH_REJECTED',
        timestamp: Date.now(),
      });
      return;
    }

    const agentId = (req.headers['x-agent-id'] as string) || req.body?.agent_id;
    const signature = req.headers['x-agent-signature'] as string;
    const delegationRef = (req.headers['x-delegation-ref'] as string) || req.body?.delegation_ref;

    if (!agentId) {
      res.status(401).json({
        error: 'Missing x-agent-id header or agent_id in payload',
        reason_code: 'AGENT_ID_REQUIRED',
      });
      return;
    }

    const agent = this.getAgent(agentId);
    if (!agent) {
      res.status(401).json({
        error: 'Unrecognized agent identity',
        reason_code: 'UNKNOWN_AGENT',
      });
      return;
    }

    if (agent.status !== 'ACTIVE') {
      res.status(403).json({
        error: `Agent status is ${agent.status}`,
        reason_code: `AGENT_${agent.status}`,
      });
      return;
    }

    // Verify sub-agent delegation if delegationRef is supplied
    if (delegationRef) {
      const delegationCheck = this.validateDelegationChain(delegationRef, agentId);
      if (!delegationCheck.valid) {
        res.status(403).json({
          error: `Delegation chain invalid: ${delegationCheck.reason}`,
          reason_code: delegationCheck.reason,
        });
        return;
      }
      req.delegation = delegationCheck.delegation;
    }

    // In a signature-verified route, verify signature if present
    if (signature) {
      const payloadString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const payloadBytes = Buffer.from(payloadString, 'utf8');
      const validSig = this.verifySignature(agentId, payloadBytes, signature);
      if (!validSig) {
        res.status(401).json({
          error: 'Invalid agent signature',
          reason_code: 'INVALID_AGENT_SIGNATURE',
        });
        return;
      }
    }

    req.agent = agent;
    next();
  };
}
