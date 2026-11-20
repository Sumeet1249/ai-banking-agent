'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Fingerprint, CheckCircle2, Loader2, X } from 'lucide-react'
import { useCountUp } from '@/hooks/useCountUp'
import { formatPaiseToINR } from '@/lib/safe-format'

export interface PasskeyStepUpModalProps {
  open?: boolean
  isOpen?: boolean
  onClose: () => void
  onApproved: () => void
  agentName: string
  payee: string
  amountPaise: number
  thresholdPaise: number
  reason: string
}

export function PasskeyStepUpModal({
  open,
  isOpen,
  onClose,
  onApproved,
  agentName,
  payee,
  amountPaise,
  thresholdPaise,
  reason,
}: PasskeyStepUpModalProps) {
  const isModalOpen = Boolean(open ?? isOpen)
  const [checkedIntent, setCheckedIntent] = useState(false)
  const [checkedPayee, setCheckedPayee] = useState(false)
  const [phase, setPhase] = useState<'review' | 'verifying' | 'signed'>('review')
  const [barMounted, setBarMounted] = useState(false)

  const overagePaise = Math.max(0, amountPaise - thresholdPaise)
  const animatedAmount = useCountUp(isModalOpen ? amountPaise : 0, 520)

  const safePct = Math.min(100, (thresholdPaise / Math.max(amountPaise, 1)) * 100)
  const overPct = Math.max(0, 100 - safePct)

  useEffect(() => {
    if (!isModalOpen) {
      setCheckedIntent(false)
      setCheckedPayee(false)
      setPhase('review')
      setBarMounted(false)
      return
    }
    const timer = window.setTimeout(() => setBarMounted(true), 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'review') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [isModalOpen, onClose, phase])

  if (!isModalOpen) return null

  const canConfirm = checkedIntent && checkedPayee && phase === 'review'

  const handleConfirm = () => {
    if (!canConfirm) return
    setPhase('verifying')
    window.setTimeout(() => {
      setPhase('signed')
      window.setTimeout(() => {
        onApproved()
        onClose()
      }, 650)
    }, 950)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-modal-title"
      onClick={() => phase === 'review' && onClose()}
    >
      <div
        className="passkey-modal-pop w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <h2 id="passkey-modal-title" className="text-sm font-semibold text-foreground">
                Over your {formatPaiseToINR(thresholdPaise)} autonomous approval line
              </h2>
              <p className="text-xs text-muted-foreground">
                Dual-control WebAuthn passkey required for <span className="font-mono text-foreground">{agentName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={phase !== 'review'}
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>

        {/* 2-Step Progress Stepper */}
        <div className="mt-5 flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-emerald-500">
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.7} />
            <span>1. Review intent &amp; payee</span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div
            className={`flex items-center gap-1.5 font-medium ${
              phase === 'signed'
                ? 'text-emerald-500'
                : 'text-foreground'
            }`}
          >
            <Fingerprint className="h-4 w-4" strokeWidth={1.7} />
            <span>2. Biometric passkey confirm</span>
          </div>
        </div>

        {/* Animated Two-Tone Threshold Bar */}
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Requested Transfer
              </div>
              <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
                {formatPaiseToINR(animatedAmount)}
              </div>
            </div>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-amber-500">
              +{formatPaiseToINR(overagePaise)} over mandate
            </span>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="flex h-full w-full">
              <div
                className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: barMounted ? `${safePct}%` : '0%' }}
              />
              <div
                className="h-full bg-amber-500 transition-all duration-700 ease-out"
                style={{ width: barMounted ? `${overPct}%` : '0%' }}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>₹0</span>
            <span>Autonomous limit: {formatPaiseToINR(thresholdPaise)}</span>
            <span className="font-mono text-foreground">{formatPaiseToINR(amountPaise)}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
            <div>
              <span className="text-muted-foreground">Payee: </span>
              <span className="font-medium text-foreground">{payee}</span>
            </div>
            <div className="truncate" title={reason}>
              <span className="text-muted-foreground">Reason: </span>
              <span className="text-foreground">{reason}</span>
            </div>
          </div>
        </div>

        {/* Dual-Control Checkboxes */}
        <div className="mt-4 space-y-2.5">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-secondary/20 p-3 text-xs transition-colors hover:bg-secondary/40">
            <input
              type="checkbox"
              checked={checkedPayee}
              disabled={phase !== 'review'}
              onChange={(e) => setCheckedPayee(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-foreground">
              I verified payee <strong>{payee}</strong> matches the registered settlement beneficiary.
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-secondary/20 p-3 text-xs transition-colors hover:bg-secondary/40">
            <input
              type="checkbox"
              checked={checkedIntent}
              disabled={phase !== 'review'}
              onChange={(e) => setCheckedIntent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-foreground">
              I authorize a one-time signed Ed25519 permit for{' '}
              <strong className="font-mono">{formatPaiseToINR(amountPaise)}</strong>.
            </span>
          </label>
        </div>

        {/* Action Footer */}
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={phase !== 'review'}
            onClick={onClose}
            className="rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={`inline-flex min-w-[210px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              phase === 'signed'
                ? 'bg-emerald-600 text-white'
                : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40'
            }`}
          >
            {phase === 'review' && (
              <>
                <Fingerprint className="h-4 w-4" strokeWidth={1.6} />
                <span>Confirm with WebAuthn Passkey</span>
              </>
            )}
            {phase === 'verifying' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} />
                <span>Verifying passkey…</span>
              </>
            )}
            {phase === 'signed' && (
              <>
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.7} />
                <span>Signed permit issued</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
