'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import * as THREE from 'three'

interface SpatialDepthCanvasProps {
  enabled: boolean
}

const ROUTE_TINTS: Record<string, { color: number; camZ: number }> = {
  '/': { color: 0x3b82f6, camZ: 28 },
  '/banking': { color: 0x10b981, camZ: 25 },
  '/coverage': { color: 0x14b8a6, camZ: 26 },
  '/compliance': { color: 0x6366f1, camZ: 29 },
  '/traces': { color: 0x60a5fa, camZ: 27 },
  '/approvals': { color: 0xf59e0b, camZ: 26 },
}

function getRouteConfig(pathname: string) {
  for (const [prefix, cfg] of Object.entries(ROUTE_TINTS)) {
    if (prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)) {
      return cfg
    }
  }
  return { color: 0x3b82f6, camZ: 28 }
}

export function SpatialDepthCanvas({ enabled }: SpatialDepthCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname() || '/'
  const [webglFailed, setWebglFailed] = useState(false)

  const targetColorRef = useRef(new THREE.Color(getRouteConfig(pathname).color))
  const targetCamZRef = useRef(getRouteConfig(pathname).camZ)

  useEffect(() => {
    const cfg = getRouteConfig(pathname)
    targetColorRef.current.setHex(cfg.color)
    targetCamZRef.current = cfg.camZ
  }, [pathname])

  useEffect(() => {
    if (!enabled || webglFailed) return
    const container = containerRef.current
    if (!container) return

    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      })
    } catch {
      setWebglFailed(true)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    )
    camera.position.set(0, 8.5, targetCamZRef.current)
    camera.lookAt(0, -1, 0)

    // Subtle Topographic Point-Wave Coordinate Matrix
    const COLS = 44
    const ROWS = 28
    const SPACING = 1.45
    const count = COLS * ROWS
    const positions = new Float32Array(count * 3)
    const baseXZ: Array<[number, number]> = []

    let i = 0
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c - COLS / 2) * SPACING
        const z = (r - ROWS / 2) * SPACING
        positions[i * 3] = x
        positions[i * 3 + 1] = 0
        positions[i * 3 + 2] = z
        baseXZ.push([x, z])
        i++
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    const material = new THREE.PointsMaterial({
      size: 0.13,
      color: targetColorRef.current.clone(),
      transparent: true,
      opacity: isDark() ? 0.36 : 0.12,
      depthWrite: false,
    })

    const points = new THREE.Points(geometry, material)
    points.position.y = -4.2
    scene.add(points)

    // Restrained Architectural Horizon Grid
    const grid = new THREE.GridHelper(64, 32, 0x334155, 0x1e293b)
    grid.position.y = -5.5
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = isDark() ? 0.16 : 0.06
    scene.add(grid)

    let mouseX = 0
    let mouseY = 0
    const onPointerMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }

    window.addEventListener('mousemove', onPointerMove, { passive: true })
    window.addEventListener('resize', onResize)

    let rafId = 0
    const clock = new THREE.Clock()

    const renderFrame = () => {
      const t = reducedMotion ? 0 : clock.getElapsedTime() * 0.45
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute

      for (let idx = 0; idx < count; idx++) {
        const [x, z] = baseXZ[idx]
        const y =
          Math.sin(x * 0.18 + t) * 0.42 +
          Math.cos(z * 0.22 + t * 0.85) * 0.36
        posAttr.setY(idx, y)
      }
      posAttr.needsUpdate = true

      // Smooth route tint + depth lerp
      material.color.lerp(targetColorRef.current, 0.05)
      material.opacity = isDark() ? 0.36 : 0.11
      gridMat.opacity = isDark() ? 0.15 : 0.05

      camera.position.x += (mouseX * 1.4 - camera.position.x) * 0.03
      camera.position.y += (8.5 - mouseY * 0.65 - camera.position.y) * 0.03
      camera.position.z += (targetCamZRef.current - camera.position.z) * 0.04
      camera.lookAt(0, -1.2, 0)

      renderer.render(scene, camera)

      if (!reducedMotion) {
        rafId = requestAnimationFrame(renderFrame)
      }
    }

    renderFrame()

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('resize', onResize)
      geometry.dispose()
      material.dispose()
      grid.geometry.dispose()
      gridMat.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [enabled, webglFailed])

  // Pure CSS Architectural Fallback
  if (!enabled || webglFailed) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-60 dark:opacity-100"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, hsl(var(--brand) / 0.07), transparent 70%)',
        }}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    />
  )
}
