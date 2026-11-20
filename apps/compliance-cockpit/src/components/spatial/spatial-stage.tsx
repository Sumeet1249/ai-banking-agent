'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface SpatialStageProps {
  isometric: boolean
  children: ReactNode
}

export function SpatialStage({ isometric, children }: SpatialStageProps) {
  const pathname = usePathname() || '/'

  return (
    <div className="spatial-perspective-stage relative z-10 w-full">
      <div
        key={pathname}
        data-isometric={isometric ? 'true' : 'false'}
        className="spatial-stage-inner page-warp-in"
      >
        {children}
      </div>
    </div>
  )
}
