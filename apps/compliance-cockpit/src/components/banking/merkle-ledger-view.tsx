'use client'

import { useState } from 'react'
import {
  Binary,
  ShieldAlert,
  ShieldCheck,
  Link2,
  Link2Off,
  RotateCcw,
  CheckCircle2,
  Database,
  Eye,
  FileCode,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface LedgerBlock {
  height: number
  txId: string
  amount: string
  rawPaise: number
  tamperedPaise: number
  validHash: string
  corruptedHash: string
  prevHash: string
  payee: string
  timestamp: string
}

const BLOCKS: LedgerBlock[] = [
  {
    height: 1,
    txId: 'TX_9901',
    amount: '₹1,240.00',
    rawPaise: 124000,
    tamperedPaise: 9924000,
    validHash: 'a4f9c2e0b1d381e09c8d7e6f5a4b3c2d',
    corruptedHash: 'ff02e9dead00118833445566778899aa',
    prevHash: '00000000000000000000000000000000',
    payee: 'BESCOM',
    timestamp: '2026-11-20T14:02:11Z',
  },
  {
    height: 10,
    txId: 'TX_9910',
    amount: '₹890.00',
    rawPaise: 89000,
    tamperedPaise: 89000,
    validHash: '7b31d8c40a2f1e9b4a1d2f3e4b5c6d7e',
    corruptedHash: 'e19c04b3a1002299445566778899aabb',
    prevHash: 'a4f9c2e0b1d381e09c8d7e6f5a4b3c2d',
    payee: 'BWSSB_WATER',
    timestamp: '2026-11-20T14:08:44Z',
  },
  {
    height: 11,
    txId: 'TX_9911',
    amount: '₹1,950.00',
    rawPaise: 195000,
    tamperedPaise: 195000,
    validHash: 'c820f19d44a0b1c2d3e4f5a6b7c8d9e0',
    corruptedHash: '991a770c2f0033aa5566778899aabbcc',
    prevHash: '7b31d8c40a2f1e9b4a1d2f3e4b5c6d7e',
    payee: 'POWER_01',
    timestamp: '2026-11-20T14:15:32Z',
  },
  {
    height: 12,
    txId: 'TX_9912',
    amount: '₹420.00',
    rawPaise: 42000,
    tamperedPaise: 42000,
    validHash: '3e65a071bce0f1a2b3c4d5e6f7a8b9c0',
    corruptedHash: '004d2188ee0044bb66778899aabbccdd',
    prevHash: 'c820f19d44a0b1c2d3e4f5a6b7c8d9e0',
    payee: 'BESCOM',
    timestamp: '2026-11-20T14:22:05Z',
  },
]

export interface MerkleLedgerViewProps {
  onTamperToggle?: (tampered: boolean) => void
  onValidated?: () => void
}

export function MerkleLedgerView({ onTamperToggle, onValidated }: MerkleLedgerViewProps) {
  const [brokenCount, setBrokenCount] = useState<number>(0)
  const [animating, setAnimating] = useState<boolean>(false)
  const [selectedBlockHeight, setSelectedBlockHeight] = useState<number>(1)
  const [copiedWitnessSig, setCopiedWitnessSig] = useState<boolean>(false)

  const selectedBlock =
    BLOCKS.find((b) => b.height === selectedBlockHeight) || BLOCKS[0]

  const triggerTamper = () => {
    if (animating) return
    setAnimating(true)
    setBrokenCount(0)
    onTamperToggle?.(true)

    BLOCKS.forEach((_, idx) => {
      window.setTimeout(() => {
        setBrokenCount(idx + 1)
        if (idx === BLOCKS.length - 1) {
          setAnimating(false)
          toast.error('Witness Checkpoint Mismatch Detected', {
            description:
              'Row tamper in Block #1 invalidated downstream Merkle roots (#10, #11, #12).',
          })
          onValidated?.()
        }
      }, idx * 220)
    })
  }

  const triggerRepair = () => {
    if (animating) return
    setAnimating(true)
    onTamperToggle?.(false)

    for (let step = BLOCKS.length - 1; step >= 0; step--) {
      const delay = (BLOCKS.length - 1 - step) * 180
      window.setTimeout(() => {
        setBrokenCount(step)
        if (step === 0) {
          setAnimating(false)
          toast.success('Merkle Chain Recomputed & Verified', {
            description: 'All 4 ledger blocks match Witness :5000 Ed25519 root signature.',
          })
          onValidated?.()
        }
      }, delay)
    }
  }

  const isTampered = brokenCount > 0

  const witnessSig =
    'sig_ed25519_witness_5000_a4f9c2e0b1d381e09c8d7e6f5a4b3c2d_rfc6962'

  const handleCopySig = () => {
    navigator.clipboard?.writeText(witnessSig)
    setCopiedWitnessSig(true)
    toast.success('Witness Ed25519 signature copied')
    setTimeout(() => setCopiedWitnessSig(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500 shrink-0">
              <Binary className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-foreground">
                  Merkle Audit Ledger &amp; Witness Checkpoints (Key #5)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                  RFC 6962 SHA-256
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  WITNESS :5000 ATTESTED
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every debit produces an immutable cryptographic leaf. Modifying historical SQL rows
                breaks the Merkle root and alerts the independent Witness daemon (:5000) in real-time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={animating || isTampered}
              onClick={triggerTamper}
              className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40 shadow-sm active:scale-95"
            >
              Simulate Database Row Tamper
            </button>
            <button
              type="button"
              disabled={animating || !isTampered}
              onClick={triggerRepair}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors disabled:opacity-40 shadow-sm active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />
              Repair &amp; Recompute
            </button>
          </div>
        </div>

        {/* Witness Checkpoint Status Banner */}
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs transition-colors',
            isTampered
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {isTampered ? (
              <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            )}
            <span>
              {isTampered
                ? `TAMPER ALERT: ${brokenCount}/${BLOCKS.length} blocks diverge from Witness :5000 checkpoint`
                : 'CHAIN INTEGRITY VERIFIED: Local SHA-256 root matches Witness :5000 checkpoint'}
            </span>
          </div>
          <span className="font-mono text-[11px] font-semibold opacity-90">
            {isTampered ? 'ROOT_MISMATCH' : 'ED25519_VALID'}
          </span>
        </div>
      </div>

      {/* 4-Block Domino Chain with SVG Hash Connectors */}
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        {BLOCKS.map((block, idx) => {
          const broken = idx < brokenCount
          const nextBroken = idx + 1 < brokenCount
          const isSelected = selectedBlockHeight === block.height

          return (
            <div key={block.height} className="contents">
              <div
                onClick={() => setSelectedBlockHeight(block.height)}
                className={cn(
                  'rounded-xl border p-4 transition-all duration-300 cursor-pointer text-xs space-y-2 select-none relative',
                  broken
                    ? 'border-rose-500/50 bg-rose-500/10 shadow-md'
                    : isSelected
                    ? 'border-cyan-500/60 bg-secondary/70 ring-1 ring-cyan-500/30 shadow-md'
                    : 'border-border bg-card hover:bg-secondary/40 shadow-sm'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-foreground">
                    Block #{block.height}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-mono text-[10px] font-bold border',
                      broken
                        ? 'bg-rose-500/20 text-rose-500 border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
                    )}
                  >
                    {broken ? 'HASH INVALID' : 'VERIFIED'}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry:</span>
                    <span className="font-mono font-medium text-foreground">{block.txId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount:</span>
                    <span
                      className={cn(
                        'font-mono font-bold tabular-nums',
                        broken && idx === 0 ? 'text-rose-500 underline' : 'text-foreground'
                      )}
                    >
                      {broken && idx === 0 ? '₹99,240.00' : block.amount}
                    </span>
                  </div>
                  <div className="mt-2 rounded border border-border bg-background/80 px-2 py-1 font-mono text-[10.5px] text-muted-foreground truncate">
                    sha256: {broken ? block.corruptedHash.slice(0, 16) : block.validHash.slice(0, 16)}…
                  </div>
                </div>

                <div className="text-[10px] text-cyan-500 flex items-center justify-between pt-1">
                  <span>Click to inspect forensic record</span>
                  <Eye className="h-3 w-3" />
                </div>
              </div>

              {/* Connector */}
              {idx < BLOCKS.length - 1 && (
                <div className="hidden items-center justify-center lg:flex px-1 select-none">
                  {nextBroken ? (
                    <div className="flex flex-col items-center gap-1 text-rose-500">
                      <Link2Off className="h-4 w-4 animate-pulse" strokeWidth={1.8} />
                      <span className="text-[9px] font-mono font-bold">BROKEN</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-emerald-500">
                      <Link2 className="h-4 w-4" strokeWidth={1.8} />
                      <span className="text-[9px] font-mono font-bold">VALID</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lower Panel: Live Forensic SQL Diff & Witness Proof Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (6 cols): Local Database Row Forensic Inspector */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-indigo-500" />
              Local Database Row Forensic Inspector (Block #{selectedBlock.height})
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">SQLite / Postgres</span>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <div className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs space-y-1.5 border border-slate-800">
              <div>
                <span className="text-slate-500">tx_id:</span> &quot;{selectedBlock.txId}&quot;
              </div>
              <div>
                <span className="text-slate-500">block_height:</span> {selectedBlock.height}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">amount_paise:</span>
                {isTampered && selectedBlock.height === 1 ? (
                  <span className="bg-rose-950/80 text-rose-400 px-1 rounded font-bold border border-rose-800">
                    9924000 (₹99,240.00) [MODIFIED BY ATTACKER]
                  </span>
                ) : (
                  <span className="text-emerald-400">
                    {selectedBlock.rawPaise} ({selectedBlock.amount})
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-500">beneficiary:</span> &quot;{selectedBlock.payee}&quot;
              </div>
              <div>
                <span className="text-slate-500">prev_hash:</span> &quot;{selectedBlock.prevHash}&quot;
              </div>
              <div>
                <span className="text-slate-500">leaf_hash:</span> &quot;
                <span
                  className={
                    isTampered && selectedBlock.height <= brokenCount
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }
                >
                  {isTampered && selectedBlock.height <= brokenCount
                    ? selectedBlock.corruptedHash
                    : selectedBlock.validHash}
                </span>
                &quot;
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              {isTampered && selectedBlock.height === 1 ? (
                <span className="text-rose-500 font-medium">
                  Notice: SQL row #1 was manually tampered in database table. Because SHA-256 leaf hash is derived from row fields, leaf hash immediately diverges.
                </span>
              ) : (
                <span>
                  Row fields match computed SHA-256 leaf. No unauthorized database alterations detected.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right (6 cols): Independent Witness :5000 Proof Inspector */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-cyan-500" />
              Independent Witness :5000 Proof Inspector
            </span>
            <span className="text-[10px] font-mono text-cyan-500">Remote Checkpoint</span>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Local Computed Merkle Root:</span>
                  <span
                    className={cn(
                      'font-mono font-bold',
                      isTampered ? 'text-rose-500' : 'text-emerald-500'
                    )}
                  >
                    {isTampered ? 'ff02e9dead00118833...' : 'a4f9c2e0b1d381e09c...'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Witness :5000 Signed Checkpoint:</span>
                  <span className="font-mono font-bold text-foreground">
                    a4f9c2e0b1d381e09c...
                  </span>
                </div>
              </div>

              {/* Byte comparison status */}
              <div
                className={cn(
                  'p-2.5 rounded-lg border flex items-center justify-between text-xs font-mono font-bold',
                  isTampered
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                )}
              >
                <span>BYTE-BY-BYTE VERIFICATION:</span>
                <span>{isTampered ? 'DIVERGENT (ROOT_MISMATCH)' : 'MATCH (RFC 6962)'}</span>
              </div>

              {/* Witness Ed25519 signature */}
              <div className="p-2.5 rounded-lg border border-border bg-background space-y-1">
                <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                  <span>Witness Ed25519 Checkpoint Signature:</span>
                  <button
                    type="button"
                    onClick={handleCopySig}
                    className="inline-flex items-center gap-1 text-cyan-500 hover:text-cyan-400"
                  >
                    {copiedWitnessSig ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-[10px] text-foreground truncate select-all">
                  {witnessSig}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
