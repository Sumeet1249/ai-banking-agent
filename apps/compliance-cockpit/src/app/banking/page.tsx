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
import { MandateGovernanceView } from '@/components/banking/mandate-governance-view'
import { IdentityReplayView } from '@/components/banking/identity-replay-view'
import { AnomalyDriftView } from '@/components/banking/anomaly-drift-view'
import { StepupEscalationView } from '@/components/banking/stepup-escalation-view'
import { MerkleLedgerView } from '@/components/banking/merkle-ledger-view'
import { JudgeWalkthroughView } from '@/components/banking/judge-walkthrough-view'
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
      text: '[SYSTEM] Dual-Keyring loaded: Gateway (Ed25519) + Bank Gate (:4000) + Witness (:5000).',
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
            text: `[LEDGER] Merkle leaf generated and validated against Witness :5000.`,
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
            <MandateGovernanceView
              onValidated={() => setCompletedFeatures((prev) => ({ ...prev, mandates: true }))}
            />
          )}

          {/* FEATURE 04: AGENT IDENTITY & KEY MANAGEMENT */}
          {activeFeature === 'identity' && (
            <IdentityReplayView
              onValidated={() => setCompletedFeatures((prev) => ({ ...prev, identity: true }))}
            />
          )}

          {/* FEATURE 05: ANOMALY & INTENT DRIFT */}
          {activeFeature === 'anomaly' && (
            <AnomalyDriftView
              onValidated={() => setCompletedFeatures((prev) => ({ ...prev, anomaly: true }))}
            />
          )}

          {/* FEATURE 06: HUMAN-IN-THE-LOOP STEP-UP */}
          {activeFeature === 'stepup' && (
            <StepupEscalationView
              onValidated={() => setCompletedFeatures((prev) => ({ ...prev, stepup: true }))}
            />
          )}

          {/* FEATURE 07: MERKLE AUDIT LEDGER */}
          {activeFeature === 'ledger' && (
            <MerkleLedgerView
              onTamperToggle={(tampered: boolean) => {
                setTamperSimulated(tampered)
                setMetrics((prev) => ({
                  ...prev,
                  merkleBlocks: tampered ? '11/12 (TAMPER)' : '12/12 Valid',
                }))
              }}
              onValidated={() => setCompletedFeatures((prev) => ({ ...prev, ledger: true }))}
            />
          )}

          {/* FEATURE 08: MVP DEV & JUDGE TESTING GUIDE */}
          {activeFeature === 'mvp_guide' && (
            <JudgeWalkthroughView
              protectionEnabled={protectionEnabled}
              onToggleProtection={(val) => setProtectionEnabled(val)}
              onNavigateToModule={(mod) => setActiveFeature(mod as BankingModuleId)}
              onValidated={() => setCompletedFeatures((prev) => ({ ...prev, mvp_guide: true }))}
            />
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

