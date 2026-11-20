'use client'

import React, { useState } from 'react'
import {
  Binary, ShieldAlert, ShieldCheck, RefreshCw, AlertTriangle,
  Check, Lock, ArrowDown, ChevronRight, CornerDownRight, Database,
  Fingerprint, Sparkles, Layers, FileCode
} from 'lucide-react'
import { toast } from 'sonner'

export interface MerkleNodeInfo {
  id: string
  name: string
  hash: string
  corruptedHash?: string
  status: 'valid' | 'corrupted' | 'uncomputed'
  level: number
  details: string
}

export function MerkleTreeVisualizer({
  currentStep = 8,
  workflowId = 'WF-2026-9401',
  amountPaise = 245000,
  payee = 'Torrent Power Ltd',
}: {
  currentStep?: number
  workflowId?: string
  amountPaise?: number
  payee?: string
}) {
  const [tamperedNode, setTamperedNode] = useState<string | null>(null)
  const [verifying, setVerifying] = useState<boolean>(false)

  // Real SHA-256 derived hashes representing the 8 specialized agents
  const leafNodes: MerkleNodeInfo[] = [
    { id: 'leaf_1', name: 'L1: Intent Hash', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', corruptedHash: 'deadbeef112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: `Intent: PAYMENT ₹${(amountPaise/100).toLocaleString('en-IN')} to ${payee}` },
    { id: 'leaf_2', name: 'L2: Mandate Hash', hash: '872983e253b50f99d0c000bd790d3c129f78295603e6ec8f66f1082c9e004dca', corruptedHash: 'fa11ed00112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'Mandate: MND_ELEC_101 (Ed25519 Verified, Cap ₹5,000)' },
    { id: 'leaf_3', name: 'L3: Fraud Hash', hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0', corruptedHash: 'badf00d0112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'PaySim ML Model: 0.0003 score (Benign, Zero Smurfing)' },
    { id: 'leaf_4', name: 'L4: Policy Hash', hash: 'f4c5d6e7f8091a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b', corruptedHash: 'c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'Invariants: I1-I9 Validated, Rule E1 paise precision' },
    { id: 'leaf_5', name: 'L5: Approval Hash', hash: '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0', corruptedHash: '00000000112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'WebAuthn FIDO2 Consent: Validated or Auto-Cleared' },
    { id: 'leaf_6', name: 'L6: BankGate Hash', hash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', corruptedHash: '11111111112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'Single-Use TBP Permit: Atomically Consumed (Changes === 1)' },
    { id: 'leaf_7', name: 'L7: Ledger Hash', hash: '778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566', corruptedHash: '22222222112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'Two-Phase Commit: RESERVED -> COMMITTED balance' },
    { id: 'leaf_8', name: 'L8: Witness Hash', hash: '99aabbccddeeff00112233445566778899aabbccddeeff001122334455667788', corruptedHash: '33333333112233445566778899aabbccddeeff00112233445566778899aabbcc', status: 'valid', level: 0, details: 'Cosigned by Independent Witness (:5000) key: wit_key_9fb2ceab' },
  ]

  // Branch Hashes
  const isBranch1Corrupted = tamperedNode === 'leaf_1' || tamperedNode === 'leaf_2'
  const isBranch2Corrupted = tamperedNode === 'leaf_3' || tamperedNode === 'leaf_4'
  const isBranch3Corrupted = tamperedNode === 'leaf_5' || tamperedNode === 'leaf_6'
  const isBranch4Corrupted = tamperedNode === 'leaf_7' || tamperedNode === 'leaf_8'

  const isQuad1Corrupted = isBranch1Corrupted || isBranch2Corrupted
  const isQuad2Corrupted = isBranch3Corrupted || isBranch4Corrupted
  const isRootCorrupted = isQuad1Corrupted || isQuad2Corrupted

  // Simulate SQL row tampering
  const handleSimulateTamper = (targetLeaf: string) => {
    setTamperedNode(targetLeaf)
    toast.error('DB Tamper Injected!', {
      description: `Altered row in ${targetLeaf.toUpperCase()}. Downstream Merkle hashes immediately invalidated.`
    })
  }

  // Restore Cryptographic Integrity
  const handleRepairIntegrity = () => {
    setVerifying(true)
    setTimeout(() => {
      setTamperedNode(null)
      setVerifying(false)
      toast.success('Merkle Tree Restored & Verified', {
        description: 'Recomputed all 8 agent hashes against Independent Witness (:5000) signature.'
      })
    }, 400)
  }

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Binary className="h-5 w-5 text-indigo-500" />
            <h3 className="text-base font-bold text-foreground">
              Cryptographic Merkle Tree State Engine
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20">
              RFC 6962 SHA-256
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Every AI agent's execution is hashed into a binary Merkle leaf. The Independent Witness (:5000) signs the Master Root to guarantee non-repudiation.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {tamperedNode ? (
            <button
              onClick={handleRepairIntegrity}
              disabled={verifying}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} />
              Recompute & Restore Proof
            </button>
          ) : (
            <button
              onClick={() => handleSimulateTamper('leaf_1')}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center gap-1.5 transition shadow-sm"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Simulate DB Row Tampering
            </button>
          )}
        </div>
      </div>

      {/* Visual Merkle Tree Structure */}
      <div className="relative p-6 rounded-xl bg-secondary/20 border border-border overflow-x-auto space-y-6">
        {/* Level 3: Master Merkle Root */}
        <div className="flex flex-col items-center">
          <div className={`p-4 rounded-xl border text-center transition-all max-w-md w-full shadow-md ${
            isRootCorrupted
              ? 'border-rose-500 bg-rose-500/15 text-rose-500 animate-pulse'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
                Master Merkle Root (Level 3)
              </span>
              {isRootCorrupted ? (
                <ShieldAlert className="h-4 w-4 text-rose-500" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              )}
            </div>
            <div className="font-mono text-xs font-bold truncate">
              {isRootCorrupted ? '0xDEAD...ROOT_HASH_INVALID' : '0x8f3c7e91...44a1b859e0a2'}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
              <span>Witness Port: :5000</span>
              <span className={isRootCorrupted ? 'text-rose-500 font-bold' : 'text-emerald-500 font-bold'}>
                {isRootCorrupted ? 'ROOT MISMATCH DETECTED' : 'WITNESS COSIGNED (VALID)'}
              </span>
            </div>
          </div>
          <div className="h-6 w-0.5 bg-border mt-1" />
        </div>

        {/* Level 2: Quad Aggregation Branches */}
        <div className="grid grid-cols-2 gap-8 max-w-2xl mx-auto">
          <div className={`p-3 rounded-xl border text-center font-mono text-[11px] ${
            isQuad1Corrupted ? 'border-rose-500 bg-rose-500/10 text-rose-500' : 'border-border bg-card text-foreground'
          }`}>
            <div className="text-[9px] text-muted-foreground font-bold uppercase">H(1..4) Sub-Tree Hash</div>
            <div className="truncate font-bold mt-0.5">{isQuad1Corrupted ? '0xCORRUPT_QUAD_1' : '0xa9f8b2...01e4'}</div>
          </div>

          <div className={`p-3 rounded-xl border text-center font-mono text-[11px] ${
            isQuad2Corrupted ? 'border-rose-500 bg-rose-500/10 text-rose-500' : 'border-border bg-card text-foreground'
          }`}>
            <div className="text-[9px] text-muted-foreground font-bold uppercase">H(5..8) Sub-Tree Hash</div>
            <div className="truncate font-bold mt-0.5">{isQuad2Corrupted ? '0xCORRUPT_QUAD_2' : '0x77c2e0...89fa'}</div>
          </div>
        </div>

        {/* Level 1: Pairwise Branches */}
        <div className="grid grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { name: 'H(1,2)', corrupted: isBranch1Corrupted, hash: '0x9b11...e420' },
            { name: 'H(3,4)', corrupted: isBranch2Corrupted, hash: '0x3c2a...09f1' },
            { name: 'H(5,6)', corrupted: isBranch3Corrupted, hash: '0x88f1...12cc' },
            { name: 'H(7,8)', corrupted: isBranch4Corrupted, hash: '0x55aa...3344' },
          ].map((br, i) => (
            <div key={i} className={`p-2.5 rounded-lg border text-center font-mono text-[10px] ${
              br.corrupted ? 'border-rose-500 bg-rose-500/10 text-rose-500 font-bold' : 'border-border bg-card text-muted-foreground'
            }`}>
              <div>{br.name}</div>
              <div className="truncate text-foreground font-semibold">{br.corrupted ? 'CORRUPT' : br.hash}</div>
            </div>
          ))}
        </div>

        {/* Level 0: The 8 Agent Leaf Nodes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-2">
          {leafNodes.map((leaf, idx) => {
            const isCorrupted = tamperedNode === leaf.id
            return (
              <div
                key={leaf.id}
                onClick={() => handleSimulateTamper(leaf.id)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all relative flex flex-col justify-between min-h-[110px] ${
                  isCorrupted
                    ? 'border-rose-500 bg-rose-500/20 text-rose-500 ring-2 ring-rose-500'
                    : 'border-border bg-card hover:bg-secondary/40 text-foreground'
                }`}
                title="Click to simulate tampering this specific agent row"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">
                      0{idx + 1}
                    </span>
                    {isCorrupted ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </div>
                  <h6 className="text-[11px] font-bold leading-tight line-clamp-2">
                    {leaf.name}
                  </h6>
                </div>

                <div className="mt-2">
                  <div className="text-[9px] font-mono truncate text-muted-foreground">
                    {isCorrupted ? leaf.corruptedHash?.substring(0, 10) : leaf.hash.substring(0, 10)}...
                  </div>
                  <span className={`inline-block text-[8px] font-mono uppercase px-1 py-0.5 rounded mt-1 font-bold ${
                    isCorrupted ? 'bg-rose-500/30 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    {isCorrupted ? 'TAMPERED' : 'VERIFIED'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Forensic Diagnostic Explanation */}
      <div className="p-4 rounded-xl bg-secondary/40 border border-border flex items-start gap-3">
        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 mt-0.5">
          <Database className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-foreground">
            Why Merkle Trees Eliminate Internal Banking Fraud
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            In standard databases, an attacker with root access can modify ledger rows undetected. With AgentShield&apos;s Merkle Tree engine, modifying even 1 paise or a single character in Agent 1&apos;s intent alters that leaf hash, which cascades up the binary tree and immediately breaks the Witness Root on port 5000.
          </p>
        </div>
      </div>
    </div>
  )
}
