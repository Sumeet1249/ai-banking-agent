/**
 * Service Node Definitions for AgentGuard Banking Security Topology
 *
 * "Sovereign Vault Silicon" Hardware Architecture:
 *   1. AI Agent Foundry (SDK / Autonomous Executor - Untrusted Edge)
 *   2. AgentGuard Gateway (:8080 - Fortress Bridge across Center Air-Gap Trench)
 *   3. Bank Gate (:4000 - Cryptographic Airlock U-Arch, Fastify, Nonce Consumer)
 *   4. Ledger Adapter (:4001 - 3-Blade Titanium Transformer Rack, Two-Phase Bridge)
 *   5. TigerBeetle Cluster (:3001 - Tri-Vault Consensus Citadel, 3-Replica VSR Quorum)
 *   6. Independent Witness (:5000 - Optical Merkle Notary Beacon, Standalone DB & Key)
 *   7. Compliance Cockpit (:3000 - Architectural Glass Telemetry Console & FIDO2 RP)
 */

export type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'BLOCKED';

export type SculptureType =
  | 'octahedron-agent'
  | 'vault-gateway'
  | 'airlock-gate'
  | 'hex-adapter'
  | 'quorum-triad'
  | 'merkle-tower'
  | 'cockpit-slab';

export interface TopologyNode {
  id: string;
  name: string;
  silkScreenLabel: string;
  subtitle: string;
  role: string;
  port?: number;
  position: [number, number, number];
  color: string;
  status: ServiceStatus;
  protocol: string;
  securityInvariant: string;
  zone: 'Untrusted Edge' | 'Zero-Trust DMZ' | 'Core Banking Vault' | 'Witness Plane';
  sculptureType: SculptureType;
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

export type CameraPresetKey = 'orbit' | 'dmz' | 'ledger';

export interface CameraPresetConfig {
  key: CameraPresetKey;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: Record<CameraPresetKey, CameraPresetConfig> = {
  orbit: {
    key: 'orbit',
    label: 'Overview',
    position: [0, 10.5, 13.8],
    target: [0, 0.4, 0.3],
  },
  dmz: {
    key: 'dmz',
    label: 'DMZ',
    position: [-0.5, 4.6, 7.2],
    target: [0, 0.8, -0.2],
  },
  ledger: {
    key: 'ledger',
    label: 'Vault',
    position: [5.2, 5.8, 8.4],
    target: [5.2, 0.6, 0.6],
  },
};

export interface ScenarioChoreographyConfig {
  id: string;
  owaspId: string;
  num: number;
  shortTitle: string;
  fullTitle: string;
  riskAmountPaise: number;
  riskAmountFormatted: string;
  sourceNodeId: string;
  targetNodeId: string;
  secondaryTargetNodeId?: string;
  cameraHint: CameraPresetKey;
  phases: [string, string, string];
  protectedOutcome: string;
  bypassedOutcome: string;
  threatSignature: string;
  originLabel: string;
  dmzLabel: string;
  protectedVerdictBadge: string;
  bypassedVerdictBadge: string;
}

export const SCENARIO_CHOREOGRAPHIES: ScenarioChoreographyConfig[] = [
  {
    id: 'scenario_1_prompt_injection',
    owaspId: 'ASI-01',
    num: 1,
    shortTitle: 'Prompt Injection',
    fullTitle: 'Prompt Injection / Payee Diversion',
    riskAmountPaise: 490000,
    riskAmountFormatted: '₹4,900.00',
    sourceNodeId: 'agent',
    targetNodeId: 'gateway',
    secondaryTargetNodeId: 'cockpit',
    cameraHint: 'dmz',
    phases: [
      '1. Origin: Prompt payload fractures into jagged crimson bolt',
      '2. DMZ: Gateway optical scanline intercepts deviation (0.8ms)',
      '3. Resolution: Payee whitelist enforced · Alert to Cockpit',
    ],
    originLabel: 'Origin: Agent generates ₹4,900 utility payout',
    dmzLabel: 'DMZ Bridge: Intent-drift scanner sweeps bolt',
    protectedVerdictBadge: 'INTENT DRIFT BLOCKED · PAYEE WHITELIST ENFORCED',
    bypassedVerdictBadge: 'BREACH: ₹4,900 DIVERTED TO ATTACKER OFFSHORE',
    protectedOutcome: 'Intent drift flagged at Gateway (0.8ms). Mandate payee whitelist enforced. ₹4,900 preserved.',
    bypassedOutcome: 'Shield bypassed: Prompt injected raw transfer into Core Vault. ₹4,900 diverted.',
    threatSignature: 'Glitching cyan packet morphs into jagged crimson payload mid-flight',
  },
  {
    id: 'scenario_2_overreach',
    owaspId: 'ASI-02',
    num: 2,
    shortTitle: 'Limit Overreach',
    fullTitle: 'Mandate Limit Overreach (₹50,000 vs ₹5,000)',
    riskAmountPaise: 5000000,
    riskAmountFormatted: '₹50,000.00',
    sourceNodeId: 'agent',
    targetNodeId: 'gateway',
    secondaryTargetNodeId: 'witness',
    cameraHint: 'dmz',
    phases: [
      '1. Origin: 2.5x heavy crimson-gold energy orb surges down bus',
      '2. DMZ: Impacts Optical Forcefield · Expanding hex shockwave',
      '3. Resolution: Mandate ceiling enforced · Merkle proof logged',
    ],
    originLabel: 'Origin: Agent requests ₹50,000 on ₹5,000 ceiling',
    dmzLabel: 'DMZ Bridge: Mandate ceiling check trips (3.8ms)',
    protectedVerdictBadge: 'MANDATE CAP ENFORCED · ₹50,000 REJECTED AT GATEWAY',
    bypassedVerdictBadge: 'BREACH: ₹50,000 DRAINED TO OFFSHORE HOSTING',
    protectedOutcome: 'Mandate cap strictly enforced at Gateway (3.8ms). ₹50,000 call blocked on ₹5,000 ceiling.',
    bypassedOutcome: 'Unverified pass-through: Heavy overreach struck TigerBeetle. ₹50,000 drained.',
    threatSignature: 'Heavy 2.5x crimson-gold energy sphere charges down main fiber bus',
  },
  {
    id: 'scenario_3_stolen_token_replay',
    owaspId: 'ASI-03',
    num: 3,
    shortTitle: 'Token Replay',
    fullTitle: 'Stolen Token & Nonce Replay Attack',
    riskAmountPaise: 250000,
    riskAmountFormatted: '₹2,500.00',
    sourceNodeId: 'agent',
    targetNodeId: 'bank-gate',
    secondaryTargetNodeId: 'witness',
    cameraHint: 'ledger',
    phases: [
      '1. Origin: Legitimate permit consumed at Bank Gate arch',
      '2. Ingress: Ghost duplicate races along bridge at +400ms',
      '3. Resolution: Airlock slams shut · 409 Nonce Burned',
    ],
    originLabel: 'Origin: Valid permit consumed by Bank Gate :4000',
    dmzLabel: 'Airlock :4000: Nonce single-use ledger check',
    protectedVerdictBadge: 'REPLAY REJECTED AT BANK GATE :4000 · NONCE CONSUMED',
    bypassedVerdictBadge: 'DOUBLE-SPEND BREACH: REPLAY HIT TIGERBEETLE TWICE',
    protectedOutcome: 'Replay rejected at Bank Gate :4000. Nonce already consumed. Airlock sealed (409 Conflict).',
    bypassedOutcome: 'Airlock bypass: Replayed token executed duplicate debit on TigerBeetle (Double-Spend).',
    threatSignature: 'Translucent glowing ghost clone chasing original packet down the pipe',
  },
  {
    id: 'scenario_4_structuring',
    owaspId: 'ASI-06',
    num: 4,
    shortTitle: 'Smurfing Burst',
    fullTitle: 'High-Frequency Structuring (10 × ₹4,900)',
    riskAmountPaise: 4900000,
    riskAmountFormatted: '₹49,000.00',
    sourceNodeId: 'agent',
    targetNodeId: 'gateway',
    secondaryTargetNodeId: 'cockpit',
    cameraHint: 'dmz',
    phases: [
      '1. Origin: Rapid 10-shot micro-tracer volley fired along bus',
      '2. DMZ: Velocity sensor trips on bolt 3 · Containment dome rises',
      '3. Resolution: Bolts 3-10 trapped mid-air · Stream to Cockpit',
    ],
    originLabel: 'Origin: Rapid 10×₹4,900 transfers spaced 90ms',
    dmzLabel: 'DMZ Bridge: Cumulative velocity anomaly trips',
    protectedVerdictBadge: 'STRUCTURING HALTED · 10×₹4.9K CONTAINED AT GATEWAY',
    bypassedVerdictBadge: 'BREACH: ALL 10 TRANSFERS COMPLETED (₹49,000 DRAIN)',
    protectedOutcome: 'Structuring velocity check tripped on packet #3. Containment dome trapped 10 micro-bursts.',
    bypassedOutcome: 'Smurfing uninspected: All 10 micro-transfers hammered TigerBeetle. ₹49,000 drained.',
    threatSignature: '10-shot rapid-fire stream of micro-packets spaced 90ms apart',
  },
  {
    id: 'scenario_5_compromised_agent',
    owaspId: 'ASI-08',
    num: 5,
    shortTitle: 'Runaway Loop',
    fullTitle: 'Compromised Runaway Agent Flooding Calls',
    riskAmountPaise: 8000000,
    riskAmountFormatted: '₹80,000.00',
    sourceNodeId: 'agent',
    targetNodeId: 'agent',
    secondaryTargetNodeId: 'gateway',
    cameraHint: 'orbit',
    phases: [
      '1. Origin: Agent Foundry overheats crimson, firing flood surge',
      '2. DMZ: Reverse circuit breaker lock laser fires backward',
      '3. Resolution: 3D Quarantine Cage snaps onto Agent Foundry',
    ],
    originLabel: 'Origin: Compromised agent in 40 calls/min loop',
    dmzLabel: 'DMZ Bridge: Reverse circuit breaker engages',
    protectedVerdictBadge: 'AGENT AUTO-QUARANTINED · 3D LOCK CAGE DEPLOYED',
    bypassedVerdictBadge: 'RUNAWAY FLOOD: CORE RAILS HAMMERED BY EXPLOIT LOOP',
    protectedOutcome: 'Agent auto-quarantined. Reverse circuit-breaker deployed 3D lock cage. Loop severed.',
    bypassedOutcome: 'Uncontrolled runaway loop overwhelmed core banking rails. Denial of reserve.',
    threatSignature: 'Erratic crimson spin + backward lock beam deploying quarantine cage',
  },
  {
    id: 'scenario_6_post_revocation',
    owaspId: 'ASI-04',
    num: 6,
    shortTitle: 'Post-Revocation',
    fullTitle: 'Post-Revocation Unauthorized Call Attempt',
    riskAmountPaise: 320000,
    riskAmountFormatted: '₹3,200.00',
    sourceNodeId: 'cockpit',
    targetNodeId: 'gateway',
    secondaryTargetNodeId: 'bank-gate',
    cameraHint: 'dmz',
    phases: [
      '1. Cockpit: Radial revocation wave sweeps across bridge (<1s)',
      '2. Ingress: Stale mandate token fired by rogue agent at +300ms',
      '3. Resolution: Token hits sealed REVOKED plane and dissolves',
    ],
    originLabel: 'Origin: Mandate revoked by user on mobile app',
    dmzLabel: 'DMZ Bridge: <1s propagation seals outer perimeter',
    protectedVerdictBadge: 'REVOKED MANDATE ENFORCED · 0ms BANK GATE EXPOSURE',
    bypassedVerdictBadge: 'BREACH: STALE MANDATE TOKEN SETTLED POST-REVOCATION',
    protectedOutcome: 'Revoked mandate enforced in <1s. Stale token dropped at outer DMZ (0ms Bank Gate exposure).',
    bypassedOutcome: 'Delayed invalidation: Stale mandate token executed unauthorized charge downstream.',
    threatSignature: 'Expanding violet wavefront sealing gateway before incoming stale token arrives',
  },
  {
    id: 'scenario_7_insider_tamper',
    owaspId: 'ASI-05',
    num: 7,
    shortTitle: 'DB Tamper',
    fullTitle: 'Insider Database Tampering (Reverse Vector)',
    riskAmountPaise: 10000000,
    riskAmountFormatted: '₹1,00,000.00',
    sourceNodeId: 'tigerbeetle',
    targetNodeId: 'witness',
    secondaryTargetNodeId: 'cockpit',
    cameraHint: 'ledger',
    phases: [
      '1. Vault: Subterranean crimson intrusion spire pierces TigerBeetle',
      '2. Witness: Turret aims directly at vault · Merkle Scan Laser',
      '3. Resolution: Root mismatch detected · Red alert arc to Cockpit',
    ],
    originLabel: 'Vault Origin: Insider root DB row modification',
    dmzLabel: 'Witness :5000: Independent Merkle chain audit',
    protectedVerdictBadge: 'TAMPER DETECTED BY WITNESS :5000 · ROOT MISMATCH',
    bypassedVerdictBadge: 'SILENT CORRUPTION: UNVERIFIED DRIFT IN TIGERBEETLE',
    protectedOutcome: 'Tamper detected by Independent Witness :5000. SHA-256 Merkle root mismatch on epoch.',
    bypassedOutcome: 'Silent database row corruption undetected. Unverified balance drift in TigerBeetle.',
    threatSignature: 'Subterranean crimson crystal spike piercing TigerBeetle + Witness laser audit beam',
  },
];

export const TOPOLOGY_NODES: TopologyNode[] = [
  {
    id: 'agent',
    name: 'AI Agent Runtime',
    silkScreenLabel: 'AI AGENT RUNTIME',
    subtitle: 'Autonomous Tool Invoker',
    role: 'Planner & Tool Invoker',
    position: [-5.8, 0.24, -0.6],
    color: '#06B6D4',
    status: 'HEALTHY',
    protocol: 'JSON-RPC / REST',
    securityInvariant: 'Rule E5: Ed25519 agent signatures; zero customer session access',
    zone: 'Untrusted Edge',
    sculptureType: 'octahedron-agent',
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
    id: 'cockpit',
    name: 'Compliance Cockpit',
    silkScreenLabel: 'COCKPIT :3000',
    subtitle: 'SOC Telemetry Console',
    role: 'Human Governance & FIDO2 RP',
    port: 3000,
    position: [-5.2, 0.24, 2.7],
    color: '#EC4899',
    status: 'HEALTHY',
    protocol: 'Next.js 14 / WebAuthn Level 3',
    securityInvariant: 'Decision D21: Transaction-bound 7-field digest WebAuthn step-up; Invariant I6 version tracking',
    zone: 'Untrusted Edge',
    sculptureType: 'cockpit-slab',
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
  {
    id: 'gateway',
    name: 'AgentShield Gateway',
    silkScreenLabel: 'AGENTSHIELD :8080',
    subtitle: 'Fortress Bridge Policy Engine',
    role: 'Authorization Perimeter',
    port: 8080,
    position: [0.0, 0.24, -0.4],
    color: '#10B981',
    status: 'HEALTHY',
    protocol: 'HTTP / WebSockets / MCP',
    securityInvariant: 'Decision D1: Isolated Ed25519 permit private key; Rule E5 cross-namespace rejection',
    zone: 'Zero-Trust DMZ',
    sculptureType: 'vault-gateway',
    details: {
      processType: 'Express 4 / Node.js Process',
      database: 'SQLite (agentguard.db in WAL mode)',
      keyMaterial: 'Gateway Permit Signing Private Key (Ed25519)',
      description: 'Evaluates hard rules, prompt-injection detectors, behavioral anomaly baselines, and issues 22-field cryptographically signed permits across the physical air-gap bridge.',
      metrics: {
        'Permits Issued': 142,
        'Hard Rule Evaluator': 'Enforced',
        'Step-Up Gateway': 'Active',
      },
    },
  },
  {
    id: 'witness',
    name: 'Independent Witness',
    silkScreenLabel: 'WITNESS :5000',
    subtitle: 'Cryptographic Merkle Notary',
    role: 'Tamper-Evident Notary',
    port: 5000,
    position: [0.0, 0.24, 2.8],
    color: '#F59E0B',
    status: 'HEALTHY',
    protocol: 'Fastify / RFC 6962 Merkle Log',
    securityInvariant: 'Invariant I9 & Decision D17: Standalone database (witness.db) & autonomous Ed25519 key',
    zone: 'Witness Plane',
    sculptureType: 'merkle-tower',
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
    id: 'bank-gate',
    name: 'Bank Gate',
    silkScreenLabel: 'BANK GATE :4000',
    subtitle: 'Biometric Airlock Arch',
    role: 'Settlement Gatekeeper',
    port: 4000,
    position: [4.6, 0.24, -2.0],
    color: '#34D399',
    status: 'HEALTHY',
    protocol: 'Fastify / HTTP REST',
    securityInvariant: 'Rule E4 & Invariant I1: Holds public key ONLY; atomic nonce single-use consumption',
    zone: 'Core Banking Vault',
    sculptureType: 'airlock-gate',
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
    silkScreenLabel: 'LEDGER :4001',
    subtitle: '3-Blade Transformer Rack',
    role: 'TigerBeetle Bridge',
    port: 4001,
    position: [6.5, 0.24, 0.3],
    color: '#3B82F6',
    status: 'HEALTHY',
    protocol: 'Express REST / Native IPC',
    securityInvariant: 'Decision D19: Explicit backend contract; Decision D20: Deterministic resolution IDs',
    zone: 'Core Banking Vault',
    sculptureType: 'hex-adapter',
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
    silkScreenLabel: 'TIGERBEETLE :3001',
    subtitle: '3-Replica Consensus Citadel',
    role: 'Financial Consensus Core',
    port: 3001,
    position: [4.8, 0.24, 2.5],
    color: '#8B5CF6',
    status: 'HEALTHY',
    protocol: 'Viewstamped Replication (TCP 3001-3003)',
    securityInvariant: 'Decision D19: 2/3 Quorum Consensus; zero overdraft leakage (debits <= credits)',
    zone: 'Core Banking Vault',
    sculptureType: 'quorum-triad',
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
  {
    id: 'link-witness-tb',
    source: 'witness',
    target: 'tigerbeetle',
    label: '7. Merkle Tree Root Verification',
    protocol: 'RFC 6962 SHA-256 Notary Audit',
    trafficType: 'MERKLE_CHECKPOINT',
    status: 'ACTIVE',
  },
];
