'use client'

import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Copy,
  Check,
  RefreshCw,
  Lock,
  Binary,
  Cpu,
  ArrowRight,
  Server,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface NonceRecord {
  id: string
  nonce: string
  agentId: string
  timestamp: string
  status: 'CONSUMED' | 'REPLAY_BLOCKED'
  permitSummary: string
}

export interface IdentityReplayViewProps {
  onValidated?: () => void
}

export function IdentityReplayView({ onValidated }: IdentityReplayViewProps) {
  const [keyVersion, setKeyVersion] = useState<'v1' | 'v2'>('v1')
  const [copiedKey, setCopiedKey] = useState(false)
  const [graceSeconds, setGraceSeconds] = useState(180)
  const [isRotating, setIsRotating] = useState(false)

  // Permit and Nonce State
  const [currentPermit, setCurrentPermit] = useState<{
    permitId: string
    nonce: string
    agentId: string
    payee: string
    amountPaise: number
    issuedAt: string
    signatureHex: string
    status: 'ACTIVE' | 'CONSUMED' | 'REPLAYED'
  } | null>(null)

  const [replayError, setReplayError] = useState<{
    errorCode: string
    message: string
    timestamp: string
    nonce: string
  } | null>(null)

  const [nonceLedger, setNonceLedger] = useState<NonceRecord[]>([
    {
      id: 'REC_901',
      nonce: 'b94e7c11-9a2f-48d3-82a1-ef4021ab7901',
      agentId: 'AGENT_ELEC_01',
      timestamp: '03:22:10 AM',
      status: 'CONSUMED',
      permitSummary: '₹1,240.00 → BESCOM',
    },
    {
      id: 'REC_902',
      nonce: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      agentId: 'AGENT_WATER_01',
      timestamp: '03:25:44 AM',
      status: 'CONSUMED',
      permitSummary: '₹890.00 → BWSSB_WATER',
    },
  ])

  // Countdown for grace window
  useEffect(() => {
    const timer = setInterval(() => {
      setGraceSeconds((prev) => (prev > 1 ? prev - 1 : 180))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const publicKeyHex =
    keyVersion === 'v1'
      ? '0x7f4c9a8b3d2e1f0a5c8e9b4a1d2f3e4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f'
      : '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b'

  const handleCopyKey = () => {
    navigator.clipboard?.writeText(publicKeyHex)
    setCopiedKey(true)
    toast.success('Public Key Hex copied to clipboard', {
      description: 'Ed25519 Curve25519 public key hash.',
    })
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleRotateKey = () => {
    setIsRotating(true)
    setTimeout(() => {
      const nextVer = keyVersion === 'v1' ? 'v2' : 'v1'
      setKeyVersion(nextVer)
      setGraceSeconds(180)
      setIsRotating(false)
      toast.success(`Keyring Rotated to key_gw_ed25519_2026_${nextVer}`, {
        description: 'Zero-downtime key rollover. Prior key active for 180s grace period.',
      })
      onValidated?.()
    }, 600)
  }

  const handleMintPermit = () => {
    // Generate UUIDv4-like string
    const freshNonce = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })

    const permitId = `PRM_${Date.now().toString().slice(-6)}`
    const nowStr = new Date().toLocaleTimeString()

    const permit = {
      permitId,
      nonce: freshNonce,
      agentId: 'AGENT_ELEC_01',
      payee: 'BESCOM',
      amountPaise: 490000,
      issuedAt: nowStr,
      signatureHex: `0x${Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`,
      status: 'CONSUMED' as const,
    }

    setCurrentPermit(permit)
    setReplayError(null)

    // Append to live ledger
    setNonceLedger((prev) => [
      {
        id: `REC_${Date.now().toString().slice(-3)}`,
        nonce: freshNonce,
        agentId: 'AGENT_ELEC_01',
        timestamp: nowStr,
        status: 'CONSUMED',
        permitSummary: '₹4,900.00 → BESCOM',
      },
      ...prev.slice(0, 5),
    ])

    toast.success(`Signed Permit ${permitId} Consumed Atomically`, {
      description: `Bank Gate :4000 verified Ed25519 signature & burned nonce ${freshNonce.slice(
        0,
        8
      )}...`,
    })
    onValidated?.()
  }

  const handleReplayPermit = () => {
    if (!currentPermit) {
      toast.error('Mint a permit first before testing replay attack')
      return
    }

    const nowStr = new Date().toLocaleTimeString()

    // Simulate 409 Conflict rejection
    setReplayError({
      errorCode: '409 CONFLICT · NONCE_ALREADY_CONSUMED',
      message: `Bank Gate :4000 rejected permit ${currentPermit.permitId}. Nonce "${currentPermit.nonce}" already burned in atomic index at ${currentPermit.issuedAt}.`,
      timestamp: nowStr,
      nonce: currentPermit.nonce,
    })

    setNonceLedger((prev) => [
      {
        id: `REC_${Date.now().toString().slice(-3)}`,
        nonce: currentPermit.nonce,
        agentId: 'AGENT_ELEC_01',
        timestamp: nowStr,
        status: 'REPLAY_BLOCKED',
        permitSummary: 'REPLAY REJECTED · ₹4,900.00',
      },
      ...prev.slice(0, 5),
    ])

    toast.error('Replay Attack Neutralized (409 Conflict)', {
      description: `Duplicate permit submission halted. Nonce already consumed.`,
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
              <Key className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground">
                  Agent Identity &amp; Anti-Replay Engine (Key #2)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  Ed25519 ASYMMETRIC
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  SINGLE-USE NONCE
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every AI transaction requires an ephemeral cryptographic permit signed with Ed25519
                and burned with atomic single-use nonce consumption.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-muted-foreground">Replay Protection:</span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              0ms Window · Strict Air-Gap
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Responsive Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Active Keyring & Live Replay Simulator */}
        <div className="lg:col-span-7 space-y-5">
          {/* Active Keyring Card */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Active Cryptographic Keyring
                </span>
              </div>
              <button
                type="button"
                onClick={handleRotateKey}
                disabled={isRotating}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-border bg-secondary hover:bg-secondary/80 text-foreground flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', isRotating && 'animate-spin')}
                  strokeWidth={1.8}
                />
                <span>Rotate Signing Key</span>
              </button>
            </div>

            <div className="p-4 rounded-xl border border-border bg-secondary/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Key Identifier:</div>
                  <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                    key_gw_ed25519_2026_{keyVersion}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  IN_SERVICE
                </span>
              </div>

              {/* Public Key Display & Copy */}
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>Ed25519 Public Key:</span>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-500 hover:text-indigo-400"
                  >
                    {copiedKey ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Hex</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-2 rounded bg-background border border-border/80 font-mono text-[11px] text-foreground truncate select-all">
                  {publicKeyHex}
                </div>
              </div>

              {/* Grace Period Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">Rotation Grace Window:</span>
                  <span className="text-foreground font-semibold">{graceSeconds}s remaining</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-[width] duration-1000 rounded-full"
                    style={{ width: `${(graceSeconds / 180) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Permit Sign & Replay Tester */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Atomic Nonce Replay Simulator
              </span>
              <span className="text-[10px] font-mono text-indigo-500">Bank Gate :4000 Air-Gap</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Test how AgentShield prevents duplicate execution. Step 1 mints and executes a valid permit;
              Step 2 attempts to replay the exact same permit payload.
            </p>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleMintPermit}
                className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
              >
                <Zap className="h-4 w-4" />
                <span>Issue Signed Permit (UUIDv4)</span>
              </button>

              <button
                type="button"
                onClick={handleReplayPermit}
                disabled={!currentPermit}
                className="py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-40"
              >
                <ShieldAlert className="h-4 w-4" />
                <span>Replay Same Nonce</span>
              </button>
            </div>

            {/* Replay 409 Conflict Rejection Card */}
            {replayError && (
              <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 space-y-2 text-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between font-mono font-bold">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" strokeWidth={1.8} />
                    <span>{replayError.errorCode}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-rose-500/30">
                    BANK GATE AIR-GAP
                  </span>
                </div>

                <div className="text-[11.5px] leading-relaxed text-foreground font-medium">
                  {replayError.message}
                </div>

                <div className="pt-1.5 border-t border-rose-500/20 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span className="truncate max-w-[280px]">Burned Nonce: {replayError.nonce}</span>
                  <span>Intercepted at {replayError.timestamp}</span>
                </div>
              </div>
            )}

            {/* Current Active Permit JSON Preview */}
            {currentPermit && !replayError && (
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2 text-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" strokeWidth={1.8} />
                    <span>200 OK · NONCE CONSUMED AT BANK GATE :4000</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/30">
                    ATOMIC BURNT
                  </span>
                </div>

                <div className="bg-background/80 rounded-lg p-2.5 font-mono text-[10.5px] text-foreground space-y-1 border border-border">
                  <div>
                    <span className="text-muted-foreground">permit_id:</span> &quot;{currentPermit.permitId}&quot;
                  </div>
                  <div>
                    <span className="text-muted-foreground">single_use_nonce:</span> &quot;{currentPermit.nonce}&quot;
                  </div>
                  <div>
                    <span className="text-muted-foreground">beneficiary:</span> &quot;{currentPermit.payee}&quot; ·{' '}
                    <span className="text-muted-foreground">amount:</span> ₹4,900.00 (490000 paise)
                  </div>
                  <div className="truncate text-muted-foreground">
                    <span>signature:</span> {currentPermit.signatureHex}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Cryptographic Invariants & Live Nonce Ledger */}
        <div className="lg:col-span-5 space-y-5">
          {/* 3-Tier Cryptographic Invariant Stack */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cryptographic Invariant Stack
            </span>

            <div className="space-y-2.5">
              <div className="p-3 rounded-lg border border-border bg-secondary/30 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Binary className="h-3.5 w-3.5 text-indigo-500" />
                    Anti-Replay Nonce Store
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    ACTIVE
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Atomic SQLite/Postgres unique constraint burns nonce in 0ms duplicate window.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-secondary/30 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-cyan-500" />
                    Bank Gate :4000 Air-Gap
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                    ISOLATED
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Core Bank Ledger never communicates with AI agents directly; only verified permits accepted.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-secondary/30 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-amber-500" />
                    HSM / KMS Enclave Ready
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    FIPS 140-2 L3
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hardware-backed security module isolation for master banking signing key pairs.
                </p>
              </div>
            </div>
          </div>

          {/* Live Nonce Audit Table */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Nonce Consumption Log
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">Live Sync</span>
            </div>

            <div className="space-y-2">
              {nonceLedger.map((record) => (
                <div
                  key={record.id}
                  className="p-2.5 rounded-lg border border-border/70 bg-secondary/20 flex items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground truncate text-[11px]">
                        {record.nonce.slice(0, 18)}…
                      </span>
                      <span className="text-[9px] text-muted-foreground">[{record.timestamp}]</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {record.agentId} · {record.permitSummary}
                    </div>
                  </div>

                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[9.5px] font-bold shrink-0 border',
                      record.status === 'CONSUMED'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    )}
                  >
                    {record.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
