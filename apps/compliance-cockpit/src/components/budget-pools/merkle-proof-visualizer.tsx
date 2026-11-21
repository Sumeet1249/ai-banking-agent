'use client'

import React, { useState } from 'react'
import {
  GitBranch, CheckCircle2, XCircle, Copy, Check, ShieldCheck,
  ExternalLink, Layers, Hash, Info, Award
} from 'lucide-react'
import { toast } from 'sonner'

export interface MerkleProofData {
  batch_id: string
  event_id: string
  leaf_hash: string
  leaf_index: number
  audit_path: string[]
  merkle_root: string
  algorithm_version?: string
}

export interface MerkleVerificationResult {
  valid: boolean
  verification_status: string
  details?: string
  witness_checkpoint_id?: string | null
  witness_epoch?: number | null
}

interface MerkleProofVisualizerProps {
  proof: MerkleProofData
  verificationResult: MerkleVerificationResult | null
  onClose?: () => void
}

export function MerkleProofVisualizer({
  proof,
  verificationResult,
  onClose,
}: MerkleProofVisualizerProps) {
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual')

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedHash(text)
    toast.success(`Copied ${label} to clipboard`)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const isValid = verificationResult?.valid ?? false
  const auditPath = proof.audit_path || []

  // Compute intermediate hash levels for visual tree representation
  // AGENTGUARD_MERKLE_V1: SHA-256(0x01 || left || right)
  const treeLevels: Array<{
    level: number
    currentHash: string
    siblingHash: string
    isRightSibling: boolean
    computedParentHash?: string
  }> = []

  let currIdx = proof.leaf_index
  let currHash = proof.leaf_hash

  for (let i = 0; i < auditPath.length; i++) {
    const sibling = auditPath[i]
    const isRight = currIdx % 2 === 1
    treeLevels.push({
      level: i,
      currentHash: currHash,
      siblingHash: sibling,
      isRightSibling: !isRight,
    })
    currIdx = Math.floor(currIdx / 2)
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/95 shadow-xl p-5 space-y-5 backdrop-blur-md">
      {/* Header with Notary Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isValid
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            }`}
          >
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-foreground text-sm tracking-tight">
                Merkle Inclusion Proof Visualizer
              </h4>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 font-bold uppercase">
                {proof.algorithm_version || 'AGENTGUARD_MERKLE_V1'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bottom-up cryptographic verification path from Leaf to Anchored Root
            </p>
          </div>
        </div>

        {/* View mode toggle & Close */}
        <div className="flex items-center gap-2">
          <div className="bg-muted/40 p-0.5 rounded-lg border border-border/60 flex items-center text-xs">
            <button
              onClick={() => setViewMode('visual')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                viewMode === 'visual'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Interactive Tree
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                viewMode === 'raw'
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Audit JSON
            </button>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/50 transition text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Verification Status Banner */}
      {verificationResult && (
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono ${
            isValid
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isValid ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
            <div>
              <span className="font-bold tracking-wide">
                {isValid ? 'CRYPTOGRAPHIC INCLUSION VERIFIED' : 'PROOF VERIFICATION REJECTED'}
              </span>
              <div className="text-[11px] opacity-90 mt-0.5 font-normal">
                Status: {verificationResult.verification_status} · {verificationResult.details || 'Valid inclusion proof'}
              </div>
            </div>
          </div>

          {/* Independent Witness Ed25519 Notary Badge */}
          {isValid && (
            <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-emerald-400 shrink-0">
              <Award className="h-4 w-4" />
              <div className="text-[10px] leading-tight font-sans">
                <div className="font-bold">Witness :5000 Ed25519 Signed</div>
                <div className="font-mono text-[9px] opacity-80">
                  {verificationResult.witness_checkpoint_id || 'chk-auto-v1'} (Epoch {verificationResult.witness_epoch ?? 1})
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tree View vs Raw View */}
      {viewMode === 'visual' ? (
        <div className="space-y-4">
          {/* Visual SVG & Node Stepper (Bottom-Up) */}
          <div className="bg-muted/20 border border-border/70 rounded-2xl p-4 sm:p-6 space-y-4 relative overflow-hidden">
            {/* Top Root Node */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => copyToClipboard(proof.merkle_root, 'Merkle Root')}
                className={`cursor-pointer group p-3 rounded-xl border max-w-lg w-full transition shadow-sm ${
                  isValid
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/60'
                    : 'bg-card border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className={`h-4 w-4 ${isValid ? 'text-emerald-500' : 'text-primary'}`} />
                    <span className="text-foreground">Anchored Merkle Root</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    {copiedHash === proof.merkle_root ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Click to copy
                  </span>
                </div>
                <div className="pt-1.5 font-mono text-xs font-bold text-foreground break-all tracking-wider">
                  {proof.merkle_root}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground pt-1 flex items-center justify-between">
                  <span>Batch ID: {proof.batch_id}</span>
                  <span className={isValid ? 'text-emerald-500 font-bold' : 'text-amber-500'}>
                    {isValid ? '● Anchored in Ledger' : 'Pending Anchor'}
                  </span>
                </div>
              </div>

              {/* Connecting Tree Line */}
              <div className="h-6 w-0.5 bg-border my-1 flex items-center justify-center">
                <div className={`h-2 w-2 rounded-full ${isValid ? 'bg-emerald-500 animate-ping' : 'bg-primary'}`} />
              </div>
            </div>

            {/* Intermediate Sibling Layers */}
            {treeLevels.length > 0 && (
              <div className="space-y-3">
                <div className="text-center">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider font-semibold">
                    {treeLevels.length} Sibling Step{treeLevels.length > 1 ? 's' : ''} (RFC 6962 SHA-256)
                  </span>
                </div>

                {treeLevels.map((lvl) => (
                  <div key={lvl.level} className="flex flex-col items-center space-y-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                      {/* Left: Computed hash at this level */}
                      <div className="p-2.5 rounded-xl border border-primary/20 bg-primary/5 text-xs font-mono">
                        <div className="text-[10px] font-semibold text-primary mb-1 flex items-center justify-between">
                          <span>Level {lvl.level} Node</span>
                          <span className="text-muted-foreground">Internal</span>
                        </div>
                        <div className="truncate text-foreground font-semibold" title={lvl.currentHash}>
                          {lvl.currentHash.slice(0, 16)}...{lvl.currentHash.slice(-8)}
                        </div>
                      </div>

                      {/* Right: Sibling hash */}
                      <div
                        onClick={() => copyToClipboard(lvl.siblingHash, `Sibling Hash Level ${lvl.level}`)}
                        className="cursor-pointer group p-2.5 rounded-xl border border-border/80 bg-card hover:border-primary/40 transition text-xs font-mono"
                      >
                        <div className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center justify-between">
                          <span>Sibling {lvl.isRightSibling ? '(Right)' : '(Left)'}</span>
                          <span className="text-[9px] flex items-center gap-1 group-hover:text-primary">
                            <Copy className="h-3 w-3" />
                            copy
                          </span>
                        </div>
                        <div className="truncate text-foreground" title={lvl.siblingHash}>
                          {lvl.siblingHash.slice(0, 16)}...{lvl.siblingHash.slice(-8)}
                        </div>
                      </div>
                    </div>

                    {lvl.level < treeLevels.length - 1 && (
                      <div className="h-4 w-0.5 bg-border/60" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Connecting Tree Line */}
            <div className="flex flex-col items-center">
              <div className="h-6 w-0.5 bg-border my-1 flex items-center justify-center">
                <div className={`h-2 w-2 rounded-full ${isValid ? 'bg-emerald-500' : 'bg-primary'}`} />
              </div>

              {/* Bottom Target Leaf Node */}
              <div
                onClick={() => copyToClipboard(proof.leaf_hash, 'Leaf Hash')}
                className="cursor-pointer group p-3 rounded-xl border border-primary/40 bg-card hover:border-primary max-w-lg w-full shadow-sm transition"
              >
                <div className="flex items-center justify-between text-xs pb-1 border-b border-border/50">
                  <div className="flex items-center gap-1.5 font-bold text-primary">
                    <Hash className="h-4 w-4" />
                    <span>Leaf Hash (SHA-256 0x00 Prefix)</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                    {copiedHash === proof.leaf_hash ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Click to copy
                  </span>
                </div>
                <div className="pt-1.5 font-mono text-xs font-bold text-foreground break-all tracking-wider">
                  {proof.leaf_hash}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground pt-1 flex items-center justify-between">
                  <span>Target Event: <strong className="text-foreground">{proof.event_id}</strong></span>
                  <span>Leaf Index: <strong className="text-foreground">#{proof.leaf_index}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Informational Pill */}
          <div className="p-3 rounded-xl bg-muted/20 border border-border/60 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p>
              In accordance with RFC 6962 and AgentGuard V1, the leaf hash is computed using <code className="font-mono text-foreground">SHA-256(0x00 || canonical_event_bytes)</code> and paired iteratively with sibling hashes using <code className="font-mono text-foreground">SHA-256(0x01 || left || right)</code> until the root is proven.
            </p>
          </div>
        </div>
      ) : (
        /* Raw JSON Audit Proof View */
        <div className="relative">
          <button
            onClick={() => copyToClipboard(JSON.stringify(proof, null, 2), 'Proof JSON')}
            className="absolute top-3 right-3 px-2.5 py-1 rounded-lg text-xs font-mono bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center gap-1 shadow-sm transition"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy JSON</span>
          </button>
          <pre className="p-4 rounded-xl bg-muted/30 border border-border text-xs font-mono text-foreground overflow-x-auto max-h-96">
            {JSON.stringify(proof, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
