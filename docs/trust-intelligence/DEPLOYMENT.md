# AGENTGUARD TRUST INTELLIGENCE ENGINE — DEPLOYMENT & PRODUCTION RUNBOOK

**Target Architecture:** Zero-Trust Autonomous AI Agent Governance Kernel  
**Classification:** Financial Application Security / Runtime Governance Engine  
**Version:** 1.0.0  

---

## 1. System Architecture & Topology

The AgentGuard platform runs as a coordinated suite of 6 dedicated microservices:

```
[ Customer / Supervisor ]          [ Autonomous AI Agents ]
           │                                  │
    HTTP / Passkeys (WebAuthn)         MCP Tool Invocations
           ▼                                  ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│   Compliance Cockpit    │        │       Gateway MCP       │
│      (Port 13003)       │◄───────┤       (Port 8081)       │
└────────────┬────────────┘        └───────────┬─────────────┘
             │                                 │
             ├─────────────────────────────────┼────────────────────────┐
             ▼                                 ▼                        ▼
┌─────────────────────────┐        ┌─────────────────────────┐   ┌─────────────────────────┐
│ Trust Intelligence      │        │        Bank Gate        │   │    Market Data MCP      │
│      (Port 4006)        │        │       (Port 4000)       │   │       (Port 4004)       │
└────────────┬────────────┘        └───────────┬─────────────┘   └─────────────────────────┘
             │                                 │
             └────────────────┬────────────────┘
                              ▼
                   ┌─────────────────────────┐
                   │   Cryptographic Witness │
                   │       (Port 5000)       │
                   └─────────────────────────┘
```

---

## 2. Port Allocation & Network Ingress

| Service | Host Port | Protocol | Ingress Policy | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Compliance Cockpit** | `13003` | HTTP / HTTPS | Public / Internal VPN | Next.js Dashboard, Vital Risk Radar & Policy Studio |
| **Gateway MCP** | `8081` | HTTP / SSE / MCP | Agent Cluster / VPC | Inbound agent MCP tool proxy, Ed25519 TBP permit issuance |
| **Trust Engine** | `4006` | HTTP REST | VPC Internal | Behavioral anomaly, Z-score, auto-quarantine, agent identity |
| **Market Data MCP** | `4004` | HTTP / MCP | VPC Internal | Read-only market intelligence (NSE/BSE, MF, Gold ETFs) |
| **Bank Gate** | `4000` | HTTP REST | VPC Private Only | Atomic financial settlement kernel (Rule E1: integer paise) |
| **Witness** | `5000` | HTTP REST | VPC Private Only | Merkle transparency tree & SHA-256 hash-chain cosigner |

---

## 3. Environment Variable Configuration

Create `.env` at root and `.env.local` in `apps/compliance-cockpit/` using `docs/trust-intelligence/DEPLOYMENT.md` references:

```ini
# Core LLM API Key (Google Gemini 1.5)
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here

# Service Endpoints
APP_URL=http://localhost:13003
PORT=8081
GATEWAY_URL=http://localhost:8081
NEXT_PUBLIC_GATEWAY_URL=http://localhost:8081
BANK_GATE_PORT=4000
BANK_GATE_URL=http://localhost:4000
WITNESS_PORT=5000
WITNESS_URL=http://localhost:5000
MARKET_DATA_PORT=4004
MARKET_MCP_URL=http://localhost:4004
TRUST_ENGINE_PORT=4006
TRUST_ENGINE_URL=http://localhost:4006
NEXT_PUBLIC_TRUST_ENGINE_URL=http://localhost:4006

# Security & Governance Credentials
GATEWAY_ADMIN_KEY=demo-admin-key-2026
GATEWAY_KEY_ID=agentguard-key-1
AEGIS_API_KEY=demo-aegis-key
AGENTGUARD_API_KEY=demo-agentguard-key
AGENTGUARD_AGENT_ID=AGENT_ELEC_01
DEMO_MODE=1
ALLOW_AUTH_BOOTSTRAP=1

# SQLite Durable Storage Paths
DATABASE_URL=file:./agentguard.db
DB_PATH=./agentguard.db
BANK_GATE_DB_PATH=./bank_gate.db
BANK_GATE_AUDIT_DB_PATH=./audit_ledger.db
WITNESS_DB_PATH=./witness.db
TRUST_DB_PATH=./packages/agent-trust/agent_trust.db
MARKET_DB_PATH=./packages/market-data-mcp/market_intelligence.db
```

---

## 4. Production Build & Compilation

To build all packages deterministically:

```bash
# 1. Ensure Node 20+ / Node 22 is active
node -v

# 2. Build core-schema and backend packages
npm --workspace=@agentguard/core-schema run build
npm --workspace=@agentguard/bank-gate run build
npm --workspace=@agentguard/witness run build
npm --workspace=@agentguard/market-data-mcp run build
npm --workspace=@agentguard/agent-trust run build
npm --workspace=@agentguard/gateway-mcp run build

# 3. Build Next.js Compliance Cockpit
npm --workspace=@agentguard/compliance-cockpit run build
```

---

## 5. Startup Commands (Daemon Mode)

Execute in order:

```bash
# Terminal 1: Core Bank Gate (:4000)
$env:BANK_GATE_PORT = "4000"; node packages/bank-gate/dist/server.js

# Terminal 2: Independent Witness (:5000)
$env:WITNESS_PORT = "5000"; node packages/witness/dist/server.js

# Terminal 3: Market Data MCP (:4004)
$env:MARKET_DATA_PORT = "4004"; node packages/market-data-mcp/dist/server.js

# Terminal 4: Trust Intelligence Engine (:4006)
$env:TRUST_ENGINE_PORT = "4006"; node packages/agent-trust/dist/server.js

# Terminal 5: Gateway MCP Tool Proxy (:8081)
$env:DEMO_MODE = "1"; $env:PORT = "8081"; node packages/gateway-mcp/dist/server.js

# Terminal 6: Compliance Cockpit UI (:13003)
cd apps/compliance-cockpit && npx next dev -p 13003
```

---

## 6. Health & Liveness Checks

Automated health probe script:

```bash
curl -I http://localhost:4000/health
curl -I http://localhost:5000/health
curl -I http://localhost:4004/health
curl -I http://localhost:4006/health
curl -I http://localhost:8081/health
curl -I http://localhost:13003/
```

All endpoints MUST return HTTP 200.

---

## 7. Emergency Response & Kill Switches

1. **Global Emergency Stop (Circuit Breaker):**
   * Endpoint: `POST http://localhost:4006/api/trust/emergency-stop`
   * Body: `{"reason": "Immediate administrative suspension", "operator_id": "OP_ADMIN_01"}`
   * Effect: Halts all agent tool invocations platform-wide with fail-closed `DEFER`.
2. **Quarantine Release Workflow:**
   * Endpoint: `POST http://localhost:4006/api/trust/quarantine/release`
   * Body: `{"agent_id": "...", "supervisor_id": "...", "reason": "Investigation concluded, policy updated"}`
   * Constraint: AI agents cannot call or authorize their own release.
