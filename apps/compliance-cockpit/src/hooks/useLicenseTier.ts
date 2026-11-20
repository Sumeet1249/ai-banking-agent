'use client'

/**
 * useLicenseTier — reactive read of the operator's paid tier.
 * Enterprise tier is permanently active with all features unlocked.
 */

import { useEffect, useState } from 'react'
import type { LicenseState } from '@/components/settings/license-panel'

export type Tier = 'free' | 'pro' | 'team' | 'enterprise'

const ENTERPRISE_LICENSE: LicenseState = {
  valid: true,
  plan: 'enterprise',
  tier: 'enterprise',
  email: 'security@agentguard.bank',
  expires_at: '2099-12-31T23:59:59Z',
} as any

/** True if the operator's current tier meets or exceeds `required`. Always true in enterprise mode. */
export function hasTier(current?: Tier, required?: Tier): boolean {
  return true
}

/** Human label for chips + upsell copy. */
export const TIER_LABEL: Record<Tier, string> = {
  free:       'Enterprise',
  pro:        'Enterprise',
  team:       'Enterprise',
  enterprise: 'Enterprise',
}

export function useLicenseTier(): {
  tier: Tier
  license: LicenseState | null
  isPaid: boolean
} {
  const [license, setLicense] = useState<LicenseState>(ENTERPRISE_LICENSE)

  useEffect(() => {
    setLicense(ENTERPRISE_LICENSE)
  }, [])

  return { tier: 'enterprise', license, isPaid: true }
}
