/**
 * Permit & Nonce Engine (Phase 2.3.1 Corrected)
 *
 * Implements:
 *   - Gateway Ed25519 signing keypair management for TBP permits (Invariant I1)
 *   - Single-use UUIDv4 Nonce issuance and tracking (T06 Replay Protection)
 *   - 22-field Transaction-Bound Permit (TBP) minting with 7-field canonical transaction digest
 *   - 90-second Permit Expiry (CONTRACTS.md & BANKING-ARCHITECTURE.md)
 *   - Authoritative financial budget reservations are DEFERRED to Bank Gate (:4000)
 *     and Ledger Adapter (:4001). Gateway only issues an advisory reservation_id placeholder.
 *   - Express handler for POST /api/agent/evaluate
 */

import Database from 'better-sqlite3';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  KeyObject,
  randomUUID,
} from 'crypto';
import type { Logger } from 'pino';
import {
  CanonicalTransaction,
  computeCanonicalTransactionDigest,
  TransactionBoundPermitPayload,
  TransactionBoundPermitPayloadSchema,
  PermitEnvelope,
  PermitEnvelopeSchema,
  canonicalJson,
  KeyMetadata,
  KeyRotationEvent,
  KeyRevocationEvent,
} from '@agentguard/core-schema';
import { BankingStores } from '../db/banking-stores';
import { BankingAgentIdentityService } from './banking-agent-identity';
import { BankingAnomalyDetector } from '../detectors/banking-anomaly-detector';
import { SoftwareKmsProvider } from '../crypto/kms-provider';

export interface NonceRow {
  nonce: string;
  agent_id: string;
  issued_at: number;
  status: 'ISSUED' | 'CONSUMED';
  consumed_at: number | null;
}

export class PermitEngineService {
  private gatewayPrivateKey!: KeyObject;
  private gatewayPublicKey!: KeyObject;
  private gatewayPublicKeyPem!: string;
  private gatewayKeyId!: string;
  private anomalyDetector: BankingAnomalyDetector;
  private kms: SoftwareKmsProvider;
  private isRotatingKey: boolean = false;

  constructor(
    private db: Database.Database,
    private stores: BankingStores,
    private agentIdentity: BankingAgentIdentityService,
    private logger?: Logger,
    kms?: SoftwareKmsProvider,
  ) {
    this.anomalyDetector = new BankingAnomalyDetector();
    this.kms = kms ?? new SoftwareKmsProvider(this.logger);
    this.initTables();
    this.initSigningKey();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gateway_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permit_nonces (
        nonce TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED',
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_nonces_agent ON permit_nonces(agent_id);

      CREATE TABLE IF NOT EXISTS issued_permits (
        permit_id TEXT PRIMARY KEY,
        nonce TEXT NOT NULL UNIQUE,
        reservation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        mandate_id TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED'
      );
    `);
  }

  /**
   * Initializes or loads the Gateway's Ed25519 signing keypair from database and registers with KMS.
   */
  private initSigningKey(): void {
    const row = this.db.prepare("SELECT value FROM gateway_config WHERE key = 'banking_gateway_private_key'").get() as { value: string } | undefined;

    if (row?.value) {
      this.gatewayPrivateKey = createPrivateKey(row.value);
      const pubRow = this.db.prepare("SELECT value FROM gateway_config WHERE key = 'banking_gateway_public_key'").get() as { value: string };
      const keyIdRow = this.db.prepare("SELECT value FROM gateway_config WHERE key = 'banking_gateway_key_id'").get() as { value: string };
      this.gatewayPublicKeyPem = pubRow.value;
      this.gatewayPublicKey = createPublicKey(pubRow.value);
      this.gatewayKeyId = keyIdRow.value;

      this.kms.registerKey({
        keyId: this.gatewayKeyId,
        privateKeyPem: row.value,
        publicKeyPem: this.gatewayPublicKeyPem,
        purpose: 'PERMIT_SIGNING',
        status: 'ACTIVE',
      });
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.gatewayPrivateKey = privateKey;
      this.gatewayPublicKey = publicKey;

      const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      const keyId = 'gw_key_' + randomUUID().substring(0, 8);

      this.gatewayPublicKeyPem = pubPem;
      this.gatewayKeyId = keyId;

      this.db.prepare("INSERT OR REPLACE INTO gateway_config (key, value) VALUES ('banking_gateway_private_key', ?)").run(privPem);
      this.db.prepare("INSERT OR REPLACE INTO gateway_config (key, value) VALUES ('banking_gateway_public_key', ?)").run(pubPem);
      this.db.prepare("INSERT OR REPLACE INTO gateway_config (key, value) VALUES ('banking_gateway_key_id', ?)").run(keyId);

      this.kms.registerKey({
        keyId,
        privateKeyPem: privPem,
        publicKeyPem: pubPem,
        purpose: 'PERMIT_SIGNING',
        status: 'ACTIVE',
      });
    }
  }

  public getGatewayPublicKeyPem(): string {
    return this.gatewayPublicKeyPem;
  }

  public getGatewayKeyId(): string {
    return this.gatewayKeyId;
  }

  public getKms(): SoftwareKmsProvider {
    return this.kms;
  }

  public getAnomalyDetector(): BankingAnomalyDetector {
    return this.anomalyDetector;
  }

  /**
   * Rotates active permit signing key with a 3-minute grace period.
   * Enforces mutex protection against concurrent key rotations.
   */
  public async rotateSigningKey(
    reason: string = 'Scheduled key rotation',
    operator: string = 'security_admin',
  ): Promise<{ newKey: KeyMetadata; oldKey: KeyMetadata; event: KeyRotationEvent }> {
    if (this.isRotatingKey) {
      throw new Error('ROTATION_IN_PROGRESS: Another key rotation is currently executing.');
    }
    this.isRotatingKey = true;
    try {
      const result = await this.kms.rotateKey('PERMIT_SIGNING', reason, operator);
      this.gatewayKeyId = result.newKey.key_id;
      this.gatewayPublicKeyPem = result.newKey.public_key_pem;
      this.gatewayPublicKey = createPublicKey(result.newKey.public_key_pem);

      this.db.prepare("INSERT OR REPLACE INTO gateway_config (key, value) VALUES ('banking_gateway_public_key', ?)").run(result.newKey.public_key_pem);
      this.db.prepare("INSERT OR REPLACE INTO gateway_config (key, value) VALUES ('banking_gateway_key_id', ?)").run(result.newKey.key_id);

      this.logger?.info(
        { old_key_id: result.oldKey.key_id, new_key_id: result.newKey.key_id, reason },
        'Gateway successfully rotated permit signing key',
      );

      return result;
    } finally {
      this.isRotatingKey = false;
    }
  }

  /**
   * Emergency revocation of a compromised permit signing key.
   */
  public async revokeSigningKey(
    keyId: string,
    reason: string = 'Emergency key revocation',
    operator: string = 'security_admin',
  ): Promise<{ key: KeyMetadata; event: KeyRevocationEvent }> {
    const result = await this.kms.revokeKey(keyId, reason, operator);
    this.logger?.warn(
      { key_id: keyId, reason, operator },
      'Gateway revoked signing key',
    );
    return result;
  }

  // ── Nonce Engine ───────────────────────────────────────────────────────────

  public mintNonce(agentId: string): string {
    const nonce = randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO permit_nonces (nonce, agent_id, issued_at, status)
      VALUES (?, ?, ?, 'ISSUED')
    `).run(nonce, agentId, now);
    return nonce;
  }

  public consumeNonce(nonce: string): boolean {
    const now = Date.now();
    const res = this.db.prepare(`
      UPDATE permit_nonces SET status = 'CONSUMED', consumed_at = ?
      WHERE nonce = ? AND status = 'ISSUED'
    `).run(now, nonce);
    return res.changes > 0;
  }

  // ── TBP Permit Minting ─────────────────────────────────────────────────────

  /**
   * Evaluates an agent's payment request against the active customer mandate,
   * performs policy checks, and mints a signed 22-field TBP permit.
   *
   * Crucial Architectural Distinction (Phase 2.3.1):
   * Gateway does NOT perform authoritative balance checks or lock funds.
   * Authoritative funds reservation and atomic ledger hold are owned by Bank Gate
   * and the Ledger Adapter. Gateway assigns an advisory reservation_id for correlation.
   *
   * Permit TTL: Strictly 90 seconds (CONTRACTS.md & BANKING-ARCHITECTURE.md).
   */
  public evaluateAndMintPermit(params: {
    agent_id: string;
    customer_ref: string;
    mandate_id: string;
    account_ref: string;
    action: string;
    purpose: string;
    amount_paise: number;
    currency: 'INR';
    payee_id: string;
    invoice_ref: string;
    request_id: string;
    delegation_ref?: string;
    approval_ref?: string | null;
    intent?: string;
  }): { decision: 'ALLOW' | 'DENY' | 'ASK'; permit_envelope?: PermitEnvelope; reason?: string } {
    const now = Date.now();

    // 1. Verify Mandate exists and is active
    const mandate = this.stores.getMandate(params.mandate_id);
    if (!mandate) {
      return { decision: 'DENY', reason: 'MANDATE_NOT_FOUND' };
    }
    if (mandate.status !== 'ACTIVE') {
      return { decision: 'DENY', reason: `MANDATE_STATUS_${mandate.status}` };
    }
    if (mandate.customer_ref !== params.customer_ref) {
      return { decision: 'DENY', reason: 'MANDATE_CUSTOMER_MISMATCH' };
    }
    if (mandate.account_ref !== params.account_ref) {
      return { decision: 'DENY', reason: 'MANDATE_ACCOUNT_MISMATCH' };
    }
    if (mandate.expires_at <= now) {
      return { decision: 'DENY', reason: 'MANDATE_EXPIRED' };
    }

    // 2. Verify Payee is in allowed_payees list
    if (!mandate.allowed_payees.includes(params.payee_id)) {
      return { decision: 'DENY', reason: 'PAYEE_NOT_PERMITTED_BY_MANDATE' };
    }

    // 3. Verify Per-Transaction Limit
    if (params.amount_paise > mandate.per_tx_limit_paise) {
      return { decision: 'DENY', reason: 'AMOUNT_EXCEEDS_PER_TX_LIMIT' };
    }

    // 4. Verify Delegation Chain if delegation_ref is present
    const delegationRef = params.delegation_ref ?? 'DEL_DIRECT';
    if (params.delegation_ref) {
      const delCheck = this.agentIdentity.validateDelegationChain(params.delegation_ref, params.agent_id);
      if (!delCheck.valid) {
        return { decision: 'DENY', reason: delCheck.reason };
      }
      if (delCheck.delegation && params.amount_paise > delCheck.delegation.max_sub_delegated_amount_paise) {
        return { decision: 'DENY', reason: 'AMOUNT_EXCEEDS_SUB_DELEGATION_LIMIT' };
      }
    } else {
      // If direct agent, verify agent matches authorized_agent_id in mandate
      if (mandate.authorized_agent_id !== params.agent_id) {
        return { decision: 'DENY', reason: 'AGENT_NOT_AUTHORIZED_ON_MANDATE' };
      }
    }

    // 4b. Evaluate Banking Anomaly & Intent-Drift Detector
    const anomalyEval = this.anomalyDetector.evaluate({
      agent_id: params.agent_id,
      action: params.action,
      purpose: params.purpose,
      intent: params.intent,
      amount_paise: params.amount_paise,
      payee_id: params.payee_id,
      allowed_payees: mandate.allowed_payees,
      max_per_txn_paise: mandate.per_tx_limit_paise,
      historical_mean_paise: 200000, // ₹2,000 baseline
    });

    if (anomalyEval.decision === 'DENY') {
      const primaryReason = anomalyEval.reasons[0] ?? anomalyEval.signals[0]?.code ?? 'BEHAVIORAL_ANOMALY_DENIED';
      return { decision: 'DENY', reason: primaryReason };
    }

    // If anomaly engine signals ASK (e.g. step-up required), escalate for customer confirmation unless approval_ref is provided
    if (anomalyEval.decision === 'ASK' && !params.approval_ref) {
      const primaryReason = anomalyEval.reasons[0] ?? anomalyEval.signals[0]?.code ?? 'STEP_UP_APPROVAL_REQUIRED';
      return { decision: 'ASK', reason: primaryReason };
    }

    // 5. Mint Single-Use Nonce
    const nonce = this.mintNonce(params.agent_id);

    // 6. Compute 7-Field Canonical Transaction Digest
    const canonicalTx: CanonicalTransaction = {
      account_ref: params.account_ref,
      action: params.action,
      amount_paise: params.amount_paise,
      currency: params.currency,
      invoice_ref: params.invoice_ref,
      payee_id: params.payee_id,
      purpose: params.purpose,
    };
    const payloadHash = computeCanonicalTransactionDigest(canonicalTx);

    // 7. Assemble 22-field TBP Payload
    const permitId = randomUUID();
    const reservationId = randomUUID(); // Advisory reservation correlation ID
    const issuedAt = now;
    const expiresAt = now + 90 * 1000; // Strictly 90s permit TTL

    const permitPayload: TransactionBoundPermitPayload = {
      permit_version: '1',
      customer_ref: params.customer_ref,
      agent_id: params.agent_id,
      delegation_ref: delegationRef,
      mandate_id: params.mandate_id,
      mandate_version: mandate.mandate_version,
      account_ref: params.account_ref,
      action: params.action,
      purpose: params.purpose,
      amount_paise: params.amount_paise,
      currency: params.currency,
      payee_id: params.payee_id,
      invoice_ref: params.invoice_ref,
      request_id: params.request_id,
      permit_id: permitId,
      nonce,
      payload_hash: payloadHash,
      policy_version: '1.0.0',
      reservation_id: reservationId,
      issued_at: issuedAt,
      expires_at: expiresAt,
      approval_ref: params.approval_ref ?? null,
    };

    // Validate payload against strict 22-field schema
    TransactionBoundPermitPayloadSchema.parse(permitPayload);

    // 8. Sign Payload with Gateway Ed25519 Private Key via KMS
    const payloadCanonicalJson = canonicalJson(permitPayload);
    let signatureBase64: string;
    let signingKeyId = this.gatewayKeyId;

    if (this.kms) {
      const sigResult = this.kms.signSync(this.gatewayKeyId, Buffer.from(payloadCanonicalJson, 'utf8'));
      signatureBase64 = sigResult.signature.toString('base64');
      signingKeyId = sigResult.keyId;
    } else {
      const signatureBuffer = cryptoSign(null, Buffer.from(payloadCanonicalJson, 'utf8'), this.gatewayPrivateKey);
      signatureBase64 = signatureBuffer.toString('base64');
    }

    const envelope: PermitEnvelope = {
      permit: permitPayload,
      signature: signatureBase64,
      gateway_key_id: signingKeyId,
      algorithm: 'ed25519',
    };

    PermitEnvelopeSchema.parse(envelope);

    // 9. Persist Issued Permit Record (Audit Trail)
    this.db.prepare(`
      INSERT INTO issued_permits (
        permit_id, nonce, reservation_id, agent_id, customer_ref, mandate_id,
        account_ref, amount_paise, payload_hash, envelope_json, issued_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED')
    `).run(
      permitId,
      nonce,
      reservationId,
      params.agent_id,
      params.customer_ref,
      params.mandate_id,
      params.account_ref,
      params.amount_paise,
      payloadHash,
      JSON.stringify(envelope),
      issuedAt,
      expiresAt,
    );

    return {
      decision: 'ALLOW',
      permit_envelope: envelope,
    };
  }
}
