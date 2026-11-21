'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import * as THREE from 'three'

interface SpatialDepthCanvasProps {
  enabled: boolean
}

interface RouteConfig {
  primary: number
  secondary: number
  camZ: number
}

const ROUTE_CONFIGS: Record<string, RouteConfig> = {
  '/': { primary: 0x3b82f6, secondary: 0x38bdf8, camZ: 27 }, // Overview: Precision Cobalt & Cyan
  '/banking': { primary: 0x10b981, secondary: 0x2dd4bf, camZ: 24 }, // Banking Command: Sovereign Emerald & Teal
  '/budget-pools': { primary: 0x8b5cf6, secondary: 0x6366f1, camZ: 25 }, // Budget Pools: Vault Violet & Indigo
  '/workflow-studio': { primary: 0x2563eb, secondary: 0x38bdf8, camZ: 23 }, // AI Workflow Studio: Electric Blue & Sky
  '/coverage': { primary: 0x14b8a6, secondary: 0x3b82f6, camZ: 25 }, // Security 360: Cyber Teal & Blue
  '/approvals': { primary: 0xf59e0b, secondary: 0x60a5fa, camZ: 26 }, // Approvals: Warm Amber & Slate
  '/violations': { primary: 0xf59e0b, secondary: 0xef4444, camZ: 26 }, // Violations: Amber & Crimson
  '/compliance': { primary: 0x6366f1, secondary: 0x38bdf8, camZ: 27 }, // Compliance: Indigo & Cyan
  '/audit-log': { primary: 0x64748b, secondary: 0x38bdf8, camZ: 27 }, // Audit: Slate & Cyan
  '/agents': { primary: 0x6366f1, secondary: 0x10b981, camZ: 27 }, // Agent Registry: Indigo & Emerald
  '/market-intelligence': { primary: 0x0ea5e9, secondary: 0x10b981, camZ: 26 }, // Market: Sky & Emerald
  '/traces': { primary: 0x60a5fa, secondary: 0x818cf8, camZ: 27 }, // Activity: Soft Blue & Violet
}

function getRouteConfig(pathname: string): RouteConfig {
  if (ROUTE_CONFIGS[pathname]) return ROUTE_CONFIGS[pathname]
  for (const [prefix, cfg] of Object.entries(ROUTE_CONFIGS)) {
    if (prefix !== '/' && pathname.startsWith(prefix)) {
      return cfg
    }
  }
  return { primary: 0x6366f1, secondary: 0x38bdf8, camZ: 27 }
}

// ── CUSTOM GLSL SHADERS FOR TOPOGRAPHIC WAVE & POINT MATRIX ──────────────────

const terrainVertexShader = `
uniform float uTime;
uniform vec3 uMouse3D;
uniform vec3 uClickPos;
uniform float uClickTime;

varying vec3 vPosition;
varying float vElevation;
varying float vMouseProximity;
varying float vDistFromCenter;

void main() {
  vec3 pos = position;

  // Calm organic dual-sine topographic swells
  float wave = sin(pos.x * 0.082 + uTime * 0.65) * 0.72 +
               cos(pos.y * 0.105 + uTime * 0.52) * 0.58 +
               sin((pos.x + pos.y) * 0.048 + uTime * 0.38) * 0.32;

  // Real-time Gaussian magnetic lift + ripple directly beneath uMouse3D
  float dMouse = length(pos.xy - uMouse3D.xy);
  float radius = 9.5;
  float magneticLift = exp(-(dMouse * dMouse) / (2.0 * radius * radius)) * 2.85;
  float ripple = sin(dMouse * 0.88 - uTime * 2.8) * exp(-dMouse * 0.16) * 0.45;

  // Interactive concentric click shockwave expanding outward over 1.6s
  float elapsed = uTime - uClickTime;
  float shockwave = 0.0;
  if (elapsed > 0.0 && elapsed < 1.6) {
    float waveSpeed = 22.0;
    float currentRadius = elapsed * waveSpeed;
    float dClick = length(pos.xy - uClickPos.xy);
    float pulse = sin((dClick - currentRadius) * 0.85) *
                  exp(-abs(dClick - currentRadius) * 0.42) *
                  exp(-elapsed * 2.0) * 1.8;
    shockwave = pulse;
  }

  pos.z += wave + magneticLift + ripple + shockwave;

  vPosition = pos;
  vElevation = pos.z;
  vMouseProximity = clamp(1.0 - dMouse / 11.5, 0.0, 1.0);
  vDistFromCenter = length(pos.xy) / 52.0;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Point size attenuation with proximity boost
  gl_PointSize = (1.9 + vMouseProximity * 2.6 + max(0.0, vElevation) * 0.55) * (180.0 / -mvPosition.z);
  gl_PointSize = clamp(gl_PointSize, 1.0, 14.0);
}
`

const pointFragmentShader = `
uniform vec3 uColor;
uniform vec3 uSecondaryColor;
uniform float uOpacity;
uniform float uIsDark;

varying vec3 vPosition;
varying float vElevation;
varying float vMouseProximity;
varying float vDistFromCenter;

void main() {
  // Circular soft particle sprite (anti-aliased disc)
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  float circleAlpha = smoothstep(0.5, 0.08, dist);

  // Dynamic color mix between primary and secondary based on elevation and mouse proximity
  float colorMix = clamp((vElevation + 1.2) * 0.35 + vMouseProximity * 0.55, 0.0, 1.0);
  vec3 finalColor = mix(uColor, uSecondaryColor, colorMix);

  // Soft luminous halo boost near cursor
  finalColor += uSecondaryColor * (vMouseProximity * 0.6);

  float alpha = circleAlpha * uOpacity;
  // Edge vignette falloff towards horizon
  alpha *= clamp(1.0 - vDistFromCenter * 0.72, 0.1, 1.0);
  // Enhance luminosity near cursor
  alpha = clamp(alpha + vMouseProximity * 0.28, 0.0, 1.0);

  gl_FragColor = vec4(finalColor, alpha);
}
`

const wireframeFragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vMouseProximity;
varying float vDistFromCenter;

void main() {
  vec3 finalColor = uColor + vec3(0.08) * vMouseProximity;
  float alpha = uOpacity * (0.8 + vMouseProximity * 0.7);
  alpha *= clamp(1.0 - vDistFromCenter * 0.75, 0.08, 1.0);
  gl_FragColor = vec4(finalColor, alpha);
}
`

export function SpatialDepthCanvas({ enabled }: SpatialDepthCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname() || '/'
  const [webglFailed, setWebglFailed] = useState(false)

  // Current route target parameters
  const currentRouteCfg = useMemo(() => getRouteConfig(pathname), [pathname])
  const targetPrimaryColorRef = useRef(new THREE.Color(currentRouteCfg.primary))
  const targetSecondaryColorRef = useRef(new THREE.Color(currentRouteCfg.secondary))
  const targetCamZRef = useRef(currentRouteCfg.camZ)

  useEffect(() => {
    targetPrimaryColorRef.current.setHex(currentRouteCfg.primary)
    targetSecondaryColorRef.current.setHex(currentRouteCfg.secondary)
    targetCamZRef.current = currentRouteCfg.camZ
  }, [currentRouteCfg])

  useEffect(() => {
    if (webglFailed) return
    const container = containerRef.current
    if (!container) return

    // Accessibility check: prefers-reduced-motion
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Detect initial theme mode
    const checkDark = () =>
      typeof document !== 'undefined' &&
      (document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark')

    let isDark = checkDark()

    // ── INITIALIZE LIGHTWEIGHT PERSISTENT THREE.JS RENDERER ──────────────────
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
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

    // ── LAYER 4: SOFT HORIZON VIGNETTE & ATMOSPHERIC FOG ─────────────────────
    const fogColor = new THREE.Color(isDark ? 0x070b14 : 0xf4f6fa)
    const sceneFog = new THREE.FogExp2(fogColor.getHex(), 0.021)
    scene.fog = sceneFog

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      140
    )
    camera.position.set(0, 7.8, targetCamZRef.current)
    camera.lookAt(0, -1.8, -10)

    // ── LAYER 1: GLSL MAGNETIC TOPOGRAPHIC WAVE & POINT MATRIX ───────────────
    const GRID_COLS = 64
    const GRID_ROWS = 42
    const GRID_WIDTH = 110
    const GRID_HEIGHT = 78

    const terrainGeometry = new THREE.PlaneGeometry(
      GRID_WIDTH,
      GRID_HEIGHT,
      GRID_COLS,
      GRID_ROWS
    )

    // Material Uniforms
    const uniforms = {
      uTime: { value: 0 },
      uMouse3D: { value: new THREE.Vector3(0, 0, 0) },
      uClickPos: { value: new THREE.Vector3(0, 0, 0) },
      uClickTime: { value: -999.0 },
      uColor: { value: targetPrimaryColorRef.current.clone() },
      uSecondaryColor: { value: targetSecondaryColorRef.current.clone() },
      uOpacity: { value: isDark ? 0.78 : 0.32 },
      uIsDark: { value: isDark ? 1.0 : 0.0 },
    }

    const wireframeUniforms = {
      uTime: uniforms.uTime,
      uMouse3D: uniforms.uMouse3D,
      uClickPos: uniforms.uClickPos,
      uClickTime: uniforms.uClickTime,
      uColor: { value: targetPrimaryColorRef.current.clone() },
      uOpacity: { value: isDark ? 0.14 : 0.05 },
    }

    const pointMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: pointFragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    })

    const wireframeMaterial = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: wireframeFragmentShader,
      uniforms: wireframeUniforms,
      transparent: true,
      depthWrite: false,
      wireframe: true,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    })

    const terrainPoints = new THREE.Points(terrainGeometry, pointMaterial)
    const terrainWireframe = new THREE.Mesh(terrainGeometry, wireframeMaterial)

    // Position and angle into deep receding perspective
    const TERRAIN_ROT_X = -Math.PI * 0.42
    const TERRAIN_POS_Y = -5.8
    const TERRAIN_POS_Z = -12

    terrainPoints.rotation.x = TERRAIN_ROT_X
    terrainPoints.position.set(0, TERRAIN_POS_Y, TERRAIN_POS_Z)

    terrainWireframe.rotation.x = TERRAIN_ROT_X
    terrainWireframe.position.set(0, TERRAIN_POS_Y, TERRAIN_POS_Z)

    scene.add(terrainWireframe)
    scene.add(terrainPoints)

    // Invisible Hit Plane for 100% Exact Mouse & Click Raycasting
    const hitPlaneGeo = new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT)
    const hitPlaneMat = new THREE.MeshBasicMaterial({ visible: false })
    const hitPlane = new THREE.Mesh(hitPlaneGeo, hitPlaneMat)
    hitPlane.rotation.x = TERRAIN_ROT_X
    hitPlane.position.set(0, TERRAIN_POS_Y, TERRAIN_POS_Z)
    scene.add(hitPlane)

    // ── LAYER 2: ARCHITECTURAL DEEP-SPACE ORBITAL TELEMETRY RINGS ────────────
    const ringGroup = new THREE.Group()

    const ringGeo1 = new THREE.TorusGeometry(17, 0.026, 16, 120)
    const ringGeo2 = new THREE.TorusGeometry(24, 0.03, 16, 140)
    const ringGeo3 = new THREE.TorusGeometry(32, 0.036, 16, 160)

    const ringMat1 = new THREE.MeshBasicMaterial({
      color: targetPrimaryColorRef.current,
      transparent: true,
      opacity: isDark ? 0.16 : 0.07,
      wireframe: true,
    })
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: targetSecondaryColorRef.current,
      transparent: true,
      opacity: isDark ? 0.13 : 0.05,
      wireframe: true,
    })
    const ringMat3 = new THREE.MeshBasicMaterial({
      color: targetPrimaryColorRef.current,
      transparent: true,
      opacity: isDark ? 0.11 : 0.04,
      wireframe: true,
    })

    const ring1 = new THREE.Mesh(ringGeo1, ringMat1)
    ring1.position.set(0, -1.8, -22)
    ring1.rotation.set(0.36, 0.42, 0.12)

    const ring2 = new THREE.Mesh(ringGeo2, ringMat2)
    ring2.position.set(3, 1.2, -26)
    ring2.rotation.set(-0.28, -0.32, 0.22)

    const ring3 = new THREE.Mesh(ringGeo3, ringMat3)
    ring3.position.set(-3.5, -3.8, -31)
    ring3.rotation.set(0.18, 0.52, -0.32)

    ringGroup.add(ring1)
    ringGroup.add(ring2)
    ringGroup.add(ring3)
    scene.add(ringGroup)

    // ── LAYER 3: FLOATING VOLUMETRIC MICRO-PARTICLES / DATA DUST ─────────────
    const DUST_COUNT = 160
    const dustPositions = new Float32Array(DUST_COUNT * 3)
    const dustVelocities: Array<{ vx: number; vy: number; vz: number }> = []

    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 62
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 32 - 1
      dustPositions[i * 3 + 2] = -Math.random() * 26 - 2
      dustVelocities.push({
        vx: (Math.random() - 0.5) * 0.005,
        vy: Math.random() * 0.012 + 0.004,
        vz: Math.random() * 0.014 + 0.004,
      })
    }

    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))

    const dustMaterial = new THREE.PointsMaterial({
      size: 0.11,
      color: targetSecondaryColorRef.current,
      transparent: true,
      opacity: isDark ? 0.42 : 0.15,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    })

    const dustPoints = new THREE.Points(dustGeometry, dustMaterial)
    scene.add(dustPoints)

    // ── MOUSE PARALLAX, RAYCASTING & CLICK SHOCKWAVE SYSTEM ───────────────────
    const raycaster = new THREE.Raycaster()
    const mouseNormalized = new THREE.Vector2(0, 0)
    let targetMouseNormX = 0
    let targetMouseNormY = 0
    let smoothMouseNormX = 0
    let smoothMouseNormY = 0

    const targetMouse3D = new THREE.Vector3(0, 0, 0)
    const smoothMouse3D = new THREE.Vector3(0, 0, 0)

    const onPointerMove = (e: MouseEvent) => {
      mouseNormalized.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseNormalized.y = -(e.clientY / window.innerHeight) * 2 + 1
      targetMouseNormX = (e.clientX / window.innerWidth - 0.5) * 2
      targetMouseNormY = (e.clientY / window.innerHeight - 0.5) * 2

      raycaster.setFromCamera(mouseNormalized, camera)
      const hits = raycaster.intersectObject(hitPlane)
      if (hits.length > 0) {
        const localHit = hitPlane.worldToLocal(hits[0].point.clone())
        targetMouse3D.set(localHit.x, localHit.y, 0)
      }
    }

    const onPointerDown = (e: MouseEvent) => {
      mouseNormalized.x = (e.clientX / window.innerWidth) * 2 - 1
      mouseNormalized.y = -(e.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouseNormalized, camera)
      const hits = raycaster.intersectObject(hitPlane)
      if (hits.length > 0) {
        const localHit = hitPlane.worldToLocal(hits[0].point.clone())
        uniforms.uClickPos.value.set(localHit.x, localHit.y, 0)
        uniforms.uClickTime.value = clock.getElapsedTime()
      }
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('resize', onResize)

    // ── DUAL-THEME MUTATION OBSERVER ─────────────────────────────────────────
    const observer = new MutationObserver(() => {
      const nextDark = checkDark()
      if (nextDark !== isDark) {
        isDark = nextDark
        uniforms.uIsDark.value = isDark ? 1.0 : 0.0
        uniforms.uOpacity.value = isDark ? 0.78 : 0.32
        wireframeUniforms.uOpacity.value = isDark ? 0.14 : 0.05
        dustMaterial.opacity = isDark ? 0.42 : 0.15
        ringMat1.opacity = isDark ? 0.16 : 0.07
        ringMat2.opacity = isDark ? 0.13 : 0.05
        ringMat3.opacity = isDark ? 0.11 : 0.04
        pointMaterial.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending
        wireframeMaterial.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending
        dustMaterial.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending
        pointMaterial.needsUpdate = true
        wireframeMaterial.needsUpdate = true
        dustMaterial.needsUpdate = true
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    // ── ANIMATION & LIFECYCLE CONTROLLER ─────────────────────────────────────
    let rafId = 0
    let isTabVisible = true
    const clock = new THREE.Clock()

    const onVisibilityChange = () => {
      isTabVisible = !document.hidden
      if (isTabVisible && !rafId && enabled) {
        rafId = requestAnimationFrame(renderLoop)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const renderLoop = () => {
      if (!isTabVisible) {
        rafId = 0
        return
      }

      const elapsed = clock.getElapsedTime()
      uniforms.uTime.value = elapsed

      // Damped Mouse 3D Interpolation
      smoothMouse3D.lerp(targetMouse3D, 0.08)
      uniforms.uMouse3D.value.copy(smoothMouse3D)

      // Damped Cursor Parallax
      smoothMouseNormX += (targetMouseNormX - smoothMouseNormX) * 0.045
      smoothMouseNormY += (targetMouseNormY - smoothMouseNormY) * 0.045

      // Smooth Route Tint Interpolation
      uniforms.uColor.value.lerp(targetPrimaryColorRef.current, 0.045)
      uniforms.uSecondaryColor.value.lerp(targetSecondaryColorRef.current, 0.045)
      wireframeUniforms.uColor.value.lerp(targetPrimaryColorRef.current, 0.045)
      ringMat1.color.lerp(targetPrimaryColorRef.current, 0.045)
      ringMat2.color.lerp(targetSecondaryColorRef.current, 0.045)
      ringMat3.color.lerp(targetPrimaryColorRef.current, 0.045)
      dustMaterial.color.lerp(targetSecondaryColorRef.current, 0.045)

      // Smooth Fog Color Transition
      const targetFogHex = isDark ? 0x070b14 : 0xf4f6fa
      fogColor.lerp(new THREE.Color(targetFogHex), 0.05)
      sceneFog.color.copy(fogColor)

      // Cinematic Multi-Plane Camera Parallax Float
      const targetCamX = smoothMouseNormX * 3.4
      const targetCamY = 7.8 - smoothMouseNormY * 1.8
      const targetCamZ = targetCamZRef.current

      camera.position.x += (targetCamX - camera.position.x) * 0.045
      camera.position.y += (targetCamY - camera.position.y) * 0.045
      camera.position.z += (targetCamZ - camera.position.z) * 0.045
      camera.rotation.z = -smoothMouseNormX * 0.024
      camera.lookAt(0, -1.8, -10)

      // Layer 2: Gentle Orbital Telemetry Ring Counter-Rotations & Parallax Tilts
      ring1.rotation.z += 0.0016
      ring1.rotation.x = 0.36 + smoothMouseNormY * 0.08
      ring1.rotation.y = 0.42 + smoothMouseNormX * 0.08

      ring2.rotation.z -= 0.0012
      ring2.rotation.x = -0.28 - smoothMouseNormY * 0.07
      ring2.rotation.y = -0.32 - smoothMouseNormX * 0.07

      ring3.rotation.y += 0.0009
      ring3.rotation.z = -0.32 + smoothMouseNormX * 0.05

      // Layer 3: Volumetric Micro-Particle / Dust Motion & Wrap-Around
      const posAttr = dustGeometry.getAttribute('position') as THREE.BufferAttribute
      const positionsArray = posAttr.array as Float32Array

      for (let i = 0; i < DUST_COUNT; i++) {
        const vel = dustVelocities[i]
        const i3 = i * 3

        positionsArray[i3] += vel.vx + smoothMouseNormX * 0.008
        positionsArray[i3 + 1] += vel.vy
        positionsArray[i3 + 2] += vel.vz

        // Wrap particles gracefully within boundary box
        if (positionsArray[i3 + 1] > 16) positionsArray[i3 + 1] = -16
        if (positionsArray[i3 + 2] > 2) positionsArray[i3 + 2] = -26
        if (positionsArray[i3] > 32) positionsArray[i3] = -32
        if (positionsArray[i3] < -32) positionsArray[i3] = 32
      }
      posAttr.needsUpdate = true

      renderer.render(scene, camera)

      if (!reducedMotion && enabled) {
        rafId = requestAnimationFrame(renderLoop)
      } else {
        rafId = 0
      }
    }

    if (enabled && !reducedMotion) {
      rafId = requestAnimationFrame(renderLoop)
    } else {
      // Render single static frame for reduced motion or paused mode
      renderer.render(scene, camera)
    }

    // ── CLEANUP & WEBGL LIFECYCLE HYGIENE ────────────────────────────────────
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      observer.disconnect()

      terrainGeometry.dispose()
      pointMaterial.dispose()
      wireframeMaterial.dispose()
      hitPlaneGeo.dispose()
      hitPlaneMat.dispose()
      ringGeo1.dispose()
      ringGeo2.dispose()
      ringGeo3.dispose()
      ringMat1.dispose()
      ringMat2.dispose()
      ringMat3.dispose()
      dustGeometry.dispose()
      dustMaterial.dispose()

      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [enabled, webglFailed])

  // Pure CSS Architectural Fallback if WebGL unavailable or 3D disabled
  if (webglFailed) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-60 dark:opacity-100 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, hsl(var(--brand) / 0.08), transparent 70%)',
        }}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 transition-opacity duration-500 will-change-[opacity] ${
        enabled ? 'opacity-100' : 'opacity-0'
      }`}
    />
  )
}
