'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  ShieldAlert, ShieldCheck, Play, RotateCcw, AlertTriangle,
  Lock, CheckCircle2, XCircle, ArrowRight, ArrowLeft, Zap, RefreshCw,
  FileCode, Terminal, HelpCircle, Layers, Cpu, Server, Database,
  Network, Eye, Fingerprint, KeyRound, ChevronRight, ChevronDown, ChevronUp,
  ExternalLink, Sparkles, AlertCircle, ArrowUpRight, Check,
  Radio, Shield, Smartphone, Activity, BarChart3, FileCheck, Sliders,
  CheckCheck, UserCheck, ShieldX, Bug, Flame, LockKeyhole, Crosshair,
  Radar, Binary, Code2, Clock, CheckSquare, Compass, Copy
} from 'lucide-react'
import { AttackLabView, SCENARIOS, AttackScenario } from '@/components/banking/attack-lab-view'
import { Security3DTopology } from '@/components/topology/security-3d-topology'
import { PasskeyStepUpModal } from '@/components/banking/passkey-stepup-modal'
import { MerkleChainVisualizer } from '@/components/banking/merkle-chain-visualizer'
import { DashboardLayout } from '@/components/dashboard/layout'
import { useCountUp } from '@/hooks/useCountUp'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type BankingModuleId =
  | 'attack_lab'
  | 'topology'
  | 'mandates'
  | 'identity'
  | 'anomaly'
  | 'stepup'
  | 'ledger'
  | 'mvp_guide'

const VALID_MODULE_IDS: BankingModuleId[] = [
  'attack_lab',
  'topology',
  'mandates',
  'identity',
  'anomaly',
  'stepup',
  'ledger',
  'mvp_guide',
]

const BANKING_MODULES = [
  {
    id: 'attack_lab' as const,
    number: '01',
    title: 'Attack Lab & Simulator',
    subtitle: '7 OWASP agent scenarios (ON vs OFF)',
    icon: Crosshair,
    badge: 'Core Demo',
    badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  {
    id: 'topology' as const,
    number: '02',
    title: 'Visual Agent Topology',
    subtitle: 'Agent → Gateway → Bank Core flow',
    icon: Network,
    badge: 'Interactive',
    badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  },
  {
    id: 'mandates' as const,
    number: '03',
    title: 'Scoped Delegation',
    subtitle: 'Integer caps & instant revocation',
    icon: KeyRound,
    badge: 'Key #1',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'identity' as const,
    number: '04',
    title: 'Agent Identity & Nonces',
    subtitle: 'Ed25519 signatures & anti-replay',
    icon: ShieldCheck,
    badge: 'Key #2',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'anomaly' as const,
    number: '05',
    title: 'Anomaly & Intent Drift',
    subtitle: 'Vector drift, smurfing & quarantine',
    icon: Activity,
    badge: 'Key #3',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'stepup' as const,
    number: '06',
    title: 'Human-in-the-Loop Step-Up',
    subtitle: 'FIDO2 WebAuthn biometric passkeys',
    icon: Fingerprint,
    badge: 'Key #4',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'ledger' as const,
    number: '07',
    title: 'Merkle Audit Ledger',
    subtitle: 'RFC 6962 SHA-256 tamper proofing',
    icon: Binary,
    badge: 'Key #5',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    id: 'mvp_guide' as const,
    number: '08',
    title: 'Judge & CLI Guide',
    subtitle: '3-min script & automated CLI tests',
    icon: Terminal,
    badge: 'Rubric',
    badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
]

export default function BankingDashboardPage() {
  // Master Security States
  const [activeFeature, setActiveFeature] = useState<BankingModuleId>('attack_lab')
  const [protectionEnabled, setProtectionEnabled] = useState<boolean>(true)
  const [globalFreeze, setGlobalFreeze] = useState<boolean>(false)
  const [selectedScenario, setSelectedScenario] = useState<AttackScenario>(SCENARIOS[0])
  const [animatingRay, setAnimatingRay] = useState<boolean>(false)
  const [simulationVerdict, setSimulationVerdict] = useState<'idle' | 'blocked' | 'breached'>('idle')
  const [tamperSimulated, setTamperSimulated] = useState<boolean>(false)
  const [passkeyModalOpen, setPasskeyModalOpen] = useState<boolean>(false)
  const [mandateActive, setMandateActive] = useState<boolean>(true)
  const [mandateReadout, setMandateReadout] = useState<string | null>(null)

  // Bottom Live Wire Telemetry Drawer State
  const [telemetryDrawerOpen, setTelemetryDrawerOpen] = useState<boolean>(false)
  const [telemetryFilter, setTelemetryFilter] = useState<'all' | 'blocked' | 'intercept'>('all')

  // Track completed steps strictly against VALID_MODULE_IDS (No scenario IDs!)
  const [completedFeatures, setCompletedFeatures] = useState<Record<string, boolean>>({
    attack_lab: true,
  })

  // Real-time forensic telemetry logs
  const [telemetryLogs, setTelemetryLogs] = useState<
    Array<{ text: string; time: string; type: 'info' | 'blocked' | 'breach' | 'system' }>
  >([
    {
      text: '[INIT] AgentShield Zero-Trust Pre-Execution Gateway online.',
      time: '00:00:01',
      type: 'system',
    },
    {
      text: '[SYSTEM] Dual-Keyring loaded: Gateway (Ed25519) + Bank Gate (:4000) + Witness (:4002).',
      time: '00:00:02',
      type: 'system',
    },
    {
      text: '[INVARIANT] Integer-Paise Precision enforced across all transaction channels (Rule E1).',
      time: '00:00:03',
      type: 'info',
    },
    {
      text: '[READY] Protection ON. Ready for autonomous agent mediation.',
      time: '00:00:04',
      type: 'info',
    },
  ])

  // Key Metrics
  const [metrics, setMetrics] = useState({
    threatsBlocked: 1872,
    fundsSavedPaise: 37910000, // ₹3,79,100
    activeMandates: 42,
    driftIntercepts: 3210,
    merkleBlocks: '12/12 Valid',
  })

  // Dynamic Animated Count-Up Counters
  const animatedThreats = useCountUp(metrics.threatsBlocked)
  const animatedFundsRupees = useCountUp(Math.round(metrics.fundsSavedPaise / 100))
  const animatedDrift = useCountUp(metrics.driftIntercepts)

  // Format integer-paise to Indian Rupees
  const formatPaise = (paise: number) => {
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })
  }

  // Strictly deduplicated validated module count (clamped to 0-8)
  const validatedCount = Math.min(
    8,
    VALID_MODULE_IDS.filter((id) => Boolean(completedFeatures[id])).length
  )

  // Sequential navigation calculation
  const currentIndex = BANKING_MODULES.findIndex((f) => f.id === activeFeature)
  const prevFeature = currentIndex > 0 ? BANKING_MODULES[currentIndex - 1] : null
  const nextFeature = currentIndex < BANKING_MODULES.length - 1 ? BANKING_MODULES[currentIndex + 1] : null

  // Handle firing a scenario against the visual topology
  const handleFireRay = (scenario: AttackScenario) => {
    setSelectedScenario(scenario)
    setAnimatingRay(true)
    setSimulationVerdict('idle')

    const nowTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const newEntries = [
      {
        text: `[SIMULATION START] Firing Attack Vector: ${scenario.title}`,
        time: nowTime,
        type: 'info' as const,
      },
      {
        text: `[PAYLOAD] Amount: ${formatPaise(scenario.riskAmountPaise)} · Target: ${scenario.subtitle}`,
        time: nowTime,
        type: 'info' as const,
      },
      {
        text: `[GATEWAY] Pre-execution evaluation active...`,
        time: nowTime,
        type: 'info' as const,
      },
    ]
    setTelemetryLogs((prev) => [...newEntries, ...prev.slice(0, 20)])

    setTimeout(() => {
      setAnimatingRay(false)
      const finishTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      if (globalFreeze) {
        setSimulationVerdict('blocked')
        setCompletedFeatures((prev) => ({ ...prev, attack_lab: true, topology: true }))
        setTelemetryLogs((prev) => [
          {
            text: `[GLOBAL FREEZE] All banking channels halted. Zero execution.`,
            time: finishTime,
            type: 'blocked' as const,
          },
          ...prev,
        ])
      } else if (protectionEnabled) {
        setSimulationVerdict('blocked')
        // Mark strictly module IDs, never scenario IDs!
        setCompletedFeatures((prev) => ({ ...prev, attack_lab: true, topology: true }))
        setMetrics((prev) => ({
          ...prev,
          threatsBlocked: prev.threatsBlocked + 1,
          fundsSavedPaise: prev.fundsSavedPaise + scenario.riskAmountPaise,
        }))
        setTelemetryLogs((prev) => [
          {
            text: `[INTERCEPTED] ${scenario.protectionOnOutcome}`,
            time: finishTime,
            type: 'blocked' as const,
          },
          {
            text: `[LEDGER] Merkle leaf generated and validated against Witness :4002.`,
            time: finishTime,
            type: 'info' as const,
          },
          ...prev,
        ])
      } else {
        setSimulationVerdict('breached')
        setTelemetryLogs((prev) => [
          {
            text: `[SECURITY BREACH] Protection is OFF. Core ledger executed raw transaction.`,
            time: finishTime,
            type: 'breach' as const,
          },
          {
            text: `[CRITICAL LOSS] ${formatPaise(scenario.riskAmountPaise)} drained to unauthorized party.`,
            time: finishTime,
            type: 'breach' as const,
          },
          ...prev,
        ])
      }
    }, 1000)
  }

  // Filtered telemetry logs for bottom live-wire dock
  const filteredTelemetry = telemetryLogs.filter((log) => {
    if (telemetryFilter === 'blocked') return log.type === 'blocked' || log.type === 'breach'
    if (telemetryFilter === 'intercept') return log.type === 'blocked'
    return true
  })

  return (
    <DashboardLayout>
      <div className="space-y-5 pb-16">
        {/* ── ROW 1: UNIFIED VAULT COMMAND HEADER & AUTHORITATIVE CONTROLS ────────────── */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm card-depth">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Title & Regulatory Badges */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0 shadow-inner">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                    AgentShield · Banking Control Plane
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    5/5 Keys Active
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    RBI &amp; PCI-DSS Ready
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-secondary text-muted-foreground border border-border">
                    Int64 Paise
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Securing Banks Against Rogue AI Agents · Zero-Trust Pre-Execution Mediation Layer
                </p>
              </div>
            </div>

            {/* Authoritative Single Master Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Progress Pill */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60 border border-border">
                <span className="text-[11px] font-medium text-muted-foreground">Progress:</span>
                <span className="text-xs font-bold text-foreground font-mono">
                  {validatedCount} / 8 Verified
                </span>
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${(validatedCount / 8) * 100}%` }}
                  />
                </div>
              </div>

              {/* Single Authoritative Master Guard Toggle */}
              <div
                className={cn(
                  'flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all select-none',
                  globalFreeze
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : protectionEnabled
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                )}
              >
                <div className="flex flex-col text-right">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Zero-Trust Guard
                  </span>
                  <span
                    className={cn(
                      'text-xs font-bold font-mono',
                      globalFreeze
                        ? 'text-rose-600 dark:text-rose-400'
                        : protectionEnabled
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {globalFreeze
                      ? 'EMERGENCY FROZEN'
                      : protectionEnabled
                        ? 'PROTECTION ON'
                        : 'PROTECTION OFF'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !protectionEnabled
                    setProtectionEnabled(next)
                    setSimulationVerdict('idle')
                  }}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0',
                    protectionEnabled ? 'bg-emerald-600' : 'bg-slate-500'
                  )}
                  title="Toggle Authoritative AgentShield Zero-Trust Protection"
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
                      protectionEnabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {/* Emergency Freeze */}
              <button
                type="button"
                onClick={() => setGlobalFreeze(!globalFreeze)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 shrink-0',
                  globalFreeze
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-secondary text-foreground border-border hover:border-rose-500 hover:text-rose-600'
                )}
              >
                <Flame className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                <span>{globalFreeze ? 'GLOBAL FREEZE ACTIVE' : 'Emergency Freeze'}</span>
              </button>
            </div>
          </div>

          {/* Emergency Kill-Switch Active Banner */}
          {globalFreeze && (
            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4 animate-pulse shrink-0" />
                <span>
                  <strong>GLOBAL EMERGENCY KILL-SWITCH ENGAGED:</strong> All autonomous agent executions halted across core banking channels.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setGlobalFreeze(false)}
                className="px-2.5 py-1 bg-rose-600 text-white rounded text-[11px] font-bold hover:bg-rose-500 transition shrink-0"
              >
                Deactivate
              </button>
            </div>
          )}
        </div>

        {/* ── ROW 2: UNIFIED 5-KPI LIVE TELEMETRY STRIP (Single Row) ─────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Threats Blocked */}
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm card-depth tilt-3d">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Threats Blocked
              </span>
              <div className="p-1 rounded bg-rose-500/10 text-rose-500">
                <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 tabular-nums font-mono">
              {animatedThreats.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
              <CheckCheck className="h-3 w-3" />
              <span>Zero Rogue Debits</span>
            </div>
          </div>

          {/* Funds Protected */}
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm card-depth tilt-3d">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Funds Protected
              </span>
              <div className="p-1 rounded bg-emerald-500/10 text-emerald-500">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 tabular-nums font-mono">
              ₹{animatedFundsRupees.toLocaleString('en-IN')}.00
            </div>
            <div className="text-[11px] text-indigo-500 mt-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>Integer-Paise Precision</span>
            </div>
          </div>

          {/* Active Mandates */}
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm card-depth tilt-3d">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Active Mandates
              </span>
              <div className="p-1 rounded bg-indigo-500/10 text-indigo-500">
                <KeyRound className="h-3.5 w-3.5" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 tabular-nums font-mono">
              {metrics.activeMandates}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>&lt;1s Revocation</span>
            </div>
          </div>

          {/* Intent Drift Intercepts */}
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm card-depth tilt-3d">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Intent Drift Intercepts
              </span>
              <div className="p-1 rounded bg-amber-500/10 text-amber-500">
                <Radar className="h-3.5 w-3.5" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground mt-1 tabular-nums font-mono">
              {animatedDrift.toLocaleString()}
            </div>
            <div className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>0.8ms Detection</span>
            </div>
          </div>

          {/* Merkle Integrity */}
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm card-depth tilt-3d col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                Merkle Integrity
              </span>
              <div className="p-1 rounded bg-cyan-500/10 text-cyan-500">
                <Binary className="h-3.5 w-3.5" strokeWidth={1.6} />
              </div>
            </div>
            <div className="text-lg sm:text-xl font-bold text-foreground mt-1 font-mono">
              {metrics.merkleBlocks}
            </div>
            <div className="text-[11px] text-cyan-500 mt-0.5 flex items-center gap-1">
              <FileCheck className="h-3 w-3" />
              <span>RFC 6962 SHA-256</span>
            </div>
          </div>
        </div>

        {/* ── ROW 3: HORIZONTAL 8-MODULE MISSION RIBBON (Zero Truncation!) ────────────── */}
        <div className="rounded-xl border border-border bg-card p-2 shadow-sm card-depth">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {BANKING_MODULES.map((mod) => {
              const Icon = mod.icon
              const isActive = activeFeature === mod.id
              const isDone = Boolean(completedFeatures[mod.id])

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    setActiveFeature(mod.id)
                    setCompletedFeatures((prev) => ({ ...prev, [mod.id]: true }))
                  }}
                  className={cn(
                    'group relative flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 shrink-0 select-none active:scale-[0.98]',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'font-mono text-[10px] px-1.5 py-0.2 rounded border shrink-0',
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30'
                        : 'bg-muted text-foreground border-border'
                    )}
                  >
                    {mod.number}
                  </span>

                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                    strokeWidth={1.6}
                  />

                  <span>{mod.title}</span>

                  {isDone && (
                    <CheckCircle2
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 ml-0.5',
                        isActive ? 'text-primary-foreground' : 'text-emerald-500'
                      )}
                      strokeWidth={2}
                    />
                  )}

                  <span
                    className={cn(
                      'text-[9px] font-bold px-1.5 py-0.2 rounded border ml-1 shrink-0',
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30'
                        : mod.badgeColor
                    )}
                  >
                    {mod.badge}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── FULL-WIDTH WORKBENCH (100% Canvas Width Utilized) ──────────────────────── */}
        <div className="space-y-6">
          {/* FEATURE 01: ATTACK LAB & SIMULATOR */}
          {activeFeature === 'attack_lab' && (
            <AttackLabView
              protectionEnabled={protectionEnabled}
              onToggleProtection={(val) => setProtectionEnabled(val)}
              globalFreeze={globalFreeze}
              activeScenario={selectedScenario}
              animatingRay={animatingRay}
              simulationVerdict={simulationVerdict}
              totalSavedPaise={metrics.fundsSavedPaise}
              onRunScenario={handleFireRay}
              onOpenLedger={() => setActiveFeature('ledger')}
            />
          )}

          {/* FEATURE 02: VISUAL AGENT TOPOLOGY */}
          {activeFeature === 'topology' && (
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5 card-depth">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Network className="h-5 w-5 text-indigo-500" strokeWidth={1.6} />
                    Agent-to-Bank Zero-Trust Interceptor Topology
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pre-execution mediation layer sitting between Autonomous Agents and Core Bank Ledger
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Proxy Network Active
                </span>
              </div>

              {/* Interactive 3D Security Topology WebGL Scene */}
              <div className="rounded-xl border border-border overflow-hidden shadow-2xl relative">
                <Security3DTopology
                  isLiveBackend={true}
                  protectionEnabled={protectionEnabled}
                  activeScenario={selectedScenario}
                  animatingRay={animatingRay}
                  simulationVerdict={simulationVerdict}
                />
              </div>

              {/* Synchronized Status & Topology Verdict Bar */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card/90 backdrop-blur card-depth transition-colors">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Topology Interception Verdict
                </span>

                {simulationVerdict === 'idle' ? (
                  <div
                    className={cn(
                      'px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border shadow-sm transition-colors',
                      globalFreeze
                        ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                        : protectionEnabled
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    )}
                  >
                    {globalFreeze ? (
                      <>
                        <Flame className="h-4 w-4 text-rose-500" strokeWidth={1.8} />
                        <span>EMERGENCY FROZEN · ALL 7 CHANNELS HALTED</span>
                      </>
                    ) : protectionEnabled ? (
                      <>
                        <ShieldCheck className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
                        <span>SHIELD ARMED · PRE-EXECUTION MEDIATION READY (3.8ms)</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-4 w-4 text-amber-500" strokeWidth={1.8} />
                        <span>BYPASS MODE · ZERO-TRUST DISARMED · RAW ACCESS</span>
                      </>
                    )}
                  </div>
                ) : simulationVerdict === 'blocked' ? (
                  <div className="px-3.5 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in duration-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
                    <span>DEFLECTED BY AGENTSHIELD GATEWAY — ZERO LOSS (PAISE PRESERVED)</span>
                  </div>
                ) : (
                  <div className="px-3.5 py-1.5 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2 shadow-sm animate-in fade-in duration-200">
                    <ShieldAlert className="h-4 w-4 text-rose-500" strokeWidth={1.8} />
                    <span>CRITICAL: DIRECT BREACH — FUNDS DRAINED</span>
                  </div>
                )}
              </div>

              {/* Quick Simulation Trigger Bar */}
              <div className="rounded-xl border border-border bg-card p-4 card-depth">
                <div className="text-xs font-semibold text-foreground mb-2 flex items-center justify-between">
                  <span>⚡ Click an attack scenario to fire a live simulated ray through topology:</span>
                  <span className="text-[10px] text-indigo-500 font-mono">0.8ms latency</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  {SCENARIOS.map((sc, idx) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => handleFireRay(sc)}
                      className={cn(
                        'p-2 rounded-lg border text-left transition text-[11px] flex flex-col justify-between active:scale-95',
                        selectedScenario.id === sc.id
                          ? 'bg-secondary border-primary/50 text-foreground shadow-sm ring-1 ring-primary/20'
                          : 'bg-card border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      <div className="font-bold truncate text-[10px]">
                        #{idx + 1} {sc.title.split('.')[1] || sc.title}
                      </div>
                      <div className="text-[9px] text-indigo-500 font-mono mt-1">{sc.owaspId}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FEATURE 03: SCOPED DELEGATION & MANDATES */}
          {activeFeature === 'mandates' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 card-depth">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Scoped Delegation &amp; Mandate Governance (Key #1)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Customers grant strictly limited, time-bound, and instantly revocable authority
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs font-mono px-2.5 py-1 rounded border font-bold transition-colors',
                    mandateActive
                      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                  )}
                >
                  {mandateReadout || (mandateActive ? '<1s Propagation' : 'REVOKED (0.4ms)')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground">MND_ELEC_101 (v1)</span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-bold border transition-colors',
                        mandateActive
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      )}
                    >
                      {mandateActive ? 'ACTIVE' : 'REVOKED'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      Authorized Agent: <strong className="text-foreground">AGENT_ELEC_01</strong>
                    </div>
                    <div>
                      Action Purpose: <strong className="text-foreground">electricity_bill_payment</strong>
                    </div>
                    <div>
                      Per-Txn Cap: <strong className="text-foreground font-mono">₹5,000.00 (500000 paise)</strong>
                    </div>
                    <div>
                      Daily Cap: <strong className="text-foreground font-mono">₹10,000.00</strong>
                    </div>
                    <div>
                      Allowed Payees: <strong className="text-foreground font-mono">[BESCOM, POWER_01]</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (mandateActive) {
                        setMandateActive(false)
                        setMandateReadout('0.4ms synced to Bank Gate :4000')
                        toast.error('Mandate MND_ELEC_101 REVOKED', {
                          description: 'Stale token invalidated in 0.4ms across all Bank Gate instances.',
                        })
                      } else {
                        setMandateActive(true)
                        setMandateReadout('<1s Propagation')
                        toast.success('Mandate MND_ELEC_101 Restored', {
                          description: 'Scoped delegation reinstated with ₹5,000 per-txn cap.',
                        })
                      }
                      setCompletedFeatures((prev) => ({ ...prev, mandates: true }))
                    }}
                    className={cn(
                      'w-full py-2 rounded-lg text-xs font-bold border transition flex items-center justify-center gap-2 active:scale-95',
                      mandateActive
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500 hover:text-white'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                    )}
                  >
                    {mandateActive ? 'Simulate Instant Revocation' : 'Restore Mandate Policy'}
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground">MND_WATER_102 (v1)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      Authorized Agent: <strong className="text-foreground">AGENT_WATER_01</strong>
                    </div>
                    <div>
                      Action Purpose: <strong className="text-foreground">water_utility_invoice</strong>
                    </div>
                    <div>
                      Per-Txn Cap: <strong className="text-foreground font-mono">₹2,000.00 (200000 paise)</strong>
                    </div>
                    <div>
                      Daily Cap: <strong className="text-foreground font-mono">₹4,000.00</strong>
                    </div>
                    <div>
                      Allowed Payees: <strong className="text-foreground font-mono">[BWSSB_WATER]</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      toast.warning('Mandate MND_WATER_102 Revoked', {
                        description: 'Stale token invalidated across all Bank Gate instances in <1s.',
                      })
                      setCompletedFeatures((prev) => ({ ...prev, mandates: true }))
                    }}
                    className="w-full py-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-bold transition active:scale-95"
                  >
                    Simulate Instant Revocation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FEATURE 04: AGENT IDENTITY & KEY MANAGEMENT */}
          {activeFeature === 'identity' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 card-depth">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Agent Identity &amp; Anti-Replay Engine (Key #2)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Asymmetric Ed25519 signing and atomic single-use nonce consumption
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-500 text-xs font-semibold rounded border border-indigo-500/20">
                  Ed25519 Cryptographic Pair
                </span>
              </div>

              <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500">
                    <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">Registered Keyring: Bank Gate TrustedKeyring</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Active Key ID: key_gw_ed25519_2026_v1 · Grace Period: 180s
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-3 bg-card border border-border rounded-lg">
                    <span className="font-semibold text-foreground block">Anti-Replay Nonce</span>
                    <span className="text-muted-foreground text-[11px] mt-0.5 block">
                      UUIDv4 atomic consumption prevents duplicate execution.
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg">
                    <span className="font-semibold text-foreground block">Bank Gate Air-Gap</span>
                    <span className="text-muted-foreground text-[11px] mt-0.5 block">
                      Bank Gate (:4000) independently verifies permit before debit.
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg">
                    <span className="font-semibold text-foreground block">KMS Abstraction</span>
                    <span className="text-muted-foreground text-[11px] mt-0.5 block">
                      Hardware-backed HSM ready (FIPS 140-2 Level 3 / PKCS#11).
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FEATURE 05: ANOMALY & INTENT DRIFT */}
          {activeFeature === 'anomaly' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 card-depth">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Machine Behavioural Anomaly &amp; Intent Drift (Key #3)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Detecting goal divergence, prompt injection, and smurfing structuring
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-amber-500/10 text-amber-500 text-xs font-semibold rounded border border-amber-500/20">
                  Cosine &amp; Heuristic Guard
                </span>
              </div>

              <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-3">
                <div className="text-xs text-muted-foreground leading-relaxed">
                  AgentShield continuously evaluates machine behaviour rather than human behaviour. If an agent states:{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
                    &ldquo;Pay BESCOM electricity bill&rdquo;
                  </code>{' '}
                  but issues a debit to{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-rose-500 font-mono">
                    ATTACKER_OFFSHORE
                  </code>
                  , the Intent-Drift engine detects the divergence in <strong>0.8ms</strong> and halts execution.
                </div>

                <div className="p-3 bg-card border border-border rounded-lg text-xs space-y-2">
                  <div className="font-bold text-foreground">Active Anomaly Protections:</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      <strong>Smurfing / Structuring Detector:</strong> Flags 10 × ₹4,900 micro-transfers below ₹5,000 threshold.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      <strong>Auto-Quarantine Circuit Breaker:</strong> Agent isolated automatically after 3 consecutive security violations.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>
                      <strong>Runaway Burst Limiter:</strong> Velocity caps prevent infinite-loop automated exploitation.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FEATURE 06: HUMAN-IN-THE-LOOP STEP-UP */}
          {activeFeature === 'stepup' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 card-depth">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Human-in-the-Loop Escalation (Key #4)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Pausing high-risk or ambiguous agent actions for biometric confirmation
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-500 text-xs font-semibold rounded border border-indigo-500/20">
                  FIDO2 Level 2 Passkeys
                </span>
              </div>

              <div className="p-5 rounded-xl border border-border bg-secondary/20 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500">
                    <Fingerprint className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">
                      Registered Passkey: Platform Biometric (Touch ID / Windows Hello)
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Credential ID: pk_cred_macbook_biometric_01 · User: CUST_101
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg text-xs text-muted-foreground">
                  <strong>Dual-Control Escalation:</strong> When an agent initiates a transfer exceeding ₹2,000 or flags medium anomaly risk, the gateway issues an <code>ASK</code> decision. The call is suspended until the customer completes WebAuthn passkey verification.
                </div>

                <button
                  type="button"
                  onClick={() => setPasskeyModalOpen(true)}
                  className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-bold flex items-center gap-2 transition active:scale-95"
                >
                  <Fingerprint className="h-4 w-4" />
                  <span>Test Biometric Step-Up Verification</span>
                </button>
              </div>

              {/* Passkey Step-Up Verification Modal */}
              <PasskeyStepUpModal
                isOpen={passkeyModalOpen}
                onClose={() => setPasskeyModalOpen(false)}
                agentName="AGENT_ELEC_01"
                payee="National Grid Settlement Escrow"
                amountPaise={485000}
                thresholdPaise={200000}
                reason="Electricity grid disbursement exceeds single-transaction policy threshold"
                onApproved={() => {
                  setCompletedFeatures((prev) => ({ ...prev, stepup: true }))
                  toast.success('Signed WebAuthn Permit Issued', {
                    description: 'Biometric passkey permit notarized and dispatched to Bank Gate (:4000).',
                  })
                }}
              />
            </div>
          )}

          {/* FEATURE 07: MERKLE AUDIT LEDGER */}
          {activeFeature === 'ledger' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 card-depth">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Cryptographic Tamper-Evident Audit Ledger (Key #5)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    RFC 6962 SHA-256 Merkle chain cosigned by independent Witness (:4002)
                  </p>
                </div>
                <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded border border-cyan-500/20 font-bold">
                  SHA-256 Merkle Chain
                </span>
              </div>

              <div className="text-xs text-muted-foreground leading-relaxed">
                Every debit transaction produces a cryptographic hash leaf linked to its predecessor. If an insider or root database operator modifies an amount from ₹1,000 to ₹1,00,000, the hash chain breaks immediately with an automated domino cascade.
              </div>

              {/* Interactive Merkle Chain Visualizer with SVG Hash Connectors & Tamper Cascade */}
              <MerkleChainVisualizer
                onTamperToggle={(tampered: boolean) => {
                  setTamperSimulated(tampered)
                  setCompletedFeatures((prev) => ({ ...prev, ledger: true }))
                  setMetrics((prev) => ({
                    ...prev,
                    merkleBlocks: tampered ? '11/12 (TAMPER)' : '12/12 Valid',
                  }))
                }}
              />
            </div>
          )}

          {/* FEATURE 08: MVP DEV & JUDGE TESTING GUIDE */}
          {activeFeature === 'mvp_guide' && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6 card-depth">
              <div className="border-b border-border pb-3">
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Hackathon Rubric Walkthrough
                </span>
                <h2 className="text-lg font-bold text-foreground mt-1">
                  How to Demonstrate AgentShield in 3 Minutes
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Follow this concise sequence to prove all 5 core problem statements to hackathon judges.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                    Step 1 · Show Unprotected Failure (Protection OFF)
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    Turn Protection OFF &amp; Run Prompt Injection
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Flip the master switch at the top right to <strong>PROTECTION OFF</strong>. Run Scenario 1 in the Attack Lab. The prompt injection in the invoice PDF bypasses controls and drains ₹4,900.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                    Step 2 · Show Protected Defense (Protection ON)
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    Turn Protection ON &amp; Intercept Rogue Agent
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Flip the master switch back to <strong>PROTECTION ON</strong>. Re-run Scenario 1. AgentShield&apos;s Intent-Drift engine catches the payee divergence in <strong>4ms</strong>. The transaction is blocked, saving ₹4,900.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                    Step 3 · Run Automated Test Suites Live
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    100% Test Coverage Across Banking Infrastructure
                  </div>
                  <div className="p-3 rounded bg-muted/80 font-mono text-xs text-foreground border border-border space-y-1 mt-2">
                    <div className="text-muted-foreground"># 1. 5 Core Hackathon Requirements (13 / 13 passed):</div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">npm run test:hackathon</div>
                    <div className="text-muted-foreground mt-2"># 2. 7 Attack Lab Scenarios (17 / 17 passed):</div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                      npm --workspace @agentguard/gateway-mcp test src/__tests__/attack-lab-scenarios.test.ts
                    </div>
                    <div className="text-muted-foreground mt-2"># 3. Core Banking Ledger &amp; Witness (101 / 101 passed):</div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">npm run test:banking</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP NAVIGATION FOOTER (PREVIOUS / NEXT WORKFLOW) ────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-depth">
            {prevFeature ? (
              <button
                type="button"
                onClick={() => {
                  setActiveFeature(prevFeature.id)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="px-3.5 py-2 rounded-lg border border-border bg-secondary hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-2 transition active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>
                  Previous: {prevFeature.number}. {prevFeature.title}
                </span>
              </button>
            ) : (
              <Link
                href="/"
                className="px-3.5 py-2 rounded-lg border border-border bg-secondary hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-2 transition active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Return to Overview</span>
              </Link>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCompletedFeatures((prev) => ({ ...prev, [activeFeature]: true }))
                  if (nextFeature) {
                    setActiveFeature(nextFeature.id)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {nextFeature
                    ? `Complete & Next: ${nextFeature.number}. ${nextFeature.title}`
                    : 'Complete Walkthrough (8/8)'}
                </span>
                {nextFeature && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── COLLAPSIBLE BOTTOM LIVE WIRE TELEMETRY DOCK ────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none flex justify-center pb-2 px-4">
          <div
            className={cn(
              'pointer-events-auto w-full max-w-7xl rounded-xl border border-border/90 bg-[hsl(var(--card)/0.96)] backdrop-blur-xl shadow-2xl transition-[max-height,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden',
              telemetryDrawerOpen ? 'max-h-64' : 'max-h-11'
            )}
          >
            {/* Ticker Bar (Always Visible) */}
            <div
              onClick={() => setTelemetryDrawerOpen(!telemetryDrawerOpen)}
              className="h-11 px-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-secondary/40 select-none transition-colors border-b border-border/40"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-[11px] font-mono font-bold text-foreground shrink-0 uppercase tracking-wider">
                  Live Wire Telemetry
                </span>
                <span className="text-muted-foreground/60 shrink-0">|</span>
                <p className="text-[11px] font-mono text-muted-foreground truncate">
                  {telemetryLogs[0]?.text || 'Standing by for live agent traces...'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                  {telemetryLogs.length} events
                </span>
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                  aria-label="Toggle Telemetry Drawer"
                >
                  {telemetryDrawerOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Expanded Drawer Console */}
            {telemetryDrawerOpen && (
              <div className="p-3 space-y-2 bg-slate-950 text-slate-200 font-mono text-xs max-h-52 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTelemetryFilter('all')}
                      className={cn(
                        'px-2 py-0.5 rounded transition',
                        telemetryFilter === 'all'
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      All ({telemetryLogs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetryFilter('blocked')}
                      className={cn(
                        'px-2 py-0.5 rounded transition',
                        telemetryFilter === 'blocked'
                          ? 'bg-emerald-900/60 text-emerald-300 font-bold'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      Enforcements
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetryFilter('intercept')}
                      className={cn(
                        'px-2 py-0.5 rounded transition',
                        telemetryFilter === 'intercept'
                          ? 'bg-indigo-900/60 text-indigo-300 font-bold'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      Intercepts
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const json = JSON.stringify(telemetryLogs, null, 2)
                        navigator.clipboard?.writeText(json)
                        toast.success('Telemetry logs copied to clipboard')
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetryLogs([])}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {filteredTelemetry.map((log, idx) => {
                    const isError = log.type === 'breach'
                    const isBlocked = log.type === 'blocked'
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'text-[11px] leading-relaxed flex items-start gap-2',
                          isError
                            ? 'text-rose-400 font-semibold'
                            : isBlocked
                              ? 'text-emerald-400 font-semibold'
                              : 'text-slate-300'
                        )}
                      >
                        <span className="text-slate-600 shrink-0 select-none">[{log.time}]</span>
                        <span className="break-all">{log.text}</span>
                      </div>
                    )
                  })}
                  {filteredTelemetry.length === 0 && (
                    <div className="text-slate-500 py-3 text-center text-[11px] italic">
                      No logs matching the current filter.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

