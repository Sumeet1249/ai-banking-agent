'use client'

import React, { useRef, useState, useMemo, useEffect, Component, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows, Text } from '@react-three/drei'
import * as THREE from 'three'
import { Eye, RotateCcw, Compass, Layers, ShieldAlert, CheckCircle2, Lock, Sparkles } from 'lucide-react'
import { AgentStep } from '../banking/autonomous-workflow-studio'

// ── TYPES & INTERFACES ─────────────────────────────────────────────────────────

export interface WorkflowPipeline3DProps {
  agents: AgentStep[]
  activeStepIndex: number
  selectedStepIndex: number
  onSelectStep: (stepIndex: number) => void
  workflowStatus: 'idle' | 'running' | 'waiting_approval' | 'approved' | 'denied' | 'held' | 'completed'
  payee: string
  amountRupees: number
  isReducedMotion?: boolean
}

interface StationDef {
  step: number
  name: string
  shortName: string
  role: string
  x: number
  z: number
  zone: 'GATEWAY' | 'BANK_GATE' | 'WITNESS'
}

// 8 Stations spread generously along a gentle arc (x = -8.4 to +8.4) with zero label collision
const STATIONS: StationDef[] = [
  { step: 1, name: '01 Intent', shortName: 'Intent Parsing', role: 'NLP Invariants', x: -8.4, z: -0.4, zone: 'GATEWAY' },
  { step: 2, name: '02 Mandate', shortName: 'Mandate Match', role: 'Ed25519 Whitelist', x: -6.0, z: 0.4, zone: 'GATEWAY' },
  { step: 3, name: '03 Fraud', shortName: 'Fraud & Anomaly', role: 'PaySim ML Velocity', x: -3.6, z: -0.8, zone: 'GATEWAY' },
  { step: 4, name: '04 Policy', shortName: 'Policy Engine', role: 'Invariants I1–I9', x: -1.2, z: 0.6, zone: 'GATEWAY' },
  { step: 5, name: '05 Passkey', shortName: 'Passkey Gate', role: 'FIDO2 Step-Up', x: 1.2, z: -0.4, zone: 'GATEWAY' },
  { step: 6, name: '06 Bank Exec', shortName: 'Bank Gate Exec', role: 'Single-Use TBP', x: 3.6, z: 0.5, zone: 'BANK_GATE' },
  { step: 7, name: '07 Reconcile', shortName: 'Reconciliation', role: '2PC Ledger Commit', x: 6.0, z: -0.6, zone: 'BANK_GATE' },
  { step: 8, name: '08 Witness', shortName: 'Audit & Witness', role: 'Merkle Co-sign', x: 8.4, z: 0.2, zone: 'WITNESS' },
]

// ── ERROR BOUNDARY FOR WEBGL FALLBACK ──────────────────────────────────────────

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
    console.warn('WebGL context failed in WorkflowPipeline3D, falling back:', error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

// ── PROCEDURAL STUDIO LIGHTING RIG (NO DARK SILHOUETTES) ───────────────────────

function StudioLighting() {
  return (
    <>
      {/* 4 Positioned Softbox Lightformers in procedural Environment */}
      <Environment resolution={256}>
        {/* Overhead cool-white key softbox */}
        <Lightformer
          form="rect"
          intensity={2.4}
          color="#f8fafc"
          position={[0, 8, 1]}
          scale={[16, 8, 1]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* Left cyan rim softbox */}
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#38bdf8"
          position={[-12, 4, 2]}
          scale={[6, 8, 1]}
        />
        {/* Right violet rim softbox */}
        <Lightformer
          form="rect"
          intensity={2.0}
          color="#a78bfa"
          position={[12, 4, -2]}
          scale={[6, 8, 1]}
        />
        {/* Front fill softbox */}
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#cbd5e1"
          position={[0, 2, 12]}
          scale={[14, 4, 1]}
        />
      </Environment>

      {/* Ambient hemisphere light prevents pitch-black undersides */}
      <hemisphereLight args={['#c7d2fe', '#1e293b', 0.95]} />

      {/* Key directional light with soft shadows */}
      <directionalLight
        position={[6, 14, 8]}
        intensity={1.8}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
    </>
  )
}

// ── ELEVATED TUBE CONDUIT CONNECTORS ──────────────────────────────────────────

function ConduitSegment({
  from,
  to,
  status,
}: {
  from: StationDef
  to: StationDef
  status: 'idle' | 'active' | 'completed' | 'denied'
}) {
  const curve = useMemo(() => {
    const p1 = new THREE.Vector3(from.x, 0.45, from.z)
    const p2 = new THREE.Vector3(to.x, 0.45, to.z)
    const mid = new THREE.Vector3()
      .addVectors(p1, p2)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.38, 0))
    return new THREE.QuadraticBezierCurve3(p1, mid, p2)
  }, [from, to])

  const tubeGeom = useMemo(() => new THREE.TubeGeometry(curve, 28, 0.045, 8, false), [curve])
  const coreGeom = useMemo(() => new THREE.TubeGeometry(curve, 28, 0.016, 6, false), [curve])

  const coreColor =
    status === 'completed'
      ? '#10b981'
      : status === 'active'
      ? '#38bdf8'
      : status === 'denied'
      ? '#f43f5e'
      : '#334155'

  return (
    <group>
      {/* Outer Frosted Glass Conduit */}
      <mesh geometry={tubeGeom}>
        <meshPhysicalMaterial
          color="#1e293b"
          roughness={0.12}
          transmission={0.7}
          thickness={0.25}
          transparent
          opacity={0.65}
          metalness={0.1}
        />
      </mesh>
      {/* Glowing Inner Core */}
      <mesh geometry={coreGeom}>
        <meshBasicMaterial color={coreColor} transparent opacity={status === 'idle' ? 0.4 : 0.9} />
      </mesh>
    </group>
  )
}

// ── TRAVELING 3D INSTRUCTION CAPSULE & SHOCKWAVE ──────────────────────────────

function TravelingCapsule({
  activeStepIndex,
  workflowStatus,
  reducedMotion,
}: {
  activeStepIndex: number
  workflowStatus: string
  reducedMotion: boolean
}) {
  const capsuleRef = useRef<THREE.Group>(null)
  const shockwaveRef = useRef<THREE.Mesh>(null)
  const [shockwaveScale, setShockwaveScale] = useState(0)

  useFrame(({ clock }) => {
    if (!capsuleRef.current) return
    const t = clock.getElapsedTime()

    // Determine target coordinates based on active step
    let targetX = 0
    let targetZ = 0
    let targetY = 0.65

    if (activeStepIndex >= 0 && activeStepIndex < STATIONS.length) {
      const st = STATIONS[activeStepIndex]
      targetX = st.x
      targetZ = st.z

      // Hover bobbing
      if (!reducedMotion) {
        targetY = 0.65 + Math.sin(t * 3.5) * 0.06
      }
    } else if (workflowStatus === 'completed') {
      // Station 8 completed
      targetX = STATIONS[7].x
      targetZ = STATIONS[7].z
      targetY = 0.8
    } else {
      // Idle: sits at station 1 entrance
      targetX = STATIONS[0].x - 0.7
      targetZ = STATIONS[0].z
    }

    // Smooth lerp movement towards target pod
    const lerpSpeed = reducedMotion ? 0.3 : 0.08
    capsuleRef.current.position.x = THREE.MathUtils.lerp(capsuleRef.current.position.x, targetX, lerpSpeed)
    capsuleRef.current.position.z = THREE.MathUtils.lerp(capsuleRef.current.position.z, targetZ, lerpSpeed)
    capsuleRef.current.position.y = THREE.MathUtils.lerp(capsuleRef.current.position.y, targetY, lerpSpeed)

    // Gentle spin
    if (!reducedMotion) {
      capsuleRef.current.rotation.y += 0.03
    }

    // Expand shockwave on denied
    if (shockwaveRef.current) {
      if (workflowStatus === 'denied') {
        const s = Math.min(3.5, shockwaveRef.current.scale.x + 0.06)
        shockwaveRef.current.scale.set(s, s, s)
        const mat = shockwaveRef.current.material as THREE.MeshBasicMaterial
        mat.opacity = Math.max(0, 1 - s / 3.5)
      } else {
        shockwaveRef.current.scale.set(0.1, 0.1, 0.1)
      }
    }
  })

  // Color logic for the capsule
  const isDenied = workflowStatus === 'denied'
  const isWaiting = workflowStatus === 'waiting_approval'
  const isCompleted = workflowStatus === 'completed'
  const capsuleColor = isDenied ? '#f43f5e' : isWaiting ? '#f59e0b' : isCompleted ? '#10b981' : '#38bdf8'

  return (
    <group>
      {/* 3D Traveling Instruction Capsule */}
      <group ref={capsuleRef} position={[STATIONS[0].x - 0.7, 0.65, STATIONS[0].z]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.09, 0.22, 12, 16]} />
          <meshStandardMaterial
            color={capsuleColor}
            emissive={capsuleColor}
            emissiveIntensity={isDenied ? 1.2 : 0.8}
            metalness={0.6}
            roughness={0.2}
          />
        </mesh>
        {/* Subtle glowing halo aura */}
        <pointLight color={capsuleColor} intensity={isDenied ? 2.5 : 1.5} distance={2.5} />
      </group>

      {/* 3D Crimson Shockwave Ring (Triggers on Deny) */}
      {isDenied && activeStepIndex >= 0 && (
        <mesh
          ref={shockwaveRef}
          position={[STATIONS[activeStepIndex]?.x || 0, 0.45, STATIONS[activeStepIndex]?.z || 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.2, 0.32, 32]} />
          <meshBasicMaterial color="#f43f5e" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// ── 8 SPECIFIC 3D AGENT STATION SCULPTURES ────────────────────────────────────

function PodSculpture({
  station,
  agent,
  isActive,
  isCompleted,
  isDenied,
  isWaiting,
  isSelected,
  reducedMotion,
}: {
  station: StationDef
  agent?: AgentStep
  isActive: boolean
  isCompleted: boolean
  isDenied: boolean
  isWaiting: boolean
  isSelected: boolean
  reducedMotion: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const leftShutterRef = useRef<THREE.Mesh>(null)
  const rightShutterRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // Active Pod gentle levitation & spin
    if (groupRef.current && !reducedMotion) {
      const targetY = isActive ? 0.22 : 0
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, 0.08)
    }

    if (coreRef.current && !reducedMotion) {
      if (isActive) {
        coreRef.current.rotation.y += 0.04
      } else {
        coreRef.current.rotation.y += 0.008
      }
    }

    if (ringRef.current && !reducedMotion) {
      ringRef.current.rotation.x += isActive ? 0.05 : 0.01
      ringRef.current.rotation.y += isActive ? 0.03 : 0.008
    }

    // Station 5 Blast Shutters: smoothly close when awaiting passkey
    if (station.step === 5) {
      const closedPos = isWaiting ? 0.18 : 0.52
      if (leftShutterRef.current) {
        leftShutterRef.current.position.x = THREE.MathUtils.lerp(
          leftShutterRef.current.position.x,
          -closedPos,
          0.1
        )
      }
      if (rightShutterRef.current) {
        rightShutterRef.current.position.x = THREE.MathUtils.lerp(
          rightShutterRef.current.position.x,
          closedPos,
          0.1
        )
      }
    }
  })

  // Theme-safe semantic status colors
  const collarColor = isDenied
    ? '#f43f5e'
    : isWaiting
    ? '#f59e0b'
    : isCompleted
    ? '#10b981'
    : isActive
    ? '#38bdf8'
    : isSelected
    ? '#6366f1'
    : '#334155'

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* ── Base Pedestal Plinth ── */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.82, 0.32, 28]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Glowing Status Collar Ring */}
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.74, 0.74, 0.03, 28]} />
        <meshBasicMaterial color={collarColor} />
      </mesh>

      {/* Selection Outer Indicator Ring */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.88, 0.96, 32]} />
          <meshBasicMaterial color="#6366f1" side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* ── Specific Internal Sculptures per Station ── */}
      <group ref={coreRef} position={[0, 0.65, 0]}>
        {/* Pod 1: Intent — Cyan crystalline octahedron + gyro ring */}
        {station.step === 1 && (
          <group>
            <mesh castShadow>
              <octahedronGeometry args={[0.34, 0]} />
              <meshPhysicalMaterial
                color="#38bdf8"
                emissive="#0284c7"
                emissiveIntensity={isActive ? 0.7 : 0.25}
                roughness={0.1}
                transmission={0.65}
                thickness={0.3}
              />
            </mesh>
            <mesh ref={ringRef}>
              <torusGeometry args={[0.52, 0.022, 16, 32]} />
              <meshStandardMaterial color="#60a5fa" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        )}

        {/* Pod 2: Mandate — Stacked cryptographic titanium keyplates */}
        {station.step === 2 && (
          <group>
            <mesh position={[0, -0.15, 0]} castShadow>
              <boxGeometry args={[0.68, 0.07, 0.68]} />
              <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0, 0]} rotation={[0, Math.PI / 8, 0]} castShadow>
              <boxGeometry args={[0.56, 0.07, 0.56]} />
              <meshStandardMaterial color="#64748b" metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
              <boxGeometry args={[0.44, 0.07, 0.44]} />
              <meshStandardMaterial
                color={isCompleted ? '#10b981' : isDenied ? '#f43f5e' : '#38bdf8'}
                metalness={0.9}
                roughness={0.15}
              />
            </mesh>
            {/* Center cryptographic key pin */}
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 0.5, 16]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
          </group>
        )}

        {/* Pod 3: Fraud — Dual spinning radar scanner rings */}
        {station.step === 3 && (
          <group>
            <mesh castShadow>
              <sphereGeometry args={[0.2, 24, 24]} />
              <meshStandardMaterial
                color="#0f172a"
                emissive={isDenied ? '#f43f5e' : '#38bdf8'}
                emissiveIntensity={isActive ? 0.8 : 0.3}
                metalness={0.6}
              />
            </mesh>
            <mesh ref={ringRef} rotation={[Math.PI / 3, 0, 0]}>
              <torusGeometry args={[0.38, 0.02, 16, 32]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
            <mesh rotation={[-Math.PI / 4, Math.PI / 6, 0]}>
              <torusGeometry args={[0.54, 0.02, 16, 32]} />
              <meshBasicMaterial color="#818cf8" />
            </mesh>
          </group>
        )}

        {/* Pod 4: Policy — Interlocking beveled logic gates */}
        {station.step === 4 && (
          <group>
            <mesh position={[-0.14, 0, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
              <boxGeometry args={[0.42, 0.1, 0.1]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0.14, 0, 0]} rotation={[0, 0, -Math.PI / 4]} castShadow>
              <boxGeometry args={[0.42, 0.1, 0.1]} />
              <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.18, 0.18, 0.18]} />
              <meshStandardMaterial
                color={isCompleted ? '#10b981' : '#38bdf8'}
                emissive={isCompleted ? '#10b981' : '#38bdf8'}
                emissiveIntensity={isActive ? 0.9 : 0.3}
              />
            </mesh>
          </group>
        )}

        {/* Pod 5: Passkey — Armored twin mechanical blast shutters + holographic barrier */}
        {station.step === 5 && (
          <group>
            {/* Left mechanical shutter */}
            <mesh ref={leftShutterRef} position={[-0.52, 0, 0]} castShadow>
              <boxGeometry args={[0.26, 0.7, 0.12]} />
              <meshStandardMaterial
                color="#334155"
                metalness={0.9}
                roughness={0.2}
              />
            </mesh>
            {/* Right mechanical shutter */}
            <mesh ref={rightShutterRef} position={[0.52, 0, 0]} castShadow>
              <boxGeometry args={[0.26, 0.7, 0.12]} />
              <meshStandardMaterial
                color="#334155"
                metalness={0.9}
                roughness={0.2}
              />
            </mesh>
            {/* Center Biometric WebAuthn Sensor Core */}
            <mesh castShadow>
              <cylinderGeometry args={[0.18, 0.18, 0.45, 24]} />
              <meshStandardMaterial
                color={isWaiting ? '#f59e0b' : isCompleted ? '#10b981' : '#64748b'}
                emissive={isWaiting ? '#f59e0b' : isCompleted ? '#10b981' : '#38bdf8'}
                emissiveIntensity={isWaiting ? 1.4 : 0.4}
              />
            </mesh>
            {/* Amber Holographic Barrier Pulse when Awaiting Passkey */}
            {isWaiting && (
              <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.34, 0.34, 0.75, 24, 1, true]} />
                <meshBasicMaterial color="#f59e0b" transparent opacity={0.45} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        )}

        {/* Pod 6: Bank Exec — Biometric airlock settlement cylinder */}
        {station.step === 6 && (
          <group>
            {/* Outer shell with viewing slit */}
            <mesh castShadow>
              <cylinderGeometry args={[0.42, 0.42, 0.72, 28, 1, true]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} side={THREE.DoubleSide} />
            </mesh>
            {/* Glowing inner TBP permit cylinder */}
            <mesh>
              <cylinderGeometry args={[0.24, 0.24, 0.58, 24]} />
              <meshPhysicalMaterial
                color={isCompleted ? '#10b981' : '#38bdf8'}
                emissive={isCompleted ? '#10b981' : '#0284c7'}
                emissiveIntensity={isActive ? 0.9 : 0.3}
                transmission={0.6}
                roughness={0.1}
              />
            </mesh>
          </group>
        )}

        {/* Pod 7: Reconcile — Twin balanced ledger counter-cylinders */}
        {station.step === 7 && (
          <group>
            {/* Left RESERVED column */}
            <mesh position={[-0.22, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.6, 20]} />
              <meshStandardMaterial
                color="#0f172a"
                emissive={isCompleted ? '#10b981' : '#f59e0b'}
                emissiveIntensity={0.5}
              />
            </mesh>
            {/* Right COMMITTED column */}
            <mesh position={[0.22, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.6, 20]} />
              <meshStandardMaterial
                color="#0f172a"
                emissive="#10b981"
                emissiveIntensity={isCompleted ? 0.9 : 0.2}
              />
            </mesh>
            {/* Connecting ledger bridge */}
            <mesh position={[0, 0.26, 0]}>
              <boxGeometry args={[0.54, 0.06, 0.1]} />
              <meshStandardMaterial color="#475569" metalness={0.9} />
            </mesh>
          </group>
        )}

        {/* Pod 8: Witness — Stepped notary obelisk + levitating golden Merkle crystal */}
        {station.step === 8 && (
          <group>
            {/* Stepped obelisk plinth */}
            <mesh position={[0, -0.18, 0]} castShadow>
              <boxGeometry args={[0.58, 0.14, 0.58]} />
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
            <mesh position={[0, -0.06, 0]} castShadow>
              <boxGeometry args={[0.44, 0.14, 0.44]} />
              <meshStandardMaterial color="#475569" metalness={0.85} />
            </mesh>
            {/* Levitating Golden Merkle Crystal */}
            <mesh position={[0, 0.22, 0]} castShadow>
              <dodecahedronGeometry args={[0.26, 0]} />
              <meshStandardMaterial
                color={isCompleted ? '#fbbf24' : '#818cf8'}
                emissive={isCompleted ? '#f59e0b' : '#6366f1'}
                emissiveIntensity={isCompleted ? 1.2 : 0.4}
                metalness={0.7}
                roughness={0.2}
              />
            </mesh>
            {/* Notary Golden Halo Ring */}
            <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 4, 0, 0]}>
              <torusGeometry args={[0.46, 0.018, 16, 32]} />
              <meshBasicMaterial color={isCompleted ? '#f59e0b' : '#818cf8'} />
            </mesh>
          </group>
        )}
      </group>

      {/* ── Angled Front 3D Nameplate Plaque (ZERO Overlap) ── */}
      <group position={[0, 0.14, 0.92]} rotation={[-Math.PI / 5.5, 0, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[1.65, 0.46, 0.04]} />
          <meshStandardMaterial
            color={isSelected ? '#1e293b' : '#0f172a'}
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
        {/* Subtle border outline */}
        <lineSegments position={[0, 0, 0.025]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(1.65, 0.46)]} />
          <lineBasicMaterial color={isSelected ? '#38bdf8' : collarColor} />
        </lineSegments>

        {/* Text Line 1: Station Number & Name */}
        <Text
          position={[0, 0.07, 0.03]}
          fontSize={0.13}
          color={isSelected ? '#38bdf8' : '#f8fafc'}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.03}
        >
          {station.name}
        </Text>

        {/* Text Line 2: Role & Status */}
        <Text
          position={[0, -0.09, 0.03]}
          fontSize={0.095}
          color={isDenied ? '#f43f5e' : isWaiting ? '#f59e0b' : isCompleted ? '#10b981' : '#94a3b8'}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.02}
        >
          {isDenied
            ? 'DENIED'
            : isWaiting
            ? 'AWAITING PASSKEY'
            : isCompleted
            ? 'COMPLETED'
            : isActive
            ? 'RUNNING'
            : station.role}
        </Text>
      </group>
    </group>
  )
}

// ── 3-ZONE CURVED PIPELINE DECK ────────────────────────────────────────────────

function PipelineDeck() {
  return (
    <group position={[0, -0.2, 0]}>
      {/* ── Main Elevated Titanium Platform (19.4 × 0.4 × 8.2) ── */}
      <mesh position={[0, 0, 0]} receiveShadow castShadow>
        <boxGeometry args={[19.4, 0.4, 8.2]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Perimeter Aluminum Edge Trim */}
      <lineSegments position={[0, 0.205, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(19.4, 8.2)]} />
        <lineBasicMaterial color="#334155" />
      </lineSegments>

      {/* ── 3 Service Zone Floor Markers & Back Labels ── */}

      {/* Zone 1: Gateway MCP Proxy (:8081) — Stations 1 to 5 */}
      <group position={[-3.6, 0.205, -3.4]}>
        <Text
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.22}
          color="#38bdf8"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
        >
          01 · GATEWAY MCP PROXY :8081 (PRE-EXECUTION FILTER)
        </Text>
      </group>

      {/* Zone 2: Bank Gate Engine (:4000) — Stations 6 to 7 */}
      <group position={[4.8, 0.205, -3.4]}>
        <Text
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.22}
          color="#10b981"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
        >
          02 · BANK GATE :4000
        </Text>
      </group>

      {/* Zone 3: Independent Witness (:5000) — Station 8 */}
      <group position={[8.4, 0.205, -3.4]}>
        <Text
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.22}
          color="#818cf8"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
        >
          03 · WITNESS :5000
        </Text>
      </group>
    </group>
  )
}

// ── CAMERA RIG WITH AUTO-FOLLOW & ORBITAL DRIFT ────────────────────────────────

function CameraRig({
  activeStepIndex,
  autoFollow,
  reducedMotion,
}: {
  activeStepIndex: number
  autoFollow: boolean
  reducedMotion: boolean
}) {
  const controlsRef = useRef<any>(null)

  useFrame(({ clock }) => {
    if (!controlsRef.current) return
    const t = clock.getElapsedTime()

    // Auto-follow active pod
    if (autoFollow && activeStepIndex >= 0 && activeStepIndex < STATIONS.length) {
      const activeX = STATIONS[activeStepIndex].x * 0.45
      const activeZ = STATIONS[activeStepIndex].z * 0.35
      controlsRef.current.target.x = THREE.MathUtils.lerp(controlsRef.current.target.x, activeX, 0.05)
      controlsRef.current.target.z = THREE.MathUtils.lerp(controlsRef.current.target.z, activeZ, 0.05)
    } else {
      controlsRef.current.target.x = THREE.MathUtils.lerp(controlsRef.current.target.x, 0, 0.05)
      controlsRef.current.target.z = THREE.MathUtils.lerp(controlsRef.current.target.z, 0, 0.05)
    }

    // Subtle ambient orbital drift when idle & not reduced motion
    if (!reducedMotion && (!autoFollow || activeStepIndex < 0)) {
      const subtleYaw = Math.sin(t * 0.18) * 0.04
      controlsRef.current.setAzimuthalAngle?.(subtleYaw)
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      minDistance={10}
      maxDistance={22}
      minPolarAngle={Math.PI / 4.5}
      maxPolarAngle={Math.PI / 2.2}
      dampingFactor={0.05}
      rotateSpeed={0.5}
    />
  )
}

// ── 2D INTERACTIVE SCHEMATIC FALLBACK ─────────────────────────────────────────

function Pipeline2DFallback({
  agents,
  activeStepIndex,
  selectedStepIndex,
  onSelectStep,
  workflowStatus,
}: {
  agents: AgentStep[]
  activeStepIndex: number
  selectedStepIndex: number
  onSelectStep: (stepIndex: number) => void
  workflowStatus: string
}) {
  return (
    <div className="h-[420px] w-full rounded-2xl bg-secondary/30 border border-border/80 p-6 flex flex-col justify-between overflow-hidden relative">
      <div className="flex items-center justify-between text-xs font-mono text-muted-foreground pb-2 border-b border-border/60">
        <span className="flex items-center gap-1.5 font-bold text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          <span>2D Architecture Schematic (High-Compatibility Mode)</span>
        </span>
        <span className="text-[11px]">8 Sequential Agents · Zero-Trust Pipeline</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 my-auto">
        {STATIONS.map((st, idx) => {
          const ag = agents[idx]
          const isSelected = selectedStepIndex === idx
          const isCurrent = activeStepIndex === idx
          const isCompleted = ag?.status === 'completed'
          const isDenied = ag?.status === 'blocked'
          const isPaused = ag?.status === 'paused'

          return (
            <button
              key={st.step}
              onClick={() => onSelectStep(idx)}
              className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between min-h-[140px] ${
                isSelected
                  ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-md'
                  : 'bg-card/70 border-border hover:bg-card'
              } ${
                isCompleted ? 'border-emerald-500/40' :
                isCurrent ? 'border-blue-500/60 ring-1 ring-blue-500/40' :
                isDenied ? 'border-rose-500/60 bg-rose-500/10' :
                isPaused ? 'border-amber-500/60 bg-amber-500/10' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-[10px] font-mono font-bold text-muted-foreground mb-1">
                  <span>STEP 0{st.step}</span>
                  {isCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {isDenied && <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />}
                  {isPaused && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                </div>
                <h5 className="text-xs font-bold text-foreground">{st.shortName}</h5>
                <p className="text-[10px] text-muted-foreground mt-0.5">{st.role}</p>
              </div>

              <div className="mt-2 text-[9px] font-mono uppercase font-bold text-muted-foreground">
                {st.zone}
              </div>
            </button>
          )
        })}
      </div>

      <div className="text-[11px] font-mono text-muted-foreground text-center pt-2 border-t border-border/60">
        Click any node to inspect parameters · 3D view toggle available in top-right controls
      </div>
    </div>
  )
}

// ── MAIN EXPORTED COMPONENT ───────────────────────────────────────────────────

export function WorkflowPipeline3D({
  agents,
  activeStepIndex,
  selectedStepIndex,
  onSelectStep,
  workflowStatus,
  payee,
  amountRupees,
  isReducedMotion: propReducedMotion,
}: WorkflowPipeline3DProps) {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d')
  const [autoFollow, setAutoFollow] = useState(true)
  const [systemReducedMotion, setSystemReducedMotion] = useState(false)

  // Listen to prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setSystemReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSystemReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const reducedMotion = propReducedMotion ?? systemReducedMotion

  return (
    <div className="h-[420px] w-full rounded-2xl border border-border/80 bg-[#0b1120] relative overflow-hidden shadow-sm">
      {/* ── Top-Right Overlay Controls ── */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {viewMode === '3d' && (
          <>
            <button
              onClick={() => setAutoFollow((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition border backdrop-blur-md flex items-center gap-1.5 ${
                autoFollow
                  ? 'bg-primary/20 text-primary border-primary/40 shadow-sm'
                  : 'bg-slate-900/70 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Automatically follow active agent station during execution"
            >
              <Compass className="h-3 w-3" />
              <span>Auto-Follow: {autoFollow ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setAutoFollow(false)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-900/70 text-slate-300 border border-slate-700 hover:text-white transition backdrop-blur-md flex items-center gap-1.5"
              title="Reset camera to full pipeline view"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Full View</span>
            </button>
          </>
        )}

        {/* 3D / 2D View Switcher */}
        <button
          onClick={() => setViewMode((prev) => (prev === '3d' ? '2d' : '3d'))}
          className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold bg-slate-900/80 text-slate-200 border border-slate-700 hover:bg-slate-800 transition backdrop-blur-md flex items-center gap-1.5 shadow"
        >
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>{viewMode === '3d' ? '2D Schematic' : '3D Stage'}</span>
        </button>
      </div>

      {/* ── Top-Left Ambient Pipeline Stage Badge ── */}
      <div className="absolute top-3 left-4 z-20 pointer-events-none flex items-center gap-2">
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30 backdrop-blur-md flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span>3D Multi-Agent Orchestration Diorama</span>
        </span>
        {workflowStatus === 'running' && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 backdrop-blur-md animate-pulse">
            DISPATCHING INSTRUCTION CAPSULE
          </span>
        )}
        {workflowStatus === 'waiting_approval' && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 backdrop-blur-md animate-pulse">
            ARMORED BLAST SHUTTERS CLOSED (WEBAUTHN)
          </span>
        )}
        {workflowStatus === 'denied' && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 backdrop-blur-md">
            INVARIANT VIOLATION · DIVERSION BLOCKED
          </span>
        )}
      </div>

      {/* ── 3D View or 2D Fallback ── */}
      {viewMode === '2d' ? (
        <Pipeline2DFallback
          agents={agents}
          activeStepIndex={activeStepIndex}
          selectedStepIndex={selectedStepIndex}
          onSelectStep={onSelectStep}
          workflowStatus={workflowStatus}
        />
      ) : (
        <WebGLErrorBoundary
          fallback={
            <Pipeline2DFallback
              agents={agents}
              activeStepIndex={activeStepIndex}
              selectedStepIndex={selectedStepIndex}
              onSelectStep={onSelectStep}
              workflowStatus={workflowStatus}
            />
          }
        >
          <Canvas
            shadows
            dpr={[1, 2]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            camera={{ position: [0, 9.2, 14.5], fov: 35 }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.25
            }}
          >
            {/* Background & Depth Fog */}
            <color attach="background" args={['#0b1120']} />
            <fog attach="fog" args={['#0b1120', 22, 42]} />

            {/* Studio Lighting Rig */}
            <StudioLighting />

            {/* Camera Rig with Auto-Follow */}
            <CameraRig
              activeStepIndex={activeStepIndex}
              autoFollow={autoFollow}
              reducedMotion={reducedMotion}
            />

            {/* 3-Zone Brushed Titanium Pipeline Platform */}
            <PipelineDeck />

            {/* Elevated Froduit Conduits between adjacent stations */}
            {STATIONS.slice(0, -1).map((st, i) => {
              const nextSt = STATIONS[i + 1]
              const segmentStatus =
                activeStepIndex > i
                  ? 'completed'
                  : activeStepIndex === i
                  ? 'active'
                  : workflowStatus === 'denied' && i === activeStepIndex - 1
                  ? 'denied'
                  : 'idle'

              return (
                <ConduitSegment
                  key={`conduit-${i}`}
                  from={st}
                  to={nextSt}
                  status={segmentStatus}
                />
              )
            })}

            {/* Traveling 3D Instruction Capsule & Shockwave */}
            <TravelingCapsule
              activeStepIndex={activeStepIndex}
              workflowStatus={workflowStatus}
              reducedMotion={reducedMotion}
            />

            {/* 8 Distinct 3D Station Pods */}
            {STATIONS.map((st, idx) => {
              const ag = agents[idx]
              const isActive = activeStepIndex === idx && workflowStatus === 'running'
              const isCompleted = ag?.status === 'completed'
              const isDenied = ag?.status === 'blocked'
              const isWaiting = ag?.status === 'paused' || (st.step === 5 && workflowStatus === 'waiting_approval')
              const isSelected = selectedStepIndex === idx

              return (
                <group
                  key={st.step}
                  position={[st.x, 0, st.z]}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectStep(idx)
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation()
                    document.body.style.cursor = 'pointer'
                  }}
                  onPointerOut={() => {
                    document.body.style.cursor = 'default'
                  }}
                >
                  <PodSculpture
                    station={st}
                    agent={ag}
                    isActive={isActive}
                    isCompleted={isCompleted}
                    isDenied={isDenied}
                    isWaiting={isWaiting}
                    isSelected={isSelected}
                    reducedMotion={reducedMotion}
                  />
                </group>
              )
            })}

            {/* Contact Shadows grounding the entire diorama */}
            <ContactShadows
              position={[0, -0.4, 0]}
              opacity={0.65}
              scale={24}
              blur={2.4}
              far={4}
            />
          </Canvas>
        </WebGLErrorBoundary>
      )}
    </div>
  )
}
