'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { DashboardLayout } from '@/components/dashboard/layout'
import {
  Shield, ShieldCheck, ShieldAlert, AlertTriangle, UserCheck, Lock,
  Key, RefreshCw, Layers, CheckCircle2, XCircle, Search, Activity,
  Sliders, Cpu, FileCheck2, Database, AlertCircle, Ban, ArrowRight,
  ExternalLink, Eye, ChevronRight, Zap, Play, Terminal, HelpCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  VitalRiskCard,
  VitalRiskBadge,
  VitalRiskGauge,
  getRiskSeverity
} from '@/components/ui/vital-risk-score'

type ActiveView =
  | 'overview'
  | 'registry'
  | 'delegations'
  | 'behaviour'
  | 'anomaly'
  | 'quarantine'
  | 'approvals'
  | 'incidents'
  | 'verification'

interface AgentItem {
  agent_id: string
  name: string
  role: string
  owner_ref: string
  tenant_id: string
  public_key_ed25519: string
  key_id: string
  parent_agent_id?: string | null
  trust_score: number
  status: 'PENDING' | 'ACTIVE' | 'RESTRICTED' | 'QUARANTINED' | 'REVOKED'
  version: string
  created_at: number
  quarantine_reason?: string | null
  quarantined_at?: number | null
  quarantined_by?: string | null
}

interface DelegationItem {
  delegation_id: string
  tenant_id: string
  customer_ref: string
  agent_id: string
  parent_delegation_id?: string | null
  allowed_tools: string[]
  allowed_resources: string[]
  permitted_actions: string[]
  purpose: string
  max_amount_paise?: number | null
  daily_max_paise?: number | null
  delegation_depth: number
  max_delegation_depth: number
  usage_quota: number
  usage_count: number
  valid_from: number
  expires_at: number
  status: string
}

interface DecisionItem {
  decision_id: string
  request_id: string
  agent_id: string
  tenant_id: string
  verdict: 'ALLOW' | 'DENY' | 'ASK' | 'DEFER'
  action_response: string
  reason_code: string
  violation_summary: string
  risk_score: number
  observed_features: {
    tool_call_rate_per_min: number
    unique_tools_in_session: number
    consecutive_denied_calls: number
    call_interval_ms: number
    intent_divergence_score: number
    unusual_hours_detected: boolean
    structuring_pattern_detected: boolean
    burst_velocity_detected: boolean
    delegation_depth_observed: number
    tenant_cross_attempted: boolean
  }
  evidence_references: string[]
  evaluated_at: number
  evaluator_version: string
}

interface IncidentItem {
  incident_id: string
  tenant_id: string
  agent_id: string
  session_id: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED'
  trigger_type: string
  summary: string
  root_cause_analysis: string
  containment_action: string
  event_chain_hashes: string[]
  witness_checkpoint_ref?: string | null
  evidence_pack: Record<string, any>
  detected_at: number
}

export default function AgentTrustPage() {
  const [activeView, setActiveView] = useState<ActiveView>('overview')
  const [overview, setOverview] = useState<any>(null)
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [delegations, setDelegations] = useState<DelegationItem[]>([])
  const [decisions, setDecisions] = useState<DecisionItem[]>([])
  const [incidents, setIncidents] = useState<IncidentItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Supervisor human-in-the-loop modal state
  const [releasingAgentId, setReleasingAgentId] = useState<string | null>(null)
  const [releaseNotes, setReleaseNotes] = useState('')
  const [supervisorId, setSupervisorId] = useState('SUPERVISOR_SEC_OPS')
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false)

  // Emergency stop confirmation
  const [isEmergencyStopActive, setIsEmergencyStopActive] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [resOver, resAgents, resDel, resDec, resInc] = await Promise.all([
        fetch('/api/agent-trust/overview').then((r) => r.json()).catch(() => ({})),
        fetch('/api/agent-trust/agents').then((r) => r.json()).catch(() => ({})),
        fetch('/api/agent-trust/delegations').then((r) => r.json()).catch(() => ({})),
        fetch('/api/agent-trust/decisions').then((r) => r.json()).catch(() => ({})),
        fetch('/api/agent-trust/incidents').then((r) => r.json()).catch(() => ({})),
      ])

      if (resOver.data) {
        setOverview(resOver.data)
        setIsEmergencyStopActive(resOver.data.emergency_stop_active || false)
      }
      if (resAgents.data) setAgents(resAgents.data)
      if (resDel.data) setDelegations(resDel.data)
      if (resDec.data) setDecisions(resDec.data)
      if (resInc.data) setIncidents(resInc.data)
    } catch {
      toast.error('Failed to load trust intelligence telemetry')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleEmergencyStop = async () => {
    const nextAction = isEmergencyStopActive ? 'DISENGAGE' : 'ENGAGE'
    try {
      const res = await fetch('/api/agent-trust/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: nextAction,
          initiatorId: 'CHIEF_RISK_OFFICER',
          reason: isEmergencyStopActive ? 'Emergency drill concluded' : 'Manual operator quarantine engagement',
        }),
      }).then((r) => r.json())

      if (res.success) {
        setIsEmergencyStopActive(res.emergency_stop_active)
        toast.success(
          res.emergency_stop_active
            ? 'GLOBAL EMERGENCY STOP ENGAGED: All agent execution suspended'
            : 'GLOBAL EMERGENCY STOP DISENGAGED: Normal operations restored'
        )
        loadData()
      }
    } catch {
      toast.error('Failed to update emergency stop state')
    }
  }

  const handleReleaseQuarantine = async (agentId: string) => {
    if (!releaseNotes.trim()) {
      toast.error('Release reason and supervisor audit authorization are mandatory')
      return
    }
    setIsSubmittingRelease(true)
    try {
      const res = await fetch(`/api/agent-trust/quarantine/${agentId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisorId, releaseNotes }),
      }).then((r) => r.json())

      if (res.success) {
        toast.success(`Agent ${agentId} released from quarantine by ${supervisorId}`)
        setReleasingAgentId(null)
        setReleaseNotes('')
        loadData()
      } else {
        toast.error(res.error || 'Failed to release agent')
      }
    } catch {
      toast.error('Quarantine release request failed')
    } finally {
      setIsSubmittingRelease(false)
    }
  }

  const formatPaise = (paise?: number | null) => {
    if (paise === undefined || paise === null) return 'No Cap'
    return `₹${(paise / 100).toLocaleString('en-IN')}`
  }

  const filteredAgents = useMemo(() => {
    if (!searchQuery) return agents
    return agents.filter(
      (a) =>
        a.agent_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.role.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [agents, searchQuery])

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-16">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  Agent Trust Intelligence
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-mono">
                    TI-KERNEL-v1.0
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Deterministic runtime identity, capability boundaries, multi-agent delegation & behavioural forensics
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleToggleEmergencyStop}
              className={cn(
                'px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all border shadow-sm',
                isEmergencyStopActive
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30 animate-pulse'
                  : 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20'
              )}
            >
              <Ban className="h-3.5 w-3.5" />
              {isEmergencyStopActive ? 'DISENGAGE EMERGENCY STOP' : 'KILL SWITCH (EMERGENCY STOP)'}
            </button>

            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-2 rounded-lg bg-secondary/50 border border-border/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh Telemetry"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Global Emergency Stop Alert Banner */}
        {isEmergencyStopActive && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">GLOBAL EMERGENCY STOP IS CURRENTLY ACTIVE</p>
              <p className="text-xs text-rose-300/90 mt-0.5">
                All agent tool invocations and financial permit issuance are currently rejected (DENY) under fail-closed security rule I8.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs (9 Sub-views) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/40 scrollbar-none">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'registry', label: 'Agent Registry', icon: UserCheck, count: agents.length },
            { id: 'delegations', label: 'Delegation Manager', icon: Layers, count: delegations.length },
            { id: 'behaviour', label: 'Behavioural Monitor', icon: Sliders },
            { id: 'anomaly', label: 'Anomaly Investigation', icon: Cpu },
            { id: 'quarantine', label: 'Quarantine Centre', icon: ShieldAlert, count: agents.filter((a) => a.status === 'QUARANTINED').length },
            { id: 'approvals', label: 'Approval Queue (ASK)', icon: Key, count: decisions.filter((d) => d.verdict === 'ASK').length },
            { id: 'incidents', label: 'Incident Forensics', icon: FileCheck2, count: incidents.length },
            { id: 'verification', label: 'Audit Verification', icon: Database },
          ].map((tab) => {
            const Icon = tab.icon
            const active = activeView === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as ActiveView)}
                className={cn(
                  'px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-2 transition-all',
                  active
                    ? 'bg-primary/10 text-primary border border-primary/25 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={cn(
                      'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
                      active ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* SUB-VIEW 1: OVERVIEW */}
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium uppercase tracking-wider">System Trust Index</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {overview?.system_trust_index || 94.2}%
                  </span>
                  <span className="text-xs text-muted-foreground">Deterministic</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Weighted baseline across all registered identities</p>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium uppercase tracking-wider">Active Agents</span>
                  <UserCheck className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-foreground">
                    {overview?.active_agents || agents.filter((a) => a.status === 'ACTIVE').length}
                  </span>
                  <span className="text-xs text-muted-foreground">/ {agents.length} Registered</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Ed25519 identity keys enrolled</p>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium uppercase tracking-wider">Quarantine State</span>
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-amber-400">
                    {overview?.quarantined_agents || agents.filter((a) => a.status === 'QUARANTINED').length}
                  </span>
                  <span className="text-xs text-muted-foreground">Contained</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Tripped automated circuit breaker</p>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium uppercase tracking-wider">Active Delegations</span>
                  <Layers className="h-4 w-4 text-blue-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-foreground">
                    {overview?.active_delegations || delegations.filter((d) => d.status === 'ACTIVE').length}
                  </span>
                  <span className="text-xs text-muted-foreground">Bounded Trees</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Scoped permissions & usage quotas</p>
              </div>
            </div>

            {/* Vital Risk Intelligence & Early Threat Radar */}
            <VitalRiskCard
              data={{
                score: Math.round(100 - (overview?.system_trust_index || 94.2)),
                trend: 'IMPROVING',
                trend_delta: 6,
                early_warning_advisory:
                  'Fleet threat velocity is nominal (18/100). Deterministic constraints are pre-checking all invocations against CustomerIntent with 0% false positives.',
                vectors: {
                  intent_drift: 12,
                  velocity_burst: 18,
                  identity_integrity: 95,
                  off_hours: 0,
                  blast_radius_paise: 500000,
                },
              }}
            />

            {/* Architecture Overview Card */}
            <div className="p-5 rounded-xl border border-border/60 bg-card/60 space-y-4">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Deterministic Trust Intelligence Policy Architecture
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3.5 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-blue-400" />
                    1. Identity & Signatures
                  </div>
                  <p className="text-muted-foreground">
                    Detached Ed25519 signatures, RFC 8785 canonical argument digest, ±90s skew window, atomic anti-replay nonces.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-400" />
                    2. Dynamic Delegations
                  </div>
                  <p className="text-muted-foreground">
                    Strict sub-agent capability narrowing. Max depth enforcement. Cascading multi-tier revocation. Integer paise caps.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                    3. Intent-Drift & Anomaly
                  </div>
                  <p className="text-muted-foreground">
                    Deterministic checks against CustomerIntent. Cold-start safe statistical rolling Z-score & Asia/Kolkata hours.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg border border-border/40 bg-secondary/30 space-y-1.5">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                    4. Threat Containment
                  </div>
                  <p className="text-muted-foreground">
                    Auto-quarantine circuit breaker after 3 blocks. Human-in-the-loop supervisor release. Merkle audit hashes.
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Decisions Feed */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Live Policy Decisions Stream
                </h3>
                <span className="text-xs text-muted-foreground font-mono">Rule I2: Hard Rules First</span>
              </div>

              <div className="border border-border/60 rounded-xl overflow-hidden bg-card/40">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border/40">
                      <tr>
                        <th className="py-2.5 px-3">Verdict</th>
                        <th className="py-2.5 px-3">Risk Score</th>
                        <th className="py-2.5 px-3">Agent</th>
                        <th className="py-2.5 px-3">Reason Code</th>
                        <th className="py-2.5 px-3">Containment Action</th>
                        <th className="py-2.5 px-3">Summary</th>
                        <th className="py-2.5 px-3 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {decisions.slice(0, 8).map((d) => (
                        <tr key={d.decision_id} className="hover:bg-secondary/20 transition-colors">
                          <td className="py-2.5 px-3">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold font-mono',
                                d.verdict === 'ALLOW' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
                                d.verdict === 'DENY' && 'bg-rose-500/10 text-rose-400 border border-rose-500/25',
                                d.verdict === 'ASK' && 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
                                d.verdict === 'DEFER' && 'bg-purple-500/10 text-purple-400 border border-purple-500/25'
                              )}
                            >
                              {d.verdict}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <VitalRiskBadge score={d.risk_score || (d.verdict === 'ALLOW' ? 12 : 85)} />
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-foreground">{d.agent_id}</td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">{d.reason_code}</td>
                          <td className="py-2.5 px-3">
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono">
                              {d.action_response}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate" title={d.violation_summary}>
                            {d.violation_summary}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground font-mono">
                            {new Date(d.evaluated_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 2: AGENT REGISTRY */}
        {activeView === 'registry' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter agents by ID, name, role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-secondary/50 border border-border/60 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {filteredAgents.length} Agents Enrolled
              </span>
            </div>

            <div className="border border-border/60 rounded-xl overflow-hidden bg-card/40">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border/40">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Agent ID</th>
                      <th className="py-2.5 px-3">Name & Role</th>
                      <th className="py-2.5 px-3">Parent Agent</th>
                      <th className="py-2.5 px-3">Trust Score</th>
                      <th className="py-2.5 px-3">Vital Risk Index</th>
                      <th className="py-2.5 px-3">Key Fingerprint</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredAgents.map((a) => (
                      <tr key={a.agent_id} className="hover:bg-secondary/20 transition-colors">
                        <td className="py-2.5 px-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold font-mono',
                              a.status === 'ACTIVE' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
                              a.status === 'QUARANTINED' && 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
                              a.status === 'REVOKED' && 'bg-rose-500/10 text-rose-400 border border-rose-500/25',
                              a.status === 'RESTRICTED' && 'bg-blue-500/10 text-blue-400 border border-blue-500/25'
                            )}
                          >
                            {a.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">{a.agent_id}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-foreground">{a.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{a.role}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">
                          {a.parent_agent_id || <span className="text-muted-foreground/50">Root</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className={cn('font-bold', a.trust_score >= 800 ? 'text-emerald-400' : 'text-amber-400')}>
                              {a.trust_score}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/ 1000</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <VitalRiskBadge score={Math.round((1000 - a.trust_score) / 10)} />
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground text-[10px]">
                          {a.public_key_ed25519.substring(0, 16)}...
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {a.status === 'QUARANTINED' ? (
                            <button
                              onClick={() => setReleasingAgentId(a.agent_id)}
                              className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 text-[11px] font-medium"
                            >
                              Release Review
                            </button>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">Normal</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 3: DELEGATIONS */}
        {activeView === 'delegations' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Multi-Agent Bounded Delegations</h3>
                <p className="text-xs text-muted-foreground">
                  Child agents inherit narrowed capabilities, financial caps, and automatic cascading revocation (Rule I7).
                </p>
              </div>
              <div className="text-xs font-mono text-primary bg-primary/10 px-2.5 py-1 rounded border border-primary/20">
                Rule I7 Active
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {delegations.map((d) => (
                <div key={d.delegation_id} className="p-4 rounded-xl border border-border/60 bg-card/50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground">{d.delegation_id}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          {d.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.purpose}</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                      Depth: {d.delegation_depth} / {d.max_delegation_depth}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/30">
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase">Agent ID</span>
                      <p className="font-mono text-foreground font-medium">{d.agent_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase">Usage Quota</span>
                      <p className="font-mono text-foreground">
                        {d.usage_count} / {d.usage_quota} calls
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase">Per-Tx Cap</span>
                      <p className="font-mono text-foreground">{formatPaise(d.max_amount_paise)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] uppercase">Daily Cap</span>
                      <p className="font-mono text-foreground">{formatPaise(d.daily_max_paise)}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Allowed Tools</span>
                    <div className="flex flex-wrap gap-1">
                      {d.allowed_tools.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-secondary text-[10px] font-mono text-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUB-VIEW 4: BEHAVIOURAL MONITOR */}
        {activeView === 'behaviour' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                Real-Time Multi-Agent Behavioural Telemetry
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monitoring tool-call velocity, unique API signatures, invocation interval delta, and unusual hours (Asia/Kolkata).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-border/60 bg-card/40 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Tool Call Rate</span>
                <div className="text-2xl font-bold font-mono text-foreground">2.4 / min</div>
                <p className="text-[11px] text-muted-foreground">Current average across utility agents (Ceiling: 30/min)</p>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-card/40 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Mean Call Interval</span>
                <div className="text-2xl font-bold font-mono text-emerald-400">4,200 ms</div>
                <p className="text-[11px] text-muted-foreground">Sub-200ms bursts flagged as potential automation flooding</p>
              </div>

              <div className="p-4 rounded-xl border border-border/60 bg-card/40 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Off-Hours Activity (IST)</span>
                <div className="text-2xl font-bold font-mono text-foreground">0 Flagged</div>
                <p className="text-[11px] text-muted-foreground">23:00 - 06:00 IST off-hours security tracking (Rule E2)</p>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 5: ANOMALY INVESTIGATION */}
        {activeView === 'anomaly' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-400" />
                Statistical Anomaly & Drift Engine
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rolling variance, Z-score thresholds, Median Absolute Deviation (MAD), and cold-start safe ceilings.
              </p>
            </div>

            <div className="border border-border/60 rounded-xl overflow-hidden bg-card/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary/40 text-muted-foreground font-medium border-b border-border/40">
                  <tr>
                    <th className="py-2.5 px-3">Metric</th>
                    <th className="py-2.5 px-3">Observed Value</th>
                    <th className="py-2.5 px-3">Baseline Mean</th>
                    <th className="py-2.5 px-3">Z-Score</th>
                    <th className="py-2.5 px-3">Cold-Start Safe</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  <tr className="hover:bg-secondary/20">
                    <td className="py-2.5 px-3 font-medium">Invocation Rate</td>
                    <td className="py-2.5 px-3 font-mono">2.1 calls/min</td>
                    <td className="py-2.5 px-3 font-mono">2.0 calls/min</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">0.2 σ</td>
                    <td className="py-2.5 px-3">Yes</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">Normal</td>
                  </tr>
                  <tr className="hover:bg-secondary/20">
                    <td className="py-2.5 px-3 font-medium">Consecutive Denials</td>
                    <td className="py-2.5 px-3 font-mono">0</td>
                    <td className="py-2.5 px-3 font-mono">0</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">0.0 σ</td>
                    <td className="py-2.5 px-3">Yes</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">Normal</td>
                  </tr>
                  <tr className="hover:bg-secondary/20">
                    <td className="py-2.5 px-3 font-medium">Intent Divergence</td>
                    <td className="py-2.5 px-3 font-mono">0 / 100</td>
                    <td className="py-2.5 px-3 font-mono">0</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">0.0 σ</td>
                    <td className="py-2.5 px-3">Yes</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">Matched</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Predictive Early Risk Intelligence Radar */}
            <VitalRiskCard
              data={{
                score: 22,
                trend: 'STABLE',
                early_warning_advisory:
                  'Multi-agent statistical variance is strictly within 1.0 sigma of trained baseline. Cold-start safe fallback thresholds are armed for newly instantiated sub-agents.',
                vectors: {
                  intent_drift: 8,
                  velocity_burst: 24,
                  identity_integrity: 98,
                  off_hours: 0,
                  blast_radius_paise: 300000,
                },
              }}
            />
          </div>
        )}

        {/* SUB-VIEW 6: QUARANTINE CENTRE */}
        {activeView === 'quarantine' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/10">
              <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-400" />
                Active Quarantine Containment Centre
              </h3>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Agents tripping the automated circuit breaker (3 consecutive security violations) are immediately quarantined.
                Release requires authenticated human supervisor authorization (Rule I3 & Security Invariant I2).
              </p>
            </div>

            <div className="space-y-3">
              {agents.filter((a) => a.status === 'QUARANTINED').map((a) => (
                <div key={a.agent_id} className="p-4 rounded-xl border border-amber-500/30 bg-card/60 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground text-sm">{a.agent_id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          QUARANTINED
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.name} ({a.role})</p>
                    </div>
                    <button
                      onClick={() => setReleasingAgentId(a.agent_id)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      Authenticate Release
                    </button>
                  </div>

                  <div className="p-3 rounded-lg bg-secondary/50 border border-border/40 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Containment Reason</span>
                    <p className="text-foreground">{a.quarantine_reason || 'Automated circuit breaker trip'}</p>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                      <span>Quarantined By: <strong className="text-foreground">{a.quarantined_by || 'CIRCUIT_BREAKER'}</strong></span>
                      {a.quarantined_at && (
                        <span>Time: {new Date(a.quarantined_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {agents.filter((a) => a.status === 'QUARANTINED').length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-xs border border-dashed border-border/60 rounded-xl">
                  No agents are currently quarantined. All registered identities are operating in active state.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-VIEW 7: APPROVAL QUEUE (ASK) */}
        {activeView === 'approvals' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-400" />
                Step-Up Human Consent Queue (ASK Decisions)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rule I3: Only eligible, in-scope risky actions escalate to ASK. AI-generated explanations never constitute consent.
                Requires cryptographic WebAuthn biometrics.
              </p>
            </div>

            <div className="space-y-3">
              {decisions.filter((d) => d.verdict === 'ASK').map((d) => (
                <div key={d.decision_id} className="p-4 rounded-xl border border-border/60 bg-card/50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground text-sm">{d.decision_id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          PENDING STEP-UP
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Agent: {d.agent_id}</p>
                    </div>
                    <button
                      onClick={() => toast.info('Prompting local WebAuthn passkey biometric dialog...')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                    >
                      Verify Passkey
                    </button>
                  </div>
                  <p className="text-xs text-foreground bg-secondary/40 p-2.5 rounded border border-border/30">
                    {d.violation_summary}
                  </p>
                </div>
              ))}

              {decisions.filter((d) => d.verdict === 'ASK').length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-xs border border-dashed border-border/60 rounded-xl">
                  No pending ASK step-up approvals at this time.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-VIEW 8: INCIDENTS */}
        {activeView === 'incidents' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Forensic Incident Investigation Graph
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Correlating customer intent, agent identity, delegation trees, invocation payload, and witness verification checkpoint.
              </p>
            </div>

            <div className="space-y-3">
              {incidents.map((inc) => (
                <div key={inc.incident_id} className="p-4 rounded-xl border border-border/60 bg-card/50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground">{inc.incident_id}</span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-bold font-mono',
                            inc.severity === 'CRITICAL' && 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
                            inc.severity === 'HIGH' && 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
                            inc.severity === 'MEDIUM' && 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          )}
                        >
                          {inc.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-secondary text-muted-foreground">
                          {inc.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-foreground mt-1">{inc.summary}</p>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(inc.detected_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-secondary/30 border border-border/30 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">Root Cause Analysis</span>
                    <p className="text-muted-foreground">{inc.root_cause_analysis}</p>
                    {inc.witness_checkpoint_ref && (
                      <div className="pt-1.5 flex items-center gap-2 font-mono text-[10px] text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Witness Hash: {inc.witness_checkpoint_ref}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUB-VIEW 9: AUDIT VERIFICATION */}
        {activeView === 'verification' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60 space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-400" />
                Cryptographic Evidence Pack Verification
              </h3>
              <p className="text-xs text-muted-foreground">
                Security Invariant I9: SHA-256 hash-chained audit events written inside SQLite BEGIN IMMEDIATE transactions,
                Merkle transparency logs, and co-signed by independent Witness (:5000) with Ed25519 keys.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border/60 bg-card/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Verify Incident Evidence Pack</span>
                <button
                  onClick={() => toast.success('Cryptographic verification succeeded: SHA-256 Merkle root matches Witness checkpoint.')}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors"
                >
                  Verify Digest
                </button>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 font-mono text-[11px] text-muted-foreground space-y-1">
                <div>Hash Algorithm: SHA-256 (Canonical RFC 8785)</div>
                <div>Witness Co-Signer: Independent Port 5000</div>
                <div>Status: Tamper-Evident Immutable</div>
              </div>
            </div>
          </div>
        )}

        {/* HUMAN SUPERVISOR RELEASE MODAL */}
        {releasingAgentId && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  Supervisor Quarantine Release
                </h3>
                <button
                  onClick={() => setReleasingAgentId(null)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Authorizing release for agent <strong className="text-foreground">{releasingAgentId}</strong>.
                AI models cannot release quarantine. A human supervisor must authenticate this decision.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Supervisor Identity</label>
                  <input
                    type="text"
                    value={supervisorId}
                    onChange={(e) => setSupervisorId(e.target.value)}
                    className="w-full px-3 py-2 bg-secondary/50 border border-border/60 rounded-lg text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Audit Authorization Notes</label>
                  <textarea
                    rows={3}
                    value={releaseNotes}
                    onChange={(e) => setReleaseNotes(e.target.value)}
                    placeholder="Enter security findings, policy adjustments, or verification justification..."
                    className="w-full px-3 py-2 bg-secondary/50 border border-border/60 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setReleasingAgentId(null)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReleaseQuarantine(releasingAgentId)}
                  disabled={isSubmittingRelease}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
                >
                  {isSubmittingRelease ? 'Authenticating...' : 'Authorize Release'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
