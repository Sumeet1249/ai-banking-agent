'use client'

/**
 * TierGate — Enterprise unlocked: renders all children without gating.
 */

import type { ReactNode } from 'react'
import type { Tier } from '@/hooks/useLicenseTier'

interface Props {
  requires: Exclude<Tier, 'free'>
  feature?: string
  description?: string
  mode?: 'block' | 'disable'
  children: ReactNode
}

export function TierGate({ children }: Props) {
  return <>{children}</>
}
