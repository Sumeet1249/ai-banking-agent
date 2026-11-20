# REPO_MAP.md — Repository Structure

## Root Governance (read before every edit)
```
AGENTS.md          — Non-negotiable security invariants (I1–I9) and engineering rules (E1–E8)
CONTRACTS.md       — Frozen schemas, endpoints, reason codes, TTL constants, seed fixtures
DECISIONS.md       — Architecture and design decisions (D1–D13)
REPO_MAP.md        — This file: repository structure guide
```

## Monorepo Layout
```
trail-main/
├── packages/
│   ├── gateway-mcp/           — Aegis Gateway (:8080) — policy engine, permit issuer, evaluation pipeline
│   │   └── src/
│   │       ├── server.ts       — Express app bootstrap + route registration
│   │       ├── config.ts       — Configuration & feature gates
│   │       ├── db/             — SQLite schema, database init, billing store
│   │       ├── api/            — REST route handlers (traces, policies, approvals, agents, etc.)
│   │       ├── services/       — Business logic (witness, anomaly, audit-log, budget-guard, etc.)
│   │       ├── detectors/      — Built-in threat detectors (PII, exfil, IPI, memory-poison, etc.)
│   │       ├── policies/       — Policy engine, DSL compiler, rule packs
│   │       ├── middleware/     — Auth, error handling, request context
│   │       ├── mcp/            — MCP protocol proxy + Aegis MCP server
│   │       ├── proxy/          — LLM proxy adapters (OpenAI, Anthropic, Mistral, Gemini)
│   │       ├── sinks/          — Log sinks (Datadog, Splunk, S3, etc.)
│   │       └── __tests__/      — Unit tests
│   │
│   ├── bank-gate/              — Bank Gate (:4000) — independent permit verification, nonces, execution FSM
│   │   └── src/
│   │       ├── server.ts       — Fastify app for /execute, /reconcile, /health, /ready
│   │       ├── services/       — permit-verifier, transaction-executor, reconciliation
│   │       ├── db/             — SQLite durable nonce store & transaction ledger
│   │       ├── adapters/       — HTTP & mock ledger client adapters
│   │       └── __tests__/      — Concurrency, race condition, & failure recovery suites
│   │
│   ├── ledger-adapter/         — TigerBeetle Two-Phase Settlement Adapter (:4001)
│   │   └── src/
│   │       ├── server.ts       — Express REST API with dual-backend switching & Fail-Closed semantics
│   │       ├── services/       — ledger-backend (ILedgerBackend), tigerbeetle-ledger-backend (native client), sqlite-ledger-backend, ledger-engine
│   │       └── __tests__/      — u128 Big-Endian conversion, dual-backend contracts, & two-phase hold tests (81 tests)
│   │
│   ├── witness/                — Witness Service (:5000) — independent cryptographic checkpoint co-signer
│   │   └── src/
│   │       ├── server.ts       — Fastify app for /checkpoints, /public-key, /health
│   │       ├── services/       — merkle-engine (RFC 6962), witness-service, witness-store
│   │       └── __tests__/      — Monotonic sequence enforcement & Merkle inclusion proof tests
│   │
│   ├── core-schema/            — Shared Zod schemas (mandate, transaction, permit, clock, ledger)
│   ├── cli/                    — CLI tools (repo-scanner, codemod-inject, demo-agent)
│   ├── sdk-js/                 — JavaScript/TypeScript SDK
│   ├── sdk-python/             — Python SDK
│   └── sdk-go/                 — Go SDK
│
├── apps/
│   ├── compliance-cockpit/     — Next.js dashboard (:3000) — policies, approvals, audit, agents
│   ├── control-plane/          — Multi-tenant control plane (SaaS)
│   ├── desktop/                — Tauri desktop app
│   └── marketing/              — Astro marketing site
│
├── docker/                     — Dockerfiles
├── charts/                     — Helm charts
├── kubernetes/                 — K8s manifests
├── monitoring/                 — Prometheus rules, Grafana dashboards
├── compliance/                 — Compliance policies and runbooks
├── research/                   — Research benchmarks, selective detectors, results
├── tools/                      — E2E tests, load tests, release signing, GitHub Action
├── scripts/                    — Setup and deployment scripts
├── demo/                       — Demo scenarios and seed data
├── docs/                       — Documentation, ebook, images
│   ├── PHASE-7.4-ENTERPRISE-KEY-MANAGEMENT.md — Enterprise KMS & HSM architecture
│   ├── PHASE-7.4.1-KMS-SECURITY-REVIEW.md     — Cryptographic audit & hardening review
│   ├── PHASE-7.4.1-KEY-LIFECYCLE-TESTS.md     — Deduplicated test execution evidence
│   ├── HSM-PRODUCTION-READINESS.md            — Hardware Security Module integration guide
│   └── compliance/                            — Phase 8 Enterprise Compliance & Runbooks
│       ├── PCI-DSS-V4-MAPPING.md              — PCI DSS v4.0 Requirement 3, 7, 8, 10 mapping
│       ├── RBI-CYBERSECURITY-MAPPING.md       — RBI 2026 Master Directions on Cyber Resilience
│       ├── EU-AI-ACT-AND-SR11-7-MAPPING.md    — High-Risk AI governance & model risk management
│       ├── INCIDENT-RESPONSE-PLAYBOOK.md      — Dual-control key compromise & incident response
│       └── ENTERPRISE-DEPLOYMENT-RUNBOOK.md   — Production deployment, NTP stratum-1 & health probes
└── nginx/                      — Nginx configs
```

## Key Files for Banking Payment Firewall

### Gateway (:8080) — Permit Issuance & Enterprise Identity Side
- `packages/gateway-mcp/src/server.ts` — Main server, route registration, and demo-mode guards
- `packages/gateway-mcp/src/api/customer.ts` — Customer REST routes (OIDC, WebAuthn, Mandates, Approvals)
- `packages/gateway-mcp/src/services/enterprise-oidc-service.ts` — Provider-neutral PKCE S256 + JWKS verifier
- `packages/gateway-mcp/src/services/webauthn-service.ts` — FIDO2 server (@simplewebauthn/server)
- `packages/gateway-mcp/src/services/transaction-approval-service.ts` — 7-field canonical digest step-up approval
- `packages/gateway-mcp/src/db/banking-stores.ts` — Multi-tenant SQLite banking store with ambient tenant resolution
- `packages/gateway-mcp/src/db/postgres-banking-stores.ts` — Multi-tenant PostgreSQL banking store with pg.Pool and withTenant
- `packages/gateway-mcp/src/middleware/tenant-context.ts` — Inbound tenant resolution, anti-spoofing check, and AsyncLocalStorage
- `packages/gateway-mcp/migrations/0002_banking_multi_tenancy_rls.sql` — PostgreSQL Row-Level Security (RLS) migration script
- `packages/gateway-mcp/src/crypto/kms-provider.ts` — Software KMS & Mock HSM provider (non-exportable keys, zero-downtime rotation, RFC 7517 JWKS)
- `packages/gateway-mcp/src/api/keys.ts` — Key Management & JWKS distribution API (/api/v1/keys/*)
- `packages/core-schema/src/banking/kms-schema.ts` — KMS schemas, key lifecycle states, rotation events, and JWKS response

### Bank Gate (:4000) — Permit Verification Side [BUILT]
- `packages/bank-gate/` — Independent Fastify process
- `packages/bank-gate/src/services/trusted-keyring.ts` — Multi-key verification keyring, grace period enforcement, emergency revocation barrier, JWKS import
- Verifies Gateway Ed25519 signature over canonical 22-field permit JSON
- Enforces single-use atomic nonces and 90s permit TTL
- Must NOT import permit signing keys or gateway internals (E4)

### Ledger Adapter (:4001) & TigerBeetle Cluster (:3001) [BUILT]
- `packages/ledger-adapter/` — Independent settlement service
- Emulates/bridges two-phase commit transfers (Pending 120s TTL -> Post/Void)
- `docker-compose.yml` runs 3-replica native TigerBeetle cluster on ports 3001, 3002, 3003
- Controlled by explicit `LEDGER_BACKEND: SQLITE_DEV | TIGERBEETLE` contract (Decision D19)

### Witness (:5000) — Independent Audit [BUILT]
- `packages/witness/` — Independent Fastify process
- `packages/witness/src/services/witness-service.ts` — Autonomous Ed25519 keypair, independent key rotation, RFC 6962 Merkle tree checkpoints

### Cockpit (:3000) — Customer & Admin UI [MODERNIZED - Phase 7.1.1]
- `apps/compliance-cockpit/src/app/banking/page.tsx` — Modernized Banking Command Centre
- `apps/compliance-cockpit/src/components/topology/security-3d-topology.tsx` — 3D Architecture Visualizer & 2D Fallback
- `apps/compliance-cockpit/src/components/topology/security-3d-scene.tsx` — Three.js / R3F WebGL Scene
- `apps/compliance-cockpit/src/components/topology/service-nodes-data.ts` — 7-Service Node Topology Model
- Real-time agent topology and two-phase ledger live feed
- Must NOT import `tigerbeetle-node` (E4)
- Must have zero external CDN dependencies on /banking (E7)

## Import Boundaries (E4)
```
packages/agentguard-bank/**  ──✗──>  permit issuers, private keys
packages/gateway-mcp/**      ──✗──>  tigerbeetle-node
apps/compliance-cockpit/**   ──✗──>  tigerbeetle-node
```

