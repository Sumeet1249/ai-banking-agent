# AGENTGUARD AI — PRODUCTION DEPLOYMENT GUIDE

**Stack Requirements**:
- Node.js: `>= 20.0.0` (Recommended: `v22.14.0`)
- Operating Systems: Linux (Ubuntu 22.04+), macOS (13+), Windows 11
- Package Manager: `npm 10.8.2+`
- Database: SQLite 3 / TigerBeetle Cluster (v0.16+)

---

## 1. Port Architecture & Microservices

| Service | Directory | Port | Protocol | Role |
|---|---|---|---|---|
| **Compliance Cockpit** | `apps/compliance-cockpit` | **13003** | HTTP / Next.js | Administrative Governance UI |
| **Gateway MCP** | `packages/gateway-mcp` | **8081** | HTTP / JSON-RPC | Agent Authentication & Permit Signing |
| **Bank Gate** | `packages/bank-gate` | **4000** | HTTP / REST | Financial Decision Engine & Ledger Store |
| **Ledger Adapter** | `packages/ledger-adapter` | **4001** | HTTP / TCP | TigerBeetle Double-Entry Accounting |
| **Witness Server** | `packages/witness` | **5000** | HTTP / REST | Independent Merkle Transparency Notary |

---

## 2. Environment Variables

### Bank Gate (`packages/bank-gate/.env`):
```env
PORT=4000
BANK_GATE_PORT=4000
DB_PATH=bank_gate.db
LEDGER_CLIENT=fake # or 'http' for live TigerBeetle adapter
LEDGER_ADAPTER_URL=http://localhost:4001
WITNESS_URL=http://localhost:5000
NODE_ENV=production
```

### Gateway MCP (`packages/gateway-mcp/.env`):
```env
PORT=8081
BANK_GATE_URL=http://localhost:4000
KMS_PROVIDER=memory # or 'aws-kms', 'vault'
DEMO_MODE=1
NODE_ENV=production
```

### Compliance Cockpit (`apps/compliance-cockpit/.env.local`):
```env
PORT=13003
NEXT_PUBLIC_BANK_GATE_URL=http://localhost:4000
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8081
```

---

## 3. Production Start Sequence

To start all services deterministically:

```bash
# 1. Build all packages and schemas
npm run build

# 2. Start Witness Notary (Port 5000)
node packages/witness/dist/server.js &

# 3. Start Ledger Adapter (Port 4001)
node packages/ledger-adapter/dist/server.js &

# 4. Start Bank Gate Core (Port 4000)
node packages/bank-gate/dist/server.js &

# 5. Start Gateway MCP (Port 8081)
node packages/gateway-mcp/dist/server.js &

# 6. Start Compliance Cockpit (Port 13003)
cd apps/compliance-cockpit && npx next start -p 13003
```

---

## 4. Health & Readiness Verification

```bash
# Check Bank Gate Liveness & Readiness
curl http://localhost:4000/health
curl http://localhost:4000/ready

# Check Gateway MCP
curl http://localhost:8081/health

# Check Dashboard Summary API
curl http://localhost:4000/api/v1/dashboard/summary
```
