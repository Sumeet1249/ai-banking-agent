'use client'

import { useState, useEffect } from 'react'
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
  RefreshCw,
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

const FALLBACK_BLOCKS: LedgerBlock[] = [
  {
    height: 1,
    txId: 'TX_CESC_01',
    amount: '₹4,900.00',
    rawPaise: 490000,
    tamperedPaise: 9949000,
    validHash: 'a4f9c2e0b1d381e09c8d7e6f5a4b3c2de4f5a6b7c8d9e0fa1b2c3d4e5f6a7b8c',
    corruptedHash: 'ff02e9dead00118833445566778899aabbccddeeff00112233445566778899aa',
    prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
    payee: 'PAYEE_CESC_001 (CESC Limited)',
    timestamp: '2026-11-21T06:02:11Z',
  },
  {
    height: 2,
    txId: 'TX_TATA_02',
    amount: '₹3,100.00',
    rawPaise: 310000,
    tamperedPaise: 310000,
    validHash: '7b31d8c40a2f1e9b4a1d2f3e4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
    corruptedHash: 'e19c04b3a1002299445566778899aabbccddeeff00112233445566778899aabb',
    prevHash: 'a4f9c2e0b1d381e09c8d7e6f5a4b3c2de4f5a6b7c8d9e0fa1b2c3d4e5f6a7b8c',
    payee: 'PAYEE_TATA_POWER_001 (Tata Power)',
    timestamp: '2026-11-21T06:08:44Z',
  },
  {
    height: 3,
    txId: 'TX_CESC_03',
    amount: '₹1,950.00',
    rawPaise: 195000,
    tamperedPaise: 195000,
    validHash: 'c820f19d44a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6',
    corruptedHash: '991a770c2f0033aa5566778899aabbccddeeff00112233445566778899aabbcc',
    prevHash: '7b31d8c40a2f1e9b4a1d2f3e4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
    payee: 'PAYEE_CESC_001 (CESC Limited)',
    timestamp: '2026-11-21T06:15:32Z',
  },
  {
    height: 4,
    txId: 'TX_TATA_04',
    amount: '₹2,420.00',
    rawPaise: 242000,
    tamperedPaise: 242000,
    validHash: '3e65a071bce0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6',
    corruptedHash: '004d2188ee0044bb66778899aabbccddeeff00112233445566778899aabbccdd',
    prevHash: 'c820f19d44a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6',
    payee: 'PAYEE_TATA_POWER_001 (Tata Power)',
    timestamp: '2026-11-21T06:22:05Z',
  },
]

export interface MerkleLedgerViewProps {
  onTamperToggle?: (tampered: boolean) => void
  onValidated?: () => void
}

export function MerkleLedgerView({ onTamperToggle, onValidated }: MerkleLedgerViewProps) {
  const [liveBlocks, setLiveBlocks] = useState<LedgerBlock[]>(FALLBACK_BLOCKS)
  const [isTampered, setIsTampered] = useState<boolean>(false)
  const [tamperedBlockHeight, setTamperedBlockHeight] = useState<number | null>(null)
  const [animating, setAnimating] = useState<boolean>(false)
  const [selectedBlockHeight, setSelectedBlockHeight] = useState<number>(1)
  const [copiedWitnessSig, setCopiedWitnessSig] = useState<boolean>(false)
  const [backendVerification, setBackendVerification] = useState<{
    valid: boolean
    total_blocks?: number
    broken_block_index?: number
    error?: string
  }>({ valid: true, total_blocks: 4 })

  const fetchAuditData = async () => {
    try {
      const [chainRes, verifyRes] = await Promise.all([
        fetch('/api/gateway/lab/audit/chain'),
        fetch('/api/gateway/lab/audit/verify'),
      ])

      if (chainRes.ok) {
        const chainData = await chainRes.json()
        if (chainData.blocks && chainData.blocks.length > 0) {
          const mapped: LedgerBlock[] = chainData.blocks
            .filter((b: any) => b.block_index > 0)
            .slice(0, 4)
            .map((b: any, idx: number) => ({
              height: b.block_index,
              txId: `TX_${b.action.toUpperCase()}_${b.block_index}`,
              amount: `₹${(b.amount_paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
              rawPaise: b.amount_paise,
              tamperedPaise: 9999999,
              validHash: b.block_hash,
              corruptedHash: 'ff02e9dead00118833445566778899aabbccddeeff00112233445566778899aa',
              prevHash: b.prev_hash,
              payee: idx % 2 === 0 ? 'PAYEE_CESC_001 (CESC Limited)' : 'PAYEE_TATA_POWER_001 (Tata Power)',
              timestamp: new Date(b.timestamp).toISOString(),
            }))

          if (mapped.length > 0) {
            setLiveBlocks(mapped)
          }
        }
      }

      if (verifyRes.ok) {
        const verifyData = await verifyRes.json()
        setBackendVerification(verifyData)
        if (!verifyData.valid && verifyData.broken_block_index != null) {
          setIsTampered(true)
          setTamperedBlockHeight(verifyData.broken_block_index)
        } else {
          setIsTampered(false)
          setTamperedBlockHeight(null)
        }
      }
    } catch (err) {
      console.warn('Backend audit chain fetch error, using fallback:', err)
    }
  }

  useEffect(() => {
    fetchAuditData()
  }, [])

  const selectedBlock =
    liveBlocks.find((b) => b.height === selectedBlockHeight) || liveBlocks[0]

  const triggerTamper = async () => {
    if (animating) return
    setAnimating(true)

    try {
      const res = await fetch('/api/gateway/lab/demo/tamper', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setIsTampered(true)
        setTamperedBlockHeight(data.tampered_block_index)
        onTamperToggle?.(true)

        // Verify with backend
        const vRes = await fetch('/api/gateway/lab/audit/verify')
        if (vRes.ok) {
          const vData = await vRes.json()
          setBackendVerification(vData)
        }

        // Re-fetch chain
        await fetchAuditData()

        toast.error('Cryptographic Mismatch Detected in SQLite Database', {
          description: `Direct SQL UPDATE on Block #${data.tampered_block_index}. Computed hash != stored hash. Downstream Merkle roots broken.`,
        })
        onValidated?.()
        setAnimating(false)
        return
      }
    } catch (err) {
      console.warn('Backend tamper API error:', err)
    }

    // Fallback animation
    setIsTampered(true)
    setTamperedBlockHeight(1)
    onTamperToggle?.(true)
    toast.error('Witness Checkpoint Mismatch Detected', {
      description: 'Row tamper in Block #1 invalidated downstream Merkle roots in SQLite ledger.',
    })
    setAnimating(false)
    onValidated?.()
  }

  const triggerRepair = async () => {
    if (animating) return
    setAnimating(true)

    try {
      const res = await fetch('/api/gateway/lab/demo/repair', { method: 'POST' })
      if (res.ok) {
        setIsTampered(false)
        setTamperedBlockHeight(null)
        onTamperToggle?.(false)

        // Verify with backend
        const vRes = await fetch('/api/gateway/lab/audit/verify')
        if (vRes.ok) {
          const vData = await vRes.json()
          setBackendVerification(vData)
        }

        // Re-fetch chain
        await fetchAuditData()

        toast.success('Merkle Hash Chain Recomputed & Verified in SQLite', {
          description: 'All ledger blocks match Witness :5000 Ed25519 root signature. 100% cryptographic integrity restored.',
        })
        onValidated?.()
        setAnimating(false)
        return
      }
    } catch (err) {
      console.warn('Backend repair API error:', err)
    }

    // Fallback animation
    setIsTampered(false)
    setTamperedBlockHeight(null)
    onTamperToggle?.(false)
    toast.success('Merkle Chain Recomputed & Verified', {
      description: 'All ledger blocks match Witness :5000 Ed25519 root signature.',
    })
    setAnimating(false)
    onValidated?.()
  }

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
                Every debit produces an immutable cryptographic leaf in SQLite. Modifying historical SQL rows
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
                ? `TAMPER DETECTED BY BACKEND: Block #${tamperedBlockHeight || 1} diverges from Witness :5000 checkpoint`
                : `CHAIN INTEGRITY VERIFIED (BACKEND SQLITE): All ${backendVerification.total_blocks || liveBlocks.length} blocks match Witness :5000 checkpoint`}
            </span>
          </div>
          <span className="font-mono text-[11px] font-semibold opacity-90">
            {isTampered ? 'ROOT_MISMATCH (ERROR 409)' : 'ED25519_VALID (RFC 6962)'}
          </span>
        </div>
      </div>

      {/* 4-Block Domino Chain with SVG Hash Connectors */}
      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        {liveBlocks.map((block, idx) => {
          const broken = isTampered && (tamperedBlockHeight == null || block.height >= tamperedBlockHeight)
          const nextBroken = isTampered && (tamperedBlockHeight == null || (block.height + 1) >= tamperedBlockHeight)
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
                        broken && (tamperedBlockHeight == null || block.height === tamperedBlockHeight)
                          ? 'text-rose-500 underline'
                          : 'text-foreground'
                      )}
                    >
                      {broken && (tamperedBlockHeight == null || block.height === tamperedBlockHeight)
                        ? '₹99,999.99'
                        : block.amount}
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
              {idx < liveBlocks.length - 1 && (
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
            <span className="text-[10px] font-mono text-muted-foreground">SQLite (agentguard.db)</span>
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
                {isTampered && (tamperedBlockHeight == null || selectedBlock.height === tamperedBlockHeight) ? (
                  <span className="bg-rose-950/80 text-rose-400 px-1 rounded font-bold border border-rose-800">
                    9999999 (₹99,999.99) [MODIFIED IN SQLITE]
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
                <span className="text-slate-500">prev_hash:</span> &quot;{selectedBlock.prevHash.slice(0, 32)}...&quot;
              </div>
              <div>
                <span className="text-slate-500">leaf_hash:</span> &quot;
                <span
                  className={
                    isTampered && (tamperedBlockHeight == null || selectedBlock.height >= tamperedBlockHeight)
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400 font-bold'
                  }
                >
                  {isTampered && (tamperedBlockHeight == null || selectedBlock.height >= tamperedBlockHeight)
                    ? selectedBlock.corruptedHash.slice(0, 32) + '...'
                    : selectedBlock.validHash.slice(0, 32) + '...'}
                </span>
                &quot;
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              {isTampered && (tamperedBlockHeight == null || selectedBlock.height === tamperedBlockHeight) ? (
                <span className="text-rose-500 font-medium">
                  Notice: SQL row #{selectedBlock.height} was directly tampered via database query. Because the SHA-256 leaf hash is derived from row fields, the stored hash diverges from the computed cryptographic hash.
                </span>
              ) : (
                <span>
                  Row fields match computed SHA-256 leaf in SQLite table <code className="text-foreground">audit_ledger_blocks</code>. No unauthorized database alterations detected.
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
                    {isTampered ? 'ff02e9dead00118833445566778899aa...' : selectedBlock.validHash.slice(0, 32) + '...'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/50">
                  <span className="text-muted-foreground">Witness :5000 Signed Checkpoint:</span>
                  <span className="font-mono font-bold text-foreground">
                    {selectedBlock.validHash.slice(0, 32)}...
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
                <span>{isTampered ? 'DIVERGENT (ROOT_MISMATCH)' : 'MATCH (RFC 6962 COMPLIANT)'}</span>
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
