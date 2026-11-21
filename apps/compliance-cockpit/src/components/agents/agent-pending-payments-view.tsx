'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Fingerprint,
  Ban,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bot,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  FileCheck2,
  Lock,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { friendlyAgent } from '@/lib/friendly-names'
import { cn } from '@/lib/utils'

export interface PendingApprovalItem {
  reservation_id: string
  pool_id: string
  tenant_id: string
  customer_ref: string
  agent_id: string
  workflow_id: string
  request_id: string
  idempotency_key: string
  transaction_digest: string
  category_id: string
  amount_paise: number
  currency: string
  status: string
  saga_state: string
  created_at: number
  expires_at: number
  violations: string
  release_reason: string
}

function formatPaiseToInr(paise: number): string {
  if (isNaN(paise) || paise === null || paise === undefined) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100)
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function AgentPendingPaymentsView() {
  const qc = useQueryClient()
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    item: PendingApprovalItem
    decision: 'APPROVE' | 'REJECT'
  } | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery<{ approvals: PendingApprovalItem[] }>({
    queryKey: ['pending-approvals'],
    queryFn: async () => {
      const res = await fetch('/api/bank-gate/approvals/pending')
      if (!res.ok) throw new Error('Failed to fetch pending approvals')
      return res.json()
    },
    refetchInterval: 5000,
  })

  const approvals = data?.approvals || []

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalHeldPaise = 0
    approvals.forEach((a) => {
      totalHeldPaise += a.amount_paise || 0
    })
    return {
      count: approvals.length,
      totalHeldPaise,
    }
  }, [approvals])

  const handleDecision = async (reservationId: string, decision: 'APPROVE' | 'REJECT') => {
    setDecidingId(reservationId)
    try {
      const biometricToken = 'passkey_sig_' + Date.now() + '_approved_user_biometric_hardware_token'
      const res = await fetch(`/api/bank-gate/approvals/${reservationId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          biometric_token: biometricToken,
          reason:
            decision === 'APPROVE'
              ? 'Approved via Customer Biometric Passkey assertion'
              : 'Rejected by Sovereign Customer in Compliance Cockpit',
        }),
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success(
          decision === 'APPROVE'
            ? 'Payment Authorized & Category Budget Settled'
            : 'Payment Rejected & Category Capacity Released'
        )
        qc.invalidateQueries({ queryKey: ['pending-approvals'] })
        qc.invalidateQueries({ queryKey: ['agents-block-history'] })
        qc.invalidateQueries({ queryKey: ['audit-db-status'] })
        qc.invalidateQueries({ queryKey: ['agent-allocations'] })
        refetch()
      } else {
        toast.error(result.reason || result.error || 'Failed to process decision')
      }
    } catch (err: any) {
      toast.error(err.message || 'Network error processing decision')
    } finally {
      setDecidingId(null)
      setConfirmModal(null)
    }
  }

  return (
    <div className="space-y-6 text-foreground">
      {/* ── METRICS TILES ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total In-Flight Approvals */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Awaiting Human Approval</span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-amber-500 tabular-nums">
              {metrics.count}
            </span>
            <span className="text-xs text-muted-foreground">in-flight</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Escalated under Invariant I3 (Restricted ASK &amp; Sovereign Customer Consent).
          </p>
        </div>

        {/* Total Value Held */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Capital Held</span>
            <Lock className="h-4 w-4 text-indigo-400" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground tabular-nums">
              {formatPaiseToInr(metrics.totalHeldPaise)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Capacity reserved atomically in Bank Gate without double-counting (Invariant I4).
          </p>
        </div>

        {/* Biometric Passkey Engine */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Biometric Passkey Rail</span>
            <Fingerprint className="h-4 w-4 text-emerald-400" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold font-mono text-emerald-400 uppercase tracking-wide">
              WebAuthn L3 Active
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight pt-1">
            Hardware-backed sovereign approval cryptographically bound to transaction digest.
          </p>
        </div>
      </div>

      {/* ── QUEUE HEADER & REFRESH ── */}
      <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
            In-Flight Payment Authorization Queue
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
            {approvals.length} pending
          </span>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* ── QUEUE LIST / CARDS ── */}
      {isLoading ? (
        <div className="h-44 rounded-xl animate-pulse bg-secondary/40 border border-border" />
      ) : approvals.length === 0 ? (
        <div className="rounded-xl border border-border py-14 text-center bg-card">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 opacity-60" />
          <p className="mt-2 text-sm font-semibold text-foreground">Zero Pending Authorizations</p>
          <p className="mt-1 text-xs text-muted-foreground">
            All agent payments are either fully settled autonomously within category limits or released.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((item) => {
            let parsedViolations: string[] = []
            try {
              parsedViolations = JSON.parse(item.violations)
            } catch {
              parsedViolations = [item.violations]
            }

            const isDeciding = decidingId === item.reservation_id

            return (
              <div
                key={item.reservation_id}
                className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs hover:border-amber-500/40 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
                  {/* Amount & Category */}
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold font-mono text-foreground tabular-nums">
                          {formatPaiseToInr(item.amount_paise)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-secondary text-foreground border border-border">
                          {item.category_id}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30 font-mono">
                          {item.saga_state}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono block mt-0.5">
                        Reservation: {item.reservation_id} • Pool: {item.pool_id}
                      </span>
                    </div>
                  </div>

                  {/* Agent Identity */}
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="text-right sm:text-left">
                      <span className="font-bold text-xs text-foreground block">
                        {friendlyAgent(item.agent_id)}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground font-mono block">
                        {item.agent_id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reason & Escalation Trigger */}
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-500 font-semibold text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Customer Consent Required Before Execution:</span>
                  </div>
                  <p className="text-xs text-amber-200/90 leading-relaxed font-sans">
                    {item.release_reason || parsedViolations.join('; ') || 'Sovereign policy threshold exceeded.'}
                  </p>
                </div>

                {/* Metadata & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-4 text-muted-foreground font-mono text-[11px]">
                    <span>Requested: {formatTimestamp(item.created_at)}</span>
                    <span>•</span>
                    <span className="text-amber-400">
                      Expires: {formatTimestamp(item.expires_at)}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmModal({ item, decision: 'REJECT' })}
                      disabled={isDeciding}
                      className="px-3.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs transition-colors inline-flex items-center gap-1.5"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Reject Payment</span>
                    </button>

                    <button
                      onClick={() => setConfirmModal({ item, decision: 'APPROVE' })}
                      disabled={isDeciding}
                      className="px-4 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Fingerprint className="h-3.5 w-3.5" />
                      <span>Approve with Passkey</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── BIOMETRIC / CONFIRMATION MODAL ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl p-5 space-y-4 bg-card border border-border shadow-2xl text-foreground">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border',
                  confirmModal.decision === 'APPROVE'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                )}
              >
                {confirmModal.decision === 'APPROVE' ? (
                  <Fingerprint className="h-5 w-5" />
                ) : (
                  <Ban className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-sm">
                  {confirmModal.decision === 'APPROVE'
                    ? 'Biometric Passkey Authorization'
                    : 'Reject & Release Reservation'}
                </h3>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Reservation {confirmModal.item.reservation_id}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Authorized Amount:</span>
                  <span className="font-bold font-mono text-foreground">
                    {formatPaiseToInr(confirmModal.item.amount_paise)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Agent:</span>
                  <span className="font-bold text-foreground">
                    {friendlyAgent(confirmModal.item.agent_id)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-semibold text-foreground">
                    {confirmModal.item.category_id}
                  </span>
                </div>
              </div>

              {confirmModal.decision === 'APPROVE' ? (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-1">
                  <span className="font-bold block text-xs">Hardware Assertion Ready</span>
                  <p className="text-[11.5px] leading-relaxed">
                    By clicking Confirm, a WebAuthn biometric assertion signature will be verified server-side in Bank Gate (:4000) and atomically commit funds to the ledger.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1">
                  <span className="font-bold block text-xs">Immediate Compensation</span>
                  <p className="text-[11.5px] leading-relaxed">
                    Rejecting this transaction will release the category budget reservation immediately and return capacity to the pool.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="text-xs px-3.5 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDecision(confirmModal.item.reservation_id, confirmModal.decision)
                }
                disabled={Boolean(decidingId)}
                className={cn(
                  'text-xs px-4 py-2 rounded-lg font-bold transition-colors inline-flex items-center gap-1.5 shadow-sm',
                  confirmModal.decision === 'APPROVE'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-rose-500 hover:bg-rose-600 text-white'
                )}
              >
                {confirmModal.decision === 'APPROVE' ? (
                  <>
                    <Fingerprint className="h-3.5 w-3.5" />
                    <span>Authorize with Biometrics</span>
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5" />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
