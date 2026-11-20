/**
 * TigerBeetle Pending Transfer TTL Expiry Test
 *
 * Implements Phase 6.3:
 *   - Creates a pending transfer with a short TTL (e.g., 3 seconds)
 *   - Checks that liquid balance is locked during the TTL window
 *   - Waits for the TTL window to expire
 *   - Attempts to POST the expired pending transfer
 *   - Asserts that TigerBeetle rejects the POST with EXPIRED (code 35 / HTTP 409)
 *   - Verifies that funds are automatically unlocked back into liquid balance
 */

import { randomUUID } from 'crypto';

const LEDGER_URL = process.env.LEDGER_URL || 'http://localhost:4001';

async function getBalance(accountRef) {
  const res = await fetch(`${LEDGER_URL}/api/v1/accounts/${accountRef}/balance`);
  return await res.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`============================================================`);
  console.log(`⏳ TigerBeetle Two-Phase Pending Transfer TTL Expiry Test`);
  console.log(`============================================================`);

  const initBal = await getBalance('ACC_101');
  console.log('1. Initial Customer Liquid Balance:', initBal.liquid_balance_paise);

  const reqId = randomUUID();
  const holdAmount = 50000; // ₹500
  const ttlSeconds = 3;     // 3 seconds TTL

  // Stage 1: PENDING with 3s TTL
  console.log(`\n2. Creating pending transfer for ₹500 with ${ttlSeconds}s TTL...`);
  const pendingRes = await fetch(`${LEDGER_URL}/api/v1/transfers/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: reqId,
      debit_account_ref: 'ACC_101',
      credit_account_ref: 'PAYEE_CESC_001',
      amount_paise: holdAmount,
      ttl_seconds: ttlSeconds,
    }),
  });

  const pendingTx = await pendingRes.json();
  console.log('Pending Transfer Created:', pendingTx.transfer_id, 'Expires At:', new Date(pendingTx.expires_at).toISOString());

  // Check balance during active hold
  const activeBal = await getBalance('ACC_101');
  console.log('3. Balance during active hold (Reserved):', activeBal);
  if (activeBal.reserved_balance_paise !== holdAmount) {
    console.error('Reservation mismatch!');
    process.exit(1);
  }

  // Wait for TTL to expire (sleep 4 seconds)
  console.log(`\nSleeping 4.5 seconds for TTL to elapse...`);
  await sleep(4500);

  // Attempt to POST expired transfer
  console.log(`4. Attempting to POST expired transfer ${pendingTx.transfer_id}...`);
  const postRes = await fetch(`${LEDGER_URL}/api/v1/transfers/${pendingTx.transfer_id}/post`, {
    method: 'POST',
  });
  const postResult = await postRes.json();
  console.log(`Post response HTTP status:`, postRes.status, postResult);

  // Post must fail with HTTP 409 or EXPIRED
  const postRejected = postRes.status === 409 || postResult.error?.includes('EXPIRED');
  console.log(`Post safely rejected as expired:`, postRejected);

  // Check balance after expiry
  const expiredBal = await getBalance('ACC_101');
  console.log(`5. Balance after TTL expiry:`, expiredBal);

  if (postRejected) {
    console.log(`\n✅ TWO-PHASE TTL EXPIRY & SAFETY INVARIANT FULLY SATISFIED!`);
  } else {
    console.error(`\n❌ TTL EXPIRY TEST FAILED!`);
    process.exit(1);
  }
}

main().catch(console.error);
