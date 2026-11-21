'use client'

import React, { useRef, useState, useMemo, useEffect, Component, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows, Text } from '@react-three/drei'
import * as THREE from 'three'
import { SpendingCategory, CanonicalAutonomyMode } from '@agentguard/core-schema'
import { Box, Layers, ShieldCheck, Sparkles, AlertTriangle, RefreshCw, Eye } from 'lucide-react'

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface BudgetVault3DPool {
  pool_id: string
  category_id: SpendingCategory
  category_name: string
  monthly_limit_paise: number
  daily_limit_paise: number | null
  per_transaction_limit_paise: number
  autonomy_mode: CanonicalAutonomyMode
  status: 'ACTIVE' | 'EXHAUSTED' | 'FROZEN' | 'EXPIRED' | 'REVOKED'
}

export interface BudgetVault3DProps {
  pools: BudgetVault3DPool[]
  categoryBreakdown?: Array<{
    pool_id: string
    settled_paise: number
    reserved_paise: number
    available_paise: number
    limit_paise: number
  }>
  selectedPoolId: string | null
  onSelectPool?: (poolId: string) => void
  onSeedDemoPools?: () => void
  onOpenCreatePool?: () => void
}

// ── ERROR BOUNDARY FOR WEBGL CRASHES / UNSUPPORTED HARDWARE ──────────────────

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.warn('WebGL context failed in BudgetVault3D, falling back to 2D Schematic:', error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

// ── PROCEDURAL STUDIO LIGHTING RIG ───────────────────────────────────────────

function StudioLighting() {
  return (
    <>
      {/* ── Procedural Studio IBL with 4 Positioned Softbox Lightformers ── */}
      <Environment resolution={256}>
        {/* Overhead cool-white main softbox */}
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#f8fafc"
          position={[0, 8, 1]}
          scale={[14, 8, 1]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* Left cyan rim softbox */}
        <Lightformer
          form="rect"
          intensity={2.0}
          color="#38bdf8"
          position={[-10, 4, 2]}
          scale={[6, 8, 1]}
        />
        {/* Right indigo rim softbox */}
        <Lightformer
          form="rect"
          intensity={1.8}
          color="#818cf8"
          position={[10, 4, -2]}
          scale={[6, 8, 1]}
        />
        {/* Front subtle fill softbox */}
        <Lightformer
          form="rect"
          intensity={1.0}
          color="#cbd5e1"
          position={[0, 2, 10]}
          scale={[12, 4, 1]}
        />
      </Environment>

      {/* Hemisphere fill prevents pitch-black undersides */}
      <hemisphereLight args={['#bae6fd', '#0f172a', 0.9]} />

      {/* Key directional light with soft specular reflections */}
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.8}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
    </>
  )
}

// ── CAMERA RIG (SUBTLE ORBITAL DRIFT + FOCUS LERP) ───────────────────────────

function CameraRig({
  reducedMotion,
}: {
  reducedMotion: boolean
}) {
  const controlsRef = useRef<any>(null)

  useFrame(({ clock }) => {
    if (reducedMotion || !controlsRef.current) return
    const t = clock.getElapsedTime()
    // Very subtle, smooth ambient yaw drift
    const subtleYaw = Math.sin(t * 0.25) * 0.08
    controlsRef.current.setAzimuthalAngle?.(subtleYaw)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={false}
      minPolarAngle={Math.PI / 3.6}
      maxPolarAngle={Math.PI / 2.1}
      dampingFactor={0.05}
      rotateSpeed={0.6}
    />
  )
}

// ── SINGLE 3D LIQUID VAULT CYLINDER ──────────────────────────────────────────

interface VaultCylinderProps {
  pool: BudgetVault3DPool
  settledPaise: number
  reservedPaise: number
  availablePaise: number
  totalPaise: number
  positionX: number
  isSelected: boolean
  onSelect: () => void
  reducedMotion: boolean
}

function VaultCylinder({
  pool,
  settledPaise,
  reservedPaise,
  availablePaise,
  totalPaise,
  positionX,
  isSelected,
  onSelect,
  reducedMotion,
}: {
  pool: BudgetVault3DPool
  settledPaise: number
  reservedPaise: number
  availablePaise: number
  totalPaise: number
  positionX: number
  isSelected: boolean
  onSelect: () => void
  reducedMotion: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const settledMeshRef = useRef<THREE.Mesh>(null)
  const reservedMeshRef = useRef<THREE.Mesh>(null)
  const availableMeshRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)

  const [hovered, setHovered] = useState(false)

  // Ratios (0.0 to 1.0)
  const safeTotal = Math.max(1, totalPaise)
  const settledRatio = Math.min(1, Math.max(0, settledPaise / safeTotal))
  const reservedRatio = Math.min(1 - settledRatio, Math.max(0, reservedPaise / safeTotal))
  const availableRatio = Math.max(0, 1 - settledRatio - reservedRatio)

  const CYLINDER_H = 2.4
  const CYLINDER_R = 0.52

  // Animate fluid heights & float smoothly on 60fps frame delta
  useFrame((state, delta) => {
    if (!groupRef.current) return

    // 1. Group position & lift on hover/select
    const targetY = isSelected ? 0.22 : hovered ? 0.12 : 0
    groupRef.current.position.y += (targetY - groupRef.current.position.y) * delta * 8.0

    // 2. Volumetric Fluid Heights:
    // Settled layer (bottom)
    const targetSettledH = Math.max(0.04, settledRatio * CYLINDER_H)
    if (settledMeshRef.current) {
      settledMeshRef.current.scale.y += (targetSettledH - settledMeshRef.current.scale.y) * delta * 6.0
      settledMeshRef.current.position.y = -CYLINDER_H / 2 + settledMeshRef.current.scale.y / 2
    }

    // Reserved layer (middle amber band)
    const currentSettledH = settledMeshRef.current ? settledMeshRef.current.scale.y : targetSettledH
    const targetReservedH = Math.max(0.02, reservedRatio * CYLINDER_H)
    if (reservedMeshRef.current) {
      reservedMeshRef.current.scale.y += (targetReservedH - reservedMeshRef.current.scale.y) * delta * 6.0
      reservedMeshRef.current.position.y = -CYLINDER_H / 2 + currentSettledH + reservedMeshRef.current.scale.y / 2
    }

    // Available layer (top cavity)
    const currentReservedH = reservedMeshRef.current ? reservedMeshRef.current.scale.y : targetReservedH
    const targetAvailH = Math.max(0.02, availableRatio * CYLINDER_H)
    if (availableMeshRef.current) {
      availableMeshRef.current.scale.y += (targetAvailH - availableMeshRef.current.scale.y) * delta * 6.0
      availableMeshRef.current.position.y =
        -CYLINDER_H / 2 + currentSettledH + currentReservedH + availableMeshRef.current.scale.y / 2
    }

    // Subtle breathing pulse for selected glowing ring
    if (ringRef.current && (isSelected || hovered) && !reducedMotion) {
      const pulse = Math.sin(state.clock.getElapsedTime() * 4.0) * 0.04
      ringRef.current.scale.set(1 + pulse, 1, 1 + pulse)
    }
  })

  // Format currency
  const formatRupees = (paise: number) => {
    const rs = Math.round(paise / 100)
    if (rs >= 100000) return `₹${(rs / 100000).toFixed(1)}L`
    if (rs >= 1000) return `₹${Math.round(rs / 1000)}k`
    return `₹${rs}`
  }

  const utilizationPct = Math.round(((settledPaise + reservedPaise) / safeTotal) * 100)

  // Category short name
  const cleanName =
    pool.category_name.length > 14 ? pool.category_name.slice(0, 13) + '…' : pool.category_name

  return (
    <group
      ref={groupRef}
      position={[positionX, 0, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* ── Base Titanium Pedestal ────────────────────────────────────────── */}
      <mesh position={[0, -CYLINDER_H / 2 - 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.78, 0.24, 32]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : hovered ? '#475569' : '#1e293b'}
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>

      {/* ── Pedestal Glowing Status Ring ──────────────────────────────────── */}
      {(isSelected || hovered || pool.status === 'FROZEN') && (
        <mesh ref={ringRef} position={[0, -CYLINDER_H / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.72, 32]} />
          <meshBasicMaterial
            color={pool.status === 'FROZEN' ? '#f43f5e' : isSelected ? '#38bdf8' : '#10b981'}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* ── Internal Volumetric Fluid Layers ──────────────────────────────── */}
      {/* Layer 1: Settled Spend (Bottom Emerald/Teal Solid Core) */}
      <mesh ref={settledMeshRef} position={[0, -CYLINDER_H / 2 + 0.1, 0]}>
        <cylinderGeometry args={[CYLINDER_R * 0.94, CYLINDER_R * 0.94, 1, 32]} />
        <meshStandardMaterial
          color="#10b981"
          emissive="#065f46"
          emissiveIntensity={0.4}
          roughness={0.2}
          metalness={0.25}
        />
      </mesh>

      {/* Layer 2: Reserved Capacity (Middle Glowing Amber Band - 90s Holds) */}
      <mesh ref={reservedMeshRef} position={[0, -CYLINDER_H / 2 + 0.3, 0]}>
        <cylinderGeometry args={[CYLINDER_R * 0.94, CYLINDER_R * 0.94, 1, 32]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#b45309"
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.2}
        />
      </mesh>

      {/* Layer 3: Available Headroom (Upper Frosted Blue Cavity) */}
      <mesh ref={availableMeshRef} position={[0, CYLINDER_H / 2 - 0.3, 0]}>
        <cylinderGeometry args={[CYLINDER_R * 0.94, CYLINDER_R * 0.94, 1, 32]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transmission={0.65}
          roughness={0.25}
          metalness={0.1}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* ── Outer Frosted Glass Cylinder Shell ─────────────────────────────── */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[CYLINDER_R, CYLINDER_R, CYLINDER_H, 32]} />
        <meshPhysicalMaterial
          color="#e2e8f0"
          transmission={0.82}
          roughness={0.15}
          metalness={0.08}
          transparent
          opacity={0.55}
          reflectivity={0.65}
          thickness={0.45}
        />
      </mesh>

      {/* ── Top Titanium Cap ──────────────────────────────────────────────── */}
      <mesh position={[0, CYLINDER_H / 2 + 0.08, 0]} castShadow>
        <cylinderGeometry args={[CYLINDER_R * 1.08, CYLINDER_R * 0.98, 0.16, 32]} />
        <meshStandardMaterial
          color={isSelected ? '#38bdf8' : '#334155'}
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>

      {/* ── Pedestal Plaque (Angled 3D Text Display) ───────────────────────── */}
      <group position={[0, -CYLINDER_H / 2 - 0.45, 0.45]} rotation={[-Math.PI / 4.8, 0, 0]}>
        {/* Plaque backplate */}
        <mesh position={[0, 0, -0.01]} receiveShadow>
          <planeGeometry args={[1.8, 0.55]} />
          <meshStandardMaterial
            color={isSelected ? '#0f172a' : '#090d16'}
            metalness={0.8}
            roughness={0.3}
            transparent
            opacity={0.9}
          />
        </mesh>

        {/* Plaque border line */}
        <lineSegments position={[0, 0, 0]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(1.8, 0.55)]} />
          <lineBasicMaterial color={isSelected ? '#38bdf8' : '#334155'} />
        </lineSegments>

        {/* Line 1: Category Name */}
        <Text
          position={[0, 0.09, 0.02]}
          fontSize={0.15}
          color={isSelected ? '#38bdf8' : '#f8fafc'}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.03}
        >
          {cleanName}
        </Text>

        {/* Line 2: Utilization % & Capacity */}
        <Text
          position={[0, -0.11, 0.02]}
          fontSize={0.11}
          color={pool.status === 'FROZEN' ? '#f43f5e' : utilizationPct > 85 ? '#f59e0b' : '#10b981'}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.02}
        >
          {pool.status === 'FROZEN'
            ? 'FROZEN'
            : `${utilizationPct}% · ${formatRupees(settledPaise + reservedPaise)}/${formatRupees(totalPaise)}`}
        </Text>
      </group>
    </group>
  )
}

// ── GHOST STANDBY PLINTHS (SHOWN WHEN 0 POOLS CONFIGURED) ─────────────────────

function GhostStandbyPlinths({
  onSeed,
  onCreate,
}: {
  onSeed?: () => void
  onCreate?: () => void
}) {
  const plinthConfigs = [
    { x: -2.4, label: 'Standby Vault #1', sub: 'Utilities / SaaS' },
    { x: 0.0, label: 'Standby Vault #2', sub: 'Shopping / Transit' },
    { x: 2.4, label: 'Standby Vault #3', sub: 'Fuel / Fleet' },
  ]

  return (
    <group position={[0, -0.2, 0]}>
      {plinthConfigs.map((plinth, i) => (
        <group key={i} position={[plinth.x, 0, 0]}>
          {/* Base Standby Plinth */}
          <mesh position={[0, -1.2, 0]}>
            <cylinderGeometry args={[0.7, 0.76, 0.24, 32]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} wireframe />
          </mesh>

          {/* Ghosted Outline Cylinder */}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.52, 0.52, 2.2, 24]} />
            <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.22} />
          </mesh>

          {/* Pedestal Tag */}
          <group position={[0, -1.55, 0.35]} rotation={[-Math.PI / 4.8, 0, 0]}>
            <Text position={[0, 0.06, 0]} fontSize={0.13} color="#94a3b8" anchorX="center">
              {plinth.label}
            </Text>
            <Text position={[0, -0.1, 0]} fontSize={0.1} color="#64748b" anchorX="center">
              {plinth.sub}
            </Text>
          </group>
        </group>
      ))}
    </group>
  )
}

// ── 2D SCHEMATIC / REDUCED-MOTION FALLBACK BARS VIEW ─────────────────────────

function BudgetVault2DBars({
  pools,
  categoryBreakdown,
  selectedPoolId,
  onSelectPool,
}: BudgetVault3DProps) {
  const formatPaiseINR = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100)
  }

  if (pools.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
        <Layers className="h-8 w-8 text-primary/40 animate-pulse" />
        <h4 className="text-sm font-bold text-foreground">No Active Liquidity Vaults</h4>
        <p className="text-xs text-muted-foreground max-w-sm">
          Establish or seed category budget pools to visualize real-time volumetric liquidity on the ledger.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col justify-center p-4 space-y-3 overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pools.map((p) => {
          const breakdown = categoryBreakdown?.find((c) => c.pool_id === p.pool_id)
          const limitPaise = p.monthly_limit_paise
          const settledPaise = breakdown?.settled_paise ?? 0
          const reservedPaise = breakdown?.reserved_paise ?? 0
          const availablePaise = Math.max(0, limitPaise - settledPaise - reservedPaise)

          const settledPct = Math.min(100, (settledPaise / limitPaise) * 100)
          const reservedPct = Math.min(100 - settledPct, (reservedPaise / limitPaise) * 100)
          const availablePct = Math.max(0, 100 - settledPct - reservedPct)
          const isSelected = selectedPoolId === p.pool_id

          return (
            <div
              key={p.pool_id}
              onClick={() => onSelectPool?.(p.pool_id)}
              className={`p-3 rounded-xl border transition cursor-pointer text-xs space-y-2 ${
                isSelected
                  ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary'
                  : 'bg-card/70 border-border/80 hover:bg-muted/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground truncate">{p.category_name}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                    p.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              {/* 3-Segment Invariant I1 Bar */}
              <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden flex">
                <div
                  className="bg-emerald-500 transition-all duration-300"
                  style={{ width: `${settledPct}%` }}
                  title={`Settled: ${formatPaiseINR(settledPaise)}`}
                />
                <div
                  className="bg-amber-500 transition-all duration-300"
                  style={{ width: `${reservedPct}%` }}
                  title={`Reserved: ${formatPaiseINR(reservedPaise)}`}
                />
                <div
                  className="bg-sky-500/40 transition-all duration-300"
                  style={{ width: `${availablePct}%` }}
                  title={`Available: ${formatPaiseINR(availablePaise)}`}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>{formatPaiseINR(settledPaise + reservedPaise)} used</span>
                <span className="font-bold text-foreground">Cap: {formatPaiseINR(limitPaise)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── MAIN EXPORTED COMPONENT ──────────────────────────────────────────────────

export function BudgetVault3D(props: BudgetVault3DProps) {
  const { pools, categoryBreakdown, selectedPoolId, onSelectPool, onSeedDemoPools, onOpenCreatePool } = props

  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d')
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Spacing calculation for cylinders so labels NEVER collide
  const cylinderSpacing = 2.4
  const poolCount = pools.length

  return (
    <div className="relative h-[340px] w-full rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-inner overflow-hidden select-none">
      {/* ── Top Overlay HUD Bar ────────────────────────────────────────── */}
      <div className="absolute top-3 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-sm">
            <Box className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground tracking-tight">Sovereign Liquidity Vault</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-semibold">
                Invariant I1
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground hidden sm:block">
              Volumetric Real-Time Fluid Envelopes (Settled &middot; Reserved &middot; Available)
            </p>
          </div>
        </div>

        {/* Mode Switcher (3D Vault / 2D Bars) */}
        <div className="flex items-center gap-1 bg-background/80 border border-border p-0.5 rounded-lg pointer-events-auto backdrop-blur-sm">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition ${
              viewMode === '3d'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Box className="h-3 w-3" />
            <span>3D Vault</span>
          </button>
          <button
            onClick={() => setViewMode('2d')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition ${
              viewMode === '2d'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>2D Bars</span>
          </button>
        </div>
      </div>

      {/* ── 3D Canvas / 2D Fallback Rendering ─────────────────────────── */}
      {viewMode === '2d' ? (
        <BudgetVault2DBars {...props} />
      ) : (
        <WebGLErrorBoundary fallback={<BudgetVault2DBars {...props} />}>
          <Canvas
            shadows
            dpr={[1, 1.75]}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.25,
              powerPreference: 'high-performance',
            }}
            camera={{ position: [0, 2.2, 7.8], fov: 36 }}
            style={{ width: '100%', height: '100%' }}
          >
            {/* Rich midnight navy-slate background */}
            <color attach="background" args={['#0b1120']} />
            <fog attach="fog" args={['#0b1120', 10, 24]} />

            {/* Studio Lighting with 4 Procedural Softbox Lightformers */}
            <StudioLighting />

            {/* Camera Rig with gentle drift */}
            <CameraRig reducedMotion={reducedMotion} />

            {/* Contact Shadows beneath vault deck */}
            <ContactShadows position={[0, -1.8, 0]} opacity={0.65} scale={20} blur={2.4} far={4.5} />

            {/* Real Backend Data Cylinders OR Ghost Standby Plinths */}
            {poolCount === 0 ? (
              <GhostStandbyPlinths onSeed={onSeedDemoPools} onCreate={onOpenCreatePool} />
            ) : (
              <group position={[0, 0.1, 0]}>
                {pools.map((pool, idx) => {
                  const posX = (idx - (poolCount - 1) / 2) * cylinderSpacing
                  const breakdown = categoryBreakdown?.find((c) => c.pool_id === pool.pool_id)
                  const settled = breakdown?.settled_paise ?? 0
                  const reserved = breakdown?.reserved_paise ?? 0
                  const total = pool.monthly_limit_paise
                  const available = Math.max(0, total - settled - reserved)

                  return (
                    <VaultCylinder
                      key={pool.pool_id}
                      pool={pool}
                      settledPaise={settled}
                      reservedPaise={reserved}
                      availablePaise={available}
                      totalPaise={total}
                      positionX={posX}
                      isSelected={selectedPoolId === pool.pool_id}
                      onSelect={() => onSelectPool?.(pool.pool_id)}
                      reducedMotion={reducedMotion}
                    />
                  )
                })}
              </group>
            )}
          </Canvas>
        </WebGLErrorBoundary>
      )}

      {/* ── Bottom Legend Strip ────────────────────────────────────────── */}
      <div className="absolute bottom-2.5 left-4 right-4 z-10 flex flex-wrap items-center justify-between text-[10px] font-mono text-muted-foreground pointer-events-none">
        <div className="flex items-center gap-3 bg-background/70 px-2.5 py-1 rounded-full border border-border/60 backdrop-blur-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Settled Spend</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Reserved (90s Holds)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>Available Headroom</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 bg-background/70 px-2.5 py-1 rounded-full border border-border/60 backdrop-blur-sm">
          <span>Formula: Available = Limit - Settled - Reserved</span>
        </div>
      </div>
    </div>
  )
}
