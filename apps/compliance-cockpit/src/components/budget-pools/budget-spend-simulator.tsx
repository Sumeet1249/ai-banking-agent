'use client'

import React, { useState, useEffect } from 'react'
import {
  Sparkles, X, ShieldCheck, AlertTriangle, Fingerprint, Lock, CheckCircle2,
  ArrowRight, Clock, RefreshCw, Zap, DollarSign, Building, AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { BudgetVault3DPool } from './budget-vault-3d'
import { SpendingCategory, CanonicalAutonomyMode } from '@agentguard/core-schema'

const BANK_GATE_URL = process.env.NEXT_PUBLIC_BANK_GATE_URL || 'http://localhost:4000'

export interface BudgetSpendSimulatorDrawerProps {
  open: boolean
  onClose: () => void
  pools: BudgetVault3DPool[]
  initialPoolId?: string | null
  onSuccess: () => void
}

interface SimulatedMerchant {
  id: string
  name: string
  mcc: string
  category: SpendingCategory
}

const PRESET_MERCHANTS: SimulatedMerchant[] = [
  { id: 'merch-amazon-in', name: 'Amazon India', mcc: '5311', category: 'SHOPPING' },
  { id: 'merch-uber-rides', name: 'Uber Corporate', mcc: '4121', category: 'TRANSPORT' },
  { id: 'merch-bpcl-fuel', name: 'Bharat Petroleum Fleet', mcc: '5541', category: 'FUEL' },
  { id: 'merch-aws-infra', name: 'AWS Cloud Services', mcc: '5734', category: 'SUBSCRIPTIONS' },
  { id: 'merch-bescom-elec', name: 'BESCOM Utilities', mcc: '4900', category: 'UTILITIES' },
  { id: 'merch-swiggy-food', name: 'Swiggy Corporate Catering', mcc: '5812', category: 'FOOD_DINING' },
]

const PRESET_AGENTS = [
  { id: 'agent-shopping-bot-01', name: 'Autonomous Procurement Bot #01' },
  { id: 'agent-logistics-transit-02', name: 'Fleet Logistics Orchestrator #02' },
  { id: 'agent-cloud-finops-03', name: 'FinOps Cloud Scaler #03' },
  { id: 'agent-executive-concierge-04', name: 'Executive Travel Assistant #04' },
]

export function BudgetSpendSimulatorDrawer({
  open,
  onClose,
  pools,
  initialPoolId,
  onSuccess,
}: BudgetSpendSimulatorDrawerProps) {
  const [selectedPoolId, setSelectedPoolId] = useState<string>('')
  const [selectedAgentId, setSelectedAgentId] = useState<string>(PRESET_AGENTS[0].id)
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>(PRESET_MERCHANTS[0].id)
  const [amountRupees, setAmountRupees] = useState<number>(1500)
  const [evaluating, setEvaluating] = useState<boolean>(false)
  const [settling, setSettling] = useState<boolean>(false)

  const [evaluationResult, setEvaluationResult] = useState<{
    decision: 'ALLOW' | 'ASK' | 'DENY' | 'DEFER'
    reservation_id?: string
    reason?: string
    saga_state?: string
    amount_paise?: number
    settled?: boolean
    released?: boolean
  } | null>(null)

  useEffect(() => {
    if (initialPoolId) {
      setSelectedPoolId(initialPoolId)
    } else if (pools.length > 0 && !selectedPoolId) {
      setSelectedPoolId(pools[0].pool_id)
    }
  }, [initialPoolId, pools, selectedPoolId])

  if (!open) return null

  const targetPool = pools.find((p) => p.pool_id === selectedPoolId) || pools[0]
  const currentMerchant = PRESET_MERCHANTS.find((m) => m.id === selectedMerchantId) || PRESET_MERCHANTS[0]

  const handleEvaluateSpend = async () => {
    if (!targetPool) {
      toast.error('No budget pool available to evaluate spend against.')
      return
    }

    setEvaluating(true)
    setEvaluationResult(null)
    try {
      const res = await fetch(`${BANK_GATE_URL}/api/v1/category-reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-default',
          'x-customer-ref': 'cust-101',
        },
        body: JSON.stringify({
          pool_id: targetPool.pool_id,
          agent_id: selectedAgentId,
          workflow_id: 'wf-sim-' + Date.now(),
          request_id: 'req-sim-' + Date.now(),
          amount_paise: amountRupees * 100,
          category_id: targetPool.category_id,
          merchant_id: currentMerchant.id,
          description: `Simulated transaction for ${currentMerchant.name} (${currentMerchant.mcc})`,
        }),
      })

      const data = await res.json()
      setEvaluationResult(data)

      if (data.decision === 'ALLOW') {
        toast.success(`Spend Permitted! Reservation ID: ${data.reservation_id?.slice(0, 8)}... (90s TTL)`)
      } else if (data.decision === 'ASK') {
        toast.info(`Human Step-Up (ASK) Triggered! Escalated to Approvals Queue`)
      } else {
        toast.warning(`Spend Rejected (${data.decision}): ${data.reason || 'Limits or policy breach'}`)
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Evaluation request failed')
    } finally {
      setEvaluating(false)
    }
  }

  const handleSettleReservation = async () => {
    if (!evaluationResult?.reservation_id) return
    setSettling(true)
    try {
      const res = await fetch(
        `${BANK_GATE_URL}/api/v1/category-reservations/${evaluationResult.reservation_id}/settle`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-default',
            'x-customer-ref': 'cust-101',
          },
          body: JSON.stringify({ transfer_id: 'tb_txn_' + Date.now() }),
        }
      )
      if (!res.ok) throw new Error('Settlement failed')
      toast.success('Funds settled on TigerBeetle ledger!')
      setEvaluationResult((prev) => (prev ? { ...prev, settled: true } : null))
      onSuccess()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSettling(false)
    }
  }

  const handleReleaseReservation = async () => {
    if (!evaluationResult?.reservation_id) return
    setSettling(true)
    try {
      const res = await fetch(
        `${BANK_GATE_URL}/api/v1/category-reservations/${evaluationResult.reservation_id}/release`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-default',
            'x-customer-ref': 'cust-101',
          },
          body: JSON.stringify({ reason: 'SIMULATOR_MANUAL_RELEASE' }),
        }
      )
      if (!res.ok) throw new Error('Release failed')
      toast.success('Reservation hold released back to Available pool!')
      setEvaluationResult((prev) => (prev ? { ...prev, released: true } : null))
      onSuccess()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSettling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Slide-Over Drawer Content */}
      <div className="w-full max-w-lg bg-card border-l border-border h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
        <div>
          {/* Drawer Header */}
          <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm tracking-tight flex items-center gap-2">
                  <span>Live Spend &amp; Permit Simulator</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase">
                    Bank Gate :4000
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Synchronous multi-period evaluation &amp; reservation lifecycle
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/50 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Form Body */}
          <div className="p-5 space-y-4 text-xs">
            {/* 1. Target Budget Pool */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center justify-between">
                <span>1. Target Category Budget Pool</span>
                {targetPool && (
                  <span className="font-mono text-[11px] text-primary">
                    Cap: ₹{Math.round(targetPool.monthly_limit_paise / 100).toLocaleString('en-IN')}
                  </span>
                )}
              </label>
              {pools.length === 0 ? (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
                  No category pools exist yet. Click "Seed Sovereign Demo Pools" on the console first.
                </div>
              ) : (
                <select
                  value={selectedPoolId || (pools[0]?.pool_id ?? '')}
                  onChange={(e) => {
                    setSelectedPoolId(e.target.value)
                    setEvaluationResult(null)
                  }}
                  className="w-full p-2.5 rounded-xl bg-background border border-border text-foreground font-mono text-xs focus:ring-1 focus:ring-primary outline-none"
                >
                  {pools.map((p) => (
                    <option key={p.pool_id} value={p.pool_id}>
                      {p.category_name} ({p.category_id} · Mode: {p.autonomy_mode})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 2. Autonomous Agent */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">2. Initiating Autonomous Agent</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-background border border-border text-foreground font-mono text-xs focus:ring-1 focus:ring-primary outline-none"
              >
                {PRESET_AGENTS.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.id} — {agent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Merchant / MCC */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center justify-between">
                <span>3. Merchant &amp; MCC Code</span>
                <span className="font-mono text-[10px] text-muted-foreground">ISO 18245</span>
              </label>
              <select
                value={selectedMerchantId}
                onChange={(e) => setSelectedMerchantId(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-background border border-border text-foreground text-xs focus:ring-1 focus:ring-primary outline-none"
              >
                {PRESET_MERCHANTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (MCC {m.mcc} · {m.category})
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Spend Amount */}
            <div className="space-y-2 p-3.5 rounded-xl bg-muted/20 border border-border/80">
              <div className="flex items-center justify-between">
                <label className="font-bold text-foreground">4. Transaction Amount (₹)</label>
                <div className="text-right font-mono">
                  <span className="font-bold text-foreground text-sm">₹{amountRupees.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">
                    (= {(amountRupees * 100).toLocaleString('en-IN')} paise)
                  </span>
                </div>
              </div>

              {/* Quick Preset Chips */}
              <div className="flex items-center gap-1.5">
                {[500, 1500, 5000, 25000, 50000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountRupees(amt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition ${
                      amountRupees === amt
                        ? 'bg-primary text-primary-foreground border-primary font-bold shadow-sm'
                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    ₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                  </button>
                ))}
              </div>

              <input
                type="number"
                min={1}
                value={amountRupees}
                onChange={(e) => setAmountRupees(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground font-mono text-xs focus:ring-1 focus:ring-primary outline-none"
              />
            </div>

            {/* Live Evaluation Verdict Telemetry Box */}
            {evaluationResult && (
              <div
                className={`p-4 rounded-xl border space-y-2.5 transition animate-in fade-in ${
                  evaluationResult.decision === 'ALLOW'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : evaluationResult.decision === 'ASK'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {evaluationResult.decision === 'ALLOW' ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : evaluationResult.decision === 'ASK' ? (
                      <Fingerprint className="h-5 w-5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5" />
                    )}
                    <span>
                      {evaluationResult.decision === 'ALLOW'
                        ? 'ALLOW · Reserved 90s TTL'
                        : evaluationResult.decision === 'ASK'
                        ? 'ASK · Escalated for Passkey'
                        : 'BLOCK · Invariant I1 Ceiling Breached'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-background/50 font-bold border border-current/20">
                    {evaluationResult.saga_state || evaluationResult.decision}
                  </span>
                </div>

                <div className="text-xs text-foreground/90 space-y-1 font-mono pt-1 border-t border-current/20">
                  {evaluationResult.reservation_id && (
                    <div className="truncate">
                      Reservation ID: <strong>{evaluationResult.reservation_id}</strong>
                    </div>
                  )}
                  {evaluationResult.reason && <div>Details: {evaluationResult.reason}</div>}
                  {evaluationResult.settled && (
                    <div className="text-emerald-500 font-bold">✓ Transaction SETTLED on TigerBeetle ledger</div>
                  )}
                  {evaluationResult.released && (
                    <div className="text-sky-500 font-bold">✓ Reservation RELEASED back to Available pool</div>
                  )}
                </div>

                {/* Settle or Release Lifecycle CTAs (if ALLOW) */}
                {evaluationResult.decision === 'ALLOW' && !evaluationResult.settled && !evaluationResult.released && (
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      onClick={handleSettleReservation}
                      disabled={settling}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{settling ? 'Settling...' : 'Settle On Ledger'}</span>
                    </button>
                    <button
                      onClick={handleReleaseReservation}
                      disabled={settling}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border transition active:scale-95"
                    >
                      <span>Release Hold</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Action Footer */}
        <div className="p-5 border-t border-border bg-muted/20 space-y-3">
          <button
            onClick={handleEvaluateSpend}
            disabled={evaluating || pools.length === 0}
            className="w-full py-2.5 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 shadow-md transition active:scale-95 disabled:opacity-50"
          >
            <Sparkles className={`h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
            <span>{evaluating ? 'Evaluating Against Invariants...' : 'Evaluate Spend Against Invariants'}</span>
          </button>

          <p className="text-[10px] text-center text-muted-foreground font-mono">
            Enforces Invariant I1 synchronously at Bank Gate (:4000). Zero floats &middot; Integer paise.
          </p>
        </div>
      </div>
    </div>
  )
}
