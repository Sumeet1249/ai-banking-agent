/**
 * TigerBeetle High-Concurrency Distributed Stress Test
 *
 * Implements Phase 6.3:
 *   - Benchmarks concurrent two-phase financial transfers over Port 4001
 *   - Tests batches of 100 and 500 transfers
 *   - Measures operations per second, latency percentiles (p50, p95, p99)
 *   - Validates double-entry mathematical conservation of funds
 */

import { randomUUID } from 'crypto';

const LEDGER_URL = process.env.LEDGER_URL || 'http://localhost:4001';

async function getBalance(accountRef) {
  const res = await fetch(`${LEDGER_URL}/api/v1/accounts/${accountRef}/balance`);
  if (!res.ok) throw new Error(`Failed to fetch balance: ${res.status}`);
  return await res.json();
}

async function executeSingleTwoPhaseTransfer(index, amountPaise = 1000) {
  const reqId = randomUUID();
  const startTime = performance.now();

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

  if (pendingRes.status !== 201) {
    const err = await pendingRes.json();
    return { success: false, stage: 'PENDING', error: err, durationMs: performance.now() - startTime };
  }
  const pendingTx = await pendingRes.json();

  // Stage 2: POST
  const postRes = await fetch(`${LEDGER_URL}/api/v1/transfers/${pendingTx.transfer_id}/post`, {
    method: 'POST',
  });

  if (postRes.status !== 200) {
    const err = await postRes.json();
    return { success: false, stage: 'POST', error: err, durationMs: performance.now() - startTime };
  }
  const postedTx = await postRes.json();

  return {
    success: true,
    transferId: postedTx.transfer_id,
    durationMs: performance.now() - startTime,
  };
}

async function runBatch(batchSize, concurrencyLimit = 20) {
  console.log(`\n============================================================`);
  console.log(`🚀 Starting Concurrency Stress Test: ${batchSize} Transfers`);
  console.log(`   Target: ${LEDGER_URL} | Concurrency Limit: ${concurrencyLimit}`);
  console.log(`============================================================`);

  const initialCustBal = await getBalance('ACC_101');
  const initialPayeeBal = await getBalance('PAYEE_CESC_001');
  console.log(`Initial Customer Liquid Balance: ₹${(initialCustBal.liquid_balance_paise / 100).toFixed(2)} (${initialCustBal.liquid_balance_paise} paise)`);
  console.log(`Initial Payee Posted Balance:    ₹${(initialPayeeBal.posted_balance_paise / 100).toFixed(2)} (${initialPayeeBal.posted_balance_paise} paise)`);

  const transferAmountPaise = 500; // ₹5.00 each
  const totalAmountToTransfer = batchSize * transferAmountPaise;

  if (initialCustBal.liquid_balance_paise < totalAmountToTransfer) {
    throw new Error(`Insufficient funds for batch: need ${totalAmountToTransfer} paise, have ${initialCustBal.liquid_balance_paise}`);
  }

  const results = [];
  const startOverall = performance.now();

  // Worker pool for concurrency control
  let currentIdx = 0;
  async function worker() {
    while (currentIdx < batchSize) {
      const idx = currentIdx++;
      const res = await executeSingleTwoPhaseTransfer(idx, transferAmountPaise);
      results.push(res);
    }
  }

  const workers = Array.from({ length: concurrencyLimit }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = performance.now() - startOverall;
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const latencies = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)].toFixed(2);
  const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
  const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(2);
  const throughputOpsSec = ((successful.length * 2) / (totalDurationMs / 1000)).toFixed(2); // 2 ops per 2-phase transfer (pending + post)

  console.log(`\n--- Batch Performance Metrics ---`);
  console.log(`Total Completed:       ${results.length} / ${batchSize}`);
  console.log(`Successful:            ${successful.length}`);
  console.log(`Failed:                ${failed.length}`);
  console.log(`Total Wall Time:       ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Two-Phase Throughput:  ${(successful.length / (totalDurationMs / 1000)).toFixed(2)} transfers/sec`);
  console.log(`Raw Ledger Throughput: ${throughputOpsSec} operations/sec (Pending + Post)`);
  console.log(`Latency Percentiles (2-Phase Roundtrip):`);
  console.log(`  p50: ${p50} ms`);
  console.log(`  p95: ${p95} ms`);
  console.log(`  p99: ${p99} ms`);

  // Verify Conservation of Money Invariant
  const finalCustBal = await getBalance('ACC_101');
  const finalPayeeBal = await getBalance('PAYEE_CESC_001');

  const expectedCustLiquid = initialCustBal.liquid_balance_paise - totalAmountToTransfer;
  const expectedPayeePosted = initialPayeeBal.posted_balance_paise + totalAmountToTransfer;

  console.log(`\n--- Financial Invariant Verification ---`);
  console.log(`Expected Customer Liquid: ${expectedCustLiquid} | Actual: ${finalCustBal.liquid_balance_paise}`);
  console.log(`Expected Payee Posted:    ${expectedPayeePosted} | Actual: ${finalPayeeBal.posted_balance_paise}`);
  console.log(`Customer Reserved Balance: ${finalCustBal.reserved_balance_paise} (Must be 0)`);

  const customerConserved = finalCustBal.liquid_balance_paise === expectedCustLiquid;
  const payeeConserved = finalPayeeBal.posted_balance_paise === expectedPayeePosted;
  const zeroReserved = finalCustBal.reserved_balance_paise === 0;

  if (customerConserved && payeeConserved && zeroReserved && failed.length === 0) {
    console.log(`✅ CONSERVATION OF FUNDS & ZERO-OVERDRAFT INVARIANT FULLY SATISFIED!`);
    return {
      batchSize,
      successful: successful.length,
      failed: failed.length,
      p50,
      p95,
      p99,
      throughputOpsSec,
      passed: true,
    };
  } else {
    console.error(`❌ INVARIANT VIOLATION DETECTED!`);
    return { passed: false };
  }
}

async function main() {
  console.log('Starting TigerBeetle Concurrency & Throughput Stress Testing...');

  // Run Test 1: 100 Transfers (Concurrency 20)
  const test1 = await runBatch(100, 20);
  if (!test1.passed) process.exit(1);

  // Run Test 2: 500 Transfers (Concurrency 30)
  const test2 = await runBatch(500, 30);
  if (!test2.passed) process.exit(1);

  console.log(`\n============================================================`);
  console.log(`🏆 ALL HIGH-CONCURRENCY STRESS TESTS PASSED WITH 100% INTEGRITY!`);
  console.log(`============================================================\n`);
}

main().catch((err) => {
  console.error('Stress test fatal error:', err);
  process.exit(1);
});
