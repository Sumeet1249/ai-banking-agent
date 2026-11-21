'use client'

/**
 * TierGate — SaaS Tier gating component.
 * Allows Pro / Enterprise access, and prompts upgrade for Free tier.
 */

import React, { type ReactNode } from 'react'
import { Shield, Sparkles, ArrowRight, Lock } from 'lucide-react'
import { useSaasPlan, openSaasPlanModal } from '@/lib/saas-plans'
import { hasTier, type Tier } from '@/hooks/useLicenseTier'

interface Props {
  requires: Exclude<Tier, 'free'>
  feature?: string
  description?: string
  mode?: 'block' | 'disable'
  children: ReactNode
}

export function TierGate({ requires, feature, description, mode = 'block', children }: Props) {
  const { subscription } = useSaasPlan()
  const isUnlocked = hasTier(subscription.tier, requires)

  if (isUnlocked) {
    return <>{children}</>
  }

  if (mode === 'disable') {
    return (
      <div className="relative group">
        <div className="opacity-40 pointer-events-none filter blur-[1px]">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4 bg-background/50 backdrop-blur-xs">
          <button
            type="button"
            onClick={() => openSaasPlanModal(requires === 'enterprise' ? 'ultra' : 'pro')}
            className="px-3.5 py-1.5 rounded-lg border border-primary/40 bg-card text-foreground text-xs font-semibold shadow-md flex items-center gap-1.5 hover:bg-muted transition"
          >
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span>Unlock {feature || 'Feature'} with {requires.toUpperCase()} Plan</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-4 my-4 max-w-lg mx-auto shadow-lg">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
        <Shield className="h-6 w-6" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-foreground">
          {feature || 'Advanced Security Capability'} Requires {requires.toUpperCase()}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description ||
            `This capability requires an active ${requires.toUpperCase()} license. Upgrade your plan to unlock unlimited multi-agent enforcement, 3D topologies, and cryptographic witness audits.`}
        </p>
      </div>
      <div className="pt-2">
        <button
          type="button"
          onClick={() => openSaasPlanModal(requires === 'enterprise' ? 'ultra' : 'pro')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md hover:bg-primary/90 transition active:scale-95"
        >
          <Sparkles className="h-4 w-4" />
          <span>View Pro &amp; Ultra Plans</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
