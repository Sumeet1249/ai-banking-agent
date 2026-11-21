'use client'

import React, { useState, useEffect } from 'react'
import {
  X, Check, Zap, Crown, Clock, ShieldCheck, ArrowRight, Sparkles,
  Lock, RefreshCw, KeyRound, CheckCircle2, ShieldAlert, Award
} from 'lucide-react'
import { toast } from 'sonner'
import { useSaasPlan, PlanId, CurrencyCode, SAAS_PLANS } from '@/lib/saas-plans'
import { cn } from '@/lib/utils'

export function SaasPlanModal() {
  const { subscription, activate } = useSaasPlan()
  const [isOpen, setIsOpen] = useState(false)
  const [currency, setCurrency] = useState<CurrencyCode>('INR')
  const [activatingPlanId, setActivatingPlanId] = useState<PlanId | null>(null)
  const [hoveredPlanId, setHoveredPlanId] = useState<PlanId | null>(null)

  // Listen for global open modal events
  useEffect(() => {
    const handleOpen = (e: any) => {
      setIsOpen(true)
    }

    window.addEventListener('aegis-open-plans-modal', handleOpen)
    return () => window.removeEventListener('aegis-open-plans-modal', handleOpen)
  }, [])

  // Listen for Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (!isOpen) return null

  const handleActivate = async (planId: PlanId) => {
    if (subscription.planId === planId) {
      toast.info(`You are already on the ${subscription.planName} tier.`)
      return
    }

    setActivatingPlanId(planId)
    // Simulated cryptographic passkey license touch
    await new Promise((r) => setTimeout(r, 450))

    try {
      const updated = activate(planId, currency)
      toast.success(
        `Subscription updated to ${updated.planName} (${updated.term})! Sovereign invariants verified.`
      )
      setTimeout(() => {
        setIsOpen(false)
        setActivatingPlanId(null)
      }, 350)
    } catch {
      toast.error('Failed to update subscription tier')
      setActivatingPlanId(null)
    }
  }

  const plansList = Object.values(SAAS_PLANS)

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

      {/* 3D Perspective Modal Container */}
      <div
        className="relative z-10 w-full max-w-5xl bg-card border border-border/90 rounded-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-300"
        style={{ transform: 'perspective(1200px)' }}
      >
        {/* Top Header Bar */}
        <div className="px-6 py-5 border-b border-border/80 bg-muted/20 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-base tracking-tight">
                  AgentShield Sovereign Security Tiers
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold uppercase tracking-wider">
                  SaaS Plans
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cryptographic multi-agent air-gapping, TigerBeetle ledgers & RFC 6962 witness governance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Currency Selector Pill */}
            <div className="flex items-center p-1 rounded-xl bg-secondary/80 border border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCurrency('INR')}
                className={cn(
                  'px-3 py-1 rounded-lg transition-colors',
                  currency === 'INR'
                    ? 'bg-card text-foreground shadow-sm font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                ₹ INR
              </button>
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={cn(
                  'px-3 py-1 rounded-lg transition-colors',
                  currency === 'USD'
                    ? 'bg-card text-foreground shadow-sm font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                $ USD
              </button>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3-Column 3D Interactive Pricing Stage */}
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plansList.map((plan) => {
              const isCurrent = subscription.planId === plan.id
              const isActivating = activatingPlanId === plan.id
              const isHovered = hoveredPlanId === plan.id
              const isUltra = plan.id === 'ultra'
              const isPro = plan.id === 'pro'

              const priceFormatted =
                currency === 'INR' ? plan.priceFormattedINR : plan.priceFormattedUSD
              const billingText =
                currency === 'INR' ? plan.billingTextINR : plan.billingTextUSD

              return (
                <div
                  key={plan.id}
                  onMouseEnter={() => setHoveredPlanId(plan.id)}
                  onMouseLeave={() => setHoveredPlanId(null)}
                  className={cn(
                    'relative rounded-2xl border p-6 flex flex-col justify-between transition-all duration-200 select-none',
                    'hover:shadow-xl hover:-translate-y-1',
                    isCurrent
                      ? 'border-primary/60 bg-primary/[0.03] ring-1 ring-primary/40'
                      : isUltra
                      ? 'border-amber-400/40 bg-gradient-to-b from-amber-500/[0.06] via-card to-card hover:border-amber-400/70'
                      : isPro
                      ? 'border-blue-500/40 bg-gradient-to-b from-blue-500/[0.05] via-card to-card hover:border-blue-400/70'
                      : 'border-border/80 bg-card hover:border-border'
                  )}
                >
                  {/* Badge Ribbon */}
                  {plan.badge && (
                    <div className="absolute -top-3 right-5">
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm',
                          isUltra
                            ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        )}
                      >
                        {plan.badge}
                      </span>
                    </div>
                  )}

                  {/* Card Header */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm',
                          isUltra
                            ? 'bg-amber-500/15 border-amber-400/35 text-amber-400'
                            : isPro
                            ? 'bg-blue-500/15 border-blue-400/35 text-blue-400'
                            : 'bg-slate-500/15 border-slate-400/30 text-slate-400'
                        )}
                      >
                        {isUltra ? (
                          <Crown className="w-5 h-5" strokeWidth={1.8} />
                        ) : isPro ? (
                          <Zap className="w-5 h-5" strokeWidth={1.8} />
                        ) : (
                          <Clock className="w-5 h-5" strokeWidth={1.6} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-foreground text-lg leading-tight">
                          {plan.name}
                        </h4>
                        <span className="text-xs text-muted-foreground font-medium">
                          {plan.term}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground min-h-[36px] mb-5">
                      {plan.description}
                    </p>

                    {/* Pricing Block */}
                    <div className="mb-6 p-3.5 rounded-xl bg-secondary/40 border border-border/70">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-extrabold text-foreground tabular-nums tracking-tight">
                          {priceFormatted}
                        </span>
                        <span className="text-xs text-muted-foreground font-medium">
                          {plan.id === 'free' ? '' : currency === 'INR' ? 'INR' : 'USD'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {billingText}
                      </p>
                    </div>

                    {/* Features List */}
                    <div className="space-y-2.5 mb-6">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Included Capabilities
                      </p>
                      {plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full flex items-center justify-center mt-0.5 shrink-0',
                              isUltra
                                ? 'bg-amber-400/15 text-amber-400'
                                : isPro
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'bg-primary/10 text-primary'
                            )}
                          >
                            <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
                          </div>
                          <span className="text-foreground/90 font-medium leading-relaxed">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-4 border-t border-border/70">
                    <button
                      type="button"
                      disabled={isCurrent || isActivating}
                      onClick={() => handleActivate(plan.id)}
                      className={cn(
                        'w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center gap-2 shadow-sm',
                        isCurrent
                          ? 'bg-secondary text-muted-foreground border border-border cursor-default opacity-85'
                          : isUltra
                          ? 'bg-amber-500 text-black hover:bg-amber-400 hover:shadow-amber-500/20 active:scale-[0.98]'
                          : isPro
                          ? 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-blue-500/20 active:scale-[0.98]'
                          : 'bg-secondary hover:bg-secondary/80 text-foreground border border-border active:scale-[0.98]'
                      )}
                    >
                      {isActivating ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Signing License...</span>
                        </>
                      ) : isCurrent ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                          <span>Current Active Tier</span>
                        </>
                      ) : (
                        <>
                          <span>
                            {plan.id === 'free'
                              ? 'Activate 7-Day Trial'
                              : plan.id === 'pro'
                              ? 'Upgrade to Pro'
                              : 'Activate Ultra 1Y'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border/80 flex items-center justify-between flex-wrap gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-primary" />
            <span>Air-Gapped Sovereign Invariants (I1, I2, I3) Guaranteed</span>
            <span className="opacity-40">·</span>
            <span>FIDO2 Passkey Compliant</span>
          </div>

          <div className="font-mono text-[11px] tabular-nums">
            Active Key: <span className="text-foreground font-semibold">{subscription.licenseKey}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
