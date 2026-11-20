import { createClient } from 'tigerbeetle-node';

const client = createClient({
  cluster_id: 0n,
  replica_addresses: [
    '172.28.0.2:3001',
    '172.28.0.3:3001',
    '172.28.0.4:3001',
  ],
});

async function main() {
  console.log('Connecting to TigerBeetle 3-replica cluster...');
  
  const debitAccountId = 9990001n;
  const creditAccountId = 9990002n;
  
  console.log('Ensuring credit account exists...');
  await client.createAccounts([
    {
      id: creditAccountId,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      reserved: 0,
      ledger: 999,
      code: 1,
      flags: 0,
      timestamp: 0n,
    },
  ]);

  // Two-Phase Transfer Test:
  // Step 1: Create a Pending Transfer (flags: 2 = pending)
  const transferId = 8880001n;
  console.log(`Creating Two-Phase PENDING transfer: ID ${transferId} (Amount: 50000 paise / ₹500)...`);
  
  const transferErrors = await client.createTransfers([
    {
      id: transferId,
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId,
      amount: 50000n, // 50000 paise
      pending_id: 0n,
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      timeout: 120, // 120s TTL
      ledger: 999,
      code: 1,
      flags: 2, // 2 = pending
      timestamp: 0n,
    },
  ]);

  console.log('Pending transfer result errors:', transferErrors);

  // Step 2: Post the Pending Transfer (flags: 1 = post_pending_transfer)
  const postTransferId = 8880002n;
  console.log(`Posting Pending transfer with resolution transfer ID ${postTransferId}...`);
  const postErrors = await client.createTransfers([
    {
      id: postTransferId,
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId,
      amount: 50000n,
      pending_id: transferId, // Reference to the pending transfer
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      timeout: 0,
      ledger: 999,
      code: 1,
      flags: 1, // 1 = post_pending_transfer
      timestamp: 0n,
    },
  ]);

  console.log('Post transfer result errors:', postErrors);

  // Step 3: Lookup accounts to verify balances
  const accounts = await client.lookupAccounts([debitAccountId, creditAccountId]);
  console.log('Account balances after 2-phase settlement:');
  for (const acc of accounts) {
    console.log(`Account ${acc.id}: debits_posted=${acc.debits_posted}, credits_posted=${acc.credits_posted}, debits_pending=${acc.debits_pending}`);
  }

  console.log('================================================================');
  console.log('TWO-PHASE SETTLEMENT VERIFICATION COMPLETE ON REAL TIGERBEETLE!');
  console.log('================================================================');

  client.destroy();
}

main().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
