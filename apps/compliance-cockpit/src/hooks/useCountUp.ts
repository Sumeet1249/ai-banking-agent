'use client'

import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, durationMs = 450): number {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)

  useEffect(() => {
    const startVal = prevRef.current
    if (startVal === target) return

    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      prevRef.current = target
      setValue(target)
      return
    }

    let rafId = 0
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startVal + (target - startVal) * eased)
      setValue(current)

      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        prevRef.current = target
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      prevRef.current = target
    }
  }, [target, durationMs])

  return value
}
