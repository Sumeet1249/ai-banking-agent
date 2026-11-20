# AgentGuard AI — TigerBeetle Cluster Deployment Runbook

**Audience:** Site Reliability Engineers, Distributed Systems Operators, Security Auditors  
**Cluster Architecture:** 3-Node Viewstamped Replication (VSR) Cluster  
**Container Image:** `ghcr.io/tigerbeetle/tigerbeetle:0.17.9`  
**Cluster ID:** `0` (Development/Testing)  
**Replica Addresses:** `172.28.0.2:3001,172.28.0.3:3001,172.28.0.4:3001`  

---

## 1. Quick Start Commands

### Step 1: Idempotent Data File Initialization
Formats the three replica data files (`0_0.tigerbeetle`, `0_1.tigerbeetle`, `0_2.tigerbeetle`) in dedicated Docker volumes **if and only if** they do not already exist.

**On Windows (PowerShell):**
```powershell
Set-Location S:\trail\AGENTGUARD-AI
powershell -ExecutionPolicy Bypass -File .\scripts\tigerbeetle-init.ps1
```

**On Linux / macOS:**
```bash
cd /path/to/AGENTGUARD-AI
./scripts/tigerbeetle-init.sh
```

### Step 2: Start the Full Multi-Service Stack
Starts the 3 TigerBeetle replicas alongside the 5 AgentGuard application services:
```bash
docker compose up -d
```

### Step 3: Verify Viewstamped Replication (VSR) Consensus
Inspect the replica container logs to verify that the cluster elected a primary:
```bash
docker compose logs --tail 20 tigerbeetle-0 tigerbeetle-1 tigerbeetle-2
```

**Expected Healthy Consensus Output:**
```
tigerbeetle-1  | 1N: transition_to_normal_from_view_change_status: view=1..1 primary
tigerbeetle-0  | 0n: transition_to_normal_from_view_change_status: view=1..1 backup
tigerbeetle-2  | 2n: transition_to_normal_from_view_change_status: view=1..1 backup
tigerbeetle-0  | 0: synchronized: accuracy=0ns
tigerbeetle-1  | 1: synchronized: accuracy=0ns
tigerbeetle-2  | 2: synchronized: accuracy=0ns
```

---

## 2. Cluster Health & Diagnostic Verification

### 2.1 TCP Port Probing
Verify that all three replica ports are open and listening on the host:

```powershell
node -e "const net = require('net'); [3001, 3002, 3003].forEach(port => { const s = net.createConnection({ port, host: '127.0.0.1' }, () => { console.log('Replica port ' + port + ': OPEN'); s.destroy(); }); s.on('error', (e) => console.error('Port ' + port + ' error:', e.message)); });"
```

### 2.2 Live Consensus & Account Verification Script
Run the automated test verification script in an isolated test container attached to `agentguard-ai_agentguard-net`:

```bash
docker run --rm --security-opt seccomp=unconfined \
  --net agentguard-ai_agentguard-net \
  -v S:\trail\AGENTGUARD-AI\scripts:/scripts \
  -w /scripts node:20-alpine \
  node tigerbeetle-verify.mjs
```

**Expected Successful Output:**
```
Connecting to TigerBeetle 3-replica cluster...
Creating test account ID: 9990001 on test ledger 999...
Lookup verification result: [ { id: 9990001n, ledger: 999, ... } ]
================================================================
VERIFICATION SUCCESSFUL: Real TigerBeetle 3-Replica Cluster Verified!
- Cluster ID: 0
- Verified Account: 9990001
- Ledger: 999
================================================================
```

---

## 3. Failure Testing & Maintenance Procedures

### 3.1 Single Replica Restart
Simulate a single-node crash to confirm that the remaining 2 replicas maintain quorum ($2/3$):
```bash
# Restart Replica 1 (the Primary)
docker restart tigerbeetle-1

# Observe view change / reelection
docker compose logs -f tigerbeetle-0 tigerbeetle-1 tigerbeetle-2
```

### 3.2 Full Cluster Restart & Persistence Audit
Verify that data files survive a complete cluster teardown:
```bash
# 1. Stop all replicas
docker compose stop tigerbeetle-0 tigerbeetle-1 tigerbeetle-2

# 2. Restart all replicas
docker compose start tigerbeetle-0 tigerbeetle-1 tigerbeetle-2

# 3. Confirm files are opened without reformatting
docker compose logs --tail 10 tigerbeetle-0
# Expected: "info(io): opening '0_0.tigerbeetle'..."
```

### 3.3 Graceful Shutdown
To shut down all services without data loss:
```bash
docker compose down
```
> [!NOTE]
> `docker compose down` stops and deletes containers but **preserves all Docker named volumes** (`tb-data-0`, `tb-data-1`, `tb-data-2`, `gateway-data`, `bank-gate-data`, `ledger-data`).

---

## 4. Troubleshooting Common Issues

| Symptom / Error | Root Cause | Remediation |
| :--- | :--- | :--- |
| `error(io): io_uring is not available: PermissionDenied` | Docker default seccomp profile blocks `io_uring` syscalls. | Ensure container has `security_opt: ["seccomp:unconfined"]`. |
| `error: --addresses: invalid IPv4 or IPv6 address` | DNS hostname passed in `--addresses`. TigerBeetle only parses literal IPs. | Use literal static IPs defined in `docker-compose.yml` (`172.28.0.2`, `172.28.0.3`, `172.28.0.4`). |
| `error: PathAlreadyExists` during format | Formatting script run on an already-formatted volume. | Normal behavior. Formatting is only needed once. Script detects and preserves file. |
| `error(io): Direct IO unavailable` | Host filesystem or Docker virtual mount does not support `O_DIRECT`. | Add the `--development` flag to both `format` and `start` commands. |
| Node.js client `debits_pending must be a BigInt` | JavaScript `Number` passed instead of `BigInt`. | Ensure all ID, amount, and timestamp fields use `BigInt` literals (e.g. `50000n`). |
