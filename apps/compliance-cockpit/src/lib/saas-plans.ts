'use client'

/**
 * AEGIS / AgentShield SaaS Plan Catalog & Storage Bridge
 *
 * Manages the 3 subscription tiers:
 *   1. Free (7-Day Trial)   → Maps to license tier 'free'
 *   2. Pro (3 Months)       → Maps to license tier 'pro'
 *   3. Ultra (1 Year)       → Maps to license tier 'enterprise'
 *
 * Bi-directionally synchronized with localStorage and the existing
 * 'aegis-license-change' event so that Settings, StatusBar, and TierGate
 * update seamlessly in real time without page reloads.
 */

import { useState, useEffect } from 'react'

export type PlanId = 'free' | 'pro' | 'ultra'
export type CurrencyCode = 'INR' | 'USD'

export interface SaasPlanDef {
  id: PlanId
  name: string
  term: string
  durationDays: number
  shortSign: string
  priceINR: number
  priceUSD: number
  priceFormattedINR: string
  priceFormattedUSD: string
  billingTextINR: string
  billingTextUSD: string
  badge?: string
  licenseTier: 'free' | 'pro' | 'enterprise'
  description: string
  features: string[]
  highlighted?: boolean
}

export const SAAS_PLANS: Record<PlanId, SaasPlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    term: '7-Day Trial',
    durationDays: 7,
    shortSign: 'FREE · 7D TRIAL',
    priceINR: 0,
    priceUSD: 0,
    priceFormattedINR: '₹0',
    priceFormattedUSD: '$0',
    billingTextINR: 'No credit card required · Instant access',
    billingTextUSD: 'No credit card required · Instant access',
    licenseTier: 'free',
    description: 'Autonomous agent security evaluation sandbox with pre-execution safety filters.',
    features: [
      'Up to 3 autonomous agents',
      'Pre-Execution Gateway (:8080)',
      '7-Scenario Attack Lab sandbox',
      'Community Policy Packs & Allow-lists',
      '7-day immutable trace retention',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    term: '3 Months',
    durationDays: 90,
    shortSign: 'PRO · 3M',
    priceINR: 14999,
    priceUSD: 179,
    priceFormattedINR: '₹14,999',
    priceFormattedUSD: '$179',
    billingTextINR: 'per 3 months · billed quarterly',
    billingTextUSD: 'per 3 months · billed quarterly',
    badge: 'Most Popular',
    highlighted: true,
    licenseTier: 'pro',
    description: 'Production multi-agent governance, Category Budget Pools, and real-time step-up approvals.',
    features: [
      'Up to 25 autonomous agents',
      'Category Budget Pools & Multi-Agent Quotas',
      'Policy DSL Editor & AI Rule Generator',
      '3D Zero-Trust Security Topology',
      'FIDO2 WebAuthn Passkey Step-Up (Key #4)',
      '90-day forensic trace retention',
    ],
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra',
    term: '1 Year',
    durationDays: 365,
    shortSign: 'ULTRA · 1Y',
    priceINR: 49999,
    priceUSD: 599,
    priceFormattedINR: '₹49,999',
    priceFormattedUSD: '$599',
    billingTextINR: 'per year · billed annually (save 17%)',
    billingTextUSD: 'per year · billed annually (save 17%)',
    badge: 'Best Value · Save 17%',
    licenseTier: 'enterprise',
    description: 'Sovereign enterprise banking security, air-gapped Bank Gate, TigerBeetle and RFC 6962 Merkle Witness.',
    features: [
      'Unlimited autonomous agents',
      'Bank Gate (:4000) Air-Gap + TigerBeetle Invariant I1',
      'Witness (:5000) RFC 6962 SHA-256 Merkle Ledger',
      'Ed25519 Signed SOC 2 / RBI / PCI-DSS Evidence Packs',
      'HSM / KMS FIPS 140-2 Keyring & Auto-Quarantine',
      '365-day sovereign audit retention & 99.99% SLA',
    ],
  },
}

export interface SaasSubscription {
  planId: PlanId
  planName: string
  term: string
  tier: 'free' | 'pro' | 'enterprise'
  shortSign: string
  activatedAt: string
  expiresAt: string
  durationDays: number
  daysRemaining: number
  licenseKey: string
  currency: CurrencyCode
}

const STORAGE_KEY = 'aegis:saas-plan'
const LICENSE_KEY = 'aegis:license'

function calculateDaysRemaining(expiresAtIso: string): number {
  try {
    const diff = new Date(expiresAtIso).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  } catch {
    return 365
  }
}

/**
 * Read the current active SaaS plan from localStorage.
 * Defaults to 'ultra' (Enterprise) if uninitialized.
 */
export function getActiveSaasPlan(): SaasSubscription {
  if (typeof window === 'undefined') {
    return {
      planId: 'ultra',
      planName: 'Ultra',
      term: '1 Year',
      tier: 'enterprise',
      shortSign: 'ULTRA · 1Y',
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      durationDays: 365,
      daysRemaining: 365,
      licenseKey: 'AG-ULTRA-2026-SOVEREIGN-UNLIMITED',
      currency: 'INR',
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const def = SAAS_PLANS[parsed.planId as PlanId] || SAAS_PLANS.ultra
      const remaining = calculateDaysRemaining(parsed.expiresAt)
      return {
        planId: def.id,
        planName: def.name,
        term: def.term,
        tier: def.licenseTier,
        shortSign: def.shortSign,
        activatedAt: parsed.activatedAt || new Date().toISOString(),
        expiresAt: parsed.expiresAt || new Date(Date.now() + def.durationDays * 86400000).toISOString(),
        durationDays: def.durationDays,
        daysRemaining: remaining,
        licenseKey: parsed.licenseKey || `AG-${def.id.toUpperCase()}-2026-KEY`,
        currency: parsed.currency || 'INR',
      }
    }
  } catch {}

  // Default initial subscription: Ultra (1 Year)
  const defaultSub: SaasSubscription = {
    planId: 'ultra',
    planName: 'Ultra',
    term: '1 Year',
    tier: 'enterprise',
    shortSign: 'ULTRA · 1Y',
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
    durationDays: 365,
    daysRemaining: 365,
    licenseKey: 'AG-ULTRA-2026-SOVEREIGN-UNLIMITED',
    currency: 'INR',
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSub))
  } catch {}

  return defaultSub
}

/**
 * Activate or switch the active SaaS plan.
 * Synchronizes with aegis:saas-plan, aegis:license, and dispatches events.
 */
export function activateSaasPlan(planId: PlanId, currency: CurrencyCode = 'INR'): SaasSubscription {
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.ultra
  const now = new Date()
  const expiresAt = new Date(now.getTime() + plan.durationDays * 86400000).toISOString()

  const sub: SaasSubscription = {
    planId: plan.id,
    planName: plan.name,
    term: plan.term,
    tier: plan.licenseTier,
    shortSign: plan.shortSign,
    activatedAt: now.toISOString(),
    expiresAt,
    durationDays: plan.durationDays,
    daysRemaining: plan.durationDays,
    licenseKey: `AG-${plan.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-PASSKEY-AUTH`,
    currency,
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sub))

      // Also bridge into existing aegis:license storage for backward compatibility
      const licensePayload = {
        key: sub.licenseKey,
        valid: true,
        plan: plan.licenseTier,
        tier: plan.licenseTier,
        email: 'security@agentguard.bank',
        expires_at: expiresAt,
        issued_at: now.toISOString(),
        last_validated_at: now.toISOString(),
      }
      localStorage.setItem(LICENSE_KEY, JSON.stringify(licensePayload))

      window.dispatchEvent(new CustomEvent('aegis-license-change', { detail: licensePayload }))
      window.dispatchEvent(new CustomEvent('aegis-plan-change', { detail: sub }))
    } catch {}
  }

  return sub
}

/**
 * Global helper to trigger the 3D SaaS Plan Modal from anywhere in the application.
 */
export function openSaasPlanModal(highlightPlan?: PlanId): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('aegis-open-plans-modal', {
        detail: { highlightPlan },
      })
    )
  }
}

/**
 * React hook for consuming and updating the active SaaS plan with real-time event updates.
 */
export function useSaasPlan() {
  const [subscription, setSubscription] = useState<SaasSubscription>(getActiveSaasPlan)

  useEffect(() => {
    const handlePlanUpdate = () => {
      setSubscription(getActiveSaasPlan())
    }

    window.addEventListener('aegis-plan-change', handlePlanUpdate)
    window.addEventListener('aegis-license-change', handlePlanUpdate)
    window.addEventListener('storage', handlePlanUpdate)

    return () => {
      window.removeEventListener('aegis-plan-change', handlePlanUpdate)
      window.removeEventListener('aegis-license-change', handlePlanUpdate)
      window.removeEventListener('storage', handlePlanUpdate)
    }
  }, [])

  return {
    subscription,
    plans: SAAS_PLANS,
    activate: (planId: PlanId, currency?: CurrencyCode) => {
      const updated = activateSaasPlan(planId, currency)
      setSubscription(updated)
      return updated
    },
    openModal: openSaasPlanModal,
  }
}
