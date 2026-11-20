'use client'

import { useEffect } from 'react'

const MAX_TILT_DEG = 2.4

export function use3DTilt(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(max-width: 767px)').matches) return

    let activeCard: HTMLElement | null = null
    let rafId: number | null = null

    const resetCard = (el: HTMLElement | null) => {
      if (!el) return
      el.style.transform = ''
      el.style.removeProperty('--mx')
      el.style.removeProperty('--my')
    }

    const handleMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('.tilt-3d') as HTMLElement | null
      if (activeCard && activeCard !== target) {
        resetCard(activeCard)
      }
      activeCard = target
      if (!activeCard) return

      const card = activeCard
      const clientX = e.clientX
      const clientY = e.clientY

      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return

        const px = (clientX - rect.left) / rect.width
        const py = (clientY - rect.top) / rect.height

        const rotateY = (px - 0.5) * 2 * MAX_TILT_DEG
        const rotateX = (0.5 - py) * 2 * MAX_TILT_DEG

        card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
        card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(4px)`
      })
    }

    const handleLeave = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      resetCard(activeCard)
      activeCard = null
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    window.addEventListener('mouseleave', handleLeave)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      resetCard(activeCard)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseleave', handleLeave)
    }
  }, [enabled])
}
