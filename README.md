# AgentGuard & AgentShield AI

> **Zero-Trust Financial Kernel, Pre-Execution Gateway & Attack Lab for Autonomous AI Agents in Banking.**
> 
> *Solving Hackathon Challenge: Cybersecurity — Securing Banks Against Rogue AI Agents.*

---

## Executive Overview

As banks deploy autonomous AI agents for customer utility bill payments, vendor disbursements, and treasury rebalancing, traditional API keys and OAuth tokens become catastrophic single points of failure. If an LLM is prompt-injected or enters a runaway loop, bearer tokens grant unrestricted balance access.

**AgentShield** acts as a **Zero-Trust Financial Kernel** positioned directly between AI agents and core banking systems. Every action is gated by customer-delegated mandates, cryptographic Ed25519 permits, sub-second instant revocation, and real-time behavioral anomaly detection.

---

## 5 Core Hackathon Requirements Coverage

| # | Requirement | AgentShield Implementation & Cryptographic Proof | Test Suite Status |
| :-: | :--- | :--- | :---: |
| **1** | **Scoped Delegation** | Customer mandates (`MND_...`) with strict limits: per-transaction cap, daily cap, authorized payee whitelist, and sub-second instant revocation (`<1s` propagation, `0.8ms` benchmark). | **VERIFIED (100% Pass)** |
| **2** | **Agent Identity & Anti-Replay** | Hardware/Software Ed25519 agent signatures, timestamp skew validation (`±90s`), and single-use atomic UUIDv4 nonces eliminating replay and double-spend attacks. | **VERIFIED (100% Pass)** |
| **3** | **Behavioral Anomaly & Intent-Drift** | **Intent-Drift Detector** flagging divergence between user goal and tool arguments; **Structuring/Smurfing Detector** flagging clustered micro-transfers (e.g. 10 × ₹4,900); **Auto-Quarantine Circuit Breaker** after 3 blocks; **Emergency Global Kill-Switch**. | **VERIFIED (100% Pass)** |
| **4** | **Human-in-the-Loop Step-Up** | `ASK` decision triggering step-up customer authorization via transaction-bound WebAuthn (FIDO2) assertions cryptographically tied to a 7-field canonical transaction digest. | **VERIFIED (100% Pass)** |
| **5** | **Tamper-Evident Audit Ledger** | SHA-256 Merkle hash-chained ledger notarized by an isolated Independent Witness service. Live tampering demo with instant block-level forensic pinpointing. | **VERIFIED (100% Pass)** |

---

## Architecture Topology

```
┌─────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│  AI Agent Host  │ ───▶  │  AgentShield Gateway │ ───▶  │      Bank Gate       │
│  (MCP Client)   │       │     (Port 8080)      │       │     (Port 4000)      │
└─────────────────┘       └──────────────────────┘       └──────────────────────┘
         │                           │                              │
         │                           ▼                              ▼
         │                 ┌────────────────────┐         ┌────────────────────┐
         │                 │ Anomaly & Intent   │         │ 2-Phase Settlement │
         │                 │ Drift Engine       │         │ (TigerBeetle / PG) │
         │                 └────────────────────┘         └────────────────────┘
         │                                                          │
         ▼                                                          ▼
┌─────────────────┐                                       ┌────────────────────┐
│ Customer Phone  │ ◀───────────────────────────────────  │ Witness Notary     │
│ (WebAuthn Step) │         Cryptographic Notarization    │ (Port 4002 / WORM) │
└─────────────────┘                                       └────────────────────┘
```

---

## Attack Lab: 7 Attack Scenarios (Protection ON vs. OFF)

The Compliance Cockpit features a dedicated **Attack Lab** (`/banking`) allowing judges and security teams to test 7 real-world attack vectors with a live toggle:

1. **Prompt Injection / Payee Diversion:** Hidden instruction in utility invoice PDF directing ₹4,900 to rogue payee. (Protection ON blocks in 3.8ms; saves ₹4,900).
2. **Overreach / Exceeding Limit:** Agent attempts ₹50,000 transfer on ₹5,000 utility mandate. (Protection ON blocks before core is contacted; saves ₹50,000).
3. **Stolen Token & Replay:** Adversary replays intercepted payment token. (Protection ON rejects already-consumed nonce with 409 Conflict; saves ₹2,500).
4. **Structuring / Smurfing:** 10 successive ₹4,900 transfers to evade per-transaction caps. (Protection ON detects clustering at 98% of limit and enforces daily cap; saves ₹49,000).
5. **Compromised Agent Runaway:** Agent enters velocity loop (40 calls/min). (Protection ON auto-quarantines rogue agent after 3 blocks; saves ₹80,000).
6. **Post-Revocation Call:** Customer revokes mandate; agent attempts transfer 200ms later. (Protection ON enforces instant `<1s` revocation; saves ₹3,200).
7. **Insider Database Tampering:** DB admin alters row amount from ₹1,000 to ₹1,00,000. (Independent Witness flags broken hash chain immediately in red).

---

## Quick Start & Verification

### Run Automated Hackathon Verification Test Suites

```bash
# 1. Run 5 Core Requirements Test Suite (13 passing tests)
npm run test:hackathon

# 2. Run Attack Lab 7 Scenarios Test Suite (17 passing tests)
npm --workspace @agentguard/gateway-mcp test src/__tests__/attack-lab-scenarios.test.ts

# 3. Run Banking Core Integration Suite (101 passing tests)
npm run test:banking
```

### Start System Locally

```bash
# Start Gateway & Banking Core
cd packages/gateway-mcp
npm run dev

# Start Compliance Cockpit (Attack Lab & 3D Topology UI)
cd apps/compliance-cockpit
npm run dev
```

Open [http://localhost:3000/banking](http://localhost:3000/banking) to access the Attack Lab and live 3D security topology.

---

## Documentation & Pitch Resources

- [docs/owasp-mapping.md](./docs/owasp-mapping.md) — Comprehensive mapping against OWASP Top 10 for Agentic Applications (2026).
- [docs/PITCH-AND-DEMO-SCRIPT.md](./docs/PITCH-AND-DEMO-SCRIPT.md) — 4-minute presentation script and judge Q&A guide.
