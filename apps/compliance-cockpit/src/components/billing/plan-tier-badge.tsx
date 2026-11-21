'use client'

import React from 'react'
import { Clock, Zap, Crown, ShieldCheck, ChevronRight, ArrowUpRight } from 'lucide-react'
import { useSaasPlan, openSaasPlanModal, PlanId } from '@/lib/saas-plans'
import { cn } from '@/lib/utils'

interface PlanTierBadgeProps {
  variant: 'statusBar' | 'sidebar'
  collapsed?: boolean
  className?: string
}

export function PlanTierBadge({ variant, collapsed = false, className }: PlanTierBadgeProps) {
  const { subscription } = useSaasPlan()
  const { planId, planName, term, shortSign, daysRemaining } = subscription

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    openSaasPlanModal(planId)
  }

  // ── VARIANT 1: STATUS BAR PILL (Clickable, Replaces Static Text) ───────────
  if (variant === 'statusBar') {
    if (planId === 'free') {
      return (
        <button
          type="button"
          onClick={handleClick}
          title="Active Plan: Free (7-Day Trial) · Click to manage or upgrade plan"
          className={cn(
            'group hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-[background-color,border-color,transform] duration-150 hover:scale-[1.02] active:scale-[0.98]',
            'border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20 hover:border-slate-400/60 shadow-sm',
            className
          )}
        >
          <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors" strokeWidth={1.6} />
          <span>{shortSign}</span>
          <span className="opacity-60 text-[10px] font-mono tabular-nums">({daysRemaining}d left)</span>
          <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover:text-slate-200 group-hover:translate-x-0.5 -ml-0.5 transition-transform" />
        </button>
      )
    }

    if (planId === 'pro') {
      return (
        <button
          type="button"
          onClick={handleClick}
          title="Active Plan: Pro (3 Months) · Click to manage or upgrade plan"
          className={cn(
            'group hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-[background-color,border-color,transform] duration-150 hover:scale-[1.02] active:scale-[0.98]',
            'border-blue-500/45 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 hover:border-blue-400/70 shadow-sm shadow-blue-500/10',
            className
          )}
        >
          <Zap className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-200 transition-colors" strokeWidth={1.8} />
          <span>{shortSign}</span>
          <span className="opacity-65 text-[10px] font-mono tabular-nums">({daysRemaining}d left)</span>
          <ArrowUpRight className="w-3 h-3 text-blue-400 group-hover:text-blue-200 group-hover:translate-x-0.5 -ml-0.5 transition-transform" />
        </button>
      )
    }

    // Default: Ultra (1 Year) Sovereign Tier
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Active Plan: Ultra Sovereign Tier (1 Year) · Click to view plan details"
        className={cn(
          'group relative hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-[background-color,border-color,transform,box-shadow] duration-150 hover:scale-[1.02] active:scale-[0.98] overflow-hidden',
          'border-amber-400/45 bg-gradient-to-r from-emerald-500/15 via-amber-500/12 to-emerald-500/15 text-amber-300 hover:border-amber-400/70 hover:shadow-md hover:shadow-amber-500/10',
          className
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <Crown className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-200 transition-colors shrink-0" strokeWidth={1.8} />
        <span className="tracking-tight">{shortSign}</span>
        <span className="opacity-70 text-[10px] font-mono tabular-nums">({daysRemaining}d left)</span>
        <ArrowUpRight className="w-3 h-3 text-amber-400 group-hover:text-amber-200 group-hover:translate-x-0.5 -ml-0.5 transition-transform shrink-0" />
      </button>
    )
  }

  // ── VARIANT 2: SIDEBAR FOOTER CARD (Placed above AccountWidget) ───────────

  // Collapsed Sidebar View (64px width)
  if (collapsed) {
    const isUltra = planId === 'ultra'
    const isPro = planId === 'pro'

    return (
      <div className="relative group flex justify-center w-full py-1">
        <button
          type="button"
          onClick={handleClick}
          title={`${planName} (${term}) · ${daysRemaining} days remaining · Click to manage`}
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 border',
            isUltra
              ? 'border-amber-400/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-400/70'
              : isPro
              ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-400/70'
              : 'border-slate-500/35 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20'
          )}
        >
          {isUltra ? (
            <Crown className="w-4 h-4" strokeWidth={1.8} />
          ) : isPro ? (
            <Zap className="w-4 h-4" strokeWidth={1.8} />
          ) : (
            <Clock className="w-4 h-4" strokeWidth={1.6} />
          )}
        </button>

        {/* Collapsed Hover Flyout Tooltip */}
        <div className="pointer-events-none absolute left-full ml-2.5 hidden group-hover:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[hsl(var(--card))] text-foreground text-xs font-medium border border-border shadow-xl z-50 whitespace-nowrap">
          <span className="font-semibold">{planName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{daysRemaining}d left</span>
          <span className="text-[10px] text-primary font-bold">MANAGE</span>
        </div>
      </div>
    )
  }

  // Expanded Sidebar View (272px width)
  const isUltra = planId === 'ultra'
  const isPro = planId === 'pro'

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e as any) } }}
      className={cn(
        'group relative w-full rounded-xl border p-2.5 transition-all duration-150 cursor-pointer select-none text-left',
        'hover:shadow-md hover:scale-[1.01] active:scale-[0.99]',
        isUltra
          ? 'border-amber-400/35 bg-gradient-to-r from-emerald-500/10 via-amber-500/8 to-emerald-500/10 hover:border-amber-400/60'
          : isPro
          ? 'border-blue-500/35 bg-blue-500/10 hover:border-blue-400/60'
          : 'border-slate-500/30 bg-slate-500/10 hover:border-slate-400/50',
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border shadow-sm',
            isUltra
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              : isPro
              ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
              : 'bg-slate-500/20 border-slate-400/35 text-slate-300'
          )}
        >
          {isUltra ? (
            <Crown className="w-4 h-4" strokeWidth={1.8} />
          ) : isPro ? (
            <Zap className="w-4 h-4" strokeWidth={1.8} />
          ) : (
            <Clock className="w-4 h-4" strokeWidth={1.6} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground truncate">{planName} · {term}</span>
            {isUltra && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                ACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <span className="font-mono tabular-nums text-foreground/80 font-medium">{daysRemaining} days remaining</span>
          </div>
        </div>

        <div className="flex items-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider hidden group-hover:inline mr-1">
            {isUltra ? 'Manage' : 'Upgrade'}
          </span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  )
}
