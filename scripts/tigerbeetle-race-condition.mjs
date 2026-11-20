/**
 * TigerBeetle Concurrent Race Condition & Overdraft Prevention Stress Test
 *
 * Implements Phase 6.3:
 *   - Simulates a thundering herd race condition where concurrent agents
 *     attempt to deplete more than 100% of available account funds simultaneously.
 *   - Proves TigerBeetle's distributed consensus rejects overdrafts atomically.
 *   - Verifies exact cutoff count and absolute mathematical fund conservation.
 */

import { randomUUID } from 'crypto';

const LEDGER_URL = process.env.LEDGER_URL || 'http://localhost:4001';

async function getBalance(accountRef) {
  const res = await fetch(`${LEDGER_URL}/api/v1/accounts/${accountRef}/balance`);
  if (!res.ok) throw new Error(`Failed to fetch balance: ${res.status}`);
  return await res.json();
}

async function attemptTransfer(amountPaise) {
  const reqId = randomUUID();

  // Stage 1: PENDING
  const pendingRes = await fetch(`${LEDGER_URL}/api/v1/transfers/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: reqId,
      debit_account_ref: 'ACC_101',
      credit_account_ref: 'PAYEE_CESC_001',
      amount_paise: amountPaise,
      ttl_seconds: 120,
    }),
  });

  if (pendingRes.status === 422) {
    const err = await pendingRes.json();
    return { success: false, reason: err.reason_code || 'INSUFFICIENT_FUNDS' };
  }

  if (pendingRes.status !== 201) {
    const err = await pendingRes.json();
    return { success: false, reason: `UNEXPECTED_STATUS_${pendingRes.status}`, error: err };
  }

  const pendingTx = await pendingRes.json();

  // Stage 2: POST
  const postRes = await fetch(`${LEDGER_URL}/api/v1/transfers/${pendingTx.transfer_id}/post`, {
    method: 'POST',
  });

  if (postRes.status !== 200) {
    const err = await postRes.json();
    return { success: false, reason: `POST_FAILED_${postRes.status}`, error: err };
  }

  return { success: true, transferId: pendingTx.transfer_id };
}

async function main() {
  console.log(`============================================================`);
  console.log(`⚡ TigerBeetle Concurrent Race Condition & Overdraft Test`);
  console.log(`============================================================`);

  const initialCustBal = await getBalance('ACC_101');
  const initialPayeeBal = await getBalance('PAYEE_CESC_001');

  console.log(`Starting Customer Liquid Balance: ₹${(initialCustBal.liquid_balance_paise / 100).toFixed(2)} (${initialCustBal.liquid_balance_paise} paise)`);

  // Target: We want exactly 10 transfers of ₹1,000 (100,000 paise) to be able to succeed,
  // and we fire 30 simultaneous requests (3x over-subscription)!
  // First calculate transfer amount so that exactly N can succeed:
  const N = 10;
  const totalConcurrent = 30;
  const transferAmountPaise = Math.floor(initialCustBal.liquid_balance_paise / N);
  const totalFundAllocated = transferAmountPaise * N;

  console.log(`Transfer Unit Size:        ₹${(transferAmountPaise / 100).toFixed(2)} (${transferAmountPaise} paise)`);
  console.log(`Planned Success Cutoff:    Exactly ${N} transfers`);
  console.log(`Simultaneous Requests:     ${totalConcurrent} (3x over-subscription)`);
  console.log(`Total Attempted Spend:     ₹${((totalConcurrent * transferAmountPaise) / 100).toFixed(2)}`);

  console.log(`\nLaunching ${totalConcurrent} concurrent requests simultaneously...`);
  const promises = Array.from({ length: totalConcurrent }, () => attemptTransfer(transferAmountPaise));
  const results = await Promise.all(promises);

  const succeeded = results.filter((r) => r.success);
  const rejected = results.filter((r) => !r.success && r.reason === 'INSUFFICIENT_FUNDS');
  const unexpected = results.filter((r) => !r.success && r.reason !== 'INSUFFICIENT_FUNDS');

  console.log(`\n--- Race Condition Outcomes ---`);
  console.log(`Total Successful Transfers: ${succeeded.length} (Expected: ${N})`);
  console.log(`Total Rejected (INSUFFICIENT_FUNDS): ${rejected.length} (Expected: ${totalConcurrent - N})`);
  console.log(`Unexpected Errors:          ${unexpected.length} (Expected: 0)`);

  const finalCustBal = await getBalance('ACC_101');
  const finalPayeeBal = await getBalance('PAYEE_CESC_001');

  const actualDebited = initialCustBal.liquid_balance_paise - finalCustBal.liquid_balance_paise;
  const actualCredited = finalPayeeBal.posted_balance_paise - initialPayeeBal.posted_balance_paise;

  console.log(`\n--- Balance Conservation & Overdraft Invariant ---`);
  console.log(`Total Amount Debited from Customer: ${actualDebited} paise`);
  console.log(`Total Amount Credited to Payee:     ${actualCredited} paise`);
  console.log(`Remaining Customer Liquid Balance:  ${finalCustBal.liquid_balance_paise} paise`);
  console.log(`Customer Reserved Balance:          ${finalCustBal.reserved_balance_paise} paise (Must be 0)`);

  const countExact = succeeded.length === N && rejected.length === totalConcurrent - N;
  const balanceConserved = actualDebited === totalFundAllocated && actualCredited === totalFundAllocated;
  const noOverdraft = finalCustBal.liquid_balance_paise >= 0 && finalCustBal.reserved_balance_paise === 0;

  if (countExact && balanceConserved && noOverdraft && unexpected.length === 0) {
    console.log(`\n✅ RACE CONDITION & ATOMIC OVERDRAFT PREVENTION VERIFIED WITH 100% ACCURACY!`);
  } else {
    console.error(`\n❌ RACE CONDITION TEST FAILED!`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during race condition test:', err);
  process.exit(1);
});
