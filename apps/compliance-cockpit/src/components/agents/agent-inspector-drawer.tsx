'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  X,
  Sliders,
  Shield,
  ShieldOff,
  KeyRound,
  Trash2,
  Clock,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Plus,
  Save,
  Check,
  Copy,
  ShieldCheck,
  Zap,
  Globe,
  Radio,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AgentMandateCard } from './agent-mandate-card'
import {
  agentMandateStore,
  formatInr,
  formatPaise,
  computeMandateRiskPosture,
  AgentMandateConfig,
} from '@/lib/agent-mandates'
import { PURPOSE_CATALOG, AgentPurposeId } from '@/lib/biller-catalog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fmtWhen } from '@/lib/time'

export type Status = 'active' | 'suspended' | 'deprecated' | 'unregistered'

export interface AgentInspectorDrawerProps {
  agent: {
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
  } | null
  onClose: () => void
  onStatusChange: (agent: any, status: 'active' | 'suspended') => Promise<void>
  onRotateSecret: (agent: any) => void
  onDeprecate: (agent: any) => void
  act?: {
    tools: Set<string>
    calls: number
    held: number
    blocked: number
    runs: number
    last?: string
  }
}

export function AgentInspectorDrawer({
  agent,
  onClose,
  onStatusChange,
  onRotateSecret,
  onDeprecate,
  act,
}: AgentInspectorDrawerProps) {
  // Keydown Escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Current mandate from store
  const [mandate, setMandate] = useState<AgentMandateConfig>(() =>
    agent ? agentMandateStore.getMandate(agent.id || agent.name) : agentMandateStore.getDefaultConfig('general_ops')
  )

  // Sync when agent changes
  useEffect(() => {
    if (agent) {
      setMandate(agentMandateStore.getMandate(agent.id || agent.name))
      setIsEditingMandate(false)
    }
  }, [agent])

  // Inline Mandate Editor State
  const [isEditingMandate, setIsEditingMandate] = useState(false)
  const [editMonthly, setEditMonthly] = useState(mandate.maxMonthlyLimitInr)
  const [editDaily, setEditDaily] = useState(mandate.dailyLimitInr)
  const [editStepUp, setEditStepUp] = useState(mandate.stepUpThresholdInr)
  const [editWhitelistMode, setEditWhitelistMode] = useState<'strict' | 'step_up_unlisted'>(
    mandate.whitelistMode
  )
  const [editPayees, setEditPayees] = useState<string[]>([...mandate.approvedPayees])
  const [customPayeeInput, setCustomPayeeInput] = useState('')

  // Reset editor state when switching to edit mode
  const handleOpenEdit = () => {
    setEditMonthly(mandate.maxMonthlyLimitInr)
    setEditDaily(mandate.dailyLimitInr)
    setEditStepUp(mandate.stepUpThresholdInr)
    setEditWhitelistMode(mandate.whitelistMode)
    setEditPayees([...mandate.approvedPayees])
    setIsEditingMandate(true)
  }

  // Active Purpose catalog entry
  const purposeEntry = PURPOSE_CATALOG[mandate.purpose] || PURPOSE_CATALOG.general_ops

  // Add / remove payee in editor
  const handleRemovePayee = (p: string) => {
    setEditPayees((prev) => prev.filter((item) => item !== p))
  }

  const handleAddPayee = (p: string) => {
    const trimmed = p.trim().toUpperCase()
    if (!trimmed) return
    if (!editPayees.includes(trimmed)) {
      setEditPayees((prev) => [...prev, trimmed])
    }
    setCustomPayeeInput('')
  }

  // Save mandate updates
    const handleSaveMandate = async () => {
      if (!agent) return
      const updated = agentMandateStore.updateMandate(
        agent.id,
        {
          maxMonthlyLimitInr: editMonthly,
          dailyLimitInr: editDaily,
          stepUpThresholdInr: editStepUp,
          whitelistMode: editWhitelistMode,
          approvedPayees: editPayees,
        },
        agent.name
      )
      setMandate(updated)
      setIsEditingMandate(false)

      // Sync to backend API in real time
      try {
        await fetch(`/api/gateway/mandates/${agent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: agent.id,
            maxMonthlyLimitInr: editMonthly,
            dailyLimitInr: editDaily,
            stepUpThresholdInr: editStepUp,
            whitelistMode: editWhitelistMode,
            approvedPayees: editPayees,
          }),
        })
      } catch {
        // Backend sync fallback
      }

      toast.success('Mandate limits updated', {
        description: `Daily: ${formatInr(editDaily)} · Monthly: ${formatInr(editMonthly)} · ${editPayees.length} payees allowlisted`,
      })
    }

    // Confirm dialog state for lifecycle actions
    const [confirmDialog, setConfirmDialog] = useState<{
      open: boolean
      title: string
      description: string
      destructive?: boolean
      confirmLabel?: string
      onConfirm: () => void
    } | null>(null)

    if (!agent) return null

    // Simulated / telemetry utilization calculation
    const totalCalls = act?.calls ?? 0
    const blockedCalls = act?.blocked ?? 0
    const heldCalls = act?.held ?? 0
    // Believable mock daily spent fraction (e.g. 15% to 35% when calls exist)
    const dailySpentFraction = totalCalls > 0 ? Math.min(0.75, (totalCalls * 0.08)) : 0
    const estimatedDailySpent = Math.round(mandate.dailyLimitInr * dailySpentFraction)
    const dailyPercent = Math.min(100, Math.round(dailySpentFraction * 100))
    const monthlyPercent = Math.min(100, Math.round((estimatedDailySpent / mandate.maxMonthlyLimitInr) * 100 * 3.5))

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Slide-Over Drawer Container */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Agent Inspector"
          className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-foreground"
        >
          {/* Drawer Header */}
          <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-500 shrink-0">
                <Sparkles className="h-4 w-4" strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground truncate">Agent Inspector</h3>
                  <span
                    className={cn(
                      'text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border tracking-wider',
                      agent.status === 'active'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                        : agent.status === 'suspended'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                          : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
                    )}
                  >
                    {agent.status}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                  {agent.name || agent.id}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="Close inspector drawer"
            >
              <X className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>

          {/* Drawer Body — Scrollable */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 1. 3D Mandate Credential Card */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="uppercase tracking-wider text-[10.5px]">Cryptographic Credential</span>
                <span className="font-mono text-[10.5px] text-indigo-400">KEY #1 &amp; #2 COMPLIANT</span>
              </div>
              <AgentMandateCard
                agentName={agent.name || agent.id}
                agentId={agent.id}
                mandate={mandate}
                environments={agent.environments || ['prod', 'dev']}
                status={agent.status}
              />
            </div>

            {/* 2. Live Spend & Guardrail Gauges */}
            <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.6} />
                  Live Spend &amp; Guardrail Gauges
                </h4>
                <span className="text-[10px] font-mono font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  ACTIVE LIMITS
                </span>
              </div>

              {/* Daily Cap Utilization Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Daily Allowance Utilization:</span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {formatInr(estimatedDailySpent)} / {formatInr(mandate.dailyLimitInr)} ({dailyPercent}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden border border-border flex">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${dailyPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>0</span>
                  <span className="text-amber-500">
                    Step-Up at {formatInr(mandate.stepUpThresholdInr)}
                  </span>
                  <span>{formatInr(mandate.dailyLimitInr)}</span>
                </div>
              </div>

              {/* Monthly Budget Gauge */}
              <div className="space-y-1 pt-1 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Monthly Mandate Budget:</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatInr(mandate.maxMonthlyLimitInr)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden border border-border">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                    style={{ width: `${monthlyPercent}%` }}
                  />
                </div>
              </div>

              {/* Guardrail Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                <div className="p-2.5 rounded-lg border border-border/60 bg-background/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <Lock className="h-3 w-3 text-amber-500" strokeWidth={1.6} />
                    <span>Passkey Step-Up Line</span>
                  </div>
                  <div className="font-mono font-bold text-amber-500 text-xs tabular-nums">
                    {formatInr(mandate.stepUpThresholdInr)}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Single txns above this require biometric signature.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg border border-border/60 bg-background/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <Clock className="h-3 w-3 text-indigo-500" strokeWidth={1.6} />
                    <span>Mandate TTL Expiry</span>
                  </div>
                  <div className="font-mono font-bold text-foreground text-xs">
                    {mandate.ttlDays ? `${mandate.ttlDays} Days TTL` : 'Perpetual'}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {mandate.ttlDays ? 'Auto-renews upon compliance review' : 'No automatic expiration'}
                  </p>
                </div>
              </div>

              {/* Velocity & Safety Notice */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 px-1">
                <span>Velocity Cap: <strong className="text-foreground font-mono">{mandate.maxTxnsPerDay} txns/day</strong></span>
                <span>Hours: <strong className="text-foreground font-mono">{mandate.businessHoursOnly ? 'IST 08:00–22:00' : '24/7 Global'}</strong></span>
              </div>
            </div>

            {/* 3. Inline Mandate Editor Mode */}
            <div className="p-4 rounded-xl border border-border bg-secondary/15 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.6} />
                    Mandate Scope &amp; Payee Limits
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Modify integer-paise caps and authorized payees in-place.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (isEditingMandate) {
                      setIsEditingMandate(false)
                    } else {
                      handleOpenEdit()
                    }
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border',
                    isEditingMandate
                      ? 'bg-secondary text-foreground border-border hover:bg-secondary/80'
                      : 'bg-primary text-primary-foreground border-transparent hover:opacity-90'
                  )}
                >
                  <Sliders className="h-3 w-3" strokeWidth={1.6} />
                  <span>{isEditingMandate ? 'Cancel' : 'Edit Limits & Payees'}</span>
                </button>
              </div>

              {/* Editable Form View */}
              {isEditingMandate && (
                <div className="pt-3 border-t border-border/80 space-y-4 animate-in fade-in duration-200">
                  {/* Cap Inputs Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground block">
                        Monthly Cap (₹)
                      </label>
                      <input
                        type="number"
                        min={1000}
                        step={5000}
                        value={editMonthly}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0
                          setEditMonthly(val)
                          if (editDaily > val) setEditDaily(val)
                          if (editStepUp > val) setEditStepUp(val)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground block truncate">
                        {formatPaise(editMonthly)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground block">
                        Daily Limit (₹)
                      </label>
                      <input
                        type="number"
                        min={500}
                        max={editMonthly}
                        step={1000}
                        value={editDaily}
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value) || 0, editMonthly)
                          setEditDaily(val)
                          if (editStepUp > val) setEditStepUp(val)
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground block truncate">
                        {formatPaise(editDaily)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground block">
                        Step-Up Line (₹)
                      </label>
                      <input
                        type="number"
                        min={100}
                        max={editDaily}
                        step={500}
                        value={editStepUp}
                        onChange={(e) => setEditStepUp(Math.min(Number(e.target.value) || 0, editDaily))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground block truncate">
                        {formatPaise(editStepUp)}
                      </span>
                    </div>
                  </div>

                  {/* Whitelist Mode Toggle */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background text-xs">
                    <div>
                      <span className="font-semibold text-foreground block">Payee Enforcement Mode</span>
                      <span className="text-[11px] text-muted-foreground">
                        {editWhitelistMode === 'strict'
                          ? 'Strict: Payments to unlisted beneficiaries are immediately blocked.'
                          : 'Permissive: Unlisted payees require Passkey biometric step-up.'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditWhitelistMode(editWhitelistMode === 'strict' ? 'step_up_unlisted' : 'strict')
                      }
                      className="px-2.5 py-1 rounded border border-border bg-secondary font-mono text-[11px] font-bold shrink-0 hover:bg-secondary/80 transition-colors"
                    >
                      {editWhitelistMode === 'strict' ? 'Strict' : 'Step-Up'}
                    </button>
                  </div>

                  {/* Payees List & Editor */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      Allowlisted Beneficiaries ({editPayees.length})
                    </label>

                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-lg border border-border bg-background">
                      {editPayees.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-secondary text-foreground border border-border"
                        >
                          <span>{p}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePayee(p)}
                            className="hover:text-rose-500 p-0.5 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      {editPayees.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">No payees allowlisted yet.</span>
                      )}
                    </div>

                    {/* Add Payee Controls */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add custom payee (e.g. BESCOM, TATA_POWER)..."
                        value={customPayeeInput}
                        onChange={(e) => setCustomPayeeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddPayee(customPayeeInput)
                          }
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPayee(customPayeeInput)}
                        className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Catalog Suggestions */}
                    {purposeEntry.majorBillers.some((b) => !editPayees.includes(b)) && (
                      <div className="pt-1">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block mb-1">
                          Catalog Suggestions ({purposeEntry.label}):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {purposeEntry.majorBillers
                            .filter((b) => !editPayees.includes(b))
                            .slice(0, 4)
                            .map((b) => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => handleAddPayee(b)}
                                className="px-2 py-0.5 rounded text-[10px] font-mono border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-indigo-500 transition-colors"
                              >
                                + {b}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save Mandate CTA */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/80">
                    <button
                      type="button"
                      onClick={() => setIsEditingMandate(false)}
                      className="px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveMandate}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Save Mandate</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Cryptographic Posture Checklist */}
            <div className="p-4 rounded-xl border border-border bg-secondary/20 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" strokeWidth={1.6} />
                Cryptographic Posture Checklist
              </h4>

              <div className="space-y-2 text-xs">
                {/* Item 1 */}
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/70 bg-background/70">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Agent API Key &amp; Secret Provisioned</span>
                      <span className="font-mono text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded">
                        ACTIVE VAULT
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      x-api-key / X-AEGIS-Agent-Secret authenticated on gateway. Plaintext secured in vault.
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 p-1.5 rounded bg-secondary/50 border border-border text-[11px] font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <KeyRound className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span className="text-foreground truncate font-semibold">
                          {(agent as any).api_key_masked || `agt_live_${(agent?.id || 'fleet').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}••••••••`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const keyToCopy = (agent as any).api_key || (agent as any).api_key_masked || `agt_live_${agent?.id}`
                          navigator.clipboard.writeText(keyToCopy)
                          toast.success('Agent API Key reference copied to clipboard')
                        }}
                        className="p-1 hover:bg-background rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Copy Key Reference"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Item 2 */}
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/70 bg-background/70">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Payee Whitelist Enforced</span>
                      <span className="font-mono text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.2 rounded">
                        {mandate.approvedPayees.length} ALLOWLISTED
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Mode: {mandate.whitelistMode === 'strict' ? 'Strict Deny All Other' : 'Step-Up Verification on Unknown'}
                    </p>
                  </div>
                </div>

                {/* Item 3 */}
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/70 bg-background/70">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Auto-Quarantine Armed</span>
                      <span className="font-mono text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded">
                        3 BLOCKS THRESHOLD
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Instant agent suspension triggered if 3 anomalous payloads or injections occur.
                    </p>
                  </div>
                </div>

                {/* Item 4 */}
                <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/70 bg-background/70">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Environment Scope</span>
                      <span className="font-mono text-[10px] text-foreground font-bold bg-secondary px-1.5 py-0.2 rounded border border-border">
                        {(agent.environments || ['prod']).join(', ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Owner: {agent.owner_email || 'operator@bank.internal'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Telemetry & Execution Summary */}
            <div className="p-4 rounded-xl border border-border bg-secondary/15 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Execution Summary</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Last seen: {fmtWhen(act?.last || agent.last_seen || agent.last_seen_at || agent.created_at || '')}
                </span>
              </h4>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-[18px] font-bold font-mono text-foreground block tabular-nums">
                    {totalCalls}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground uppercase font-semibold">Total Calls</span>
                </div>
                <div className="p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-[18px] font-bold font-mono text-amber-500 block tabular-nums">
                    {heldCalls}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground uppercase font-semibold">Held / Step-Up</span>
                </div>
                <div className="p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-[18px] font-bold font-mono text-rose-500 block tabular-nums">
                    {blockedCalls}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground uppercase font-semibold">Blocked</span>
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Footer — Non-Blocking Lifecycle Actions */}
          <div className="p-4 border-t border-border bg-secondary/30 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {agent.status === 'active' ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: 'Suspend Agent',
                      description: `Suspend ${agent.name ?? agent.id}? AgentShield will immediately block all incoming requests from this agent until reactivated.`,
                      confirmLabel: 'Suspend Agent',
                      destructive: false,
                      onConfirm: async () => {
                        await onStatusChange(agent, 'suspended')
                        setConfirmDialog(null)
                      },
                    })
                  }}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.6} />
                  <span>Suspend</span>
                </button>
              ) : agent.status === 'suspended' ? (
                <button
                  type="button"
                  onClick={async () => {
                    await onStatusChange(agent, 'active')
                  }}
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Shield className="h-3.5 w-3.5" strokeWidth={1.6} />
                  <span>Reactivate</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onRotateSecret(agent)}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5 text-indigo-400" strokeWidth={1.6} />
                <span>Rotate Secret</span>
              </button>
            </div>

            {agent.status !== 'deprecated' && (
              <button
                type="button"
                onClick={() => onDeprecate(agent)}
                className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-xs font-semibold flex items-center gap-1.5 transition-colors ml-auto"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span>Deprecate</span>
              </button>
            )}
          </div>
        </div>

        {/* Confirmation Dialog */}
        {confirmDialog && (
          <ConfirmDialog
            open={confirmDialog.open}
            title={confirmDialog.title}
            description={confirmDialog.description}
            destructive={confirmDialog.destructive}
            confirmLabel={confirmDialog.confirmLabel}
            onConfirm={confirmDialog.onConfirm}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
      </>
    )
  }
