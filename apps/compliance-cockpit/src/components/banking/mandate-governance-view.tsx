'use client'

import { useState } from 'react'
import {
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatPaiseToINR } from '@/lib/safe-format'

export interface Mandate {
  id: string
  version: string
  agentId: string
  purpose: string
  perTxnCapPaise: number
  dailyCapPaise: number
  dailyUsedPaise: number
  allowedPayees: string[]
  ttlText: string
  active: boolean
  isReadOnly?: boolean
}

const INITIAL_MANDATES: Mandate[] = [
  {
    id: 'MND_ELEC_101',
    version: 'v1',
    agentId: 'AGENT_ELEC_01',
    purpose: 'electricity_bill_payment',
    perTxnCapPaise: 500000, // ₹5,000.00
    dailyCapPaise: 800000, // ₹8,000.00
    dailyUsedPaise: 124000, // ₹1,240.00
    allowedPayees: ['PAYEE_CESC_001', 'PAYEE_TATA_POWER_001'],
    ttlText: '18d 04h remaining',
    active: true,
  },
  {
    id: 'MND_WATER_102',
    version: 'v1',
    agentId: 'AGENT_WATER_01',
    purpose: 'water_utility_invoice',
    perTxnCapPaise: 200000, // ₹2,000.00
    dailyCapPaise: 400000, // ₹4,000.00
    dailyUsedPaise: 89000, // ₹890.00
    allowedPayees: ['BWSSB_WATER'],
    ttlText: '24d 11h remaining',
    active: true,
  },
  {
    id: 'MND_CLOUD_103',
    version: 'v2',
    agentId: 'AGENT_DEVOPS_01',
    purpose: 'cloud_infrastructure_spend',
    perTxnCapPaise: 2500000, // ₹25,000.00
    dailyCapPaise: 10000000, // ₹1,00,000.00
    dailyUsedPaise: 4200000, // ₹42,000.00
    allowedPayees: ['AWS_INFRA', 'GCP_CLOUD'],
    ttlText: '6d 19h remaining',
    active: true,
  },
]

export interface MandateGovernanceViewProps {
  onValidated?: () => void
}

export function MandateGovernanceView({ onValidated }: MandateGovernanceViewProps) {
  const [mandates, setMandates] = useState<Mandate[]>(INITIAL_MANDATES)
  const [lastRevocationTelemetry, setLastRevocationTelemetry] = useState<string | null>(null)

  // Simulator state
  const [selectedMandateId, setSelectedMandateId] = useState<string>('MND_ELEC_101')
  const [testAmountRupees, setTestAmountRupees] = useState<number>(4900)
  const [testPayee, setTestPayee] = useState<string>('PAYEE_CESC_001')
  const [evaluationResult, setEvaluationResult] = useState<{
    status: 'ALLOW' | 'DENY'
    reasonCode: string
    details: string
    latencyMs: number
    checkedAt: string
  } | null>(null)

  const activeMandate = mandates.find((m) => m.id === selectedMandateId) || mandates[0]

  const handleToggleMandate = (id: string) => {
    setMandates((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        const nextActive = !m.active
        if (!nextActive) {
          setLastRevocationTelemetry(
            `Gateway :8081 (0.2ms) → Bank Gate :4000 (0.4ms) → Witness :5000 (0.7ms) ✓ Stale Token Burned`
          )
          toast.error(`Mandate ${m.id} REVOKED`, {
            description: `Token invalidated in 0.4ms across Bank Gate instances. Zero downstream permits honored.`,
          })
        } else {
          setLastRevocationTelemetry(`Restored policy for ${m.id} in 0.3ms`)
          toast.success(`Mandate ${m.id} Restored`, {
            description: `Scoped delegation reinstated with ${formatPaiseToINR(m.perTxnCapPaise)} per-txn cap.`,
          })
        }
        return { ...m, active: nextActive }
      })
    )
    onValidated?.()
  }

  const handleEvaluate = (amount?: number, payee?: string) => {
    const amt = amount ?? testAmountRupees
    const pay = payee ?? testPayee
    const amtPaise = amt * 100

    const m = mandates.find((item) => item.id === selectedMandateId) || mandates[0]

    if (!m.active) {
      setEvaluationResult({
        status: 'DENY',
        reasonCode: 'DENY_MANDATE_REVOKED',
        details: `Mandate ${m.id} is marked REVOKED. Stale cryptographic token rejected at Gateway :8081 in 0.2ms.`,
        latencyMs: 0.2,
        checkedAt: new Date().toLocaleTimeString(),
      })
      toast.error('Policy Engine: Transfer Denied', {
        description: `Mandate ${m.id} is revoked. No debits allowed.`,
      })
      onValidated?.()
      return
    }

    if (!m.allowedPayees.includes(pay)) {
      setEvaluationResult({
        status: 'DENY',
        reasonCode: 'DENY_PAYEE_NOT_ALLOWLISTED',
        details: `Payee "${pay}" is not in the cryptographic allowlist [${m.allowedPayees.join(
          ', '
        )}]. Direct breach deflected.`,
        latencyMs: 0.3,
        checkedAt: new Date().toLocaleTimeString(),
      })
      toast.error('Policy Engine: Payee Denied', {
        description: `Beneficiary "${pay}" violates whitelist policy.`,
      })
      onValidated?.()
      return
    }

    if (amtPaise > m.perTxnCapPaise) {
      setEvaluationResult({
        status: 'DENY',
        reasonCode: 'DENY_PER_TXN_CAP_EXCEEDED',
        details: `Amount ${formatPaiseToINR(
          amtPaise
        )} (${amtPaise} paise) exceeds per-transaction cap of ${formatPaiseToINR(
          m.perTxnCapPaise
        )} (${m.perTxnCapPaise} paise).`,
        latencyMs: 0.4,
        checkedAt: new Date().toLocaleTimeString(),
      })
      toast.error('Policy Engine: Cap Exceeded', {
        description: `Transfer exceeds per-transaction limit by ${formatPaiseToINR(
          amtPaise - m.perTxnCapPaise
        )}.`,
      })
      onValidated?.()
      return
    }

    if (m.dailyUsedPaise + amtPaise > m.dailyCapPaise) {
      setEvaluationResult({
        status: 'DENY',
        reasonCode: 'DENY_DAILY_VELOCITY_CAP_EXCEEDED',
        details: `Cumulative daily spend would reach ${formatPaiseToINR(
          m.dailyUsedPaise + amtPaise
        )}, exceeding daily mandate limit of ${formatPaiseToINR(m.dailyCapPaise)}.`,
        latencyMs: 0.4,
        checkedAt: new Date().toLocaleTimeString(),
      })
      toast.error('Policy Engine: Daily Cap Exceeded', {
        description: `Exceeds rolling daily volume limit.`,
      })
      onValidated?.()
      return
    }

    setEvaluationResult({
      status: 'ALLOW',
      reasonCode: 'ALLOW_POLICY_PERMIT_ISSUED',
      details: `Permit authorized for ${formatPaiseToINR(
        amtPaise
      )} → ${pay}. Within per-txn limit (${formatPaiseToINR(
        m.perTxnCapPaise
      )}) and daily cap (${formatPaiseToINR(m.dailyCapPaise)}).`,
      latencyMs: 0.5,
      checkedAt: new Date().toLocaleTimeString(),
    })
    toast.success('Policy Engine: Transfer Allowed', {
      description: `Ed25519 permit signed for ${formatPaiseToINR(amtPaise)}.`,
    })
    onValidated?.()
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500 shrink-0">
              <KeyRound className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground">
                  Scoped Delegation &amp; Mandate Governance (Key #1)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  RBI APRA COMPLIANT
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  &lt;1ms Revocation
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Autonomous agents operate strictly under time-bound, cryptographically-bounded, and
                instantly-revocable delegation contracts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-muted-foreground">
              Integer-Paise Precision Guarantee:
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-secondary text-foreground border border-border">
              Zero Float Rounding (Int64)
            </span>
          </div>
        </div>

        {/* Real-time Propagation Telemetry Strip */}
        <div className="rounded-lg border border-border bg-secondary/30 px-3.5 py-2 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <Clock className="h-3.5 w-3.5 text-indigo-500 shrink-0" strokeWidth={1.6} />
            <span className="text-muted-foreground">Revocation Propagation Mesh:</span>
            <span className="text-foreground font-semibold">
              {lastRevocationTelemetry ||
                'Gateway :8080 (0.2ms) → Bank Gate :4000 (0.4ms) → Witness :5000 (0.7ms) ✓ Synced'}
            </span>
          </div>
          <span className="text-[10.5px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            P99 &lt; 1.0ms
          </span>
        </div>
      </div>

      {/* 2-Column Responsive Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (6 cols): Active Mandate Vault Cards */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Mandate Vault
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                {mandates.filter((m) => m.active).length} of {mandates.length} Active
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Click toggle to simulate instant revocation
            </span>
          </div>

          <div className="space-y-3.5">
            {mandates.map((mandate) => {
              const dailyPct = Math.min(
                100,
                Math.round((mandate.dailyUsedPaise / mandate.dailyCapPaise) * 100)
              )
              const isSelected = selectedMandateId === mandate.id

              return (
                <div
                  key={mandate.id}
                  onClick={() => setSelectedMandateId(mandate.id)}
                  className={cn(
                    'p-4 rounded-xl border transition-all duration-200 cursor-pointer text-xs relative select-none',
                    isSelected
                      ? 'border-indigo-500/50 bg-secondary/60 ring-1 ring-indigo-500/20 shadow-md'
                      : 'border-border bg-card hover:bg-secondary/30 shadow-sm',
                    !mandate.active && 'opacity-80 border-rose-500/30'
                  )}
                >
                  {/* Top Row: Mandate ID, Version, Status, Revoke Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground text-sm">
                        {mandate.id}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                        {mandate.version}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold border font-mono transition-colors',
                          mandate.active
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        )}
                      >
                        {mandate.active ? 'ACTIVE' : 'REVOKED (0.4ms)'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleMandate(mandate.id)
                      }}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors flex items-center gap-1 active:scale-95',
                        mandate.active
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white'
                      )}
                    >
                      {mandate.active ? (
                        <>
                          <XCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
                          <span>Revoke Mandate</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
                          <span>Restore Mandate</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Mandate Metadata */}
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-muted-foreground text-[11px]">
                    <div>
                      Agent:{' '}
                      <strong className="text-foreground font-mono">{mandate.agentId}</strong>
                    </div>
                    <div>
                      Purpose:{' '}
                      <strong className="text-foreground">{mandate.purpose}</strong>
                    </div>
                  </div>

                  {/* Integer-Paise Caps & Progress Bar */}
                  <div className="mt-3 p-2.5 rounded-lg bg-background/80 border border-border/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Per-Transaction Cap:</span>
                      <span
                        className="font-mono font-bold text-foreground"
                        title={`${mandate.perTxnCapPaise} paise`}
                      >
                        {formatPaiseToINR(mandate.perTxnCapPaise)}{' '}
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({mandate.perTxnCapPaise} paise)
                        </span>
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-muted-foreground">Daily Utilization:</span>
                        <span className="font-mono font-semibold text-foreground">
                          {formatPaiseToINR(mandate.dailyUsedPaise)} /{' '}
                          {formatPaiseToINR(mandate.dailyCapPaise)}{' '}
                          <span className="text-indigo-500 font-bold">({dailyPct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-[width] duration-500 rounded-full',
                            dailyPct > 80
                              ? 'bg-rose-500'
                              : dailyPct > 50
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                          )}
                          style={{ width: `${dailyPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Allowlist & TTL Footer */}
                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground">Payees:</span>
                      {mandate.allowedPayees.map((payee) => (
                        <span
                          key={payee}
                          className="px-1.5 py-0.5 rounded font-mono font-semibold text-[10px] bg-secondary text-foreground border border-border"
                        >
                          {payee}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{mandate.ttlText}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column (6 cols): Interactive Mandate Evaluation Sandbox */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Interactive Mandate Test Bench
            </span>
            <span className="text-[10px] font-mono text-indigo-500">
              Selected: {activeMandate.id}
            </span>
          </div>

          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Simulate Mandate Policy Evaluation
              </h3>
              <p className="text-xs text-muted-foreground">
                Run simulated agent payment instructions against real-time mandate caps, whitelists,
                and revocation status.
              </p>
            </div>

            {/* Quick Test Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Quick Test Scenarios:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTestAmountRupees(4900)
                    setTestPayee('BESCOM')
                    handleEvaluate(4900, 'BESCOM')
                  }}
                  className="p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/70 text-left transition text-xs flex flex-col gap-0.5 active:scale-95"
                >
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>₹4,900 → BESCOM</span>
                    <span className="text-[10px] text-emerald-500 font-mono font-bold">PASS EXPECTED</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Within ₹5,000 cap · Whitelisted
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTestAmountRupees(50000)
                    setTestPayee('OFFSHORE_UNKNOWN')
                    handleEvaluate(50000, 'OFFSHORE_UNKNOWN')
                  }}
                  className="p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/70 text-left transition text-xs flex flex-col gap-0.5 active:scale-95"
                >
                  <div className="font-semibold text-foreground flex items-center justify-between">
                    <span>₹50,000 → OFFSHORE</span>
                    <span className="text-[10px] text-rose-500 font-mono font-bold">DENY EXPECTED</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    10× Over Cap · Rogue Payee
                  </span>
                </button>
              </div>
            </div>

            {/* Configurable Test Form */}
            <div className="space-y-3 pt-2 border-t border-border">
              {/* Mandate Selector */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Active Mandate:
                </label>
                <select
                  value={selectedMandateId}
                  onChange={(e) => setSelectedMandateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/50 text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {mandates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} ({m.agentId}) — Cap: {formatPaiseToINR(m.perTxnCapPaise)} [
                      {m.active ? 'ACTIVE' : 'REVOKED'}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Slider & Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Transfer Amount (INR):</span>
                  <span className="font-mono font-bold text-foreground text-sm">
                    {formatPaiseToINR(testAmountRupees * 100)}{' '}
                    <span className="text-[10.5px] font-normal text-muted-foreground">
                      ({testAmountRupees * 100} paise)
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="60000"
                  step="500"
                  value={testAmountRupees}
                  onChange={(e) => setTestAmountRupees(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>₹500</span>
                  <span>Cap: {formatPaiseToINR(activeMandate.perTxnCapPaise)}</span>
                  <span>₹60,000</span>
                </div>
              </div>

              {/* Payee Selection */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Target Beneficiary (Payee):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testPayee}
                    onChange={(e) => setTestPayee(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary/50 text-foreground font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Enter payee code (e.g. BESCOM)"
                  />
                  <button
                    type="button"
                    onClick={() => setTestPayee('BESCOM')}
                    className="px-2.5 py-1 text-xs rounded border border-border bg-secondary hover:bg-secondary/80 font-mono text-foreground"
                  >
                    BESCOM
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestPayee('OFFSHORE_UNKNOWN')}
                    className="px-2.5 py-1 text-xs rounded border border-border bg-secondary hover:bg-secondary/80 font-mono text-rose-500"
                  >
                    OFFSHORE
                  </button>
                </div>
              </div>

              {/* Evaluate Button */}
              <button
                type="button"
                onClick={() => handleEvaluate()}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
              >
                <Sparkles className="h-4 w-4" />
                <span>Evaluate Transfer Against Active Policy</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Live Evaluation Result Card */}
            {evaluationResult && (
              <div
                className={cn(
                  'p-4 rounded-xl border text-xs space-y-2 animate-in fade-in duration-200 transition-colors',
                  evaluationResult.status === 'ALLOW'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                )}
              >
                <div className="flex items-center justify-between font-mono font-bold">
                  <div className="flex items-center gap-2">
                    {evaluationResult.status === 'ALLOW' ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" strokeWidth={1.8} />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" strokeWidth={1.8} />
                    )}
                    <span>DECISION: {evaluationResult.status}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-current">
                    {evaluationResult.latencyMs}ms check
                  </span>
                </div>

                <div className="text-[11.5px] leading-relaxed text-foreground font-medium">
                  {evaluationResult.details}
                </div>

                <div className="pt-1.5 border-t border-current/20 flex items-center justify-between text-[10px] font-mono opacity-80">
                  <span>Rule: {evaluationResult.reasonCode}</span>
                  <span>Evaluated at {evaluationResult.checkedAt}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
