'use client'

import React, { useRef, useMemo, useState, useEffect, Component, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { ShieldCheck, Lock, Sparkles, KeyRound } from 'lucide-react'

// ── TYPES & PROPS ────────────────────────────────────────────────────────────

export interface LoginVault3DProps {
  mode: 'login' | 'signup'
  passwordFocused?: boolean
  authState?: 'idle' | 'submitting' | 'success' | 'error'
  className?: string
}

// ── ERROR BOUNDARY FOR WEBGL CRASHES / UNSUPPORTED HARDWARE ──────────────────

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: any) {
    console.warn('WebGL Context Warning in LoginVault3D:', error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[#070b14] text-foreground">
          <div className="relative flex items-center justify-center">
            <div className="w-36 h-36 rounded-full border border-primary/30 animate-spin duration-1000" />
            <div className="absolute w-24 h-24 rounded-full border border-emerald-500/40 animate-ping duration-1000" />
            <ShieldCheck className="h-12 w-12 text-primary" />
          </div>
          <p className="text-xs font-mono text-muted-foreground mt-4 uppercase tracking-widest">
            Cryptographic Vault Active · 2D Fallback
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── AMBIENT COORDINATE STARS & PARTICLES ──────────────────────────────────────

function AmbientDust() {
  const particleCount = 80
  const [positions] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14
    }
    return [pos]
  }, [])

  const pointsRef = useRef<THREE.Points>(null)

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.03
      pointsRef.current.rotation.x += delta * 0.015
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.065}
        color="#94a3b8"
        transparent
        opacity={0.45}
        sizeAttenuation
      />
    </points>
  )
}

// ── TELEMETRY ORBITER SATELLITE ──────────────────────────────────────────────

interface OrbiterProps {
  radius: number
  speed: number
  color: string
  inclination: number
  initialPhase: number
  label?: string
}

function TelemetryOrbiter({ radius, speed, color, inclination, initialPhase }: OrbiterProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const angleRef = useRef(initialPhase)

  useFrame((_, delta) => {
    angleRef.current += speed * delta
    if (meshRef.current) {
      const a = angleRef.current
      const x = Math.cos(a) * radius
      const z = Math.sin(a) * radius
      const y = Math.sin(a) * Math.sin(inclination) * radius * 0.45
      meshRef.current.position.set(x, y, z)
    }
  })

  return (
    <group>
      {/* Orbiter Trail Ring */}
      <mesh rotation={[inclination, 0, 0]}>
        <ringGeometry args={[radius - 0.008, radius + 0.008, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} side={THREE.DoubleSide} />
      </mesh>

      {/* Orbiting Satellite Node */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} />
      </mesh>
    </group>
  )
}

// ── EXPANDING VERIFICATION SHOCKWAVE (On Success) ─────────────────────────────

function VerificationShockwave({ trigger }: { trigger: boolean }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const [active, setActive] = useState(false)
  const progressRef = useRef(0)

  useEffect(() => {
    if (trigger) {
      setActive(true)
      progressRef.current = 0
    }
  }, [trigger])

  useFrame((_, delta) => {
    if (!active || !ringRef.current) return
    progressRef.current += delta * 1.8
    const p = progressRef.current
    if (p >= 1) {
      setActive(false)
      ringRef.current.scale.set(0, 0, 0)
      return
    }
    const scale = 0.5 + p * 4.5
    ringRef.current.scale.set(scale, scale, scale)
    const mat = ringRef.current.material as THREE.MeshBasicMaterial
    if (mat) {
      mat.opacity = Math.max(0, 1 - p * p)
    }
  })

  if (!active) return null

  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.9, 1.05, 64]} />
      <meshBasicMaterial color="#10b981" transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ── SHUTTER PETAL BLADES (Tightens on Password Focus) ─────────────────────────

function ShutterBlades({ tightened, color }: { tightened: boolean; color: THREE.Color }) {
  const groupRef = useRef<THREE.Group>(null)
  const bladeCount = 6
  const blades = useMemo(() => {
    return Array.from({ length: bladeCount }, (_, i) => ({
      angle: (i / bladeCount) * Math.PI * 2,
      id: i,
    }))
  }, [bladeCount])

  const currentRadiusRef = useRef(1.55)

  useFrame((_, delta) => {
    const targetRadius = tightened ? 0.98 : 1.55
    currentRadiusRef.current = THREE.MathUtils.lerp(currentRadiusRef.current, targetRadius, delta * 7)

    if (groupRef.current) {
      // Gentle constant rotation of the shutter assembly
      groupRef.current.rotation.z += delta * (tightened ? 0.4 : 0.15)
      groupRef.current.children.forEach((child, i) => {
        const blade = blades[i]
        const r = currentRadiusRef.current
        const x = Math.cos(blade.angle) * r
        const y = Math.sin(blade.angle) * r
        child.position.set(x, y, 0)
        child.rotation.z = blade.angle + (tightened ? Math.PI / 3 : Math.PI / 6)
      })
    }
  })

  return (
    <group ref={groupRef}>
      {blades.map((b) => (
        <mesh key={b.id}>
          <boxGeometry args={[0.34, 0.08, 0.025]} />
          <meshStandardMaterial
            color="#475569"
            metalness={0.85}
            roughness={0.25}
            emissive={color}
            emissiveIntensity={tightened ? 0.35 : 0.05}
          />
        </mesh>
      ))}
    </group>
  )
}

// ── SOVEREIGN CRYPTOGRAPHIC CORE SCULPTURE ────────────────────────────────────

interface CoreSculptureProps {
  mode: 'login' | 'signup'
  passwordFocused: boolean
  authState: 'idle' | 'submitting' | 'success' | 'error'
}

function CoreSculpture({ mode, passwordFocused, authState }: CoreSculptureProps) {
  const outerRingRef = useRef<THREE.Mesh>(null)
  const midRingRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Mesh>(null)
  const coreMeshRef = useRef<THREE.Mesh>(null)
  const shellMeshRef = useRef<THREE.Mesh>(null)
  const mainGroupRef = useRef<THREE.Group>(null)

  // Target Color: Emerald for login, Cyan-Indigo for signup
  const targetColorHex = mode === 'login' ? '#10b981' : '#38bdf8'
  const activeColor = useMemo(() => new THREE.Color(targetColorHex), [targetColorHex])
  const currentColor = useRef(new THREE.Color(targetColorHex))

  // Mouse parallax sway
  const { pointer } = useThree()

  useFrame((state, delta) => {
    // 1. Lerp core color smoothly
    const errorColor = new THREE.Color('#f43f5e')
    const destColor = authState === 'error' ? errorColor : activeColor
    currentColor.current.lerp(destColor, delta * 5)

    // 2. Speed multipliers based on state
    const speedMult = authState === 'submitting' ? 3.8 : 1.0

    // 3. Independent 3D Gimbal Axis Rotations
    if (outerRingRef.current) {
      outerRingRef.current.rotation.x += delta * 0.45 * speedMult
      outerRingRef.current.rotation.y += delta * 0.25 * speedMult
    }
    if (midRingRef.current) {
      midRingRef.current.rotation.y -= delta * 0.65 * speedMult
      midRingRef.current.rotation.z += delta * 0.35 * speedMult
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z += delta * 0.85 * speedMult
      innerRingRef.current.rotation.x -= delta * 0.35 * speedMult
    }

    // 4. Center Geometric Core Rotation & Pulse
    if (coreMeshRef.current) {
      coreMeshRef.current.rotation.y += delta * 0.8
      coreMeshRef.current.rotation.x += delta * 0.4
      const pulseBase = authState === 'submitting' ? Math.sin(state.clock.elapsedTime * 8) * 0.08 : 0
      const pulseScale = 1.0 + pulseBase
      coreMeshRef.current.scale.set(pulseScale, pulseScale, pulseScale)

      const mat = coreMeshRef.current.material as THREE.MeshStandardMaterial
      if (mat) {
        mat.color.copy(currentColor.current)
        mat.emissive.copy(currentColor.current)
        mat.emissiveIntensity = authState === 'success' ? 4.5 : authState === 'submitting' ? 2.8 : 1.5
      }
    }

    // 5. Outer Glass Shell
    if (shellMeshRef.current) {
      shellMeshRef.current.rotation.y -= delta * 0.3
      shellMeshRef.current.rotation.z += delta * 0.2
    }

    // 6. Damped Pointer Parallax
    if (mainGroupRef.current) {
      mainGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        mainGroupRef.current.rotation.y,
        pointer.x * 0.3,
        delta * 3
      )
      mainGroupRef.current.rotation.x = THREE.MathUtils.lerp(
        mainGroupRef.current.rotation.x,
        -pointer.y * 0.25,
        delta * 3
      )
      // Floating vertical bob
      mainGroupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.4) * 0.12
    }
  })

  return (
    <group ref={mainGroupRef}>
      {/* ── 1. Floating Crystalline Vault Heart ──────────────────────────── */}
      {/* Outer Faceted Frosted-Glass Shell */}
      <mesh ref={shellMeshRef}>
        <icosahedronGeometry args={[0.82, 0]} />
        <meshPhysicalMaterial
          color="#ffffff"
          roughness={0.12}
          transmission={0.68}
          thickness={1.1}
          ior={1.48}
          transparent
          opacity={0.88}
          metalness={0.1}
        />
      </mesh>

      {/* Inner Geometric Radiant Core */}
      <mesh ref={coreMeshRef}>
        <octahedronGeometry args={[0.48, 0]} />
        <meshStandardMaterial
          color={targetColorHex}
          emissive={targetColorHex}
          emissiveIntensity={1.8}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>

      {/* ── 2. Privacy Shutter Blades ────────────────────────────────────── */}
      <ShutterBlades tightened={passwordFocused} color={currentColor.current} />

      {/* ── 3. Three Concentric Brushed-Titanium Gimbal Rings ────────────── */}
      {/* Outer Titanium Ring (Radius ~ 2.45) */}
      <mesh ref={outerRingRef}>
        <torusGeometry args={[2.45, 0.038, 16, 80]} />
        <meshStandardMaterial
          color="#64748b"
          metalness={0.85}
          roughness={0.24}
        />
      </mesh>

      {/* Mid Titanium Ring (Radius ~ 2.05) */}
      <mesh ref={midRingRef}>
        <torusGeometry args={[2.05, 0.034, 16, 72]} />
        <meshStandardMaterial
          color="#475569"
          metalness={0.82}
          roughness={0.26}
        />
      </mesh>

      {/* Inner Titanium Ring (Radius ~ 1.65) */}
      <mesh ref={innerRingRef}>
        <torusGeometry args={[1.65, 0.03, 16, 64]} />
        <meshStandardMaterial
          color="#64748b"
          metalness={0.88}
          roughness={0.2}
        />
      </mesh>

      {/* ── 4. Telemetry Orbiters (:8081, :4000, :5000) ──────────────────── */}
      <TelemetryOrbiter
        radius={2.9}
        speed={0.7}
        color="#38bdf8"
        inclination={Math.PI / 4}
        initialPhase={0}
      />
      <TelemetryOrbiter
        radius={3.3}
        speed={-0.5}
        color="#10b981"
        inclination={-Math.PI / 5}
        initialPhase={2.1}
      />
      <TelemetryOrbiter
        radius={3.7}
        speed={0.4}
        color="#a855f7"
        inclination={Math.PI / 6}
        initialPhase={4.2}
      />

      {/* Expanding Verification Ring on Success */}
      <VerificationShockwave trigger={authState === 'success'} />

      {/* Ground Contact Shadow */}
      <ContactShadows
        position={[0, -2.6, 0]}
        opacity={0.65}
        scale={8}
        blur={2.4}
        far={5}
        color="#020617"
      />
    </group>
  )
}

// ── MAIN EXPORTED COMPONENT ──────────────────────────────────────────────────

export function LoginVault3D({
  mode = 'login',
  passwordFocused = false,
  authState = 'idle',
  className = '',
}: LoginVault3DProps) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReducedMotion(mq.matches)
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }
  }, [])

  return (
    <div className={`relative w-full h-full min-h-[300px] overflow-hidden bg-[#070b14] select-none ${className}`}>
      <WebGLErrorBoundary>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 0.4, 6.8], fov: 42 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.25,
          }}
        >
          {/* Depth Fog blending into vault darkness */}
          <fog attach="fog" args={['#070b14', 12, 32]} />

          {/* Studio Lights (Bright, Metallic, No silhouettes) */}
          <hemisphereLight
            args={['#c7d2fe', '#070b14', 1.1]}
          />
          <directionalLight
            position={[5, 8, 5]}
            intensity={2.2}
            color="#ffffff"
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight
            position={[-5, -2, -3]}
            intensity={1.1}
            color={mode === 'login' ? '#10b981' : '#38bdf8'}
          />
          <pointLight
            position={[0, 0, 0]}
            intensity={authState === 'success' ? 4 : 2}
            color={mode === 'login' ? '#10b981' : '#38bdf8'}
            distance={8}
          />

          {/* Procedural Studio Softboxes */}
          <Environment resolution={256}>
            {/* Overhead Cool White */}
            <Lightformer
              form="rect"
              intensity={2.4}
              color="#e0f2fe"
              scale={[10, 5, 1]}
              position={[0, 6, -2]}
              target={[0, 0, 0]}
            />
            {/* Left Cyan Rim */}
            <Lightformer
              form="rect"
              intensity={2.2}
              color="#38bdf8"
              scale={[4, 8, 1]}
              position={[-6, 1, -2]}
              target={[0, 0, 0]}
            />
            {/* Right Indigo Rim */}
            <Lightformer
              form="rect"
              intensity={2.0}
              color={mode === 'login' ? '#10b981' : '#818cf8'}
              scale={[4, 8, 1]}
              position={[6, 1, -2]}
              target={[0, 0, 0]}
            />
            {/* Soft Front Fill */}
            <Lightformer
              form="rect"
              intensity={1.3}
              color="#cbd5e1"
              scale={[10, 3, 1]}
              position={[0, -2, 5]}
              target={[0, 0, 0]}
            />
          </Environment>

          {/* Architectural Floor Grid */}
          <gridHelper
            args={[24, 24, '#1e293b', '#0f172a']}
            position={[0, -2.6, 0]}
          />

          {/* Ambient Dust Particles */}
          <AmbientDust />

          {/* Centerpiece 3D Vault */}
          <CoreSculpture
            mode={mode}
            passwordFocused={passwordFocused}
            authState={authState}
          />

          {/* Gentle Orbit Interaction */}
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            maxPolarAngle={Math.PI / 2 + 0.15}
            minPolarAngle={Math.PI / 3}
            autoRotate={!reducedMotion && authState !== 'submitting'}
            autoRotateSpeed={0.5}
            dampingFactor={0.05}
          />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  )
}
