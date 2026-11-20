'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck, Link2, Link2Off, RotateCcw, AlertTriangle } from 'lucide-react'

interface LedgerBlock {
  height: number
  txId: string
  amount: string
  validHash: string
  corruptedHash: string
}

const BLOCKS: LedgerBlock[] = [
  { height: 1, txId: 'TX_9901', amount: '₹1,240.00', validHash: 'a4f9c2…81e0', corruptedHash: 'ff02e9…dead' },
  { height: 10, txId: 'TX_9910', amount: '₹890.00', validHash: '7b31d8…40a2', corruptedHash: 'e19c04…b3a1' },
  { height: 11, txId: 'TX_9911', amount: '₹1,950.00', validHash: 'c820f1…9d44', corruptedHash: '991a77…0c2f' },
  { height: 12, txId: 'TX_9912', amount: '₹420.00', validHash: '3e65a0…71bc', corruptedHash: '004d21…88ee' },
]

export interface MerkleChainVisualizerProps {
  onTamperToggle?: (tampered: boolean) => void
}

export function MerkleChainVisualizer({ onTamperToggle }: MerkleChainVisualizerProps = {}) {
  // Tracks how many blocks from index 0 are currently broken (for sequential domino cascade)
  const [brokenCount, setBrokenCount] = useState(0)
  const [animating, setAnimating] = useState(false)

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
            description: 'Row tamper in Block #1 invalidated downstream Merkle roots (#10, #11, #12).',
          })
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
        }
      }, delay)
    }
  }

  const isTampered = brokenCount > 0

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>Merkle Audit Ledger &amp; Witness Checkpoints</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              RFC 6962 SHA-256
            </span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Modifying any historical SQL row breaks every downstream SHA-256 hash link immediately.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={animating || isTampered}
            onClick={triggerTamper}
            className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 shadow-sm"
          >
            Simulate Database Row Tamper
          </button>
          <button
            type="button"
            disabled={animating || !isTampered}
            onClick={triggerRepair}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40 shadow-sm"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.6} />
            Repair &amp; Recompute
          </button>
        </div>
      </div>

      {/* Witness Verification Banner */}
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs transition-colors ${
          isTampered
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
        }`}
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

      {/* Linked 4-Block Chain with Connectors */}
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        {BLOCKS.map((block, idx) => {
          const broken = idx < brokenCount
          const nextBroken = idx + 1 < brokenCount

          return (
            <div key={block.height} className="contents">
              <div
                className={`rounded-xl border p-3.5 transition-all duration-300 ${
                  broken
                    ? 'border-rose-500/40 bg-rose-500/10 shadow-sm'
                    : 'border-border bg-secondary/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    Block #{block.height}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      broken
                        ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                    }`}
                  >
                    {broken ? 'HASH INVALID' : 'VERIFIED'}
                  </span>
                </div>

                <div className="mt-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry</span>
                    <span className="font-mono font-medium text-foreground">{block.txId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {broken && idx === 0 ? '₹99,240.00' : block.amount}
                    </span>
                  </div>
                  <div className="mt-2 rounded border border-border bg-background/80 px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
                    sha256: {broken ? block.corruptedHash : block.validHash}
                  </div>
                </div>
              </div>

              {idx < BLOCKS.length - 1 && (
                <div className="hidden items-center justify-center lg:flex px-1">
                  {nextBroken ? (
                    <div className="flex flex-col items-center gap-1 text-rose-500">
                      <Link2Off className="h-4 w-4" strokeWidth={1.8} />
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
    </section>
  )
}
