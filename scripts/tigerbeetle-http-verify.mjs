import { randomUUID } from 'crypto';

async function main() {
  const reqId = randomUUID();
  console.log('--- Testing Live TigerBeetle Two-Phase Commit over Port 4001 ---');
  console.log('Generated Request ID:', reqId);

  // 1. Check baseline balance
  const initBalRes = await fetch('http://localhost:4001/api/v1/accounts/ACC_101/balance');
  const initBal = await initBalRes.json();
  console.log('1. Initial Customer Balance:', initBal);

  // 2. Stage 1: Create pending transfer (₹2,400 = 240,000 paise)
  const pendingRes = await fetch('http://localhost:4001/api/v1/transfers/pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: reqId,
      debit_account_ref: 'ACC_101',
      credit_account_ref: 'PAYEE_CESC_001',
      amount_paise: 240000,
      ttl_seconds: 120,
    }),
  });
  const pendingTx = await pendingRes.json();
  console.log('2. Pending Transfer Created:', pendingTx);

  // 3. Check balance during hold
  const holdBalRes = await fetch('http://localhost:4001/api/v1/accounts/ACC_101/balance');
  const holdBal = await holdBalRes.json();
  console.log('3. Customer Balance During Pending Hold (Reserved):', holdBal);

  // 4. Stage 2: Post (commit) transfer
  const postRes = await fetch(`http://localhost:4001/api/v1/transfers/${pendingTx.transfer_id}/post`, {
    method: 'POST',
  });
  const postedTx = await postRes.json();
  console.log('4. Post Settlement Result:', postedTx);

  // 5. Check final customer balance
  const finalCustRes = await fetch('http://localhost:4001/api/v1/accounts/ACC_101/balance');
  const finalCustBal = await finalCustRes.json();
  console.log('5. Customer Final Balance (Debited):', finalCustBal);

  // 6. Check final payee balance
  const finalPayeeRes = await fetch('http://localhost:4001/api/v1/accounts/PAYEE_CESC_001/balance');
  const finalPayeeBal = await finalPayeeRes.json();
  console.log('6. Payee Final Balance (Credited):', finalPayeeBal);

  // 7. Stage 1 & 2B: Test Void lifecycle
  console.log('\n--- Testing Void Cancellation Lifecycle ---');
  const voidReqId = randomUUID();
  const voidPendingRes = await fetch('http://localhost:4001/api/v1/transfers/pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: voidReqId,
      debit_account_ref: 'ACC_101',
      credit_account_ref: 'PAYEE_CESC_001',
      amount_paise: 160000,
      ttl_seconds: 120,
    }),
  });
  const voidPendingTx = await voidPendingRes.json();
  console.log('7A. Void Test Pending Transfer Created:', voidPendingTx);

  const voidBalRes = await fetch('http://localhost:4001/api/v1/accounts/ACC_101/balance');
  const voidBal = await voidBalRes.json();
  console.log('7B. Customer Balance During Void Pending Hold:', voidBal);

  const voidActionRes = await fetch(`http://localhost:4001/api/v1/transfers/${voidPendingTx.transfer_id}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'VERIFICATION_TEST_CANCEL' }),
  });
  const voidActionTx = await voidActionRes.json();
  console.log('7C. Void Action Result:', voidActionTx);

  const voidFinalBalRes = await fetch('http://localhost:4001/api/v1/accounts/ACC_101/balance');
  const voidFinalBal = await voidFinalBalRes.json();
  console.log('7D. Customer Balance After Void (Restored):', voidFinalBal);

  // 8. Verify Invariants
  if (
    holdBal.reserved_balance_paise === 240000 &&
    finalCustBal.reserved_balance_paise === 0 &&
    finalCustBal.liquid_balance_paise === initBal.liquid_balance_paise - 240000 &&
    finalPayeeBal.posted_balance_paise >= 240000 &&
    voidActionTx.status === 'VOIDED' &&
    voidFinalBal.liquid_balance_paise === finalCustBal.liquid_balance_paise &&
    voidFinalBal.reserved_balance_paise === 0
  ) {
    console.log('>>> ALL TIGERBEETLE TWO-PHASE INVARIANTS (POST & VOID) VERIFIED SUCCESSFULLY! <<<');
  } else {
    console.error('>>> INVARIANT CHECK FAILED <<<');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
