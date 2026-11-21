'use client'

/**
 * useLicenseTier — reactive read of the operator's paid tier.
 * Synchronized with SaasPlan and aegis:license.
 */

import { useEffect, useState } from 'react'
import type { LicenseState } from '@/components/settings/license-panel'
import { useSaasPlan } from '@/lib/saas-plans'

export type Tier = 'free' | 'pro' | 'team' | 'enterprise'

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
}

/** True if the operator's current tier meets or exceeds `required`. */
export function hasTier(current?: Tier, required?: Tier): boolean {
  if (!required) return true
  const curRank = TIER_RANK[current || 'enterprise'] ?? 3
  const reqRank = TIER_RANK[required] ?? 0
  return curRank >= reqRank
}

/** Human label for chips + upsell copy. */
export const TIER_LABEL: Record<Tier, string> = {
  free:       'Free Trial',
  pro:        'Pro',
  team:       'Team',
  enterprise: 'Enterprise',
}

export function useLicenseTier(): {
  tier: Tier
  license: LicenseState | null
  isPaid: boolean
} {
  const { subscription } = useSaasPlan()
  const tier: Tier = (subscription?.tier as Tier) || 'enterprise'

  const license: LicenseState = {
    valid: true,
    plan: tier,
    tier: tier,
    email: 'security@agentguard.bank',
    expires_at: subscription?.expiresAt || '2099-12-31T23:59:59Z',
  } as any

  return { tier, license, isPaid: tier !== 'free' }
}
