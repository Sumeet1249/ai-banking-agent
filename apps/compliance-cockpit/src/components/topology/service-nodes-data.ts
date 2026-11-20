/**
 * Service Node Definitions for AgentGuard Banking Security Topology
 *
 * Defines the 7 foundational services and their cryptographic/operational properties:
 *   1. AI Agent Runtime (SDK / Autonomous Executor)
 *   2. AgentGuard Gateway (:8080 - Policy Engine, Permit Issuer, Ed25519 Private Key)
 *   3. Bank Gate (:4000 - Fastify, Nonce Consumer, Permit Verifier, Ed25519 Public Key Only)
 *   4. Ledger Adapter (:4001 - Two-Phase Commit Bridge, u128 Mapping, Fail-Closed)
 *   5. TigerBeetle Cluster (:3001-3003 - 3-Replica Viewstamped Replication Quorum)
 *   6. Independent Witness (:5000 - Merkle Tree Checkpoints, Standalone DB & Key)
 *   7. Compliance Cockpit (:3000 - Next.js Enterprise Dashboard & FIDO2 WebAuthn RP)
 */

export type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'BLOCKED';

export interface TopologyNode {
  id: string;
  name: string;
  subtitle: string;
  role: string;
  port?: number;
  position: [number, number, number];
  color: string;
  status: ServiceStatus;
  protocol: string;
  securityInvariant: string;
  details: {
    processType: string;
    database: string;
    keyMaterial: string;
    description: string;
    metrics?: Record<string, string | number>;
  };
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  label: string;
  protocol: string;
  trafficType: 'MANDATE' | 'PERMIT' | 'TWO_PHASE_HOLD' | 'MERKLE_CHECKPOINT' | 'FIDO2_ASSERTION';
  status: 'ACTIVE' | 'IDLE' | 'FAILED';
}

export const TOPOLOGY_NODES: TopologyNode[] = [
  {
    id: 'agent',
    name: 'AI Agent Runtime',
    subtitle: 'Delegated Autonomous Executor',
    role: 'Planner & Tool Invoker',
    position: [-6.2, 0.6, 0.5],
    color: '#06b6d4', // cyan-500
    status: 'HEALTHY',
    protocol: 'JSON-RPC / REST',
    securityInvariant: 'Rule E5: Ed25519 agent signatures; zero customer session access',
    details: {
      processType: 'External Autonomous Agent (Python / TS SDK)',
      database: 'Ephemeral Memory / Context Ledger',
      keyMaterial: 'Agent Ed25519 Request Signing Keypair',
      description: 'Generative LLM agent that plans financial tasks and requests transaction permits within customer-delegated mandate boundaries.',
      metrics: {
        'Active Agents': 3,
        'Instruction Provenance': 'Verified',
        'Revocation Live Check': 'Instant',
      },
    },
  },
  {
    id: 'gateway',
    name: 'AgentGuard Gateway',
    subtitle: 'Policy Firewall & Permit Issuer',
    role: 'Authorization Perimeter',
    port: 8080,
    position: [-1.4, 0.8, 1.2],
    color: '#6366f1', // indigo-500
    status: 'HEALTHY',
    protocol: 'HTTP / WebSockets / MCP',
    securityInvariant: 'Decision D1: Isolated Ed25519 permit private key; Rule E5 cross-namespace rejection',
    details: {
      processType: 'Express 4 / Node.js Process',
      database: 'SQLite (agentguard.db in WAL mode)',
      keyMaterial: 'Gateway Permit Signing Private Key (Ed25519)',
      description: 'Evaluates hard rules, prompt-injection detectors, behavioral anomaly baselines, and issues 22-field cryptographically signed permits.',
      metrics: {
        'Permits Issued': 142,
        'Hard Rule Evaluator': 'Enforced',
        'Step-Up Gateway': 'Active',
      },
    },
  },
  {
    id: 'bank-gate',
    name: 'Bank Gate',
    subtitle: 'Independent Execution Perimeter',
    role: 'Settlement Gatekeeper',
    port: 4000,
    position: [2.6, 1.8, 0.4],
    color: '#10b981', // emerald-500
    status: 'HEALTHY',
    protocol: 'Fastify / HTTP REST',
    securityInvariant: 'Rule E4 & Invariant I1: Holds public key ONLY; atomic nonce single-use consumption',
    details: {
      processType: 'Standalone Fastify Process',
      database: 'SQLite (bankgate.db with atomic WAL locks)',
      keyMaterial: 'Gateway Ed25519 Public Key Only (Zero Private Keys)',
      description: 'Independent gateway enforcing single-use permit consumption, mandate version consistency, and 7-field canonical digest verification before settlement.',
      metrics: {
        'Single-Use Nonces': '100% Enforced',
        'Reconciliation FSM': 'Synchronized',
        'Gateway Bypass': 'Impossible (I1)',
      },
    },
  },
  {
    id: 'ledger-adapter',
    name: 'Ledger Adapter',
    subtitle: 'Two-Phase Settlement Engine',
    role: 'TigerBeetle Bridge',
    port: 4001,
    position: [6.2, 1.8, -0.6],
    color: '#3b82f6', // blue-500
    status: 'HEALTHY',
    protocol: 'Express REST / Native IPC',
    securityInvariant: 'Decision D19: Explicit backend contract; Decision D20: Deterministic resolution IDs',
    details: {
      processType: 'Settlement Service with official tigerbeetle-node client',
      database: 'TigerBeetle VSR Cluster / Fallback SQLite Dev',
      keyMaterial: 'None (Transport Authentication Only)',
      description: 'Transforms UUIDv4 requests into Big-Endian u128 identifiers and executes two-phase commit holds (120s TTL Pending -> Post/Void).',
      metrics: {
        'Settlement Mode': 'TIGERBEETLE_CLUSTER',
        'Transfer TTL': '120 seconds',
        'Integer Paise': 'Rule E1 Enforced',
      },
    },
  },
  {
    id: 'tigerbeetle',
    name: 'TigerBeetle Cluster',
    subtitle: '3-Replica Distributed VSR',
    role: 'Financial Consensus Core',
    port: 3001,
    position: [6.4, -1.2, -1.2],
    color: '#8b5cf6', // violet-500
    status: 'HEALTHY',
    protocol: 'Viewstamped Replication (TCP 3001-3003)',
    securityInvariant: 'Decision D19: 2/3 Quorum Consensus; zero overdraft leakage (debits <= credits)',
    details: {
      processType: '3 Distributed Replicas (tigerbeetle-0, -1, -2)',
      database: 'Native Immutable LSM / Pre-Allocated 0_0.tigerbeetle Data Files',
      keyMaterial: 'Cluster ID 0 (Static IP subnet 172.28.0.0/16)',
      description: 'High-throughput, strictly serialized integer ledger implementing native two-phase transfers with sub-millisecond settlement times.',
      metrics: {
        'Active Quorum': '3 / 3 Replicas Online',
        'Consensus Protocol': 'Viewstamped Replication',
        'Overdraft Prevention': 'Strict Zero Overdraft',
      },
    },
  },
  {
    id: 'witness',
    name: 'Independent Witness',
    subtitle: 'Cryptographic Merkle Notary',
    role: 'Tamper-Evident Notary',
    port: 5000,
    position: [2.2, -2.4, 0.8],
    color: '#f59e0b', // amber-500
    status: 'HEALTHY',
    protocol: 'Fastify / RFC 6962 Merkle Log',
    securityInvariant: 'Invariant I9 & Decision D17: Standalone database (witness.db) & autonomous Ed25519 key',
    details: {
      processType: 'Independent Witness Process',
      database: 'SQLite (witness.db totally isolated from Gateway)',
      keyMaterial: 'Autonomous Witness Ed25519 Keypair',
      description: 'Maintains an append-only RFC 6962 SHA-256 Merkle tree of all issued permits and checkpoints, co-signing audit log heads for non-repudiation.',
      metrics: {
        'Merkle Tree Epoch': 12,
        'Signed Checkpoints': 48,
        'Storage Isolation': '100% Isolated (D17)',
      },
    },
  },
  {
    id: 'cockpit',
    name: 'Compliance Cockpit',
    subtitle: 'Enterprise Banking Command',
    role: 'Human Governance & FIDO2 RP',
    port: 3000,
    position: [-3.2, -2.2, 0.5],
    color: '#ec4899', // pink-500
    status: 'HEALTHY',
    protocol: 'Next.js 14 / WebAuthn Level 3',
    securityInvariant: 'Decision D21: Transaction-bound 7-field digest WebAuthn step-up; Invariant I6 version tracking',
    details: {
      processType: 'Next.js 14 React 18 App Router Application',
      database: 'Server-Side Sessions & WebAuthn Store',
      keyMaterial: 'FIDO2 Hardware Passkeys (Secure Enclave / TPM / YubiKey)',
      description: 'Provides institution-grade oversight, 3D architecture visualization, mandate configuration, and transaction-bound step-up customer approvals.',
      metrics: {
        'Enterprise OIDC': 'Microsoft Entra ID (PKCE)',
        'Passkey Standard': 'FIDO2 / WebAuthn L3',
        'Zero Floats UI': 'Integer Paise (E1)',
      },
    },
  },
];

export const TOPOLOGY_LINKS: TopologyLink[] = [
  {
    id: 'link-agent-gw',
    source: 'agent',
    target: 'gateway',
    label: '1. Intent & Permit Request',
    protocol: 'Ed25519 Signed REST',
    trafficType: 'PERMIT',
    status: 'ACTIVE',
  },
  {
    id: 'link-gw-cockpit',
    source: 'gateway',
    target: 'cockpit',
    label: '2. Human Step-Up Escalation (ASK)',
    protocol: 'FIDO2 WebAuthn Prompt',
    trafficType: 'FIDO2_ASSERTION',
    status: 'ACTIVE',
  },
  {
    id: 'link-gw-witness',
    source: 'gateway',
    target: 'witness',
    label: '3. Permit Merkle Co-Signing',
    protocol: 'RFC 6962 Checkpoint',
    trafficType: 'MERKLE_CHECKPOINT',
    status: 'ACTIVE',
  },
  {
    id: 'link-gw-bankgate',
    source: 'gateway',
    target: 'bank-gate',
    label: '4. Signed 22-Field Permit Forwarding',
    protocol: 'HTTP Post with Signed Envelope',
    trafficType: 'PERMIT',
    status: 'ACTIVE',
  },
  {
    id: 'link-bankgate-adapter',
    source: 'bank-gate',
    target: 'ledger-adapter',
    label: '5. Two-Phase Hold Execution',
    protocol: 'Pending Transfer (120s TTL)',
    trafficType: 'TWO_PHASE_HOLD',
    status: 'ACTIVE',
  },
  {
    id: 'link-adapter-tb',
    source: 'ledger-adapter',
    target: 'tigerbeetle',
    label: '6. VSR Quorum Commit (Post/Void)',
    protocol: 'Native u128 Transfer Protocol',
    trafficType: 'TWO_PHASE_HOLD',
    status: 'ACTIVE',
  },
];
