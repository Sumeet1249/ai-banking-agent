'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
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
  Play,
  Zap,
  Crosshair,
  Flame,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TopologyNode,
  TopologyLink,
  TOPOLOGY_NODES,
  TOPOLOGY_LINKS,
  CameraPresetKey,
  SCENARIO_CHOREOGRAPHIES,
  ScenarioChoreographyConfig,
} from './service-nodes-data'

// Dynamically import the 3D Canvas Scene with SSR disabled
const Dynamic3DScene = dynamic(() => import('./security-3d-scene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[460px] flex flex-col items-center justify-center bg-card/60 rounded-xl border border-border text-muted-foreground gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="text-xs font-mono tracking-wider text-foreground/80">
        Initializing Sovereign Vault Silicon Motherboard...
      </span>
    </div>
  ),
})

export interface Security3DTopologyProps {
  nodes?: TopologyNode[]
  links?: TopologyLink[]
  isLiveBackend?: boolean
  protectionEnabled?: boolean
  onToggleProtection?: (val: boolean) => void
  globalFreeze?: boolean
  activeScenario?: any
  onSelectScenario?: (scenario: any) => void
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
    subtitle: 'Fortress Bridge Policy Engine',
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
    subtitle: 'Cryptographic Airlock Arch',
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

const SCENARIO_ICONS: Record<string, any> = {
  scenario_1_prompt_injection: Crosshair,
  scenario_2_overreach: Zap,
  scenario_3_stolen_token_replay: KeyRound,
  scenario_4_structuring: Activity,
  scenario_5_compromised_agent: Flame,
  scenario_6_post_revocation: Clock,
  scenario_7_insider_tamper: Database,
}

export function Security3DTopology({
  nodes = TOPOLOGY_NODES,
  links = TOPOLOGY_LINKS,
  isLiveBackend = false,
  protectionEnabled = true,
  onToggleProtection,
  globalFreeze = false,
  activeScenario = null,
  onSelectScenario,
  animatingRay = false,
  simulationVerdict = 'idle',
}: Security3DTopologyProps) {
  const [selected3DNode, setSelected3DNode] = useState<TopologyNode | null>(null)
  const [hovered3DNode, setHovered3DNode] = useState<TopologyNode | null>(null)
  const [selected2DId, setSelected2DId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D')
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPresetKey>('orbit')
  const [cameraResetKey, setCameraResetKey] = useState<number>(0)
  const [hasWebGL, setHasWebGL] = useState<boolean>(true)
  const [stageTilt, setStageTilt] = useState({ rx: 0, ry: 0 })
  const [animPhase, setAnimPhase] = useState<1 | 2 | 3>(1)
  const [isTourRunning, setIsTourRunning] = useState<boolean>(false)

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

  // Track 3.2-second 3-phase timing in lockstep with 3D engine
  useEffect(() => {
    if (animatingRay) {
      setAnimPhase(1)
      const t1 = setTimeout(() => setAnimPhase(2), 1100)
      const t2 = setTimeout(() => setAnimPhase(3), 2200)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    } else {
      setAnimPhase(1)
    }
  }, [animatingRay])

  // Find active choreography configuration
  const activeChoreo = useMemo(() => {
    if (!activeScenario) return SCENARIO_CHOREOGRAPHIES[0]
    return (
      SCENARIO_CHOREOGRAPHIES.find(
        (s) =>
          s.id === activeScenario.id ||
          s.owaspId === activeScenario.owaspId ||
          s.owaspId === activeScenario.code
      ) || SCENARIO_CHOREOGRAPHIES[0]
    )
  }, [activeScenario])

  // Auto-align camera hint if a scenario is actively fired
  useEffect(() => {
    if (activeChoreo?.cameraHint) {
      setActiveCameraPreset(activeChoreo.cameraHint)
    }
  }, [activeChoreo])

  // "Play All 7" Auto-Tour Runner
  useEffect(() => {
    if (!isTourRunning) return
    let step = 0
    const interval = setInterval(() => {
      if (step >= SCENARIO_CHOREOGRAPHIES.length) {
        setIsTourRunning(false)
        clearInterval(interval)
        return
      }
      onSelectScenario?.(SCENARIO_CHOREOGRAPHIES[step])
      step++
    }, 3600)
    return () => clearInterval(interval)
  }, [isTourRunning, onSelectScenario])

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

  const handleScenarioClick = (sc: ScenarioChoreographyConfig) => {
    setIsTourRunning(false)
    onSelectScenario?.(sc)
  }

  const handleReplay = () => {
    if (activeChoreo) {
      onSelectScenario?.(activeChoreo)
    }
  }

  return (
    <div className="relative w-full rounded-xl border border-border bg-card overflow-hidden shadow-2xl flex flex-col">
      {/* ── Top Header Control Bar ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 sm:px-4 py-2.5 z-10 bg-card/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 border border-border text-xs font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} />
            <span>3D Zero-Trust Vault</span>
          </div>

          <span
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5',
              isLiveBackend
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isLiveBackend ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              )}
            />
            {isLiveBackend ? 'LIVE TELEMETRY' : 'DEMO MODE'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Master Shield Status Pill */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              globalFreeze
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : protectionEnabled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
            )}
          >
            {globalFreeze ? (
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.6} />
            ) : protectionEnabled ? (
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
            <span>
              {globalFreeze
                ? 'Global Freeze'
                : protectionEnabled
                  ? 'Shield Armed'
                  : 'Bypassed'}
            </span>
          </span>

          {/* Camera Preset Toolbar (visible in 3D Mode) */}
          {viewMode === '3D' && (
            <div className="hidden sm:flex items-center bg-secondary/80 border border-border rounded-lg p-0.5 text-xs font-mono gap-0.5">
              <button
                type="button"
                onClick={() => setActiveCameraPreset('orbit')}
                className={cn(
                  'px-2 py-1 rounded transition-all text-[11px]',
                  activeCameraPreset === 'orbit'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Overview 3/4 Studio View"
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setActiveCameraPreset('dmz')}
                className={cn(
                  'px-2 py-1 rounded transition-all text-[11px]',
                  activeCameraPreset === 'dmz'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Focus on Center Zero-Trust DMZ Bridge"
              >
                DMZ
              </button>
              <button
                type="button"
                onClick={() => setActiveCameraPreset('ledger')}
                className={cn(
                  'px-2 py-1 rounded transition-all text-[11px]',
                  activeCameraPreset === 'ledger'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Focus on Sovereign Bank Vault Core"
              >
                Vault
              </button>
            </div>
          )}

          {/* 3D vs 2D View Switcher */}
          <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setViewMode('3D')}
              disabled={!hasWebGL}
              className={cn(
                'px-2.5 py-1 rounded transition-all',
                viewMode === '3D'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              3D
            </button>
            <button
              onClick={() => setViewMode('2D')}
              className={cn(
                'px-2.5 py-1 rounded transition-all',
                viewMode === '2D'
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              2D
            </button>
          </div>

          {/* Reset Camera Button (3D Mode) */}
          {viewMode === '3D' && (
            <button
              onClick={() => {
                setActiveCameraPreset('orbit')
                setCameraResetKey((prev) => prev + 1)
              }}
              title="Reset 3D Camera"
              className="p-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition"
              aria-label="Reset Camera View"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.6} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Visualizer Area ──────────────────────────────────────────── */}
      <div className="flex-1 w-full min-h-[520px] relative bg-gradient-to-b from-card via-background to-card">
        {viewMode === '3D' && hasWebGL ? (
          /* High-Fidelity 3D WebGL Canvas Scene */
          <div className="w-full h-[520px] relative">
            {/* Top-Left In-Canvas Live Execution Telemetry Pill */}
            <div className="absolute top-3 left-3 z-20 pointer-events-none max-w-[calc(100%-24px)]">
              {animatingRay ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-primary/40 shadow-xl backdrop-blur-md animate-in fade-in duration-150">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] truncate">
                    <span className="font-bold text-primary">{activeChoreo.owaspId}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground font-medium">
                      {animPhase === 1
                        ? 'Phase 1/3: Origin & Ingress'
                        : animPhase === 2
                          ? 'Phase 2/3: Policy Gate Check'
                          : 'Phase 3/3: Resolution'}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-cyan-400 font-bold tabular-nums">
                      {animPhase === 1 ? '0.8ms' : animPhase === 2 ? '3.8ms' : '12.4ms'}
                    </span>
                  </div>
                </div>
              ) : simulationVerdict === 'blocked' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/90 border border-emerald-500/50 shadow-xl backdrop-blur-md text-emerald-300 font-mono text-[11px] animate-in fade-in duration-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" strokeWidth={1.8} />
                  <span className="font-bold">✓ {activeChoreo.protectedVerdictBadge}</span>
                </div>
              ) : simulationVerdict === 'breached' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-950/90 border border-rose-500/50 shadow-xl backdrop-blur-md text-rose-300 font-mono text-[11px] animate-in fade-in duration-200">
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-400 shrink-0" strokeWidth={1.8} />
                  <span className="font-bold">✕ {activeChoreo.bypassedVerdictBadge}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-950/75 border border-white/10 backdrop-blur-md text-muted-foreground font-mono text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>SOVEREIGN VAULT SILICON · 7 HARDWARE MODULES ONLINE</span>
                </div>
              )}
            </div>

            {/* Top-Right Contextual Hover Glass Readout */}
            {hovered3DNode && (
              <div className="absolute top-3 right-3 z-20 pointer-events-none">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-primary/40 shadow-xl backdrop-blur-md text-foreground font-mono text-[11px] animate-in fade-in duration-100">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hovered3DNode.color }} />
                  <span className="font-bold">{hovered3DNode.name}</span>
                  {hovered3DNode.port && <span className="opacity-70 text-[10px]">:{hovered3DNode.port}</span>}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{hovered3DNode.role}</span>
                </div>
              </div>
            )}

            <Dynamic3DScene
              nodes={nodes}
              links={links}
              selectedNodeId={selected3DNode?.id ?? null}
              onSelectNode={(node) => setSelected3DNode(node)}
              onHoverNode={(node) => setHovered3DNode(node)}
              cameraResetKey={cameraResetKey}
              protectionEnabled={protectionEnabled}
              globalFreeze={globalFreeze}
              activeScenario={activeScenario}
              animatingRay={animatingRay}
              simulationVerdict={simulationVerdict}
              activeCameraPreset={activeCameraPreset}
              onPresetChange={(preset: CameraPresetKey) => setActiveCameraPreset(preset)}
            />

            {/* ── Live Synced 3-Step Storyboard Bar (Inside Bottom of 3D Canvas) ── */}
            <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-none">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/90 border border-white/10 backdrop-blur-md text-[11px] font-mono shadow-2xl">
                {/* Step 1: 01 ORIGIN */}
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors min-w-0 flex-1',
                    animPhase >= 1 && animatingRay
                      ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                      : 'text-muted-foreground'
                  )}
                >
                  <span className="font-bold shrink-0 text-cyan-400">01 ORIGIN:</span>
                  <span className="truncate">
                    {activeChoreo.originLabel}
                  </span>
                </div>

                <span className="text-muted-foreground/40 hidden sm:inline shrink-0">──▶</span>

                {/* Step 2: 02 DMZ GATE */}
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors min-w-0 flex-1',
                    animPhase >= 2 && animatingRay
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-muted-foreground'
                  )}
                >
                  <span className="font-bold shrink-0 text-amber-400">02 DMZ GATE:</span>
                  <span className="truncate">
                    {activeChoreo.dmzLabel}
                  </span>
                </div>

                <span className="text-muted-foreground/40 hidden sm:inline shrink-0">──▶</span>

                {/* Step 3: 03 VERDICT */}
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors min-w-0 flex-1',
                    simulationVerdict === 'blocked'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : simulationVerdict === 'breached'
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        : animPhase >= 3 && animatingRay
                          ? 'bg-primary/15 text-primary-foreground border border-primary/30'
                          : 'text-muted-foreground'
                  )}
                >
                  <span className="font-bold shrink-0 text-emerald-400">03 VERDICT:</span>
                  <span className="truncate">
                    {simulationVerdict === 'blocked'
                      ? activeChoreo.protectedVerdictBadge
                      : simulationVerdict === 'breached'
                        ? activeChoreo.bypassedVerdictBadge
                        : 'Pre-Execution Shield Active'}
                  </span>
                </div>
              </div>
            </div>

            {/* Slide-out Inspector Card for 3D Selected Node */}
            {selected3DNode && (
              <aside
                className="passkey-modal-pop absolute top-4 right-4 bottom-4 w-80 md:w-88 rounded-xl border border-border bg-card/95 backdrop-blur-xl p-4 shadow-2xl z-30 flex flex-col space-y-3 overflow-y-auto"
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
                      <Cpu className="h-3 w-3 text-cyan-500" strokeWidth={1.6} /> Module Type:
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
          /* 2D Vector Policy-Flow View (Fallback Mode) */
          <div
            className="relative min-h-[470px] w-full select-none p-2 sm:p-4"
            style={{ perspective: '1200px' }}
            onMouseMove={handlePointerMove}
            onMouseLeave={() => setStageTilt({ rx: 0, ry: 0 })}
            onClick={() => setSelected2DId(null)}
          >
            {/* Top-Left Live Execution Telemetry Pill (2D Sync) */}
            <div className="absolute top-3 left-3 z-20 pointer-events-none max-w-[calc(100%-24px)]">
              {animatingRay ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/95 border border-primary/40 shadow-xl backdrop-blur-md animate-in fade-in duration-150">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] truncate">
                    <span className="font-bold text-primary">{activeChoreo.owaspId}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground font-medium">
                      {animPhase === 1
                        ? 'Phase 1/3: Ingress & Mutation'
                        : animPhase === 2
                          ? 'Phase 2/3: Policy Evaluation'
                          : 'Phase 3/3: Resolution'}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-cyan-500 font-bold tabular-nums">
                      {animPhase === 1 ? '0.8ms' : animPhase === 2 ? '3.8ms' : '12.4ms'}
                    </span>
                  </div>
                </div>
              ) : simulationVerdict === 'blocked' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/50 shadow-xl backdrop-blur-md text-emerald-600 dark:text-emerald-300 font-mono text-[11px] animate-in fade-in duration-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" strokeWidth={1.8} />
                  <span className="font-bold">✓ {activeChoreo.protectedVerdictBadge}</span>
                </div>
              ) : simulationVerdict === 'breached' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/50 shadow-xl backdrop-blur-md text-rose-600 dark:text-rose-300 font-mono text-[11px] animate-in fade-in duration-200">
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-500 shrink-0" strokeWidth={1.8} />
                  <span className="font-bold">✕ {activeChoreo.bypassedVerdictBadge}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-card/85 border border-border backdrop-blur-md text-muted-foreground font-mono text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>2D SCHEMATIC · 7 NODES ONLINE · 3.8ms BASELINE</span>
                </div>
              )}
            </div>

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

                {/* Volumetric Directional Beam Cones */}
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

                {/* Tier Headers */}
                <text
                  x="120"
                  y="40"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
                >
                  01 · Autonomous Agents
                </text>
                <text
                  x="450"
                  y="40"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
                >
                  02 · Zero-Trust Gateway
                </text>
                <text
                  x="780"
                  y="40"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-widest"
                >
                  03 · Protected Vault
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
                      {/* Card Shell */}
                      <rect
                        width={cardW}
                        height={cardH}
                        rx={12}
                        fill="hsl(var(--card))"
                        stroke={borderStroke}
                        strokeWidth={isSelected || isGateway ? 1.8 : 1.1}
                      />

                      {/* Status Dot */}
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

                      <text
                        x={25}
                        y={21}
                        className="fill-foreground text-[11px] font-semibold"
                        style={{ fontFamily: 'var(--font-mono, monospace)' }}
                      >
                        {node.label}
                      </text>

                      <text x={14} y={38} className="fill-muted-foreground text-[9.5px]">
                        {node.subtitle}
                      </text>

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

            {/* Slide-out Inspector Card for 2D View */}
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
              </aside>
            )}
          </div>
        )}
      </div>

      {/* ── Unified Bottom Command Console ─────────────────────────────────── */}
      <div className="border-t border-border bg-card/95 backdrop-blur-md p-4 space-y-4">
        {/* Console Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
          {/* Left: Active Scenario & Accurate Technical Verdict */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-secondary border border-border text-foreground">
              {activeChoreo.owaspId}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {activeChoreo.shortTitle}
            </span>
            <span className="text-muted-foreground text-xs hidden sm:inline">·</span>

            {/* Live Scenario-Accurate Technical Verdict Badge */}
            <div
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 border shadow-xs transition-colors',
                globalFreeze
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                  : simulationVerdict === 'blocked'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : simulationVerdict === 'breached'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      : protectionEnabled
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
              )}
            >
              {globalFreeze ? (
                <>
                  <Flame className="h-3.5 w-3.5 text-rose-500" strokeWidth={1.8} />
                  <span>EMERGENCY FROZEN · ALL CHANNELS HALTED</span>
                </>
              ) : simulationVerdict === 'blocked' ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.8} />
                  <span>{activeChoreo.protectedVerdictBadge}</span>
                </>
              ) : simulationVerdict === 'breached' ? (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-500" strokeWidth={1.8} />
                  <span>{activeChoreo.bypassedVerdictBadge}</span>
                </>
              ) : protectionEnabled ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.8} />
                  <span>SHIELD ARMED · READY FOR INTERCEPTION (3.8ms)</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.8} />
                  <span>BYPASS MODE · FORTRESS SHUTTERS RETRACTED</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Tactile Segmented Guard Switch + Replay + Tour */}
          <div className="flex items-center gap-2">
            {/* Replay 3.2s Animation */}
            <button
              type="button"
              onClick={handleReplay}
              disabled={animatingRay}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border bg-secondary hover:bg-secondary/80 text-foreground flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              title="Replay 3.2s 3D Choreography Animation"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>Replay</span>
            </button>

            {/* Play All 7 Tour */}
            <button
              type="button"
              onClick={() => setIsTourRunning((prev) => !prev)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition active:scale-95',
                isTourRunning
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm animate-pulse'
                  : 'bg-secondary hover:bg-secondary/80 text-foreground border-border'
              )}
              title="Auto-play all 7 attack scenarios in sequence"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span>{isTourRunning ? 'Pause Tour' : 'Play All 7'}</span>
            </button>

            {/* Tactile Segmented Guard Armed / Raw Bypass Control */}
            <div className="flex items-center bg-secondary border border-border rounded-lg p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => onToggleProtection?.(true)}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-all flex items-center gap-1 font-semibold text-[11px]',
                  protectionEnabled
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>Armed</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleProtection?.(false)}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-all flex items-center gap-1 font-semibold text-[11px]',
                  !protectionEnabled
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>Bypass</span>
              </button>
            </div>
          </div>
        </div>

        {/* 7-Card High-Contrast Attack Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {SCENARIO_CHOREOGRAPHIES.map((sc) => {
            const isSelected = activeChoreo.id === sc.id
            const HintIcon = SCENARIO_ICONS[sc.id] || Zap

            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => handleScenarioClick(sc)}
                className={cn(
                  'p-2.5 rounded-xl border text-left transition relative flex flex-col justify-between gap-2 overflow-hidden group active:scale-98',
                  isSelected
                    ? simulationVerdict === 'blocked'
                      ? 'bg-secondary/90 border-emerald-500/60 shadow-sm ring-1 ring-emerald-500/30'
                      : simulationVerdict === 'breached'
                        ? 'bg-secondary/90 border-rose-500/60 shadow-sm ring-1 ring-rose-500/30'
                        : 'bg-secondary/90 border-primary text-foreground shadow-sm ring-1 ring-primary/30'
                    : 'bg-card border-border/80 text-muted-foreground hover:bg-secondary/60 hover:text-foreground hover:border-border'
                )}
              >
                {/* 3.2s Sweeping Top Progress Bar on Active Card */}
                {isSelected && animatingRay && (
                  <div
                    className="absolute top-0 left-0 h-[2.5px] bg-primary transition-all duration-3200 ease-linear"
                    style={{ width: animatingRay ? '100%' : '0%' }}
                  />
                )}

                <div className="flex items-center justify-between w-full">
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold tracking-tight',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary border border-border text-foreground'
                    )}
                  >
                    {sc.owaspId}
                  </span>
                  <HintIcon
                    className={cn(
                      'h-3.5 w-3.5 transition-colors',
                      isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                    strokeWidth={1.6}
                  />
                </div>

                <div className="min-w-0">
                  <div className="font-semibold text-xs text-foreground truncate">
                    {sc.shortTitle}
                  </div>
                  <div className="text-xs font-mono font-bold text-foreground/90 mt-0.5 tabular-nums">
                    {sc.riskAmountFormatted}
                  </div>
                </div>

                {/* Left accent indicator */}
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
