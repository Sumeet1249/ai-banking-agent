/**
 * Re-seed Customer ACC_101 with funds from Treasury for subsequent tests
 */

import { randomUUID } from 'crypto';

const LEDGER_URL = process.env.LEDGER_URL || 'http://localhost:4001';

async function main() {
  const reqId = randomUUID();
  console.log('Refunding ACC_101 with ₹50,000 (5,000,000 paise) from BANK_TREASURY...');

  // Pending transfer from BANK_TREASURY to ACC_101
  const pendingRes = await fetch(`${LEDGER_URL}/api/v1/transfers/pending`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: reqId,
      debit_account_ref: 'PAYEE_CESC_001',
      credit_account_ref: 'ACC_101',
      amount_paise: 5000000,
      ttl_seconds: 120,
    }),
  });

  const pendingTx = await pendingRes.json();
  if (pendingRes.status !== 201) {
    console.error('Pending failed:', pendingTx);
    process.exit(1);
  }

  // Post transfer
  const postRes = await fetch(`${LEDGER_URL}/api/v1/transfers/${pendingTx.transfer_id}/post`, {
    method: 'POST',
  });
  const postTx = await postRes.json();
  console.log('Refund Post Result:', postTx);

  const balRes = await fetch(`${LEDGER_URL}/api/v1/accounts/ACC_101/balance`);
  const bal = await balRes.json();
  console.log('Updated Customer ACC_101 Balance:', bal);
}

main().catch(console.error);
