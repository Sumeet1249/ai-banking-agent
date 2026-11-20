'use client'

import { useState } from 'react'
import {
  Fingerprint,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Clock,
  KeyRound,
  FileCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatPaiseToINR } from '@/lib/safe-format'
import { PasskeyStepUpModal } from './passkey-stepup-modal'

export interface PermitReceipt {
  receiptId: string
  permitNonce: string
  amountPaise: number
  payee: string
  verifiedAt: string
  authenticator: string
}

export interface StepupEscalationViewProps {
  onValidated?: () => void
}

export function StepupEscalationView({ onValidated }: StepupEscalationViewProps) {
  const [transferAmountRupees, setTransferAmountRupees] = useState<number>(18500)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  const [receipts, setReceipts] = useState<PermitReceipt[]>([
    {
      receiptId: 'RCPT_8801',
      permitNonce: '7c89e1a2-3f4b-4c5d-9e0f-1a2b3c4d5e6f',
      amountPaise: 485000,
      payee: 'National Grid Settlement Escrow',
      verifiedAt: '03:15:20 AM',
      authenticator: 'Touch ID / Windows Hello (FIDO2 L2)',
    },
  ])

  const thresholdPaise = 200000 // ₹2,000.00
  const currentPaise = transferAmountRupees * 100
  const isOverThreshold = currentPaise > thresholdPaise
  const overagePaise = Math.max(0, currentPaise - thresholdPaise)

  // Escalation zone derivation
  let zoneName = 'Autonomous Mandate'
  let zoneColor = 'text-emerald-500'
  let zoneBg = 'bg-emerald-500/10 border-emerald-500/30'
  if (transferAmountRupees > 10000) {
    zoneName = 'Dual-Admin Quorum + Passkey'
    zoneColor = 'text-purple-500'
    zoneBg = 'bg-purple-500/10 border-purple-500/30'
  } else if (transferAmountRupees > 2000) {
    zoneName = 'FIDO2 Passkey Step-Up (ASK)'
    zoneColor = 'text-amber-500'
    zoneBg = 'bg-amber-500/10 border-amber-500/30'
  }

  const handleApproved = () => {
    const newReceipt: PermitReceipt = {
      receiptId: `RCPT_${Date.now().toString().slice(-4)}`,
      permitNonce: `${Math.random().toString(36).substring(2, 10)}-${Math.random()
        .toString(36)
        .substring(2, 6)}`,
      amountPaise: currentPaise,
      payee: 'National Grid Settlement Escrow',
      verifiedAt: new Date().toLocaleTimeString(),
      authenticator: 'Touch ID / Windows Hello (FIDO2 L2)',
    }
    setReceipts((prev) => [newReceipt, ...prev])
    toast.success('Passkey Step-Up Verified', {
      description: `Signed Ed25519 permit issued for ${formatPaiseToINR(currentPaise)}.`,
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
              <Fingerprint className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground">
                  Human-in-the-Loop Escalation &amp; Passkeys (Key #4)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  FIDO2 LEVEL 2 WEBAUTHN
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  DUAL-CONTROL QUORUM
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                High-risk actions pause execution and issue a real-time cryptographic ASK decision,
                requiring customer biometric confirmation before permit release.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-muted-foreground">Approval Mode:</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-secondary text-foreground border border-border">
              Synchronous WebAuthn
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Responsive Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Escalation Ruler & Pending Escalation Card */}
        <div className="lg:col-span-7 space-y-5">
          {/* Interactive Tiered Escalation Ruler */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-indigo-500" />
                Tiered Escalation Threshold Ruler
              </span>
              <span className={cn('px-2 py-0.5 rounded font-mono text-[10.5px] font-bold border', zoneBg, zoneColor)}>
                {zoneName}
              </span>
            </div>

            {/* Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Simulate Transfer Amount:</span>
                <span className="font-mono font-bold text-foreground text-base">
                  {formatPaiseToINR(currentPaise)}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({currentPaise} paise)
                  </span>
                </span>
              </div>

              <input
                type="range"
                min="500"
                max="25000"
                step="500"
                value={transferAmountRupees}
                onChange={(e) => setTransferAmountRupees(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer"
              />

              {/* 3-Zone Color Track Legend */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-[10px] font-mono">
                <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-center">
                  ≤ ₹2,000 (Autonomous)
                </div>
                <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-center">
                  ₹2,001 - ₹10,000 (Passkey)
                </div>
                <div className="p-1.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 text-center">
                  &gt; ₹10,000 (Dual Admin)
                </div>
              </div>
            </div>
          </div>

          {/* Pending High-Risk Escalation Card */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Live Transaction Escalation Pending
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                STATUS: ACTION_PAUSED (ASK)
              </span>
            </div>

            <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Requested Disbursement:
                  </div>
                  <div className="mt-0.5 font-mono text-2xl font-bold text-foreground">
                    {formatPaiseToINR(currentPaise)}
                  </div>
                </div>

                {isOverThreshold ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-amber-500">
                    +{formatPaiseToINR(overagePaise)} over autonomous line
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-500">
                    Within autonomous line
                  </span>
                )}
              </div>

              {/* Progress Two-Tone Bar */}
              <div className="space-y-1">
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 transition-[width] duration-300"
                    style={{
                      width: `${Math.min(100, (thresholdPaise / Math.max(currentPaise, 1)) * 100)}%`,
                    }}
                  />
                  <div
                    className="h-full bg-amber-500 transition-[width] duration-300"
                    style={{
                      width: `${Math.max(
                        0,
                        100 - (thresholdPaise / Math.max(currentPaise, 1)) * 100
                      )}%`,
                    }}
                  />
                </div>

                <div className="flex justify-between text-[10.5px] text-muted-foreground font-mono">
                  <span>₹0</span>
                  <span>Autonomous limit: ₹2,000.00</span>
                  <span>{formatPaiseToINR(currentPaise)}</span>
                </div>
              </div>

              {/* Context Fields */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                <div>
                  <span className="text-muted-foreground">Initiating Agent:</span>{' '}
                  <strong className="text-foreground font-mono">AGENT_ELEC_01</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Beneficiary:</span>{' '}
                  <strong className="text-foreground">National Grid Settlement Escrow</strong>
                </div>
              </div>
            </div>

            {/* Launch CTA */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
            >
              <Fingerprint className="h-4 w-4" />
              <span>Launch WebAuthn Passkey Confirmation ({formatPaiseToINR(currentPaise)})</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right Column (5 cols): Hardware Passkey Authenticator & Signed Permit Receipt */}
        <div className="lg:col-span-5 space-y-5">
          {/* Registered Authenticator Card */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Hardware Biometric Authenticator
            </span>

            <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-500 shrink-0">
                  <Fingerprint className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">
                    Touch ID / Windows Hello Enclave
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    pk_cred_macbook_biometric_01
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground pt-1">
                <div className="flex justify-between">
                  <span>Enclave Attestation:</span>
                  <span className="font-mono text-foreground font-semibold">FIDO2 Level 2</span>
                </div>
                <div className="flex justify-between">
                  <span>Authorized Identity:</span>
                  <span className="font-mono text-foreground font-semibold">CUST_101</span>
                </div>
                <div className="flex justify-between">
                  <span>Signature Algorithm:</span>
                  <span className="font-mono text-foreground font-semibold">ES256 / Ed25519</span>
                </div>
              </div>
            </div>
          </div>

          {/* Signed Permit Receipt Log */}
          <div className="p-5 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Signed Permit Receipts
              </span>
              <span className="text-[10px] font-mono text-emerald-500">Notarized</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {receipts.map((rcpt) => (
                <div
                  key={rcpt.receiptId}
                  className="p-3 rounded-lg border border-border/70 bg-secondary/20 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between font-mono font-bold">
                    <span className="text-foreground">{rcpt.receiptId}</span>
                    <span className="text-emerald-500 tabular-nums">
                      {formatPaiseToINR(rcpt.amountPaise)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{rcpt.payee}</div>
                  <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span className="truncate max-w-[150px]">Nonce: {rcpt.permitNonce}</span>
                    <span>{rcpt.verifiedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3D Passkey Step-Up Modal */}
      <PasskeyStepUpModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        agentName="AGENT_ELEC_01"
        payee="National Grid Settlement Escrow"
        amountPaise={currentPaise}
        thresholdPaise={thresholdPaise}
        reason="Disbursement exceeds autonomous policy line"
        onApproved={handleApproved}
      />
    </div>
  )
}
