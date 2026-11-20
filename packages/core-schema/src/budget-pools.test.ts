import {
  CanonicalAutonomyModeSchema,
  LegacyAutonomyModeSchema,
  AutonomyModeSchema,
  AutonomousPoolPolicySchema,
  CanonicalCategoryBudgetPoolSchema,
  CategoryBudgetPoolSchema,
  BudgetPeriodSchema,
  CategoryBudgetReservationSchema,
  isValidReservationTransition,
  MerchantClassificationSchema,
  AgentBudgetAllocationSchema,
  CategorySpendingDecisionSchema,
  isValidIanaTimezone,
} from './budget-pools';

describe('BP-1: Canonical Category Budget Data Model & Contracts', () => {
  const baseValidPool = {
    pool_id: 'pool_shopping_001',
    tenant_id: 'tenant_enterprise_01',
    customer_ref: 'cust_98765',
    category_id: 'SHOPPING' as const,
    category_name: 'Retail Shopping & Groceries',
    currency: 'INR' as const,
    monthly_limit_paise: 5000000, // ₹50,000
    weekly_limit_paise: 2000000,  // ₹20,000
    daily_limit_paise: 500000,    // ₹5,000
    per_transaction_limit_paise: 100000, // ₹1,000
    autonomy_mode: 'AUTO_APPROVE_WITHIN_LIMITS' as const,
    status: 'ACTIVE' as const,
    policy_version: 1,
    valid_from: 1700000000000,
    valid_until: 1735689600000,
    timezone: 'Asia/Kolkata',
    created_at: 1700000000000,
    updated_at: 1700000000000,
  };

  // 1. Valid Category Pool
  test('1. parses valid canonical category pool successfully', () => {
    const result = CanonicalCategoryBudgetPoolSchema.safeParse(baseValidPool);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pool_id).toBe('pool_shopping_001');
      expect(result.data.monthly_limit_paise).toBe(5000000);
      expect(result.data.currency).toBe('INR');
      expect(result.data.timezone).toBe('Asia/Kolkata');
    }
  });

  // 2. Negative Amount Rejection
  test('2. rejects negative amounts across all limit fields (Rule E1)', () => {
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        monthly_limit_paise: -5000,
      }).success
    ).toBe(false);

    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        per_transaction_limit_paise: -100,
      }).success
    ).toBe(false);
  });

  // 3. Float Amount Rejection
  test('3. rejects floating-point amounts (Rule E1: integer paise only)', () => {
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        monthly_limit_paise: 5000.5,
      }).success
    ).toBe(false);

    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        per_transaction_limit_paise: 99.99,
      }).success
    ).toBe(false);
  });

  // 4. Invalid Currency Rejection
  test('4. rejects non-INR currencies', () => {
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        currency: 'USD',
      }).success
    ).toBe(false);

    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        currency: 'EUR',
      }).success
    ).toBe(false);
  });

  // 5. Invalid Timezone Rejection
  test('5. rejects invalid IANA timezone strings', () => {
    expect(isValidIanaTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('Invalid/Zone')).toBe(false);

    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        timezone: 'Not_A_Real_Timezone_123',
      }).success
    ).toBe(false);
  });

  // 6. Invalid Autonomy Mode Rejection
  test('6. rejects invalid autonomy modes in canonical schema', () => {
    expect(
      CanonicalAutonomyModeSchema.safeParse('UNRESTRICTED_ACCESS').success
    ).toBe(false);
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        autonomy_mode: 'INVALID_AUTONOMY_MODE',
      }).success
    ).toBe(false);
  });

  // 7. Invalid Period Boundaries
  test('7. rejects invalid period boundaries where period_end <= period_start', () => {
    const invalidPeriod = {
      period_id: 'period_2026_11',
      pool_id: 'pool_shopping_001',
      period_type: 'MONTHLY' as const,
      period_start: 1700000000000,
      period_end: 1700000000000, // Equal is invalid
      timezone: 'Asia/Kolkata',
      limit_paise: 5000000,
      settled_amount_paise: 0,
      reserved_amount_paise: 0,
      version: 1,
    };
    expect(BudgetPeriodSchema.safeParse(invalidPeriod).success).toBe(false);

    const reversedPeriod = {
      ...invalidPeriod,
      period_end: 1699999999999, // Earlier is invalid
    };
    expect(BudgetPeriodSchema.safeParse(reversedPeriod).success).toBe(false);

    const validPeriod = {
      ...invalidPeriod,
      period_end: 1702598400000,
    };
    expect(BudgetPeriodSchema.safeParse(validPeriod).success).toBe(true);
  });

  // 8. Per-Transaction Cap Exceeding Daily/Weekly/Monthly
  test('8. rejects when per_tx > daily, daily > weekly, or weekly > monthly', () => {
    // per_tx > daily
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        per_transaction_limit_paise: 600000, // exceeds daily 500000
      }).success
    ).toBe(false);

    // daily > weekly
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        daily_limit_paise: 2500000, // exceeds weekly 2000000
      }).success
    ).toBe(false);

    // weekly > monthly
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        weekly_limit_paise: 6000000, // exceeds monthly 5000000
      }).success
    ).toBe(false);
  });

  // 9. Reservation State Validation
  test('9. validates CategoryBudgetReservationSchema states', () => {
    const baseReservation = {
      reservation_id: 'res_12345',
      pool_id: 'pool_shopping_001',
      tenant_id: 'tenant_enterprise_01',
      customer_ref: 'cust_98765',
      agent_id: 'agent_procurement_99',
      workflow_id: 'wf_auto_buy_01',
      request_id: 'req_tx_001',
      idempotency_key: 'idem_key_777',
      transaction_digest: 'a'.repeat(64),
      category_id: 'SHOPPING' as const,
      amount_paise: 50000,
      currency: 'INR' as const,
      period_id: 'period_2026_11',
      pool_policy_version: 1,
      status: 'RESERVED' as const,
      created_at: 1700000000000,
      expires_at: 1700000120000,
    };

    expect(CategoryBudgetReservationSchema.safeParse(baseReservation).success).toBe(true);

    // SETTLED requires settled_at
    expect(
      CategoryBudgetReservationSchema.safeParse({
        ...baseReservation,
        status: 'SETTLED',
      }).success
    ).toBe(false);

    expect(
      CategoryBudgetReservationSchema.safeParse({
        ...baseReservation,
        status: 'SETTLED',
        settled_at: 1700000060000,
      }).success
    ).toBe(true);

    // RELEASED requires released_at
    expect(
      CategoryBudgetReservationSchema.safeParse({
        ...baseReservation,
        status: 'RELEASED',
        released_at: 1700000070000,
      }).success
    ).toBe(true);
  });

  // 10. Invalid Reservation Transition
  test('10. enforces strict state machine transitions (AVAILABLE -> RESERVED -> SETTLED)', () => {
    // Valid transitions
    expect(isValidReservationTransition('RESERVED', 'SETTLED')).toBe(true);
    expect(isValidReservationTransition('RESERVED', 'RELEASED')).toBe(true);
    expect(isValidReservationTransition('SETTLED', 'REVERSED')).toBe(true);

    // Invalid transitions
    expect(isValidReservationTransition('RELEASED', 'SETTLED')).toBe(false);
    expect(isValidReservationTransition('RELEASED', 'RESERVED')).toBe(false);
    expect(isValidReservationTransition('REVERSED', 'RESERVED')).toBe(false);
    expect(isValidReservationTransition('REVERSED', 'SETTLED')).toBe(false);
    expect(isValidReservationTransition('SETTLED', 'RESERVED')).toBe(false);
    expect(isValidReservationTransition('SETTLED', 'RELEASED')).toBe(false);
  });

  // 11. Invalid MCC Format
  test('11. enforces 4-digit ISO 18245 numeric MCC code', () => {
    const validMCC = {
      merchant_id: 'merch_swiggy_01',
      merchant_name: 'Swiggy Food Delivery',
      mcc_code: '5814', // Fast food restaurants
      category_id: 'FOOD_DINING' as const,
      verification_source: 'NPCI_UPI_RAILS',
      classification_method: 'PAYMENT_RAIL' as const,
      confidence_basis: 'UPI settlement payload header',
      verified_at: 1700000000000,
      status: 'VERIFIED' as const,
    };
    expect(MerchantClassificationSchema.safeParse(validMCC).success).toBe(true);

    // 3 digits
    expect(
      MerchantClassificationSchema.safeParse({ ...validMCC, mcc_code: '581' }).success
    ).toBe(false);

    // 5 digits
    expect(
      MerchantClassificationSchema.safeParse({ ...validMCC, mcc_code: '58140' }).success
    ).toBe(false);

    // Alphanumeric
    expect(
      MerchantClassificationSchema.safeParse({ ...validMCC, mcc_code: '581A' }).success
    ).toBe(false);
  });

  // 12. AI Advisory Classification Cannot Be VERIFIED
  test('12. prohibits AI_ADVISORY from being marked VERIFIED without rail corroboration', () => {
    const aiAdvisoryClassification = {
      merchant_id: 'merch_unknown_01',
      merchant_name: 'Unregistered Vendor Express',
      mcc_code: '5411',
      category_id: 'SHOPPING' as const,
      verification_source: 'GEMINI_FLASH_INFERENCE',
      classification_method: 'AI_ADVISORY' as const,
      confidence_basis: 'LLM invoice string heuristic',
      verified_at: 1700000000000,
      status: 'VERIFIED' as const, // Prohibited!
    };

    const result = MerchantClassificationSchema.safeParse(aiAdvisoryClassification);
    expect(result.success).toBe(false);

    // Changing status to PROVISIONAL or FLAGGED is allowed
    const provisional = { ...aiAdvisoryClassification, status: 'PROVISIONAL' as const };
    expect(MerchantClassificationSchema.safeParse(provisional).success).toBe(true);
  });

  // 13. Agent Allocation Exceeding Customer Authority
  test('13. rejects agent allocation exceeding customer limits or inverted hierarchy', () => {
    const validAllocation = {
      allocation_id: 'alloc_subagent_01',
      pool_id: 'pool_shopping_001',
      agent_id: 'agent_procurement_99',
      tenant_id: 'tenant_enterprise_01',
      customer_ref: 'cust_98765',
      agent_limit_paise: 2000000, // ₹20,000
      daily_limit_paise: 300000,  // ₹3,000
      per_transaction_limit_paise: 50000, // ₹500
      allowed_categories: ['SHOPPING' as const],
      status: 'ACTIVE' as const,
      valid_from: 1700000000000,
      valid_until: 1735689600000,
      version: 1,
    };
    expect(AgentBudgetAllocationSchema.safeParse(validAllocation).success).toBe(true);

    // per_tx > daily
    expect(
      AgentBudgetAllocationSchema.safeParse({
        ...validAllocation,
        per_transaction_limit_paise: 400000, // exceeds daily 300000
      }).success
    ).toBe(false);

    // daily > agent_limit
    expect(
      AgentBudgetAllocationSchema.safeParse({
        ...validAllocation,
        daily_limit_paise: 3000000, // exceeds total 2000000
      }).success
    ).toBe(false);
  });

  // 14. Expired Pool / valid_until <= valid_from
  test('14. rejects pool when valid_until <= valid_from', () => {
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        valid_until: baseValidPool.valid_from, // Equal
      }).success
    ).toBe(false);

    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        valid_until: baseValidPool.valid_from - 1000, // Earlier
      }).success
    ).toBe(false);
  });

  // 15. Policy Version Validation
  test('15. rejects invalid policy versions (must be positive integer)', () => {
    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        policy_version: 0,
      }).success
    ).toBe(false);

    expect(
      CanonicalCategoryBudgetPoolSchema.safeParse({
        ...baseValidPool,
        policy_version: -2,
      }).success
    ).toBe(false);
  });

  // 16. Backward Compatibility with Legacy Autonomy Modes
  test('16. transforms legacy autonomy modes seamlessly and enforces Invariant I2', () => {
    // Legacy transform tests
    expect(AutonomyModeSchema.parse('ALWAYS_ASK')).toBe('ASK_BEFORE_EVERY_PAYMENT');
    expect(AutonomyModeSchema.parse('PAY_WITHOUT_RESTRICTION')).toBe('AUTO_APPROVE_WITHIN_LIMITS');
    expect(AutonomyModeSchema.parse('AUTO_APPROVE_WITHIN_LIMITS')).toBe('AUTO_APPROVE_WITHIN_LIMITS');
    expect(AutonomyModeSchema.parse('ASK_BEFORE_EVERY_PAYMENT')).toBe('ASK_BEFORE_EVERY_PAYMENT');
    expect(AutonomyModeSchema.parse('MANUAL_ONLY')).toBe('MANUAL_ONLY');

    // Legacy Cockpit UI structure parsing
    const legacyUiPool = {
      id: 'pool-shopping',
      category: 'SHOPPING' as const,
      displayName: 'Shopping',
      monthlyCapPaise: 5000000,
      spentPaise: 1200000,
      singleTxCapPaise: 100000,
      policyMode: 'ALWAYS_ASK' as const,
      color: '#6366f1',
      iconName: 'ShoppingBag',
    };
    const legacyParsed = CategoryBudgetPoolSchema.safeParse(legacyUiPool);
    expect(legacyParsed.success).toBe(true);

    // Invariant I2: CategorySpendingDecisionSchema cannot produce ALLOW when violations exist
    const decisionWithViolations = {
      decision: 'ALLOW' as const,
      decision_reason: 'Overriding policy check',
      policy_version: 1,
      pool_id: 'pool_shopping_001',
      category_id: 'SHOPPING' as const,
      request_id: 'req_001',
      amount_paise: 50000,
      currency: 'INR' as const,
      evaluated_at: 1700000000000,
      requires_human_approval: false,
      violations: ['TRANSACTION_LIMIT_EXCEEDED'],
    };
    expect(CategorySpendingDecisionSchema.safeParse(decisionWithViolations).success).toBe(false);

    const safeDenyDecision = {
      ...decisionWithViolations,
      decision: 'DENY' as const,
    };
    expect(CategorySpendingDecisionSchema.safeParse(safeDenyDecision).success).toBe(true);
  });
});
