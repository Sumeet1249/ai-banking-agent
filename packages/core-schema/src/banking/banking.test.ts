import {
  CustomerMandateSchema,
  MandateRevocationRequestSchema,
  SubAgentDelegationSchema,
  PaymentRequestSchema,
  CanonicalTransactionSchema,
  CanonicalDigestSchema,
  computeCanonicalTransactionDigest,
  TransactionBoundPermitPayloadSchema,
  PermitEnvelopeSchema,
  BankDecisionOutcomeSchema,
  GatewayDenyReasonSchema,
  BankDenyReasonSchema,
  EvaluationDecisionResponseSchema,
  LedgerAccountSchema,
  BudgetReservationSchema,
  LedgerTransferSchema,
  SettlementResultSchema,
  ReconciliationRequestSchema,
  ReconciliationResultSchema,
  TestClock,
  SystemClock,
} from './index';

describe('Banking Zod Schemas & Invariant Verification', () => {
  // Sample fixtures from Section 7 of CONTRACTS.md
  const validMandateFixture = {
    mandate_id: 'MND_ELEC_101',
    mandate_version: 1,
    customer_ref: 'CUST_101',
    account_ref: 'ACC_101',
    authorized_agent_id: 'AGENT_ELEC_01',
    action: 'bill_payment',
    purpose: 'electricity_bill',
    allowed_payees: ['PAYEE_CESC_001', 'PAYEE_TATA_POWER_001'],
    per_tx_limit_paise: 500000, // ₹5,000 in integer paise
    daily_limit_paise: 800000,  // ₹8,000 in integer paise
    status: 'ACTIVE' as const,
    created_at: 1795000000000,
    updated_at: 1795000000000,
    expires_at: 1797678000000,
  };

  const validPaymentRequestFixture = {
    request_id: '123e4567-e89b-12d3-a456-426614174000',
    agent_id: 'AGENT_ELEC_01',
    customer_ref: 'CUST_101',
    mandate_id: 'MND_ELEC_101',
    account_ref: 'ACC_101',
    action: 'bill_payment',
    purpose: 'electricity_bill',
    payee_id: 'PAYEE_CESC_001',
    amount_paise: 240000, // ₹2,400 in paise
    currency: 'INR' as const,
    invoice_ref: 'INV-1001',
    timestamp_ms: 1795000000000,
    approval_ref: null,
    task_ref: null,
    agent_signature: 'jws-eddsa-signature-mock-bytes',
  };

  const validCanonicalTx = {
    account_ref: 'ACC_101',
    action: 'bill_payment',
    amount_paise: 240000,
    currency: 'INR' as const,
    invoice_ref: 'INV-1001',
    payee_id: 'PAYEE_CESC_001',
    purpose: 'electricity_bill',
  };

  const validPermitFixture = {
    permit_version: '1' as const,
    customer_ref: 'CUST_101',
    agent_id: 'AGENT_ELEC_01',
    delegation_ref: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    mandate_id: 'MND_ELEC_101',
    mandate_version: 1,
    account_ref: 'ACC_101',
    action: 'bill_payment',
    purpose: 'electricity_bill',
    amount_paise: 240000,
    currency: 'INR' as const,
    payee_id: 'PAYEE_CESC_001',
    invoice_ref: 'INV-1001',
    request_id: '123e4567-e89b-12d3-a456-426614174000',
    permit_id: '223e4567-e89b-12d3-a456-426614174001',
    nonce: '323e4567-e89b-12d3-a456-426614174002',
    payload_hash: 'a'.repeat(64),
    policy_version: 'policy-v1',
    reservation_id: '423e4567-e89b-12d3-a456-426614174003',
    issued_at: 1795000000000,
    expires_at: 1795000090000,
    approval_ref: null,
  };

  describe('Customer Mandate Schemas (mandate.ts)', () => {
    it('accepts a valid customer mandate', () => {
      const res = CustomerMandateSchema.safeParse(validMandateFixture);
      expect(res.success).toBe(true);
    });

    it('rejects floating-point monetary amounts (Rule E1)', () => {
      const invalid = { ...validMandateFixture, per_tx_limit_paise: 5000.5 };
      const res = CustomerMandateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects negative monetary amounts (Rule E1)', () => {
      const invalid = { ...validMandateFixture, per_tx_limit_paise: -500000 };
      const res = CustomerMandateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects zero or empty allowed payees', () => {
      const invalid = { ...validMandateFixture, allowed_payees: [] };
      const res = CustomerMandateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects unexpected / unknown fields in mandate (strict schema)', () => {
      const invalid = { ...validMandateFixture, extra_field: 'malicious' };
      const res = CustomerMandateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('validates mandate revocation request', () => {
      const validRevocation = {
        mandate_id: 'MND_ELEC_101',
        customer_ref: 'CUST_101',
        revoked_at: 1795000010000,
        reason: 'Customer requested cancellation',
      };
      expect(MandateRevocationRequestSchema.safeParse(validRevocation).success).toBe(true);
    });

    it('validates sub-agent delegation schema (Invariant I7)', () => {
      const delegation = {
        parent_agent_id: 'AGENT_ELEC_01',
        child_agent_id: 'AGENT_BILL_VERIFY_01',
        mandate_id: 'MND_ELEC_101',
        mandate_version: 1,
        allowed_actions: ['bill_verify'],
        max_amount_paise: 240000,
        delegation_ref: 'del-hash-1234',
        expires_at: 1795000090000,
      };
      expect(SubAgentDelegationSchema.safeParse(delegation).success).toBe(true);
    });
  });

  describe('Canonical Transaction & Permit Schemas (transaction.ts)', () => {
    it('verifies exact 7-field Canonical Transaction schema', () => {
      const keys = Object.keys(validCanonicalTx).sort();
      expect(keys).toEqual([
        'account_ref',
        'action',
        'amount_paise',
        'currency',
        'invoice_ref',
        'payee_id',
        'purpose',
      ]);
      expect(CanonicalTransactionSchema.safeParse(validCanonicalTx).success).toBe(true);
    });

    it('rejects canonical transaction with 8 or 6 fields', () => {
      const eightFields = { ...validCanonicalTx, extra: 'not-allowed' };
      expect(CanonicalTransactionSchema.safeParse(eightFields).success).toBe(false);

      const sixFields = { ...validCanonicalTx };
      delete (sixFields as any).invoice_ref;
      expect(CanonicalTransactionSchema.safeParse(sixFields).success).toBe(false);
    });

    it('computes deterministic 7-field canonical digest (payload_hash)', () => {
      const hash1 = computeCanonicalTransactionDigest(validCanonicalTx);
      const hash2 = computeCanonicalTransactionDigest(validCanonicalTx);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(CanonicalDigestSchema.safeParse(hash1).success).toBe(true);
      // Formal cross-language RFC 8785 test vector:
      expect(hash1).toBe('b566a992326ebc84abb6c1e5ffbc66794233e303694cf3acf34a50a37a585330');
    });

    it('verifies exact 22-field Transaction-Bound Permit (TBP)', () => {
      const keys = Object.keys(validPermitFixture).sort();
      expect(keys).toHaveLength(22);
      expect(TransactionBoundPermitPayloadSchema.safeParse(validPermitFixture).success).toBe(true);
    });

    it('rejects TBP with missing or extra fields', () => {
      const missingField = { ...validPermitFixture };
      delete (missingField as any).reservation_id;
      expect(TransactionBoundPermitPayloadSchema.safeParse(missingField).success).toBe(false);

      const extraField = { ...validPermitFixture, extra: 'unknown' };
      expect(TransactionBoundPermitPayloadSchema.safeParse(extraField).success).toBe(false);
    });

    it('validates Permit Envelope structure', () => {
      const envelope = {
        permit: validPermitFixture,
        signature: 'mock-ed25519-detached-sig-base64',
      };
      expect(PermitEnvelopeSchema.safeParse(envelope).success).toBe(true);
    });

    it('validates canonical PaymentRequest wire format', () => {
      expect(PaymentRequestSchema.safeParse(validPaymentRequestFixture).success).toBe(true);
    });

    it('rejects unsupported currency (strict INR)', () => {
      const nonInr = { ...validPaymentRequestFixture, currency: 'USD' as any };
      expect(PaymentRequestSchema.safeParse(nonInr).success).toBe(false);
    });

    it('validates 4-way decision outcomes (ALLOW, DENY, ASK, DEFER)', () => {
      expect(BankDecisionOutcomeSchema.safeParse('ALLOW').success).toBe(true);
      expect(BankDecisionOutcomeSchema.safeParse('DENY').success).toBe(true);
      expect(BankDecisionOutcomeSchema.safeParse('ASK').success).toBe(true);
      expect(BankDecisionOutcomeSchema.safeParse('DEFER').success).toBe(true);
      expect(BankDecisionOutcomeSchema.safeParse('UNKNOWN').success).toBe(false);
    });

    it('validates fixed reason codes from Section 5 of CONTRACTS.md', () => {
      expect(GatewayDenyReasonSchema.safeParse('DAILY_LIMIT_EXCEEDED').success).toBe(true);
      expect(GatewayDenyReasonSchema.safeParse('UNKNOWN_PAYEE').success).toBe(true);
      expect(BankDenyReasonSchema.safeParse('PAYLOAD_DIGEST_MISMATCH').success).toBe(true);
      expect(BankDenyReasonSchema.safeParse('PERMIT_ALREADY_CONSUMED').success).toBe(true);
    });

    it('validates complete evaluation decision response', () => {
      const evalResponse = {
        decision: 'ALLOW' as const,
        request_id: '123e4567-e89b-12d3-a456-426614174000',
        permit_envelope: {
          permit: validPermitFixture,
          signature: 'sig-bytes',
        },
        decided_at: 1795000000000,
      };
      expect(EvaluationDecisionResponseSchema.safeParse(evalResponse).success).toBe(true);
    });
  });

  describe('Ledger & Reservation Schemas (ledger.ts)', () => {
    it('validates Ledger Account with non-negative balance', () => {
      const account = {
        account_ref: 'ACC_101',
        customer_ref: 'CUST_101',
        balance_paise: 10000000, // ₹1,00,000
        currency: 'INR' as const,
        status: 'ACTIVE' as const,
        created_at: 1795000000000,
        updated_at: 1795000000000,
      };
      expect(LedgerAccountSchema.safeParse(account).success).toBe(true);
    });

    it('validates Budget Reservation (Invariant I4, Rule D8)', () => {
      const reservation = {
        reservation_id: '423e4567-e89b-12d3-a456-426614174003',
        mandate_id: 'MND_ELEC_101',
        customer_ref: 'CUST_101',
        account_ref: 'ACC_101',
        amount_paise: 240000,
        currency: 'INR' as const,
        status: 'RESERVED' as const,
        created_at: 1795000000000,
        expires_at: 1795000120000, // 120s TTL
      };
      expect(BudgetReservationSchema.safeParse(reservation).success).toBe(true);
    });

    it('validates two-stage Ledger Transfer lifecycle', () => {
      const transfer = {
        transfer_id: '523e4567-e89b-12d3-a456-426614174004',
        reservation_id: '423e4567-e89b-12d3-a456-426614174003',
        permit_id: '223e4567-e89b-12d3-a456-426614174001',
        request_id: '123e4567-e89b-12d3-a456-426614174000',
        debit_account: 'ACC_101',
        credit_account: 'ACC_CESC_CORP',
        amount_paise: 240000,
        currency: 'INR' as const,
        state: 'PENDING_RECONCILIATION' as const,
        created_at: 1795000000000,
        settled_at: null,
      };
      expect(LedgerTransferSchema.safeParse(transfer).success).toBe(true);
    });

    it('validates Settlement Result and Reconciliation Schemas', () => {
      const settlement = {
        status: 'SETTLED' as const,
        receipt: 'RCT_CESC_1001',
        transfer_id: '523e4567-e89b-12d3-a456-426614174004',
        request_id: '123e4567-e89b-12d3-a456-426614174000',
        amount_paise: 240000,
        currency: 'INR' as const,
        settled_at: 1795000002000,
      };
      expect(SettlementResultSchema.safeParse(settlement).success).toBe(true);

      const reconRequest = {
        reservation_id: '423e4567-e89b-12d3-a456-426614174003',
        outcome: 'COMMIT' as const,
        reason: 'Confirmed by TigerBeetle lookup',
      };
      expect(ReconciliationRequestSchema.safeParse(reconRequest).success).toBe(true);

      const reconResult = {
        reservation_id: '423e4567-e89b-12d3-a456-426614174003',
        outcome: 'COMMIT' as const,
        previous_state: 'PENDING_RECONCILIATION' as const,
        current_state: 'POSTED' as const,
        reconciled_at: 1795000010000,
      };
      expect(ReconciliationResultSchema.safeParse(reconResult).success).toBe(true);
    });
  });

  describe('Deterministic Clock (clock.ts)', () => {
    it('provides predictable deterministic timestamps with TestClock', () => {
      const clock = new TestClock(1795000000000);
      expect(clock.now()).toBe(1795000000000);

      clock.advance(90000); // 90 seconds (permit TTL)
      expect(clock.now()).toBe(1795000090000);

      clock.set(1800000000000);
      expect(clock.now()).toBe(1800000000000);
    });

    it('delegates to SystemClock for runtime execution', () => {
      const clock = new SystemClock();
      const now = clock.now();
      expect(typeof now).toBe('number');
      expect(now).toBeGreaterThan(0);
    });
  });
});
