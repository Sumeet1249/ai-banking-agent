'use client'

import React, { useRef, useState } from 'react'
import {
  Zap,
  Droplets,
  Wifi,
  Cloud,
  Building2,
  ShieldCheck,
  Bot,
  KeyRound,
  Copy,
  Check,
  LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  AgentPurposeId,
  PURPOSE_CATALOG,
  PurposeCatalogEntry,
} from '@/lib/biller-catalog'
import {
  formatInr,
  computeMandateRiskPosture,
  AgentMandateConfig,
} from '@/lib/agent-mandates'

const PURPOSE_ICONS: Record<PurposeCatalogEntry['iconKey'], LucideIcon> = {
  Zap,
  Droplets,
  Wifi,
  Cloud,
  Building2,
  ShieldCheck,
  Bot,
}

export interface AgentMandateCardProps {
  agentName: string
  agentId: string
  mandate: AgentMandateConfig
  environments?: string[]
  status?: string
  className?: string
  compact?: boolean
}

export function AgentMandateCard({
  agentName,
  agentId,
  mandate,
  environments = ['dev', 'prod'],
  status = 'active',
  className,
  compact = false,
}: AgentMandateCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 })
  const [copied, setCopied] = useState(false)

  const activePurpose = PURPOSE_CATALOG[mandate.purpose] || PURPOSE_CATALOG.general_ops
  const riskPosture = computeMandateRiskPosture(mandate)
  const IconComponent = PURPOSE_ICONS[activePurpose.iconKey] || Bot

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rx = ((y - centerY) / centerY) * -9
    const ry = ((x - centerX) / centerX) * 9
    const mx = (x / rect.width) * 100
    const my = (y / rect.height) * 100
    setTilt({ rx, ry, mx, my })
  }

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50 })
  }

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(agentId)
      setCopied(true)
      toast.success('Agent ID copied', { description: agentId })
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className={cn(
        'relative rounded-2xl border border-border bg-gradient-to-br from-card via-card/95 to-secondary/50 shadow-xl select-none overflow-hidden',
        compact ? 'p-4 space-y-3' : 'p-5 space-y-4',
        className
      )}
    >
      {/* Dynamic Specular Radial Highlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-45 transition-opacity"
        style={{
          background: `radial-gradient(circle 220px at ${tilt.mx}% ${tilt.my}%, hsl(var(--brand) / 0.22), transparent 70%)`,
        }}
      />

      {/* Decorative Micro-Mesh Watermark */}
      <div className="pointer-events-none absolute -bottom-6 -right-6 text-foreground/[0.03]">
        <IconComponent className="w-36 h-36" strokeWidth={0.8} />
      </div>

      <div className="relative z-10 space-y-3.5">
        {/* Header: Purpose Badge, Agent Name & Slug, Status & Envs */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-500 shrink-0 shadow-sm">
              <IconComponent className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-foreground leading-tight truncate">
                {agentName || 'Unnamed Agent'}
              </h4>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-[10.5px] text-muted-foreground truncate max-w-[170px]">
                  {agentId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  title="Copy Agent ID"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-500" strokeWidth={1.8} />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={1.6} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-mono font-bold border tracking-wider uppercase',
                riskPosture === 'Low Risk'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  : riskPosture === 'Balanced'
                  ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
              )}
            >
              {riskPosture}
            </span>
            <div className="flex gap-1">
              {environments.slice(0, 2).map((env) => (
                <span
                  key={env}
                  className="px-1.5 py-0.2 rounded font-mono text-[9px] uppercase font-semibold bg-secondary/80 text-foreground border border-border"
                >
                  {env}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Financial Limits Strip */}
        <div className="p-3 rounded-xl border border-border/80 bg-background/80 space-y-1.5 backdrop-blur-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Daily Allowance:</span>
            <span className="font-mono font-bold text-foreground tabular-nums">
              {formatInr(mandate.dailyLimitInr)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Passkey Step-Up Line:</span>
            <span className="font-mono font-bold text-amber-500 tabular-nums">
              {formatInr(mandate.stepUpThresholdInr)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
            <span className="text-muted-foreground">Monthly Cap:</span>
            <span className="font-mono font-bold text-indigo-500 tabular-nums">
              {formatInr(mandate.maxMonthlyLimitInr)}
            </span>
          </div>
        </div>

        {/* Allowlisted Payees Chips */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10.5px]">
            <span className="uppercase font-semibold text-muted-foreground tracking-wider">
              Beneficiaries ({mandate.approvedPayees.length}):
            </span>
            <span className="font-mono text-muted-foreground text-[10px]">
              {mandate.whitelistMode === 'strict' ? 'Strict Whitelist' : 'Step-up unlisted'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {mandate.approvedPayees.length > 0 ? (
              mandate.approvedPayees.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-foreground border border-border truncate max-w-[130px]"
                >
                  {p}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground italic">
                None allowlisted (open scope)
              </span>
            )}
            {mandate.approvedPayees.length > 3 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary text-muted-foreground border border-border">
                +{mandate.approvedPayees.length - 3}
              </span>
            )}
          </div>
        </div>

        {/* Footer: Mandate ID & Auth Mode */}
        <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-muted-foreground border-t border-border/40">
          <span className="flex items-center gap-1">
            <KeyRound className="h-3 w-3 text-indigo-500" strokeWidth={1.6} />
            {mandate.mandateId || 'MND_PROVISIONED'}
          </span>
          <span className="uppercase tracking-wider">
            {mandate.authMode === 'ed25519_permit' ? 'Ed25519 Permit' : 'Bearer Token'}
          </span>
        </div>
      </div>
    </div>
  )
}
