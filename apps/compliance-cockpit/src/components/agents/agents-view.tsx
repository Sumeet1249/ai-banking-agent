'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  UserRound,
  Plus,
  Shield,
  ShieldOff,
  KeyRound,
  Copy,
  Check,
  Trash2,
  Search,
  LayoutGrid,
  List,
  Filter,
  Sparkles,
  Zap,
  Droplets,
  Wifi,
  Cloud,
  Building2,
  ShieldCheck,
  Bot,
  ArrowRight,
  Lock,
  Clock,
  ChevronDown,
  LucideIcon,
  Activity,
  AlertTriangle,
} from 'lucide-react'
import { USE_MOCK, mockAgents, mockTraces } from '@/lib/mock-traces'
import { ToolIcon } from '@/lib/tool-icons'
import { fmtWhen } from '@/lib/time'
import { PageHeader } from '@/components/ui/page-header'
import { friendlyAgent } from '@/lib/friendly-names'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { RegisterAgentModal } from './register-agent-modal'
import { AgentInspectorDrawer } from './agent-inspector-drawer'
import { useTraceStream } from '@/hooks/useTraceStream'
import {
  agentMandateStore,
  formatInr,
  formatPaise,
  computeMandateRiskPosture,
} from '@/lib/agent-mandates'
import {
  PURPOSE_CATALOG,
  PURPOSE_LIST,
  AgentPurposeId,
  PurposeCatalogEntry,
} from '@/lib/biller-catalog'
import { cn } from '@/lib/utils'

export type Status = 'active' | 'suspended' | 'deprecated' | 'unregistered'

export interface Agent {
  id: string
  org_id?: string
  name?: string
  description?: string
  owner_email?: string
  declared_tools?: string[]
  max_cost_daily_usd?: number
  environments?: string[]
  status: Status
  has_secret?: boolean
  has_public_key?: boolean
  created_at?: string
  updated_at?: string
  last_seen_at?: string
  last_seen?: string
}

const STATUS_STYLE: Record<Status, { bg: string; color: string; border: string; label: string }> = {
  active: {
    bg: 'hsl(var(--status-ok) / 0.12)',
    color: 'hsl(var(--status-ok))',
    border: 'hsl(var(--status-ok) / 0.3)',
    label: 'Active',
  },
  suspended: {
    bg: 'hsl(var(--status-attn) / 0.12)',
    color: 'hsl(var(--status-attn))',
    border: 'hsl(var(--status-attn) / 0.3)',
    label: 'Suspended',
  },
  deprecated: {
    bg: 'hsl(var(--status-drift) / 0.12)',
    color: 'hsl(var(--status-drift))',
    border: 'hsl(var(--status-drift) / 0.3)',
    label: 'Deprecated',
  },
  unregistered: {
    bg: 'hsl(var(--secondary))',
    color: 'hsl(var(--muted-foreground))',
    border: 'hsl(var(--border))',
    label: 'Unregistered',
  },
}

const PURPOSE_ICONS: Record<PurposeCatalogEntry['iconKey'], LucideIcon> = {
  Zap,
  Droplets,
  Wifi,
  Cloud,
  Building2,
  ShieldCheck,
  Bot,
}

function StatusBadge({ s }: { s: Status }) {
  const sty = STATUS_STYLE[s] || STATUS_STYLE.unregistered
  return (
    <span
      className="inline-block text-[11px] font-medium px-2 py-0.5 rounded border"
      style={{ background: sty.bg, color: sty.color, borderColor: sty.border }}
    >
      {sty.label}
    </span>
  )
}

function fmtTs(s?: string): string {
  return s ? fmtWhen(s) : '—'
}

export function AgentsView() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPurpose, setSelectedPurpose] = useState<AgentPurposeId | 'all'>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [showRegister, setShowRegister] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  const [selected, setSelected] = useState<Agent | null>(null)
  const [, setStoreTick] = useState(0)

  // Listen to in-memory mandate updates to sync UI immediately
  useEffect(() => {
    return agentMandateStore.subscribe(() => {
      setStoreTick((t) => t + 1)
    })
  }, [])

  const [confirmState, setConfirmState] = useState<{
    open: boolean
    title: string
    description: string
    destructive?: boolean
    confirmLabel?: string
    onConfirm: () => void
  } | null>(null)

    // Live SSE stream connection for real-time fleet & trace updates
    useTraceStream()

  // Always query `/api/gateway/agents` (handled by gateway proxy or local serverAgentStore fallback)
  const { data: gatewayAgents, isLoading } = useQuery({
      queryKey: ['agents', filter],
      queryFn: async () => {
        const url =
          filter === 'all'
            ? '/api/gateway/agents?include_deprecated=1'
            : `/api/gateway/agents?status=${filter}&include_deprecated=1`
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to load agents')
        const j = await res.json()
        return (j.items ?? []) as Agent[]
      },
      refetchInterval: 8000,
    })

  const rawAgents: Agent[] = useMemo(() => {
        if (gatewayAgents && gatewayAgents.length > 0) return gatewayAgents
        return mockAgents().filter((a) => (filter === 'all' ? true : a.status === filter)) as unknown as Agent[]
      }, [gatewayAgents, filter])

  // Activity from gateway traces and sessions
  const { data: sdata } = useQuery({
        queryKey: ['sessions-for-agents'],
        enabled: !USE_MOCK,
        refetchInterval: 15000,
        queryFn: async () => (await fetch('/api/gateway/traces/sessions?limit=200')).json(),
      })

  const { data: tdata } = useQuery({
        queryKey: ['traces-for-agents'],
        enabled: !USE_MOCK,
        refetchInterval: 15000,
        queryFn: async () => (await fetch('/api/gateway/traces?limit=500')).json(),
      })

  const effectiveTraces = useMemo(() => {
        if (USE_MOCK) return mockTraces()
        return tdata?.traces && tdata.traces.length > 0 ? tdata.traces : mockTraces()
      }, [tdata])

  // Populate activity from BOTH traces (tool_call.tool_name) AND sessions (tool_names)
  const activity = useMemo(() => {
        const byKey = new Map<
          string,
          { tools: Set<string>; calls: number; held: number; blocked: number; runs: number; last?: string }
        >()
        const get = (k: string) => {
          const lower = String(k).toLowerCase()
          if (!byKey.has(lower)) {
            byKey.set(lower, { tools: new Set(), calls: 0, held: 0, blocked: 0, runs: 0 })
          }
          return byKey.get(lower)!
        }

        // 1. Process session telemetry
        for (const s of (sdata?.sessions ?? []) as any[]) {
          for (const k of [s.agent_name, s.agent_id].filter(Boolean)) {
            const a = get(k)
            a.runs++
            for (const t of String(s.tool_names ?? '').split(',').filter(Boolean)) {
              a.tools.add(t)
            }
          }
        }

        // 2. Process trace telemetry (including mockTraces fallback)
        for (const t of (effectiveTraces ?? []) as any[]) {
          const keys = [t.agent_name, t.agent_id, friendlyAgent(t.agent_id, t.agent_name)].filter(Boolean)
          const toolName = t.tool_call?.tool_name || t.tool || t.tool_name
          for (const k of keys) {
            const a = get(k)
            a.calls++
            if (toolName) a.tools.add(toolName)
            const d = String(t.decision ?? t.status ?? '').toLowerCase()
            if (d === 'block' || d === 'blocked') a.blocked++
            else if (d === 'pending' || d === 'held') a.held++
            if (!a.last || String(t.timestamp ?? t.created_at) > a.last) {
              a.last = String(t.timestamp ?? t.created_at)
            }
          }
        }
        return byKey
      }, [sdata, effectiveTraces])

  const actOf = (a: any) => {
      const candidates = [a.id, a.name, friendlyAgent(a.id, a.name)].filter(Boolean)
      for (const c of candidates) {
        const hit = activity.get(String(c).toLowerCase())
        if (hit) return hit
      }
      return undefined
    }

  // Filtered agents list based on search, status tab, and purpose category
  const filteredAgents = useMemo(() => {
      return rawAgents.filter((a) => {
        // 1. Status Filter
        if (filter !== 'all' && a.status !== filter) return false

        // 2. Purpose Filter
        const mandate = agentMandateStore.getMandate(a.id || a.name)
        if (selectedPurpose !== 'all' && mandate.purpose !== selectedPurpose) return false

        // 3. Search query filter
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase().trim()
        const nameMatch = (a.name || '').toLowerCase().includes(q)
        const idMatch = a.id.toLowerCase().includes(q)
        const emailMatch = (a.owner_email || '').toLowerCase().includes(q)
        const purposeMatch = (PURPOSE_CATALOG[mandate.purpose]?.label || '').toLowerCase().includes(q)
        const payeeMatch = mandate.approvedPayees.some((p) => p.toLowerCase().includes(q))
        const toolMatch = (a.declared_tools || []).some((t) => t.toLowerCase().includes(q))

        return nameMatch || idMatch || emailMatch || purposeMatch || payeeMatch || toolMatch
      })
    }, [rawAgents, filter, selectedPurpose, searchQuery])

  // Aggregate Fleet Telemetry Metrics for Top 4 Cards
  const fleetMetrics = useMemo(() => {
      const all = rawAgents
      const active = all.filter((a) => a.status === 'active')
      const suspended = all.filter((a) => a.status === 'suspended')

      const totalDailyLimit = active.reduce((sum, a) => {
        const m = agentMandateStore.getMandate(a.id || a.name)
        return sum + m.dailyLimitInr
      }, 0)

      const totalMonthlyBudget = active.reduce((sum, a) => {
        const m = agentMandateStore.getMandate(a.id || a.name)
        return sum + m.maxMonthlyLimitInr
      }, 0)

      let totalHeld = 0
      let totalBlocked = 0
      activity.forEach((act) => {
        totalHeld += act.held
        totalBlocked += act.blocked
      })

      return {
        totalCount: all.length,
        activeCount: active.length,
        suspendedCount: suspended.length,
        activeRatio: all.length > 0 ? (active.length / all.length) * 100 : 0,
        totalDailyLimit,
        totalMonthlyBudget,
        totalInterceptions: totalHeld + totalBlocked,
        totalHeld,
        totalBlocked,
      }
    }, [rawAgents, activity])

  // Lifecycle action handlers
  async function setStatus(agent: Agent, status: 'active' | 'suspended') {
    const res = await fetch(`/api/gateway/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if(res.ok) {
      qc.invalidateQueries({ queryKey: ['agents'] })
  if (selected?.id === agent.id) {
    const data = await res.json()
    setSelected(data.agent)
  }
  toast.success(`Agent ${status === 'active' ? 'reactivated' : 'suspended'}`)
}
  }

function rotateSecret(agent: Agent) {
  setConfirmState({
    open: true,
    title: 'Rotate Agent Secret',
    description: `Rotate secret for ${agent.name ?? agent.id}? The current secret will stop working immediately.`,
    confirmLabel: 'Rotate Secret',
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/gateway/agents/${agent.id}/rotate-secret`, { method: 'POST' })
        const data = await res.json()
        if (res.ok && data.secret) {
          setNewSecret(data.secret)
          toast.success('New agent secret generated')
        }
      } finally {
        setConfirmState(null)
      }
    },
  })
}

function deprecate(agent: Agent) {
  setConfirmState({
    open: true,
    title: 'Deprecate Agent',
    description: `Deprecate ${agent.name ?? agent.id}? All calls will be blocked. (Soft delete — record stays for audit.)`,
    destructive: true,
    confirmLabel: 'Deprecate',
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/gateway/agents/${agent.id}`, { method: 'DELETE' })
        if (res.ok) {
          qc.invalidateQueries({ queryKey: ['agents'] })
          if (selected?.id === agent.id) setSelected(null)
          toast.success('Agent deprecated')
        }
      } finally {
        setConfirmState(null)
      }
    },
  })
}

return (
  <div className="space-y-6 text-foreground">
    {/* Page Header */}
    <PageHeader
      title="Agent Fleet & Mandate Governance"
      subtitle="Cryptographically verified autonomous agents, scoped integer-paise financial mandates, and real-time policy telemetry."
      actions={
        <button
          onClick={() => setShowRegister(true)}
          className="text-[13px] font-semibold px-4 h-9 rounded-full inline-flex items-center gap-1.5 bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" strokeWidth={1.6} />
          <span>Register Agent</span>
        </button>
      }
    />

    {/* ── TOP 4-CARD FLEET TELEMETRY STRIP ── */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Active Agents */}
      <div
        className="tilt-3d stagger-in rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs"
        style={{ '--stagger-index': 0 } as React.CSSProperties}
      >
        <div className="z-pop space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Active Fleet</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">
              {fleetMetrics.activeCount}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              / {fleetMetrics.totalCount} deployed
            </span>
          </div>
          {/* Ratio Mini-Bar */}
          <div className="space-y-1 pt-1">
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden border border-border flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${fleetMetrics.activeRatio}%` }}
              />
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${100 - fleetMetrics.activeRatio}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>{fleetMetrics.activeCount} Active</span>
              <span>{fleetMetrics.suspendedCount} Suspended</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Daily Exposure Cap */}
      <div
        className="tilt-3d stagger-in rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs"
        style={{ '--stagger-index': 1 } as React.CSSProperties}
      >
        <div className="z-pop space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Daily Exposure Cap</span>
            <Lock className="h-3.5 w-3.5 text-indigo-400" strokeWidth={1.6} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">
              {formatInr(fleetMetrics.totalDailyLimit)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Sum of active agents&apos; daily ceiling limits across enterprise rails.
          </p>
        </div>
      </div>

      {/* Card 3: Monthly Mandate Budget */}
      <div
        className="tilt-3d stagger-in rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs"
        style={{ '--stagger-index': 2 } as React.CSSProperties}
      >
        <div className="z-pop space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Monthly Budget</span>
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.6} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-indigo-500 tabular-nums">
              {formatInr(fleetMetrics.totalMonthlyBudget)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Total monthly delegated authority under cryptographic mandate keys.
          </p>
        </div>
      </div>

      {/* Card 4: Policy Interceptions (24h) */}
      <div
        className="tilt-3d stagger-in rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs"
        style={{ '--stagger-index': 3 } as React.CSSProperties}
      >
        <div className="z-pop space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Interceptions (24h)</span>
            <ShieldCheck className="h-3.5 w-3.5 text-rose-500" strokeWidth={1.6} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">
              {fleetMetrics.totalInterceptions}
            </span>
            <span className="text-xs text-muted-foreground">events</span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-[11px] font-mono">
            <span className="text-amber-500 font-semibold">{fleetMetrics.totalHeld} Held / Step-Up</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-rose-500 font-semibold">{fleetMetrics.totalBlocked} Blocked</span>
          </div>
        </div>
      </div>
    </div>

    {/* ── UPGRADED FILTER & CONTROL BAR ── */}
    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-2 rounded-xl border border-border bg-card shadow-xs">
      {/* Left: Status Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
        {(['all', 'active', 'unregistered', 'suspended', 'deprecated'] as const).map((s) => {
          const count =
            s === 'all'
              ? rawAgents.length
              : rawAgents.filter((a) => a.status === s).length
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors',
                filter === s
                  ? 'bg-foreground text-background shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              )}
            >
              <span>{s === 'all' ? 'All' : STATUS_STYLE[s].label}</span>
              <span
                className={cn(
                  'text-[10px] font-mono px-1.5 py-0.2 rounded-full',
                  filter === s
                    ? 'bg-background/20 text-background'
                    : 'bg-secondary text-muted-foreground'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Right: Search + Purpose Dropdown + View Toggle */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Inline Search */}
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by agent, payee, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Purpose Filter Dropdown */}
        <select
          value={selectedPurpose}
          onChange={(e) => setSelectedPurpose(e.target.value as any)}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
        >
          <option value="all">All Purposes ({PURPOSE_LIST.length})</option>
          {PURPOSE_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {/* List vs 3D Cards Toggle */}
        <div className="flex rounded-lg border border-border p-0.5 bg-secondary/30 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === 'list'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="List View"
          >
            <List className="h-4 w-4" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              viewMode === 'grid'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="3D Cards Grid View"
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </div>

    {/* Loading Skeleton */}
    {isLoading && (
      <div className="h-48 rounded-2xl animate-pulse bg-secondary/50 border border-border" />
    )}

    {/* Empty State */}
    {!isLoading && filteredAgents.length === 0 && (
      <div className="rounded-2xl border border-border py-16 text-center bg-card">
        <UserRound className="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
        <p className="mt-3 text-sm font-semibold text-foreground">No agents match criteria</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {searchQuery || selectedPurpose !== 'all'
            ? 'Try clearing the search query or purpose filter.'
            : 'Register a new autonomous agent to start monitoring.'}
        </p>
        {(searchQuery || selectedPurpose !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('')
              setSelectedPurpose('all')
            }}
            className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>
    )}

    {/* ── LIST VIEW ── */}
    {!isLoading && filteredAgents.length > 0 && viewMode === 'list' && (
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
        <ul className="divide-y divide-border">
          {filteredAgents.map((a: Agent) => {
            const act = actOf(a)
            const tools = act ? Array.from(act.tools).slice(0, 5) : []
            const label = friendlyAgent(a.id, a.name)
            const mandate = agentMandateStore.getMandate(a.id || a.name)
            const purpose = PURPOSE_CATALOG[mandate.purpose] || PURPOSE_CATALOG.general_ops
            const IconComp = PURPOSE_ICONS[purpose.iconKey] || Bot
            const riskPosture = computeMandateRiskPosture(mandate)

            return (
              <li key={a.id}>
                <button
                  onClick={() => setSelected(a)}
                  className="w-full text-left px-5 py-4 grid gap-x-5 gap-y-2 items-center hover:bg-secondary/40 transition-colors group"
                  style={{
                    gridTemplateColumns:
                      'minmax(230px, 1.4fr) minmax(180px, 1.1fr) minmax(180px, 1fr) repeat(3, minmax(60px, auto)) minmax(90px, auto) 28px',
                  }}
                >
                  {/* 1. Identity & Purpose */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-500 shadow-xs">
                      <IconComp className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-bold text-foreground truncate group-hover:text-indigo-400 transition-colors">
                          {label}
                        </p>
                        <StatusBadge s={a.status} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground truncate">
                        <span className="font-mono text-[11px] truncate max-w-[140px]">
                          {a.owner_email || (a.name && a.name !== a.id ? a.id.slice(0, 18) : 'No owner')}
                        </span>
                        <span>•</span>
                        <span className="text-[10.5px] truncate text-indigo-400 font-medium">
                          {purpose.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Mandate Scope & Payees (Fixes 'No calls yet' mismatch) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {tools.length > 0 ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {tools.map((tn) => (
                          <ToolIcon key={tn} name={tn} size={18} />
                        ))}
                        {act && act.tools.size > 5 && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            +{act.tools.size - 5}
                          </span>
                        )}
                      </div>
                    ) : (act?.calls ?? 0) > 0 ? (
                      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                        {mandate.approvedPayees.slice(0, 2).map((p) => (
                          <span
                            key={p}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-foreground border border-border truncate max-w-[85px]"
                          >
                            {p}
                          </span>
                        ))}
                        {a.declared_tools?.slice(0, 1).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 truncate max-w-[80px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0 overflow-hidden text-muted-foreground">
                        {mandate.approvedPayees.length > 0 ? (
                          <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[150px]">
                            Whitelisted: {mandate.approvedPayees[0]}
                          </span>
                        ) : (
                          <span className="text-[12px] italic">No calls yet</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. Spend Envelope & Progress Micro-bar */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-foreground tabular-nums">
                        {formatInr(mandate.dailyLimitInr)}
                        <span className="text-[10px] text-muted-foreground font-normal">/day</span>
                      </span>
                      <span className="text-[10.5px] font-mono text-indigo-400 tabular-nums">
                        {formatInr(mandate.maxMonthlyLimitInr)}/mo
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-secondary overflow-hidden border border-border">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(15, (mandate.stepUpThresholdInr / mandate.dailyLimitInr) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* 4. Telemetry: Calls / Held / Blocked */}
                  <Stat n={act?.calls ?? 0} label="calls" />
                  <Stat
                    n={act?.held ?? 0}
                    label="held"
                    tone={act?.held ? 'hsl(var(--status-attn))' : undefined}
                  />
                  <Stat
                    n={act?.blocked ?? 0}
                    label="blocked"
                    tone={act?.blocked ? 'hsl(var(--status-drift))' : undefined}
                  />

                  {/* 5. Last Seen */}
                  <span className="text-[12px] text-right text-muted-foreground tabular-nums">
                    {fmtTs(act?.last ?? a.last_seen ?? a.last_seen_at)}
                  </span>

                  {/* 6. Action Arrow */}
                  <div className="text-right text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all">
                    <ArrowRight className="h-4 w-4 ml-auto" strokeWidth={1.6} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )}

    {/* ── 3D CARDS GRID VIEW ── */}
    {!isLoading && filteredAgents.length > 0 && viewMode === 'grid' && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAgents.map((a: Agent, index) => {
          const act = actOf(a)
          const label = friendlyAgent(a.id, a.name)
          const mandate = agentMandateStore.getMandate(a.id || a.name)
          const purpose = PURPOSE_CATALOG[mandate.purpose] || PURPOSE_CATALOG.general_ops
          const IconComp = PURPOSE_ICONS[purpose.iconKey] || Bot
          const riskPosture = computeMandateRiskPosture(mandate)

          return (
            <div
              key={a.id}
              onClick={() => setSelected(a)}
              className="tilt-3d stagger-in rounded-2xl border border-border bg-card p-5 space-y-4 cursor-pointer hover:border-indigo-500/50 shadow-sm transition-all group"
              style={{ '--stagger-index': index % 6 } as React.CSSProperties}
            >
              <div className="z-pop space-y-3.5">
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-500 shrink-0 shadow-xs">
                      <IconComp className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground leading-tight truncate group-hover:text-indigo-400 transition-colors">
                        {label}
                      </h4>
                      <span className="text-[11px] text-muted-foreground font-mono block truncate">
                        {a.id}
                      </span>
                    </div>
                  </div>

                  <StatusBadge s={a.status} />
                </div>

                {/* Financial Envelope */}
                <div className="p-3 rounded-xl border border-border/80 bg-secondary/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Daily Allowance:</span>
                    <span className="font-mono font-bold text-foreground tabular-nums">
                      {formatInr(mandate.dailyLimitInr)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Step-Up Threshold:</span>
                    <span className="font-mono font-bold text-amber-500 tabular-nums">
                      {formatInr(mandate.stepUpThresholdInr)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">Monthly Cap:</span>
                    <span className="font-mono font-bold text-indigo-500 tabular-nums">
                      {formatInr(mandate.maxMonthlyLimitInr)}
                    </span>
                  </div>
                </div>

                {/* Beneficiary Payees */}
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                    Allowlisted Beneficiaries:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {mandate.approvedPayees.length > 0 ? (
                      mandate.approvedPayees.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-foreground border border-border truncate max-w-[110px]"
                        >
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        None allowlisted
                      </span>
                    )}
                    {mandate.approvedPayees.length > 3 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-muted-foreground border border-border">
                        +{mandate.approvedPayees.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                {/* Telemetry Strip & Quick Arrow */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                  <div className="flex items-center gap-2 font-mono tabular-nums text-muted-foreground">
                    <span className="text-foreground font-semibold">{act?.calls ?? 0} calls</span>
                    <span>·</span>
                    <span className="text-rose-500 font-semibold">{act?.blocked ?? 0} blk</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
                    <span>Inspect</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )}

    {/* ── 3D REGISTER AGENT MODAL ── */}
    <RegisterAgentModal
      open={showRegister}
      onClose={() => setShowRegister(false)}
      onSuccess={() => {
        qc.invalidateQueries({ queryKey: ['agents'] })
      }}
    />

    {/* ── 3D SLIDE-OVER AGENT INSPECTOR DRAWER ── */}
    {selected && (
      <AgentInspectorDrawer
        agent={selected}
        act={actOf(selected)}
        onClose={() => setSelected(null)}
        onStatusChange={setStatus}
        onRotateSecret={rotateSecret}
        onDeprecate={deprecate}
      />
    )}

    {/* Rotated Secret Modal */}
    {newSecret && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-xl p-5 space-y-3 bg-card border border-border shadow-xl text-foreground">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-indigo-500" strokeWidth={1.6} />
            <h2 className="font-semibold text-sm">Agent secret rotated (shown once)</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy this now. AgentShield only stores the SHA-256 hash; this plaintext is unrecoverable
            after you close this dialog.
          </p>
          <div className="font-mono text-xs p-2 rounded border break-all bg-secondary border-border text-foreground">
            {newSecret}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(newSecret)
                setSecretCopied(true)
                setTimeout(() => setSecretCopied(false), 1500)
              }}
              className="text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
            >
              {secretCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              {secretCopied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => {
                setNewSecret(null)
                setSecretCopied(false)
              }}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              I saved it
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Lifecycle Confirmation Modal */}
    {confirmState && (
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        destructive={confirmState.destructive}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(null)}
      />
    )}
  </div>
)
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <span className="text-right leading-tight">
      <span
        className="block text-[15px] font-semibold tabular-nums font-mono"
        style={{ color: n ? tone ?? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
      >
        {n.toLocaleString()}
      </span>
      <span className="block text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </span>
  )
}
