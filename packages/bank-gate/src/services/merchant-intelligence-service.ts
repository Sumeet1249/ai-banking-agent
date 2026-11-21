/**
 * Provenance-Aware Merchant Intelligence Engine (Phase BP-3.2)
 *
 * Implements:
 *   - Layered evidence hierarchy (AUTHORITATIVE_RAIL > REGULATORY_REGISTRY > CUSTOMER_OVERRIDE > DETERMINISTIC_HEURISTIC > ADVISORY_HEURISTIC)
 *   - ISO 18245 Merchant Category Code (MCC) normalization and validation
 *   - Merchant/Category mismatch detection
 *   - Unknown merchant handling (fail-closed into ASK / DENY)
 *   - Customer correction & override registry
 *   - Non-negotiable Rule: AI Advisory output can NEVER override authoritative rail evidence or independently grant VERIFIED status.
 */

import type Database from 'better-sqlite3';
import type { Logger } from 'pino';
import {
  SpendingCategory,
  EvidenceTier,
  MerchantEvaluationInput,
  MerchantEvaluationResult,
} from '@agentguard/core-schema';

export interface MerchantClassificationRecord {
  merchant_id: string;
  merchant_name: string;
  mcc_code: string;
  category_id: SpendingCategory;
  verification_source: string;
  verification_reference?: string;
  classification_method: string;
  evidence_tier: EvidenceTier;
  confidence_basis: string;
  verified_at: number;
  status: 'VERIFIED' | 'PROVISIONAL' | 'FLAGGED' | 'BLOCKED';
  provenance_metadata?: string;
}

export class MerchantIntelligenceService {
  // Authoritative ISO 18245 MCC to Spending Category Dictionary
  private static readonly MCC_TO_CATEGORY: Record<string, SpendingCategory> = {
    // Shopping & Retail
    '5311': 'SHOPPING', // Department Stores
    '5411': 'SHOPPING', // Grocery Stores / Supermarkets
    '5999': 'SHOPPING', // Miscellaneous Retail
    '5732': 'SHOPPING', // Electronic Sales
    '5651': 'SHOPPING', // Family Clothing Stores
    '5331': 'SHOPPING', // Variety Stores
    // Food & Dining
    '5812': 'FOOD_DINING', // Eating places, Restaurants
    '5814': 'FOOD_DINING', // Fast Food Restaurants
    '5811': 'FOOD_DINING', // Caterers
    '5462': 'FOOD_DINING', // Bakeries
    // Transport & Fuel
    '4121': 'TRANSPORT', // Taxicabs & Limousines / Rideshare
    '5541': 'TRANSPORT', // Service Stations (with or without ancillary services)
    '5542': 'TRANSPORT', // Automated Fuel Dispensers
    '4111': 'TRANSPORT', // Local & Suburban Commuter Passenger Transportation
    '4131': 'TRANSPORT', // Bus Lines
    // Utilities
    '4900': 'UTILITIES', // Utilities - Electric, Gas, Sanitary, Water
    // Healthcare & Medical
    '8011': 'HEALTHCARE', // Doctors, Physicians
    '5912': 'HEALTHCARE', // Drug Stores, Pharmacies
    '8062': 'HEALTHCARE', // Hospitals
    // Travel & Entertainment
    '7011': 'ENTERTAINMENT', // Hotels, Motels, Resorts
    '7832': 'ENTERTAINMENT', // Motion Picture Theaters
    '7999': 'ENTERTAINMENT', // Recreation Services
    // Financial & Investment Services
    '6011': 'MISCELLANEOUS', // Automated Cash Disbursements
    '6012': 'MISCELLANEOUS', // Financial Institutions - Merchandise & Services
    '6211': 'INVESTMENT_STOCK', // Security Brokers/Dealers
    // Education
    '8220': 'EDUCATION', // Colleges, Universities
    '8299': 'EDUCATION', // Schools & Educational Services
  };

  constructor(
    private db: Database.Database,
    private logger?: Logger,
  ) {
    this.ensureSchema();
    this.seedDefaultVerifiedMerchants();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS merchant_classifications (
        merchant_id TEXT PRIMARY KEY,
        merchant_name TEXT NOT NULL,
        mcc_code TEXT NOT NULL,
        category_id TEXT NOT NULL,
        verification_source TEXT NOT NULL,
        verification_reference TEXT,
        classification_method TEXT NOT NULL,
        evidence_tier TEXT NOT NULL,
        confidence_basis TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'VERIFIED',
        provenance_metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS customer_merchant_overrides (
        override_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_ref TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        merchant_name TEXT NOT NULL,
        assigned_category TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(tenant_id, customer_ref, merchant_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cmo_tenant_cust ON customer_merchant_overrides(tenant_id, customer_ref);
    `);
  }

  private seedDefaultVerifiedMerchants(): void {
    const defaultMerchants: Array<{
      merchant_id: string;
      merchant_name: string;
      mcc_code: string;
      category_id: SpendingCategory;
      evidence_tier: EvidenceTier;
      source: string;
    }> = [
      {
        merchant_id: 'merch_amzn_in',
        merchant_name: 'Amazon India',
        mcc_code: '5311',
        category_id: 'SHOPPING',
        evidence_tier: 'AUTHORITATIVE_RAIL',
        source: 'NPCI_UPI_DIRECTORY',
      },
      {
        merchant_id: 'merch_flipkart_01',
        merchant_name: 'Flipkart Internet',
        mcc_code: '5311',
        category_id: 'SHOPPING',
        evidence_tier: 'AUTHORITATIVE_RAIL',
        source: 'NPCI_UPI_DIRECTORY',
      },
      {
        merchant_id: 'merch_swiggy_01',
        merchant_name: 'Swiggy Bundl Technologies',
        mcc_code: '5812',
        category_id: 'FOOD_DINING',
        evidence_tier: 'AUTHORITATIVE_RAIL',
        source: 'NPCI_UPI_DIRECTORY',
      },
      {
        merchant_id: 'merch_zomato_01',
        merchant_name: 'Zomato Limited',
        mcc_code: '5812',
        category_id: 'FOOD_DINING',
        evidence_tier: 'AUTHORITATIVE_RAIL',
        source: 'NPCI_UPI_DIRECTORY',
      },
      {
        merchant_id: 'merch_uber_in',
        merchant_name: 'Uber India Systems',
        mcc_code: '4121',
        category_id: 'TRANSPORT',
        evidence_tier: 'AUTHORITATIVE_RAIL',
        source: 'NPCI_UPI_DIRECTORY',
      },
      {
        merchant_id: 'merch_ola_in',
        merchant_name: 'ANI Technologies (Ola)',
        mcc_code: '4121',
        category_id: 'TRANSPORT',
        evidence_tier: 'AUTHORITATIVE_RAIL',
        source: 'NPCI_UPI_DIRECTORY',
      },
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO merchant_classifications (
        merchant_id, merchant_name, mcc_code, category_id, verification_source,
        classification_method, evidence_tier, confidence_basis, verified_at, status
      ) VALUES (?, ?, ?, ?, ?, 'PAYMENT_RAIL', ?, 'Authenticated ISO 18245 payment network registration', ?, 'VERIFIED')
    `);

    const now = Date.now();
    for (const m of defaultMerchants) {
      insertStmt.run(m.merchant_id, m.merchant_name, m.mcc_code, m.category_id, m.source, m.evidence_tier, now);
    }
  }

  // ── LAYERED EVALUATION PIPELINE ──────────────────────────────────────────

  /**
   * Evaluates merchant classification following the strict evidence hierarchy:
   * 1. Payment Rail MCC (AUTHORITATIVE_RAIL)
   * 2. Customer Override (CUSTOMER_OVERRIDE)
   * 3. Regulatory Registry (REGULATORY_REGISTRY)
   * 4. Deterministic Rule (DETERMINISTIC_HEURISTIC)
   * 5. AI Advisory (ADVISORY_HEURISTIC) - strictly advisory
   */
  public evaluateMerchant(
    input: MerchantEvaluationInput,
    tenantId: string = 'tenant_default',
    customerRef: string = 'cust_1001',
  ): MerchantEvaluationResult {
    const violations: string[] = [];

    // 1. Tier 1: Authoritative Payment Rail Evidence
    if (input.payment_rail_mcc && MerchantIntelligenceService.MCC_TO_CATEGORY[input.payment_rail_mcc]) {
      const railCategory = MerchantIntelligenceService.MCC_TO_CATEGORY[input.payment_rail_mcc];
      const isMismatch = input.claimed_category !== undefined && input.claimed_category !== railCategory;

      if (isMismatch) {
        violations.push(
          `Claimed category (${input.claimed_category}) mismatches authenticated payment-rail MCC ${input.payment_rail_mcc} (${railCategory})`,
        );
      }

      return {
        is_valid: true,
        resolved_category: railCategory,
        resolved_mcc: input.payment_rail_mcc,
        evidence_tier: 'AUTHORITATIVE_RAIL',
        is_mismatch_detected: isMismatch,
        is_ai_advisory_only: false,
        status: isMismatch ? 'FLAGGED' : 'VERIFIED',
        confidence_basis: 'Authenticated payment rail settlement feed (Tier 1)',
        violations,
      };
    }

    // 2. Tier 2: Customer-Approved Custom Mapping
    const customerOverride = this.getCustomerOverride(tenantId, customerRef, input.merchant_id);
    if (customerOverride) {
      return {
        is_valid: true,
        resolved_category: customerOverride.assigned_category as SpendingCategory,
        resolved_mcc: input.claimed_mcc || '5999',
        evidence_tier: 'CUSTOMER_OVERRIDE',
        is_mismatch_detected: false,
        is_ai_advisory_only: false,
        status: 'VERIFIED',
        confidence_basis: `Explicit customer override approved: ${customerOverride.reason}`,
        violations: [],
      };
    }

    // 3. Tier 3: Verified Merchant Registry
    const registryEntry = this.getRegistryMerchant(input.merchant_id);
    if (registryEntry && registryEntry.status === 'VERIFIED') {
      const isMismatch = input.claimed_category !== undefined && input.claimed_category !== registryEntry.category_id;
      if (isMismatch) {
        violations.push(`Claimed category mismatches verified merchant registry category ${registryEntry.category_id}`);
      }

      return {
        is_valid: true,
        resolved_category: registryEntry.category_id,
        resolved_mcc: registryEntry.mcc_code,
        evidence_tier: registryEntry.evidence_tier,
        is_mismatch_detected: isMismatch,
        is_ai_advisory_only: false,
        status: isMismatch ? 'FLAGGED' : 'VERIFIED',
        confidence_basis: registryEntry.confidence_basis,
        violations,
      };
    }

    // 4. Tier 4: Deterministic Claimed MCC
    if (input.claimed_mcc && MerchantIntelligenceService.MCC_TO_CATEGORY[input.claimed_mcc]) {
      const mappedCategory = MerchantIntelligenceService.MCC_TO_CATEGORY[input.claimed_mcc];
      return {
        is_valid: true,
        resolved_category: mappedCategory,
        resolved_mcc: input.claimed_mcc,
        evidence_tier: 'DETERMINISTIC_HEURISTIC',
        is_mismatch_detected: false,
        is_ai_advisory_only: false,
        status: 'PROVISIONAL',
        confidence_basis: 'Deterministic ISO 18245 code lookup (unverified merchant identity)',
        violations: [],
      };
    }

    // 5. Tier 5: AI Advisory / Unverified Inference (Rule: NEVER AUTHORITATIVE)
    if (input.ai_inferred_category) {
      violations.push(
        'Merchant classification relies solely on advisory AI inference without payment rail corroboration',
      );
      return {
        is_valid: false,
        resolved_category: input.ai_inferred_category,
        resolved_mcc: input.claimed_mcc || '5999',
        evidence_tier: 'ADVISORY_HEURISTIC',
        is_mismatch_detected: true,
        is_ai_advisory_only: true,
        status: 'PROVISIONAL', // Crucial rule: Never VERIFIED
        confidence_basis: `Advisory heuristic score ${(input.ai_confidence ?? 0) * 100}% (Non-authoritative)`,
        violations,
      };
    }

    // Fail-Closed: Completely Unknown Merchant
    violations.push('Unknown merchant: No payment rail, registry, or MCC mapping available');
    return {
      is_valid: false,
      resolved_category: 'SHOPPING', // Default fallback
      resolved_mcc: '5999',
      evidence_tier: 'ADVISORY_HEURISTIC',
      is_mismatch_detected: true,
      is_ai_advisory_only: true,
      status: 'FLAGGED',
      confidence_basis: 'Fail-closed unknown merchant',
      violations,
    };
  }

  // ── CUSTOMER OVERRIDE MANAGEMENT ─────────────────────────────────────────

  public setCustomerOverride(params: {
    tenant_id: string;
    customer_ref: string;
    merchant_id: string;
    merchant_name: string;
    assigned_category: SpendingCategory;
    reason: string;
  }): void {
    const now = Date.now();
    const overrideId = `cmo_${params.tenant_id}_${params.merchant_id}`;

    this.db
      .prepare(`
        INSERT INTO customer_merchant_overrides (
          override_id, tenant_id, customer_ref, merchant_id, merchant_name, assigned_category, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, customer_ref, merchant_id) DO UPDATE SET
          assigned_category = excluded.assigned_category,
          reason = excluded.reason,
          created_at = excluded.created_at
      `)
      .run(
        overrideId,
        params.tenant_id,
        params.customer_ref,
        params.merchant_id,
        params.merchant_name,
        params.assigned_category,
        params.reason,
        now,
      );
  }

  public getCustomerOverride(
    tenantId: string,
    customerRef: string,
    merchantId: string,
  ): { assigned_category: string; reason: string } | null {
    const row = this.db
      .prepare(`
        SELECT assigned_category, reason FROM customer_merchant_overrides
        WHERE tenant_id = ? AND customer_ref = ? AND merchant_id = ?
      `)
      .get(tenantId, customerRef, merchantId) as { assigned_category: string; reason: string } | undefined;
    return row ?? null;
  }

  public getRegistryMerchant(merchantId: string): MerchantClassificationRecord | null {
    const row = this.db
      .prepare('SELECT * FROM merchant_classifications WHERE merchant_id = ?')
      .get(merchantId) as MerchantClassificationRecord | undefined;
    return row ?? null;
  }

  public listClassifiedMerchants(): MerchantClassificationRecord[] {
    return this.db
      .prepare('SELECT * FROM merchant_classifications ORDER BY verified_at DESC')
      .all() as MerchantClassificationRecord[];
  }

  public searchMerchants(params: {
    query?: string;
    category?: string;
    status?: string;
  }): MerchantClassificationRecord[] {
    let sql = 'SELECT * FROM merchant_classifications WHERE 1=1';
    const bindings: any[] = [];

    if (params.query) {
      sql += ' AND (merchant_name LIKE ? OR merchant_id LIKE ? OR mcc_code LIKE ?)';
      const q = `%${params.query}%`;
      bindings.push(q, q, q);
    }
    if (params.category) {
      sql += ' AND category_id = ?';
      bindings.push(params.category);
    }
    if (params.status) {
      sql += ' AND status = ?';
      bindings.push(params.status);
    }

    sql += ' ORDER BY verified_at DESC';
    return this.db.prepare(sql).all(...bindings) as MerchantClassificationRecord[];
  }

  public listConflicts(): Array<{
    conflict_id: string;
    merchant_id: string;
    merchant_name: string;
    mcc_code: string;
    registered_category: string;
    attempted_category: string;
    reason: string;
    timestamp: number;
  }> {
    // Queries audit events or reservations where category mismatch occurred
    const rows = this.db
      .prepare(`
        SELECT reservation_id, customer_ref, category_id, agent_id, violations, created_at
        FROM category_budget_reservations
        WHERE violations LIKE '%mismatch%' OR violations LIKE '%MISMATCH%'
        ORDER BY created_at DESC
        LIMIT 50
      `)
      .all() as any[];

    return rows.map((r) => ({
      conflict_id: `conf_${r.reservation_id}`,
      merchant_id: r.agent_id,
      merchant_name: `Payee for tx ${r.reservation_id}`,
      mcc_code: '5999',
      registered_category: 'SHOPPING',
      attempted_category: r.category_id,
      reason: r.violations || 'Category mismatch between MCC dictionary and requested pool',
      timestamp: r.created_at,
    }));
  }

  public listReviewQueue(): Array<{
    item_id: string;
    merchant_id: string;
    merchant_name: string;
    mcc_code: string;
    evidence_tier: string;
    status: string;
    reason: string;
    last_seen: number;
  }> {
    const unverified = this.db
      .prepare(`
        SELECT merchant_id, merchant_name, mcc_code, evidence_tier, status, confidence_basis, verified_at
        FROM merchant_classifications
        WHERE status IN ('PROVISIONAL', 'FLAGGED', 'BLOCKED')
        ORDER BY verified_at DESC
      `)
      .all() as any[];

    return unverified.map((u) => ({
      item_id: `rev_${u.merchant_id}`,
      merchant_id: u.merchant_id,
      merchant_name: u.merchant_name,
      mcc_code: u.mcc_code,
      evidence_tier: u.evidence_tier,
      status: u.status,
      reason: u.confidence_basis || 'Unverified merchant evidence requires compliance confirmation',
      last_seen: u.verified_at,
    }));
  }
}
