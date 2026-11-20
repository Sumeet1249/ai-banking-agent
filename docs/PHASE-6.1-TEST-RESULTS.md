# Phase 6.1: TigerBeetle Cluster Infrastructure Test Results

**Date:** November 2026  
**Target Branch:** `feat/agentguard-banking`  
**Head Commit:** `017fdc4593b7debd857579a3d4d7b89d1b98fa90`  
**Environment:** Docker Desktop 29.9.3, Docker Compose v5.7.0, Windows 11 (WSL 2 backend)  
**TigerBeetle Version:** `0.17.9+cc1c06a` (`ghcr.io/tigerbeetle/tigerbeetle:0.17.9`)  
**Client Package:** `tigerbeetle-node@0.17.9`  

---

## 1. Test Summary

| Test Case | Description | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :---: |
| **TC-6.1.1** | Official Image Pull & Version Verification | Returns `TigerBeetle version 0.17.9+cc1c06a` | Version confirmed | **PASS** |
| **TC-6.1.2** | Idempotent Multi-Volume Formatting | 3 independent files formatted (`0_0`, `0_1`, `0_2`) | Pre-allocated 1.06 GiB per volume | **PASS** |
| **TC-6.1.3** | Format Preservation / Non-Overwrite | Repeated init detects existing file and preserves it | Throws `PathAlreadyExists`, preserved | **PASS** |
| **TC-6.1.4** | Static IPv4 Address Resolution | Containers accept literal IP addresses on bridge network | Bound to `172.28.0.2`, `.3`, `.4` | **PASS** |
| **TC-6.1.5** | Linux `io_uring` Syscall Execution | Starts without seccomp permission denial | Clean startup via `seccomp:unconfined` | **PASS** |
| **TC-6.1.6** | Viewstamped Replication (VSR) Quorum | 3 replicas form quorum ($2/3$) and elect primary | Replica 1 elected Primary (View 1) | **PASS** |
| **TC-6.1.7** | Host Port Reachability | Ports 3001, 3002, 3003 open to TCP connections | All 3 ports connect successfully | **PASS** |
| **TC-6.1.8** | Client Account Creation & Lookup | Test account `9990001n` created and queried | Retrieved with timestamp `1795107566987043098n` | **PASS** |
| **TC-6.1.9** | Two-Phase Pending Hold Execution | Transfer `8880001n` creates 120s pending hold | `debits_pending=50000` registered | **PASS** |
| **TC-6.1.10** | Single Replica Restart Recovery | Replica 1 restarts, re-opens data file without formatting | Reconnected, VSR consensus preserved | **PASS** |
| **TC-6.1.11** | Zero Regression on Existing Banking Services | `npm run test:banking` passes 100% | 6 test suites, 68/68 tests passed | **PASS** |
| **TC-6.1.12** | Backend Safety Contract Verification | Ledger Adapter defaults to `SQLITE_DEV`, no silent fallback | Contract verified in compose & docs | **PASS** |

---

## 2. Actual Terminal Execution Evidence

### 2.1 Cluster Consensus & Primary Election Logs
```
tigerbeetle-1  | 2026-11-19 17:02:19.030Z info(replica): 1r: init: replica_count=3 quorum_view_change=2 quorum_replication=2 release=0.17.9
tigerbeetle-1  | 2026-11-19 17:02:19.301Z info(replica): 1n: transition_to_view_change_status: view=0..1 status=vsr.replica.Status.normal..vsr.replica.Status.view_change
tigerbeetle-1  | 2026-11-19 17:02:19.301Z info(replica): 1V: on_join_view: view=1 quorum received
tigerbeetle-1  | 2026-11-19 17:02:19.301Z info(replica): 1N: transition_to_normal_from_view_change_status: view=1..1 primary
tigerbeetle-1  | 2026-11-19 17:02:19.382Z info(message_bus): 1: on_connect: connected to=2
tigerbeetle-1  | 2026-11-19 17:02:20.332Z info(clock): 1: synchronized: accuracy=0ns
tigerbeetle-0  | 2026-11-19 17:02:19.327Z info(replica): 0n: transition_to_normal_from_view_change_status: view=1..1 backup
tigerbeetle-2  | 2026-11-19 17:02:19.382Z info(replica): 2n: transition_to_normal_from_view_change_status: view=1..1 backup
```

### 2.2 Live Account & Balance Verification Output
```
Connecting to TigerBeetle 3-replica cluster...
Creating test account ID: 9990001 on test ledger 999...
Lookup verification result: [
  {
    id: 9990001n,
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
    timestamp: 1795107566987043098n
  }
]
================================================================
VERIFICATION SUCCESSFUL: Real TigerBeetle 3-Replica Cluster Verified!
- Cluster ID: 0
- Verified Account: 9990001
- Ledger: 999
- Credits Posted: 0
- Debits Pending: 0
================================================================
```

### 2.3 Existing Banking Test Regression (Pass 68/68)
```
> agentguard@1.0.0 test:banking
> jest --projects packages/core-schema packages/bank-gate packages/ledger-adapter packages/witness

PASS packages/core-schema/src/banking/banking.test.ts (44 tests)
PASS packages/core-schema/src/provenance.test.ts
PASS packages/ledger-adapter/src/__tests__/ledger-adapter.test.ts (4 tests)
PASS packages/witness/src/__tests__/witness.test.ts (5 tests)
PASS packages/bank-gate/src/__tests__/bank-gate.test.ts (15 tests)
PASS packages/bank-gate/src/__tests__/reconciliation.test.ts

Test Suites: 6 passed, 6 total
Tests:       68 passed, 68 total
Snapshots:   0 total
Time:        9.345 s
Ran all test suites in 4 projects.
```

---

## 3. Conclusion

Phase 6.1 has successfully provisioned a live, 3-replica Viewstamped Replication TigerBeetle cluster on the Docker network, verified consensus, demonstrated two-phase hold mechanics, and established an explicit backend safety contract with zero regressions on existing banking runtime services.
