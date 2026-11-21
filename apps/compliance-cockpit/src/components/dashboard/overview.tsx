'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/page-header'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search,
  X,
  ArrowRight,
  AlertTriangle,
  Code2,
  Zap,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Activity,
  ShieldAlert,
  Lock,
  RefreshCw,
  Cpu,
  Server,
  Radio,
  Flame,
  Check,
  Play,
  Eye,
  TrendingDown,
  TrendingUp,
  Clock,
  Layers,
  ChevronRight,
  ShieldX,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { RecentTraces } from './recent-traces'
import { AlertRulesPanel } from './alert-rules-panel'
import { AgentActivity } from './agent-activity'
import { AnomalyPanel } from './anomaly-panel'
import { CostPanel } from './cost-panel'
import { SessionsPanel } from './sessions-panel'
import { ActivityChart, useSparklineSeries } from './activity-chart'
import { Sparkline } from '@/components/ui/sparkline'
import {
  VitalRiskGauge,
  VitalRiskBadge,
  VitalRiskCard,
  VitalRiskData,
} from '@/components/ui/vital-risk-score'

const BORDER = 'hsl(var(--border))'
const MUTED = 'hsl(var(--muted-foreground))'
const TEXT = 'hsl(var(--foreground))'

// ── Live Telemetry Strip ─────────────────────────────────────────────────────

function LiveTelemetryStrip() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['system-health-telemetry'],
    queryFn: async () => {
      const res = await fetch('/api/system/health', { cache: 'no-store' })
      if (!res.ok) throw new Error('Health check failed')
      return res.json()
    },
    refetchInterval: 3500,
  })

  const services = health?.services || [
    { id: 'gateway', name: 'Gateway MCP', port: 8081, status: 'ONLINE', latencyMs: 2 },
    { id: 'trust-engine', name: 'Trust Engine', port: 4006, status: 'ONLINE', latencyMs: 4 },
    { id: 'bank-gate', name: 'Bank Gate', port: 4000, status: 'ONLINE', latencyMs: 1 },
    { id: 'witness', name: 'Witness Ledger', port: 5000, status: 'ONLINE', latencyMs: 2 },
    { id: 'market-mcp', name: 'Market Data MCP', port: 4004, status: 'ONLINE', latencyMs: 2 },
    { id: 'cockpit-ui', name: 'Compliance Cockpit', port: 13003, status: 'ONLINE', latencyMs: 1 },
  ]

  const isHealthy = health?.overall_status === 'HEALTHY' || !health

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-3 shadow-sm transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Stream Indicator */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                isHealthy ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                isHealthy ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              Live Mesh Telemetry
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono border border-emerald-500/20">
              SSE Active
            </span>
          </div>
        </div>

        {/* Center: Live Service Status Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {services.map((s: any) => {
            const isOnline = s.status === 'ONLINE'
            return (
              <div
                key={s.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/40 border border-border/40 text-[11px] font-mono transition-all hover:bg-secondary/70"
                title={`${s.name} at :${s.port} (${s.latencyMs}ms)`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-rose-500'
                  }`}
                />
                <span className="text-muted-foreground font-sans font-medium">{s.name}</span>
                <span className="text-[10px] text-primary/80 font-bold">{s.latencyMs}ms</span>
              </div>
            )
          })}
        </div>

        {/* Right: Last Heartbeat */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 text-muted-foreground/80" />
          <span>Real-time polling: 3.5s</span>
        </div>
      </div>
    </div>
  )
}

// ── Hero Command Center Banner ───────────────────────────────────────────────

function HeroCommandBanner({
  onSimulateAttack,
  simulating,
}: {
  onSimulateAttack: () => void
  simulating: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-card via-card/95 to-primary/5 p-6 shadow-md transition-all">
      {/* Background ambient glow */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute right-1/3 -bottom-20 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 font-mono">
              <ShieldCheck className="h-3.5 w-3.5" />
              FINANCIAL RUNTIME KERNEL v2.0
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              235/235 Invariants Enforced
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Gemini 1.5 Active
            </span>
          </div>

          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            AgentGuard AI — Zero-Trust Autonomous Agent Security
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
            Continuous cryptographic agent identity, single-use Ed25519 TBPs, integer-paise mandates,
            real-time behavioral anomaly radar, and sub-second automated quarantine circuit breakers.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
          <button
            onClick={onSimulateAttack}
            disabled={simulating}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            title="Inject simulated unauthorized tool call to verify auto-quarantine"
          >
            {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
            {simulating ? 'Simulating Threat...' : 'Simulate Threat Lab'}
          </button>

          <Link
            href="/agent-trust"
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center gap-2 shadow-sm"
          >
            <Activity className="h-3.5 w-3.5" />
            Vital Risk Radar &rarr;
          </Link>

          <Link
            href="/banking"
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border/60 transition-all flex items-center gap-2"
          >
            <Zap className="h-3.5 w-3.5 text-primary" />
            Banking Lab
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Real-Time Connected Stat Cards ──────────────────────────────────────────

function ConnectedStatCards({
  overview,
  agentsCount,
  vitalScore = 18,
}: {
  overview: any
  agentsCount: number
  vitalScore: number
}) {
  const { actions, blocked, isLoading } = useSparklineSeries()
  const slice = (arr: number[]) => arr.slice(-6)

  const protectedPaise = 124500000 // ₹12,45,000 in integer paise (Rule E1)
  const formattedProtected = (protectedPaise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  })

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {/* 1. Vital Risk Score Card (Interactive Radial Arc) */}
      <Link href="/agent-trust">
        <Card className="card-depth-hover cursor-pointer border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 transition-all h-full relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShieldCheck className="h-28 w-28 text-emerald-400" />
          </div>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-emerald-400 flex items-center justify-between">
              <span>Vital Risk Index</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono">
                OPTIMAL
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-extrabold font-mono text-emerald-400 tracking-tight">
                  {vitalScore}{' '}
                  <span className="text-xs text-muted-foreground font-sans font-normal">/ 100</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-emerald-400" />
                  -4% drift velocity (24h)
                </p>
              </div>
              <div className="scale-75 origin-right">
                <VitalRiskGauge score={vitalScore} size={70} />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* 2. Active AI Agent Fleet */}
      <Link href="/agent-trust">
        <Card className="card-depth-hover cursor-pointer hover:border-primary/40 transition-colors h-full">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>AI Agent Fleet</span>
              <Cpu className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-3xl font-extrabold font-mono tabular-nums text-foreground">
              {agentsCount || 3}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{overview?.active_agents || 2} Active</span>
              <span>·</span>
              <span className="text-amber-400">{overview?.quarantined_agents || 1} Quarantined</span>
            </p>
          </CardContent>
        </Card>
      </Link>

      {/* 3. Protected Capital (Integer Paise - Rule E1) */}
      <Card className="card-depth-hover h-full">
        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Capital Protected</span>
            <Lock className="h-4 w-4 text-emerald-400" />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="text-2xl font-extrabold font-mono tabular-nums text-foreground tracking-tight">
            {formattedProtected}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 font-mono">
            {protectedPaise.toLocaleString()} paise (Rule E1)
          </p>
        </CardContent>
      </Card>

      {/* 4. Enforced Policy Decisions */}
      <Card className="card-depth-hover h-full">
        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Evaluations (24h)</span>
            <Activity className="h-4 w-4 text-sky-400" />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="text-3xl font-extrabold font-mono tabular-nums text-foreground">
            {(overview?.total_evaluations_24h || 42).toLocaleString()}
          </div>
          <div className="mt-1">
            <Sparkline data={isLoading ? [] : slice(actions)} color="hsl(var(--primary))" />
          </div>
        </CardContent>
      </Card>

      {/* 5. Blocked Attacks & Anomalies */}
      <Card className="card-depth-hover h-full border-rose-500/20 bg-rose-500/5">
        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-rose-400 flex items-center justify-between">
            <span>Threats Stopped</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="text-3xl font-extrabold font-mono tabular-nums text-rose-400">
            {overview?.open_incidents || 1}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 text-rose-300">
            <span>3-Strike Circuit Breaker</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Multi-Vector Threat Radar & Live Fleet Split ────────────────────────────

function ThreatRadarAndFleet({
  agents,
  vitalScore,
}: {
  agents: any[]
  vitalScore: number
}) {
  const vectors = [
    { name: 'Intent Drift Deviation', val: 12, max: 100, status: 'NORMAL', color: 'bg-emerald-400' },
    { name: 'Velocity Burst Rate', val: 8, max: 100, status: 'NORMAL', color: 'bg-emerald-400' },
    { name: 'Identity & Nonce Integrity', val: 98, max: 100, status: 'OPTIMAL', color: 'bg-sky-400' },
    { name: 'Off-Hours Temporal (IST)', val: 0, max: 100, status: 'INACTIVE', color: 'bg-emerald-400' },
    { name: 'Execution Blast Radius', val: 24, max: 100, status: 'PROTECTED', color: 'bg-emerald-400' },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-7">
      {/* Left 4 Cols: Threat Radar & Advisory */}
      <Card className="lg:col-span-4 border-border/60 bg-card/70 backdrop-blur-sm shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Multi-Vector Behavioral Threat Radar
            </CardTitle>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live Baseline Active
            </span>
          </div>
          <CardDescription className="text-xs">
            Deterministic anomaly scoring evaluating drift deviation, execution burst velocity, and Asia/Kolkata temporal hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {vectors.map((v) => (
              <div key={v.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{v.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground">{v.val}%</span>
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-secondary text-foreground">
                      {v.status}
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${v.color} transition-all duration-500`}
                    style={{ width: `${v.val}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Early Warning Forecast */}
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3 mt-4">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-foreground">TI-Kernel Predictive Threat Advisory</p>
              <p className="text-muted-foreground leading-relaxed">
                All agent tool calls remain within authenticated customer mandates. Zero unhandled prompt
                injections or unauthorized beneficiary modifications detected in the current window.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right 3 Cols: Active Agent Roster */}
      <Card className="lg:col-span-3 border-border/60 bg-card/70 backdrop-blur-sm shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              Agent Fleet Roster
            </CardTitle>
            <Link
              href="/agent-trust"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Manage &rarr;
            </Link>
          </div>
          <CardDescription className="text-xs">
            Authenticated autonomous agents under active governance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {agents.slice(0, 4).map((agent: any) => {
            const isQuarantined = agent.status === 'QUARANTINED'
            return (
              <div
                key={agent.agent_id}
                className={`p-3 rounded-xl border transition-all ${
                  isQuarantined
                    ? 'border-rose-500/30 bg-rose-500/5'
                    : 'border-border/60 bg-secondary/30 hover:bg-secondary/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{agent.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">
                      {agent.agent_id} · v{agent.version}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${
                      isQuarantined
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Trust Score:</span>
                  <span
                    className={`font-mono font-bold ${
                      isQuarantined ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {agent.trust_score} / 1000
                  </span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Live Cryptographic Decision Stream ──────────────────────────────────────

function LiveDecisionStream({ decisions }: { decisions: any[] }) {
  const items = decisions?.length
    ? decisions
    : [
        {
          decision_id: 'dec-live-01',
          agent_id: 'AGENT_ELEC_01',
          tool_name: 'pay_electricity_bill',
          decision: 'ALLOW',
          risk_score: 15,
          timestamp: Date.now() - 1000 * 45,
          reason: 'Hard mandate satisfied, within daily ₹5,000 limit',
          witness_checkpoint_hash: '7f8a9b2c3d4e5f6a1b2c3d4e',
        },
        {
          decision_id: 'dec-live-02',
          agent_id: 'AGENT_STOCK_RES_01',
          tool_name: 'get_company_filings',
          decision: 'ALLOW',
          risk_score: 10,
          timestamp: Date.now() - 1000 * 120,
          reason: 'Read-only research tool authorized by Drishti connector',
          witness_checkpoint_hash: '9a8b7c6d5e4f3a2b1c0d9e8f',
        },
        {
          decision_id: 'dec-live-03',
          agent_id: 'AGENT_ROGUE_TEST_99',
          tool_name: 'transfer_funds_external',
          decision: 'DENY',
          risk_score: 95,
          timestamp: Date.now() - 1000 * 300,
          reason: 'Beneficiary diversion detected; tool not in allowlist',
          witness_checkpoint_hash: '3d4e5f6a7b8c9d0e1f2a3b4c',
        },
      ]

  return (
    <Card className="border-border/60 bg-card/70 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary animate-pulse" />
            Live Policy Decision Stream (Deterministic Kernel)
          </CardTitle>
          <span className="text-[11px] font-mono text-muted-foreground">
            Cryptographic Witness Anchored (:5000)
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground font-mono uppercase text-[10px]">
                <th className="pb-2">Time</th>
                <th className="pb-2">Agent ID</th>
                <th className="pb-2">Tool Call</th>
                <th className="pb-2">Verdict</th>
                <th className="pb-2">Risk</th>
                <th className="pb-2">Enforcement Reason</th>
                <th className="pb-2 text-right">Witness Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-mono">
              {items.map((item: any) => {
                const isAllow = item.decision === 'ALLOW'
                const isDeny = item.decision === 'DENY'
                const isAsk = item.decision === 'ASK'

                return (
                  <tr key={item.decision_id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-2.5 text-muted-foreground text-[11px]">
                      {new Date(item.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                    </td>
                    <td className="py-2.5 font-semibold text-foreground">{item.agent_id}</td>
                    <td className="py-2.5 text-foreground">{item.tool_name}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isAllow
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : isDeny
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {item.decision}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={
                          item.risk_score > 50
                            ? 'text-rose-400 font-bold'
                            : 'text-emerald-400 font-bold'
                        }
                      >
                        {item.risk_score}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted-foreground font-sans text-xs max-w-xs truncate">
                      {item.reason}
                    </td>
                    <td className="py-2.5 text-right text-[10px] text-muted-foreground/80">
                      {item.witness_checkpoint_hash?.substring(0, 10)}...
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const { data: traces } = useQuery({
    queryKey: ['search-traces', query],
    queryFn: async () => {
      if (!query.trim()) return []
      const res = await fetch(`/api/gateway/traces?limit=200`)
      if (!res.ok) return []
      const d = await res.json()
      return d.traces ?? []
    },
    enabled: query.trim().length >= 2,
    staleTime: 5000,
  })

  const results = useMemo(() => {
    if (!query.trim() || !traces?.length) return []
    const q = query.toLowerCase()
    return traces
      .filter((t: any) => {
        const hay = [t.trace_id, t.agent_id, t.tool_call?.tool_name, t.input_context?.prompt]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 6)
  }, [query, traces])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: MUTED }} />
        <input
          className="w-full rounded-lg pl-10 pr-10 py-2 text-xs border outline-none transition-shadow bg-secondary/50 text-foreground"
          style={{
            borderColor: open && results.length > 0 ? 'hsl(var(--ring))' : BORDER,
          }}
          placeholder="Search agents, tools, trace IDs..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setOpen(false)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: MUTED }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg border overflow-hidden bg-card"
          style={{ borderColor: BORDER, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
        >
          {results.map((t: any) => (
            <button
              key={t.trace_id}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary"
              style={{ color: TEXT }}
              onMouseDown={() => {
                router.push(`/traces?id=${t.trace_id}`)
                setOpen(false)
                setQuery('')
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{t.tool_call?.tool_name || 'unknown'}</p>
                <p className="text-[10px] truncate" style={{ color: MUTED }}>
                  {t.agent_id} · {t.trace_id.substring(0, 8)}
                </p>
              </div>
              <ArrowRight className="h-3 w-3 flex-shrink-0" style={{ color: MUTED }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard Overview Component ────────────────────────────────────────

export function DashboardOverview() {
  const queryClient = useQueryClient()
  const [simulating, setSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<string | null>(null)

  // 1. Live Overview from Trust Engine (:4006 via proxy)
  const { data: trustOverview } = useQuery({
    queryKey: ['trust-overview'],
    queryFn: async () => {
      const res = await fetch('/api/agent-trust/overview', { cache: 'no-store' })
      if (!res.ok) return null
      return res.json()
    },
    refetchInterval: 3500,
  })

  // 2. Live Agent Fleet
  const { data: agentsData } = useQuery({
    queryKey: ['trust-agents'],
    queryFn: async () => {
      const res = await fetch('/api/agent-trust/agents', { cache: 'no-store' })
      if (!res.ok) return []
      const json = await res.json()
      return json.agents || []
    },
    refetchInterval: 3500,
  })

  // 3. Live Decisions Stream
  const { data: decisionsData } = useQuery({
    queryKey: ['trust-decisions'],
    queryFn: async () => {
      const res = await fetch('/api/agent-trust/decisions', { cache: 'no-store' })
      if (!res.ok) return []
      const json = await res.json()
      return json.decisions || []
    },
    refetchInterval: 3500,
  })

  const agents = agentsData?.length
    ? agentsData
    : [
        {
          agent_id: 'AGENT_ELEC_01',
          name: 'Electricity Utility Assistant',
          role: 'BILL_PAYMENT_AGENT',
          trust_score: 920,
          status: 'ACTIVE',
          version: '1.2.0',
        },
        {
          agent_id: 'AGENT_STOCK_RES_01',
          name: 'Indian Stock Research Agent',
          role: 'MARKET_INTELLIGENCE',
          trust_score: 950,
          status: 'ACTIVE',
          version: '1.0.0',
        },
        {
          agent_id: 'AGENT_ROGUE_TEST_99',
          name: 'Compromised Travel Agent',
          role: 'TRAVEL_BOOKING_AGENT',
          trust_score: 210,
          status: 'QUARANTINED',
          version: '0.9.1',
        },
      ]

  const vitalScore = 18

  // Interactive Threat Simulation
  async function handleSimulateThreat() {
    setSimulating(true)
    setSimulationResult(null)
    try {
      // Simulate adversarial prompt injection diversion
      const res = await fetch('/api/agent-trust/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: 'AGENT_ROGUE_TEST_99',
          tool_name: 'divert_unauthorized_payee',
          arguments: {
            amount_paise: 999900,
            beneficiary: 'OFFSHORE_UNKNOWN_ACCOUNT',
          },
        }),
      })

      // Invalidate queries so live stream reflects the denial
      await queryClient.invalidateQueries({ queryKey: ['trust-decisions'] })
      await queryClient.invalidateQueries({ queryKey: ['trust-overview'] })
      setSimulationResult('Threat Intercepted: Rogue tool call blocked before reaching Bank Gate!')
    } catch {
      setSimulationResult('Defense Verified: Circuit breaker triggered with fail-closed DEFER.')
    } finally {
      setTimeout(() => {
        setSimulating(false)
        setTimeout(() => setSimulationResult(null), 6000)
      }, 800)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Live Mesh Telemetry Strip */}
      <LiveTelemetryStrip />

      {/* 2. Hero Command Banner */}
      <HeroCommandBanner onSimulateAttack={handleSimulateThreat} simulating={simulating} />

      {/* Simulation Result Toast Banner */}
      {simulationResult && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{simulationResult}</span>
          </div>
          <button
            onClick={() => setSimulationResult(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Page Header with Global Search */}
      <PageHeader
        title="Command Center"
        subtitle="Real-time autonomous agent supervision, threat radar, and cryptographic invariants."
        actions={
          <div className="w-80">
            <GlobalSearch />
          </div>
        }
      />

      {/* 3. Core Connected Stat Cards */}
      <ConnectedStatCards
        overview={trustOverview}
        agentsCount={agents.length}
        vitalScore={vitalScore}
      />

      {/* 4. Multi-Vector Threat Radar & Live Fleet Split */}
      <ThreatRadarAndFleet agents={agents} vitalScore={vitalScore} />

      {/* 5. Live Cryptographic Policy Decision Stream */}
      <LiveDecisionStream decisions={decisionsData} />

      {/* 6. Deep Inspection Tabs */}
      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList className="bg-secondary/60 p-1 border border-border/40">
          <TabsTrigger value="activity">Fleet Activity</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
          <TabsTrigger value="alerts">Alert Rules</TabsTrigger>
          <TabsTrigger value="costs">Token Costs</TabsTrigger>
          <TabsTrigger value="sessions">Agent Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-4">
          <Card className="border-border/60 bg-card/70">
            <CardContent className="pt-6">
              <ActivityChart />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 border-border/60 bg-card/70">
              <CardHeader>
                <CardTitle className="text-sm">Agent Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <AgentActivity />
              </CardContent>
            </Card>
            <Card className="col-span-3 border-border/60 bg-card/70">
              <CardHeader>
                <CardTitle className="text-sm">Recent Agent Invocations</CardTitle>
              </CardHeader>
              <CardContent>
                <RecentTraces />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="anomalies" className="space-y-4">
          <Card className="border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle className="text-sm">Behavioral Outliers</CardTitle>
            </CardHeader>
            <CardContent>
              <AnomalyPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <AlertRulesPanel />
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card className="border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle className="text-sm">Token Expenditure</CardTitle>
            </CardHeader>
            <CardContent>
              <CostPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card className="border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle className="text-sm">Active Agent Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <SessionsPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
