'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  RotateCcw,
  Layers,
  ShieldCheck,
  ShieldAlert,
  X,
  Cpu,
  Database,
  KeyRound,
  Activity,
  Landmark,
  FileCheck2,
  Wrench,
  Lock,
} from 'lucide-react'
import { TopologyNode, TopologyLink, TOPOLOGY_NODES, TOPOLOGY_LINKS } from './service-nodes-data'

// Dynamically import the 3D Canvas Scene with SSR disabled
const Dynamic3DScene = dynamic(() => import('./security-3d-scene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[460px] flex flex-col items-center justify-center bg-card/60 rounded-xl border border-border text-muted-foreground gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="text-xs font-mono tracking-wider text-foreground/80">
        Initializing 3D Security Mesh & Shaders...
      </span>
    </div>
  ),
})

export interface TopologyAttackScenario {
  code?: string
  title?: string
  latencyMs?: number
  [key: string]: any
}

export interface Security3DTopologyProps {
  nodes?: TopologyNode[]
  links?: TopologyLink[]
  isLiveBackend?: boolean
  protectionEnabled?: boolean
  activeScenario?: TopologyAttackScenario | null
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
}

// 2D Vector Policy-Flow Node Definition
interface VectorNode {
  id: string
  label: string
  subtitle: string
  tier: 'agent' | 'gateway' | 'downstream'
  x: number
  y: number
  port?: string
  risk: 'low' | 'guarded' | 'critical'
  description: string
  metrics: { label: string; value: string }[]
  securityInvariant?: string
}

const VECTOR_NODES: VectorNode[] = [
  {
    id: 'agent-elec',
    label: 'AGENT_ELEC_01',
    subtitle: 'Autonomous Utility Settlement',
    tier: 'agent',
    x: 120,
    y: 110,
    risk: 'guarded',
    description: 'Executes electricity grid disbursements under mandate MND_ELEC_101 (₹2,000 ceiling).',
    metrics: [
      { label: 'Mandate Cap', value: '₹2,000.00' },
      { label: 'Avg Latency', value: '3.4 ms' },
    ],
    securityInvariant: 'Rule E5: Ed25519 agent signatures; zero customer session access',
  },
  {
    id: 'agent-water',
    label: 'AGENT_WATER_01',
    subtitle: 'Municipal Billing Runtime',
    tier: 'agent',
    x: 120,
    y: 235,
    risk: 'low',
    description: 'Scheduled utility reconciliation agent with read-only ledger scope.',
    metrics: [
      { label: 'Trust Score', value: '98.4%' },
      { label: 'Blocked 24h', value: '0' },
    ],
    securityInvariant: 'Mandate Version: Scoped read-only access to invoice balance',
  },
  {
    id: 'agent-claims',
    label: 'claims-processing-agent',
    subtitle: 'High-Risk External Prompt Intake',
    tier: 'agent',
    x: 120,
    y: 360,
    risk: 'critical',
    description: 'Processes untrusted vendor invoices; primary target for OWASP ASI-01 prompt injection.',
    metrics: [
      { label: 'Risk Tier', value: 'Elevated' },
      { label: 'Intercepted', value: '14' },
    ],
    securityInvariant: 'Rule E5: Untrusted payload isolation & mandatory intent extraction',
  },
  {
    id: 'gateway',
    label: 'AgentGuard Gateway',
    subtitle: 'Pre-Execution Policy Engine',
    tier: 'gateway',
    x: 450,
    y: 235,
    port: ':8080',
    risk: 'guarded',
    description: 'Evaluates hard rules, prompt injection, behavioral baselines, and issues 22-field signed permits.',
    metrics: [
      { label: 'Eval P99', value: '3.8 ms' },
      { label: 'Active Rules', value: '24' },
    ],
    securityInvariant: 'Decision D1: Isolated Ed25519 permit private key; Rule E5 cross-namespace rejection',
  },
  {
    id: 'bank-gate',
    label: 'Bank Gate',
    subtitle: 'Signed Permit Verifier',
    tier: 'downstream',
    x: 780,
    y: 95,
    port: ':4000',
    risk: 'guarded',
    description: 'Rejects any unsigned or expired transfer payload before touching core banking rails.',
    metrics: [
      { label: 'Signature', value: 'Ed25519' },
      { label: 'Revocation', value: '<1 ms' },
    ],
    securityInvariant: 'Rule E4 & Invariant I1: Holds public key ONLY; atomic single-use nonce consumption',
  },
  {
    id: 'core-ledger',
    label: 'Core Bank Ledger',
    subtitle: 'Integer-Paise Settlement DB',
    tier: 'downstream',
    x: 780,
    y: 195,
    risk: 'critical',
    description: 'Authoritative double-entry settlement ledger isolated behind Bank Gate :4000.',
    metrics: [
      { label: 'Precision', value: 'Int64 Paise' },
      { label: 'Integrity', value: 'Verified' },
    ],
    securityInvariant: 'Decision D19: 2/3 Quorum Consensus; zero overdraft leakage (debits <= credits)',
  },
  {
    id: 'witness',
    label: 'Witness Notarizer',
    subtitle: 'Immutable Merkle Checkpoints',
    tier: 'downstream',
    x: 780,
    y: 295,
    port: ':5000',
    risk: 'low',
    description: 'Independently signs append-only SHA-256 Merkle roots to detect silent database tampering.',
    metrics: [
      { label: 'Chain Height', value: '#12,482' },
      { label: 'Drift', value: '0 rows' },
    ],
    securityInvariant: 'Invariant I9 & Decision D17: Standalone database (witness.db) & autonomous keypair',
  },
  {
    id: 'mcp-tools',
    label: 'MCP Tool Sandbox',
    subtitle: 'Scoped External Integrations',
    tier: 'downstream',
    x: 780,
    y: 395,
    risk: 'low',
    description: 'Egress-filtered tool servers with taint tracking and per-tool capability allowlists.',
    metrics: [
      { label: 'Tools', value: '11 Active' },
      { label: 'Egress', value: 'Allowlist' },
    ],
    securityInvariant: 'Decision D21: Transaction-bound 7-field digest WebAuthn step-up',
  },
]

const VECTOR_LINKS = [
  { id: 'vl1', from: 'agent-elec', to: 'gateway', kind: 'ingress' as const },
  { id: 'vl2', from: 'agent-water', to: 'gateway', kind: 'ingress' as const },
  { id: 'vl3', from: 'agent-claims', to: 'gateway', kind: 'attack-path' as const },
  { id: 'vl4', from: 'gateway', to: 'bank-gate', kind: 'egress' as const },
  { id: 'vl5', from: 'gateway', to: 'core-ledger', kind: 'breach-path' as const },
  { id: 'vl6', from: 'gateway', to: 'witness', kind: 'notarize' as const },
  { id: 'vl7', from: 'gateway', to: 'mcp-tools', kind: 'egress' as const },
]

function buildBezier(a: VectorNode, b: VectorNode) {
  const dx = (b.x - a.x) * 0.48
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export function Security3DTopology({
  nodes = TOPOLOGY_NODES,
  links = TOPOLOGY_LINKS,
  isLiveBackend = false,
  protectionEnabled = true,
  activeScenario = null,
  animatingRay = false,
  simulationVerdict = 'idle',
}: Security3DTopologyProps) {
  const [selected3DNode, setSelected3DNode] = useState<TopologyNode | null>(null)
  const [selected2DId, setSelected2DId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D')
  const [cameraResetKey, setCameraResetKey] = useState<number>(0)
  const [hasWebGL, setHasWebGL] = useState<boolean>(true)
  const [stageTilt, setStageTilt] = useState({ rx: 0, ry: 0 })

  // Verify WebGL availability
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) setHasWebGL(false)
    } catch {
      setHasWebGL(false)
    }
  }, [])

  const vectorNodeMap = useMemo(() => new Map(VECTOR_NODES.map((n) => [n.id, n])), [])
  const selectedVectorNode = selected2DId ? vectorNodeMap.get(selected2DId) ?? null : null

  // Click-to-isolate connected node IDs in 2D
  const connectedVectorIds = useMemo(() => {
    if (!selected2DId) return null
    const set = new Set<string>([selected2DId])
    for (const l of VECTOR_LINKS) {
      if (l.from === selected2DId) set.add(l.to)
      if (l.to === selected2DId) set.add(l.from)
    }
    return set
  }, [selected2DId])

  const isBreached = !protectionEnabled && simulationVerdict === 'breached'
  const beamColor = protectionEnabled ? 'hsl(var(--status-ok))' : 'hsl(var(--status-drift))'

  // Pointer-driven 3D CSS parallax on 2D stage
  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    setStageTilt({ rx: -py * 3.5, ry: px * 4.5 })
  }

  return (
    <div className="relative w-full rounded-xl border border-border bg-card overflow-hidden shadow-2xl flex flex-col">
      {/* Top Header Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 sm:px-4 py-2.5 z-10 bg-card/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 border border-border text-xs font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} />
            <span>Interactive Security Topology</span>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              isLiveBackend
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isLiveBackend ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            {isLiveBackend ? 'Live Cluster Telemetry' : 'Demonstration Mode'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Scenario Badge */}
          {activeScenario?.code && (
            <span className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-foreground hidden sm:inline-block">
              {activeScenario.code}
            </span>
          )}

          {/* Master Shield Status Pill */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              protectionEnabled
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {protectionEnabled ? (
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
            <span>{protectionEnabled ? 'Gateway Shield Armed' : 'Bypass Exposure'}</span>
          </span>

          {/* 3D vs 2D View Switcher */}
          <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setViewMode('3D')}
              disabled={!hasWebGL}
              className={`px-2.5 py-1 rounded transition-all ${
                viewMode === '3D'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              3D Mesh
            </button>
            <button
              onClick={() => setViewMode('2D')}
              className={`px-2.5 py-1 rounded transition-all ${
                viewMode === '2D'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              2D Schematic
            </button>
          </div>

          {/* Reset Camera Button (3D Mode) */}
          {viewMode === '3D' && (
            <button
              onClick={() => setCameraResetKey((prev) => prev + 1)}
              title="Reset 3D Camera"
              className="p-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition"
              aria-label="Reset Camera View"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.6} />
            </button>
          )}
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="flex-1 w-full min-h-[460px] relative bg-gradient-to-b from-card via-background to-card">
        {viewMode === '3D' && hasWebGL ? (
          /* High-Fidelity 3D WebGL Canvas Scene */
          <div className="w-full h-[460px] relative">
            <Dynamic3DScene
              nodes={nodes}
              links={links}
              selectedNodeId={selected3DNode?.id ?? null}
              onSelectNode={(node) => setSelected3DNode(node)}
              cameraResetKey={cameraResetKey}
              protectionEnabled={protectionEnabled}
              activeScenario={activeScenario}
              animatingRay={animatingRay}
              simulationVerdict={simulationVerdict}
            />

            {/* Bottom 3D Hint Banner */}
            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-muted-foreground pointer-events-none">
              <span>Click node to inspect cryptographic isolation · Drag to rotate 3D orbit</span>
              <span className="hidden sm:inline">VSR Quorum Online</span>
            </div>

            {/* Slide-out Inspector Card for 3D Selected Node */}
            {selected3DNode && (
              <aside
                className="passkey-modal-pop absolute top-4 right-4 bottom-4 w-80 md:w-88 rounded-xl border border-border bg-card/95 backdrop-blur-xl p-4 shadow-2xl z-20 flex flex-col space-y-3 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{selected3DNode.name}</span>
                      {selected3DNode.port && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20">
                          :{selected3DNode.port}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{selected3DNode.subtitle}</div>
                  </div>

                  <button
                    onClick={() => setSelected3DNode(null)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                    aria-label="Close details"
                  >
                    <X className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {selected3DNode.details.description}
                </p>

                {/* Enforced Invariant */}
                <div className="p-2.5 rounded-lg bg-secondary/70 border border-border text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-primary tracking-wider flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} /> Security Invariant
                  </span>
                  <div className="text-foreground font-mono text-[11px] leading-tight">
                    {selected3DNode.securityInvariant}
                  </div>
                </div>

                {/* Core Properties */}
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between p-1.5 rounded bg-secondary/50 border border-border">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Cpu className="h-3 w-3 text-cyan-500" strokeWidth={1.6} /> Runtime:
                    </span>
                    <span className="text-foreground text-right truncate max-w-[160px]">
                      {selected3DNode.details.processType}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-secondary/50 border border-border">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Database className="h-3 w-3 text-emerald-500" strokeWidth={1.6} /> Storage:
                    </span>
                    <span className="text-foreground text-right truncate max-w-[160px]">
                      {selected3DNode.details.database}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded bg-secondary/50 border border-border">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <KeyRound className="h-3 w-3 text-amber-500" strokeWidth={1.6} /> Keys:
                    </span>
                    <span className="text-foreground text-right truncate max-w-[160px]">
                      {selected3DNode.details.keyMaterial}
                    </span>
                  </div>
                </div>

                {/* Operational Metrics */}
                {selected3DNode.details.metrics && (
                  <div className="pt-1">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} /> Telemetry Metrics
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {Object.entries(selected3DNode.details.metrics).map(([k, v]) => (
                        <div key={k} className="p-2 rounded bg-secondary/60 border border-border">
                          <div className="text-[10px] text-muted-foreground">{k}</div>
                          <div className="font-bold text-foreground text-xs mt-0.5 truncate">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>
        ) : (
          /* Nexus-Grade Interactive Vector Policy-Flow Topology (2D View) */
          <div
            className="relative min-h-[470px] w-full select-none p-2 sm:p-4"
            style={{ perspective: '1200px' }}
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setStageTilt({ rx: 0, ry: 0 })}
            onClick={() => setSelected2DId(null)}
          >
            <div
              className="transition-transform duration-300 ease-out"
              style={{
                transform: `rotateX(${stageTilt.rx.toFixed(2)}deg) rotateY(${stageTilt.ry.toFixed(2)}deg)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <svg
                viewBox="0 0 900 480"
                className="h-auto w-full"
                role="img"
                aria-label="AgentGuard live security topology map"
              >
                <defs>
                  <radialGradient id="gateway-halo" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={beamColor} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={beamColor} stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="beam-cone-left" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor={beamColor} stopOpacity="0.02" />
                    <stop offset="100%" stopColor={beamColor} stopOpacity="0.12" />
                  </linearGradient>
                  <linearGradient id="beam-cone-right" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor={beamColor} stopOpacity="0.12" />
                    <stop offset="100%" stopColor={beamColor} stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Coordinate Background Grid */}
                <g opacity="0.16" stroke="hsl(var(--border))" strokeWidth="1">
                  {[90, 180, 270, 360, 450, 540, 630, 720, 810].map((x) => (
                    <line key={`vx-${x}`} x1={x} y1={20} x2={x} y2={460} strokeDasharray="2 6" />
                  ))}
                  {[95, 190, 285, 380].map((y) => (
                    <line key={`hy-${y}`} x1={20} y1={y} x2={880} y2={y} strokeDasharray="2 6" />
                  ))}
                </g>

                {/* Volumetric Directional Beam Cones Morphing with Protection State */}
                <polygon points="150,80 450,235 150,390" fill="url(#beam-cone-left)" />
                <polygon points="750,70 450,235 750,420" fill="url(#beam-cone-right)" />
                <circle cx="450" cy="235" r="92" fill="url(#gateway-halo)" />

                {/* Animated Cubic-Bézier Policy Flow Links */}
                {VECTOR_LINKS.map((link) => {
                  const from = vectorNodeMap.get(link.from)!
                  const to = vectorNodeMap.get(link.to)!
                  const d = buildBezier(from, to)
                  const dimmed =
                    connectedVectorIds !== null &&
                    (!connectedVectorIds.has(link.from) || !connectedVectorIds.has(link.to))

                  const isAttackIngress = animatingRay && link.kind === 'attack-path'
                  const isBreachEgress =
                    (animatingRay || isBreached) && !protectionEnabled && link.kind === 'breach-path'
                  const isWitnessPulse =
                    animatingRay && protectionEnabled && link.kind === 'notarize'

                  const stroke =
                    isAttackIngress || isBreachEgress
                      ? 'hsl(var(--status-drift))'
                      : isWitnessPulse
                        ? 'hsl(var(--status-ok))'
                        : 'hsl(var(--border))'

                  return (
                    <g
                      key={link.id}
                      opacity={dimmed ? 0.16 : 1}
                      className="transition-opacity duration-200"
                    >
                      <path
                        id={`path-${link.id}`}
                        d={d}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={isAttackIngress || isBreachEgress ? 2.4 : 1.4}
                        strokeDasharray={link.kind === 'notarize' ? '4 4' : undefined}
                      />
                      {/* Live Traveling Data Packet with <animateMotion> */}
                      <circle
                        r={isAttackIngress || isBreachEgress ? 4.2 : 2.6}
                        fill={
                          isAttackIngress || isBreachEgress
                            ? 'hsl(var(--status-drift))'
                            : protectionEnabled
                              ? 'hsl(var(--status-ok))'
                              : 'hsl(var(--status-attn))'
                        }
                      >
                        <animateMotion
                          dur={isAttackIngress || isBreachEgress ? '0.85s' : '3.2s'}
                          repeatCount="indefinite"
                          path={d}
                        />
                      </circle>
                    </g>
                  )
                })}

                {/* Tier Column Section Headers */}
                <text
                  x="120"
                  y="40"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
                >
                  Autonomous Agents
                </text>
                <text
                  x="450"
                  y="40"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
                >
                  Zero-Trust Gateway
                </text>
                <text
                  x="780"
                  y="40"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
                >
                  Protected Infrastructure
                </text>

                {/* Interactive Vector Nodes */}
                {VECTOR_NODES.map((node) => {
                  const isSelected = selected2DId === node.id
                  const dimmed = connectedVectorIds !== null && !connectedVectorIds.has(node.id)
                  const isGateway = node.tier === 'gateway'

                  const cardW = isGateway ? 188 : 170
                  const cardH = isGateway ? 78 : 58

                  const borderStroke = isSelected
                    ? 'hsl(var(--primary))'
                    : isGateway
                      ? beamColor
                      : node.id === 'core-ledger' && isBreached
                        ? 'hsl(var(--status-drift))'
                        : 'hsl(var(--border))'

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x - cardW / 2}, ${node.y - cardH / 2})`}
                      opacity={dimmed ? 0.22 : 1}
                      className="cursor-pointer transition-opacity duration-200"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected2DId((prev) => (prev === node.id ? null : node.id))
                      }}
                    >
                      {/* Gateway Shield Deflection Pulse Shell */}
                      {isGateway && animatingRay && protectionEnabled && (
                        <rect
                          x={-8}
                          y={-8}
                          width={cardW + 16}
                          height={cardH + 16}
                          rx={16}
                          fill="none"
                          stroke="hsl(var(--status-ok))"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                        />
                      )}

                      {/* Main Node Card */}
                      <rect
                        width={cardW}
                        height={cardH}
                        rx={12}
                        fill="hsl(var(--card))"
                        stroke={borderStroke}
                        strokeWidth={isSelected || isGateway ? 1.8 : 1.1}
                      />

                      {/* Status Indicator Dot */}
                      <circle
                        cx={14}
                        cy={18}
                        r={3.5}
                        fill={
                          isGateway
                            ? beamColor
                            : node.risk === 'critical'
                              ? 'hsl(var(--status-drift))'
                              : node.risk === 'guarded'
                                ? 'hsl(var(--primary))'
                                : 'hsl(var(--status-ok))'
                        }
                      />

                      {/* Node Label */}
                      <text
                        x={25}
                        y={21}
                        className="fill-foreground text-[11px] font-semibold"
                        style={{ fontFamily: 'var(--font-mono, monospace)' }}
                      >
                        {node.label}
                      </text>

                      {/* Node Subtitle */}
                      <text x={14} y={38} className="fill-muted-foreground text-[9.5px]">
                        {node.subtitle}
                      </text>

                      {/* Gateway Pre-Execution Guard Indicator */}
                      {isGateway && (
                        <text
                          x={14}
                          y={58}
                          className="text-[9.5px] font-semibold tracking-tight"
                          fill={beamColor}
                        >
                          {protectionEnabled
                            ? 'PRE-EXEC GUARD ARMED · 3.8ms'
                            : 'SHIELD DISARMED · PASS-THROUGH'}
                        </text>
                      )}

                      {/* Port Label */}
                      {node.port && !isGateway && (
                        <text
                          x={cardW - 10}
                          y={20}
                          textAnchor="end"
                          className="fill-muted-foreground text-[9px]"
                          style={{ fontFamily: 'var(--font-mono, monospace)' }}
                        >
                          {node.port}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Slide-Out Service Details Inspector (2D View) */}
            {selectedVectorNode && (
              <aside
                className="passkey-modal-pop absolute right-4 top-4 z-20 w-76 sm:w-84 rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-2 border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary text-foreground">
                      {selectedVectorNode.tier === 'agent' && (
                        <Cpu className="h-3.5 w-3.5" strokeWidth={1.6} />
                      )}
                      {selectedVectorNode.tier === 'gateway' && (
                        <Lock className="h-3.5 w-3.5" strokeWidth={1.6} />
                      )}
                      {selectedVectorNode.id === 'bank-gate' && (
                        <Landmark className="h-3.5 w-3.5" strokeWidth={1.6} />
                      )}
                      {selectedVectorNode.id === 'core-ledger' && (
                        <Database className="h-3.5 w-3.5" strokeWidth={1.6} />
                      )}
                      {selectedVectorNode.id === 'witness' && (
                        <FileCheck2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                      )}
                      {selectedVectorNode.id === 'mcp-tools' && (
                        <Wrench className="h-3.5 w-3.5" strokeWidth={1.6} />
                      )}
                    </span>
                    <div>
                      <h3 className="font-mono text-xs font-semibold text-foreground">
                        {selectedVectorNode.label}
                      </h3>
                      <p className="text-[10px] text-muted-foreground">{selectedVectorNode.subtitle}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected2DId(null)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                    aria-label="Close inspector"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </div>

                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  {selectedVectorNode.description}
                </p>

                {selectedVectorNode.securityInvariant && (
                  <div className="mt-2.5 p-2 rounded-lg bg-secondary/60 border border-border text-[11px] font-mono text-foreground leading-tight">
                    <span className="text-[10px] uppercase font-bold text-primary block mb-0.5">
                      Security Invariant
                    </span>
                    {selectedVectorNode.securityInvariant}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {selectedVectorNode.metrics.map((m) => (
                    <div key={m.label} className="rounded-lg border border-border bg-secondary/50 p-2">
                      <div className="text-[10px] text-muted-foreground">{m.label}</div>
                      <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-foreground">
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.6} />
                  <span>Telemetry Live · Real-Time Isolation</span>
                </div>
              </aside>
            )}

            {/* Bottom 2D Hint Banner */}
            <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-muted-foreground px-2">
              <span>Click any node to isolate cryptographic pathways · Mouse parallax active</span>
              <span>Cubic-Bézier Policy Grid</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
