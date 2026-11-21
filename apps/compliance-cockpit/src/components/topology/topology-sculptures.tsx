'use client'

import React, { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { TopologyNode } from './service-nodes-data'

export interface SculptureProps {
  node: TopologyNode
  isSelected: boolean
  onSelect: () => void
  onHover?: (node: TopologyNode | null) => void
  protectionEnabled?: boolean
  globalFreeze?: boolean
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
  isQuarantined?: boolean
  isTampered?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Conduit Tube Subcomponent: Creates an elevated frosted glass conduit
// ─────────────────────────────────────────────────────────────────────────────
function ElevatedConduitTube({
  points,
  coreColor = '#38bdf8',
  archY = 0.35,
}: {
  points: [[number, number, number], [number, number, number]]
  coreColor?: string
  archY?: number
}) {
  const curve = useMemo(() => {
    const p1 = new THREE.Vector3(...points[0])
    const p2 = new THREE.Vector3(...points[1])
    const mid = new THREE.Vector3()
      .addVectors(p1, p2)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, archY, 0))
    return new THREE.QuadraticBezierCurve3(p1, mid, p2)
  }, [points, archY])

  const tubeGeom = useMemo(() => new THREE.TubeGeometry(curve, 32, 0.045, 8, false), [curve])
  const coreGeom = useMemo(() => new THREE.TubeGeometry(curve, 32, 0.016, 6, false), [curve])

  return (
    <group>
      {/* Outer Frosted Glass Conduit */}
      <mesh geometry={tubeGeom}>
        <meshPhysicalMaterial
          color="#334155"
          roughness={0.15}
          transmission={0.65}
          thickness={0.2}
          transparent
          opacity={0.65}
          metalness={0.1}
        />
      </mesh>
      {/* Glowing Inner Optical Core */}
      <mesh geometry={coreGeom}>
        <meshBasicMaterial color={coreColor} transparent opacity={0.75} />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Studio-Lit Base Deck, 3 Raised Zone Decks, Elevated Conduits & Nameplates
// ─────────────────────────────────────────────────────────────────────────────
export function MotherboardDeck({
  nodes,
  protectionEnabled = true,
  globalFreeze = false,
  activeScenario = null,
  animatingRay = false,
  simulationVerdict = 'idle',
}: {
  nodes: TopologyNode[]
  protectionEnabled?: boolean
  globalFreeze?: boolean
  activeScenario?: any
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
}) {
  const dmzBorderColor = globalFreeze
    ? '#f59e0b'
    : simulationVerdict === 'breached'
      ? '#f43f5e'
      : protectionEnabled
        ? '#10b981'
        : '#f43f5e'

  return (
    <group position={[0, 0, 0]}>
      {/* ── Main Floating 3D Base Deck (17.5 × 9.2 × 0.36) ────────────────── */}
      <mesh position={[0, -0.18, 0]} receiveShadow castShadow>
        <boxGeometry args={[17.5, 0.36, 9.2]} />
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.58}
          metalness={0.32}
        />
      </mesh>

      {/* Brushed-Aluminum Perimeter Trim Frame */}
      <mesh position={[0, -0.18, 0]}>
        <boxGeometry args={[17.65, 0.32, 9.35]} />
        <meshStandardMaterial
          color="#475569"
          metalness={0.7}
          roughness={0.25}
          wireframe
        />
      </mesh>

      {/* Architectural Blueprint Grid Lines on top of Base Deck */}
      <gridHelper
        args={[17.2, 28, '#475569', '#334155']}
        position={[0, 0.005, 0]}
      />

      {/* ── 3 Raised Zone Decks (y = 0.04, height = 0.08) ─────────────────── */}

      {/* Zone 1: Untrusted Agent Edge (x = -5.6, width = 5.4) */}
      <group position={[-5.6, 0.04, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[5.4, 0.08, 8.6]} />
          <meshStandardMaterial color="#1f2c42" roughness={0.45} metalness={0.4} />
        </mesh>
        {/* Cyan Front Edge Trim */}
        <mesh position={[0, 0.045, 4.28]}>
          <boxGeometry args={[5.4, 0.02, 0.06]} />
          <meshBasicMaterial color="#0ea5e9" />
        </mesh>
        {/* Back Edge Zone Header Label */}
        <Text
          position={[0, 0.05, -4.0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.24}
          color="#38bdf8"
          letterSpacing={0.12}
          anchorX="center"
          anchorY="middle"
        >
          01 · UNTRUSTED AGENT EDGE
        </Text>
      </group>

      {/* Zone 2: Zero-Trust DMZ Gate (x = 0.0, width = 4.6) */}
      <group position={[0.0, 0.04, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[4.6, 0.08, 8.6]} />
          <meshStandardMaterial color="#1d2e3a" roughness={0.45} metalness={0.4} />
        </mesh>
        {/* Dynamic Edge Trim (Emerald when Armed, Crimson when Bypass/Breached, Amber on Freeze) */}
        <mesh position={[0, 0.045, 4.28]}>
          <boxGeometry args={[4.6, 0.02, 0.06]} />
          <meshBasicMaterial color={dmzBorderColor} />
        </mesh>
        {/* Back Edge Zone Header Label */}
        <Text
          position={[0, 0.05, -4.0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.24}
          color={dmzBorderColor}
          letterSpacing={0.12}
          anchorX="center"
          anchorY="middle"
        >
          02 · ZERO-TRUST DMZ GATE
        </Text>
      </group>

      {/* Zone 3: Sovereign Bank Vault (x = +5.6, width = 5.6) */}
      <group position={[5.6, 0.04, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[5.6, 0.08, 8.6]} />
          <meshStandardMaterial color="#232944" roughness={0.45} metalness={0.4} />
        </mesh>
        {/* Indigo/Violet Front Edge Trim */}
        <mesh position={[0, 0.045, 4.28]}>
          <boxGeometry args={[5.6, 0.02, 0.06]} />
          <meshBasicMaterial color="#6366f1" />
        </mesh>
        {/* Back Edge Zone Header Label */}
        <Text
          position={[0, 0.05, -4.0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.24}
          color="#818cf8"
          letterSpacing={0.12}
          anchorX="center"
          anchorY="middle"
        >
          03 · SOVEREIGN BANK VAULT
        </Text>
      </group>

      {/* ── Elevated Glowing Glass Conduits (Catmull-Rom Splines 0.35 above deck) ─ */}
      {/* 1. Inbound Untrusted Edge: Agent [-5.8, -0.6] -> Gateway [0, -0.4] */}
      <ElevatedConduitTube
        points={[[-5.8, 0.24, -0.6], [0, 0.24, -0.4]]}
        coreColor="#06b6d4"
        archY={0.32}
      />
      {/* 2. Protected Banking Rail: Gateway [0, -0.4] -> Bank Gate [4.6, -2.0] */}
      <ElevatedConduitTube
        points={[[0, 0.24, -0.4], [4.6, 0.24, -2.0]]}
        coreColor="#34d399"
        archY={0.35}
      />
      {/* 3. Bank Gate [4.6, -2.0] -> Ledger Adapter [6.5, 0.3] */}
      <ElevatedConduitTube
        points={[[4.6, 0.24, -2.0], [6.5, 0.24, 0.3]]}
        coreColor="#3b82f6"
        archY={0.3}
      />
      {/* 4. Ledger Adapter [6.5, 0.3] -> TigerBeetle [4.8, 2.5] */}
      <ElevatedConduitTube
        points={[[6.5, 0.24, 0.3], [4.8, 0.24, 2.5]]}
        coreColor="#8b5cf6"
        archY={0.32}
      />
      {/* 5. Cryptographic Notary Bus: Gateway [0, -0.4] -> Witness [0, 2.8] */}
      <ElevatedConduitTube
        points={[[0, 0.24, -0.4], [0, 0.24, 2.8]]}
        coreColor="#f59e0b"
        archY={0.35}
      />
      {/* 6. Merkle Audit Verification Bus: TigerBeetle [4.8, 2.5] -> Witness [0, 2.8] */}
      <ElevatedConduitTube
        points={[[4.8, 0.24, 2.5], [0, 0.24, 2.8]]}
        coreColor="#f59e0b"
        archY={0.36}
      />
      {/* 7. Live SOC Telemetry Bus: Gateway [0, -0.4] -> Cockpit [-5.2, 2.7] */}
      <ElevatedConduitTube
        points={[[0, 0.24, -0.4], [-5.2, 0.24, 2.7]]}
        coreColor="#ec4899"
        archY={0.34}
      />

      {/* ── Octagonal Pedestals & Angled 3D Nameplate Plaques Under Every Sculpture ── */}
      {nodes.map((n) => {
        const isGw = n.id === 'gateway'
        const collarColor = isGw ? dmzBorderColor : n.color

        return (
          <group key={`pedestal-group-${n.id}`} position={[n.position[0], 0, n.position[2]]}>
            {/* Raised Bevelled Octagonal Pedestal Base */}
            <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
              <cylinderGeometry args={[0.85, 0.92, 0.22, 8]} />
              <meshStandardMaterial
                color="#2b3852"
                roughness={0.25}
                metalness={0.8}
              />
            </mesh>

            {/* Glowing Colored LED Collar Ring */}
            <mesh position={[0, 0.235, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.76, 0.85, 32]} />
              <meshBasicMaterial color={collarColor} transparent opacity={0.85} />
            </mesh>

            {/* ── Angled 3D Nameplate Plaque (Directly in front: z + 1.25, y = 0.26) ── */}
            <group position={[0, 0.26, 1.25]} rotation={[-Math.PI / 3.2, 0, 0]}>
              {/* Thin Backing Slab with Colored Border */}
              <mesh>
                <boxGeometry args={[2.2, 0.62, 0.04]} />
                <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.7} />
              </mesh>
              {/* Plaque Perimeter Edge */}
              <mesh>
                <boxGeometry args={[2.24, 0.66, 0.02]} />
                <meshStandardMaterial color={collarColor} roughness={0.2} metalness={0.8} wireframe />
              </mesh>

              {/* Line 1: Bold Node Name */}
              <Text
                position={[0, 0.10, 0.028]}
                fontSize={0.22}
                color="#f8fafc"
                letterSpacing={0.04}
                anchorX="center"
                anchorY="middle"
              >
                {n.name}
              </Text>

              {/* Line 2: Port or Subtitle */}
              <Text
                position={[0, -0.13, 0.028]}
                fontSize={0.15}
                color="#94a3b8"
                letterSpacing={0.02}
                anchorX="center"
                anchorY="middle"
              >
                {n.port ? `:${n.port} · ${n.role}` : n.subtitle}
              </Text>
            </group>
          </group>
        )
      })}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hardware #1: AI Agent Runtime (Left-Back: [-5.8, 0.24, -0.6])
// ─────────────────────────────────────────────────────────────────────────────
export function OctahedronAgentSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  isQuarantined = false,
}: SculptureProps) {
  const coreRef = useRef<THREE.Mesh>(null)
  const gyro1Ref = useRef<THREE.Mesh>(null)
  const gyro2Ref = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    const mult = isQuarantined ? 0.2 : hovered ? 2.0 : 1.0
    if (coreRef.current) {
      coreRef.current.rotation.y += delta * 0.7 * mult
      coreRef.current.rotation.z += delta * 0.35 * mult
    }
    if (gyro1Ref.current) {
      gyro1Ref.current.rotation.x += delta * 1.2 * mult
      gyro1Ref.current.rotation.y += delta * 0.8 * mult
    }
    if (gyro2Ref.current) {
      gyro2Ref.current.rotation.y -= delta * 1.0 * mult
      gyro2Ref.current.rotation.z += delta * 0.6 * mult
    }
  })

  const coreColor = isQuarantined ? '#f43f5e' : '#06b6d4'

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Brushed-Titanium Octagonal CPU Base Plinth */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.72, 0.22, 8]} />
        <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
      </mesh>

      {/* Titanium Micro-Heatsink Fins */}
      {[-0.32, -0.16, 0, 0.16, 0.32].map((x, i) => (
        <mesh key={`fin-${i}`} position={[x, 0.28, 0]}>
          <boxGeometry args={[0.04, 0.14, 0.68]} />
          <meshStandardMaterial color="#475569" roughness={0.2} metalness={0.9} />
        </mesh>
      ))}

      {/* Levitating Glowing Cyan Crystalline Neural Core */}
      <mesh ref={coreRef} position={[0, 0.75, 0]}>
        <octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={isQuarantined ? 1.8 : isSelected ? 1.4 : hovered ? 1.2 : 0.8}
          roughness={0.15}
          metalness={0.9}
        />
      </mesh>

      {/* Tilted Rotating Precision Gyro-Ring 1 */}
      <mesh ref={gyro1Ref} position={[0, 0.75, 0]}>
        <torusGeometry args={[0.54, 0.018, 16, 36]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#38bdf8"
          emissiveIntensity={isSelected ? 1.0 : 0.5}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Tilted Rotating Precision Gyro-Ring 2 */}
      <mesh ref={gyro2Ref} position={[0, 0.75, 0]} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.62, 0.016, 16, 36]} />
        <meshStandardMaterial
          color="#0ea5e9"
          emissive="#0ea5e9"
          emissiveIntensity={isSelected ? 0.9 : 0.4}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Hardware #2: AgentShield Gateway :8080 (Hero Centerpiece: [0, 0.24, -0.4])
// ─────────────────────────────────────────────────────────────────────────────
export function VaultGatewaySculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  protectionEnabled = true,
  globalFreeze = false,
  animatingRay = false,
  simulationVerdict = 'idle',
}: SculptureProps) {
  const leftShutterRef = useRef<THREE.Mesh>(null)
  const rightShutterRef = useRef<THREE.Mesh>(null)
  const curtainRef = useRef<THREE.Mesh>(null)
  const scanlineRef = useRef<THREE.Mesh>(null)
  const freezeBar1Ref = useRef<THREE.Mesh>(null)
  const freezeBar2Ref = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    // Mechanical Sliding Blast Shutters (Armed = closed together; Bypass = retracted into pylons)
    const targetLeftX = protectionEnabled ? -0.24 : -0.85
    const targetRightX = protectionEnabled ? 0.24 : 0.85

    if (leftShutterRef.current) {
      leftShutterRef.current.position.x += (targetLeftX - leftShutterRef.current.position.x) * delta * 7.0
    }
    if (rightShutterRef.current) {
      rightShutterRef.current.position.x += (targetRightX - rightShutterRef.current.position.x) * delta * 7.0
    }

    // Holographic Energy Shield Curtain (collapses when bypass)
    if (curtainRef.current) {
      const targetScaleY = protectionEnabled ? 1.0 : 0.05
      const targetOpacity = protectionEnabled ? (animatingRay ? 0.55 : 0.38) : 0.04
      curtainRef.current.scale.y += (targetScaleY - curtainRef.current.scale.y) * delta * 7.0
      const mat = curtainRef.current.material as THREE.MeshStandardMaterial
      mat.opacity += (targetOpacity - mat.opacity) * delta * 6.0
    }

    // Vertical Laser Scanline Sweep
    if (scanlineRef.current && protectionEnabled) {
      scanlineRef.current.position.y = 1.0 + Math.sin(Date.now() * 0.007) * 0.5
    }
  })

  const archColor = globalFreeze
    ? '#f59e0b'
    : simulationVerdict === 'breached'
      ? '#f43f5e'
      : protectionEnabled
        ? '#10b981'
        : '#f43f5e'

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* ── Twin-Pillar Reinforced Titanium Fortress Archway (2.6 units tall) ─ */}
      {/* West Armored Column */}
      <mesh position={[-0.95, 1.1, 0]} castShadow>
        <boxGeometry args={[0.34, 2.2, 0.95]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.88} />
      </mesh>
      {/* West Vertical Status LED Strip */}
      <mesh position={[-0.95, 1.1, 0.5]}>
        <boxGeometry args={[0.12, 1.8, 0.03]} />
        <meshBasicMaterial color={archColor} />
      </mesh>

      {/* East Armored Column */}
      <mesh position={[0.95, 1.1, 0]} castShadow>
        <boxGeometry args={[0.34, 2.2, 0.95]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.88} />
      </mesh>
      {/* East Vertical Status LED Strip */}
      <mesh position={[0.95, 1.1, 0.5]}>
        <boxGeometry args={[0.12, 1.8, 0.03]} />
        <meshBasicMaterial color={archColor} />
      </mesh>

      {/* Heavy Top Lintel Bridge Connecting Columns */}
      <mesh position={[0, 2.25, 0]} castShadow>
        <boxGeometry args={[2.3, 0.28, 0.98]} />
        <meshStandardMaterial color="#1e293b" roughness={0.25} metalness={0.82} />
      </mesh>

      {/* ── Mechanical Twin Blast Shutters (Slide open on Bypass) ─────────── */}
      <mesh ref={leftShutterRef} position={[-0.24, 1.05, 0]} castShadow>
        <boxGeometry args={[0.46, 1.9, 0.16]} />
        <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh ref={rightShutterRef} position={[0.24, 1.05, 0]} castShadow>
        <boxGeometry args={[0.46, 1.9, 0.16]} />
        <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* ── Translucent Glowing Holographic Energy Shield Curtain ─────────── */}
      <mesh ref={curtainRef} position={[0, 1.05, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.88, 1.85]} />
        <meshStandardMaterial
          color={archColor}
          emissive={archColor}
          emissiveIntensity={protectionEnabled ? 1.0 : 0.1}
          transparent
          opacity={protectionEnabled ? 0.38 : 0.04}
          side={THREE.DoubleSide}
          wireframe={!protectionEnabled}
        />
      </mesh>

      {/* Vertical Animated Laser Scanline */}
      <mesh ref={scanlineRef} position={[0, 1.0, 0]}>
        <boxGeometry args={[1.52, 0.024, 0.06]} />
        <meshBasicMaterial color="#34d399" transparent opacity={protectionEnabled ? 0.9 : 0} />
      </mesh>

      {/* ── Emergency Global Freeze Heavy Amber Containment Lock Bars ──────── */}
      {globalFreeze && (
        <group position={[0, 1.05, 0.18]}>
          <mesh ref={freezeBar1Ref} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[2.0, 0.12, 0.08]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive="#f59e0b"
              emissiveIntensity={1.2}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
          <mesh ref={freezeBar2Ref} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[2.0, 0.12, 0.08]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive="#f59e0b"
              emissiveIntensity={1.2}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
        </group>
      )}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hardware #3: Bank Gate :4000 (Biometric Airlock Arch: [4.6, 0.24, -2.0])
// ─────────────────────────────────────────────────────────────────────────────
export function AirlockGateSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  animatingRay = false,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const scannerRef = useRef<THREE.Mesh>(null)
  const laserRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (scannerRef.current) {
      scannerRef.current.rotation.z += delta * (animatingRay ? 4.5 : 1.2)
    }
    if (laserRef.current) {
      laserRef.current.position.y = 0.65 + Math.sin(Date.now() * 0.006) * 0.3
    }
  })

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Plinth Base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[1.3, 0.2, 0.9]} />
        <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
      </mesh>

      {/* Double Concentric Titanium Vault Door Outer Ring */}
      <mesh position={[0, 0.72, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.58, 0.08, 16, 36]} />
        <meshStandardMaterial color="#64748b" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Double Concentric Inner Ring */}
      <mesh position={[0, 0.72, 0]}>
        <torusGeometry args={[0.42, 0.05, 16, 36]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.85} />
      </mesh>

      {/* Spinning Keyway Scanner Core */}
      <mesh ref={scannerRef} position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.12, 6]} />
        <meshStandardMaterial
          color="#10b981"
          emissive="#10b981"
          emissiveIntensity={animatingRay ? 1.6 : isSelected ? 1.2 : 0.6}
          roughness={0.15}
          metalness={0.85}
        />
      </mesh>

      {/* Dual Vertical Verification Laser Emitter Bar */}
      <mesh ref={laserRef} position={[0, 0.65, 0]}>
        <boxGeometry args={[0.72, 0.02, 0.02]} />
        <meshBasicMaterial color="#34d399" />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Hardware #4: Ledger Adapter :4001 (Blade Server: [6.5, 0.24, 0.3])
// ─────────────────────────────────────────────────────────────────────────────
export function HexAdapterSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const [ledFlash, setLedFlash] = useState(false)

  useFrame(() => {
    if (Math.random() < 0.05) {
      setLedFlash((prev) => !prev)
    }
  })

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Plinth Base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[1.1, 0.2, 0.9]} />
        <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
      </mesh>

      {/* Layered 3-Rack Horizontal API Bus Blade Server */}
      {[0.32, 0.56, 0.8].map((y, idx) => (
        <group key={`blade-${idx}`} position={[0, y, 0]}>
          {/* Anodized Aluminum Blade Server Chassis */}
          <mesh castShadow>
            <boxGeometry args={[0.92, 0.16, 0.72]} />
            <meshStandardMaterial color="#475569" roughness={0.25} metalness={0.8} />
          </mesh>

          {/* Front Panel Drive Bays */}
          <mesh position={[0, 0, 0.37]}>
            <boxGeometry args={[0.84, 0.1, 0.02]} />
            <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.7} />
          </mesh>

          {/* Blinking Cobalt LED Indicator Bars */}
          <mesh position={[-0.32, 0, 0.385]}>
            <boxGeometry args={[0.06, 0.04, 0.01]} />
            <meshBasicMaterial color={ledFlash && idx === 0 ? '#60a5fa' : '#3b82f6'} />
          </mesh>
          <mesh position={[-0.22, 0, 0.385]}>
            <boxGeometry args={[0.06, 0.04, 0.01]} />
            <meshBasicMaterial color="#34d399" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Hardware #5: TigerBeetle Cluster :3001 (Citadel: [4.8, 0.24, 2.5])
// ─────────────────────────────────────────────────────────────────────────────
export function QuorumTriadSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  simulationVerdict = 'idle',
  protectionEnabled = true,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const haloRef = useRef<THREE.Mesh>(null)
  const isBreached = simulationVerdict === 'breached' && !protectionEnabled

  useFrame((_, delta) => {
    if (haloRef.current) {
      haloRef.current.rotation.z += delta * (isBreached ? 3.5 : 0.9)
    }
  })

  const clusterColor = isBreached ? '#f43f5e' : '#8b5cf6'

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Triangular Plinth Base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.88, 0.96, 0.2, 3]} />
        <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
      </mesh>

      {/* Shared Metallic Cap Ring linking the Citadel */}
      <mesh ref={haloRef} position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.65, 0.022, 16, 36]} />
        <meshStandardMaterial
          color={clusterColor}
          emissive={clusterColor}
          emissiveIntensity={isBreached ? 1.8 : isSelected ? 1.2 : 0.6}
        />
      </mesh>

      {/* 3 Glossy Titanium-and-Glass Vertical Storage Cylinders */}
      {[
        [0, 0.48, -0.42],
        [-0.38, 0.48, 0.26],
        [0.38, 0.48, 0.26],
      ].map(([x, y, z], i) => (
        <group key={`cylinder-${i}`} position={[x, y, z]}>
          {/* Main Storage Cylinder */}
          <mesh castShadow>
            <cylinderGeometry args={[0.26, 0.28, 0.65, 24]} />
            <meshStandardMaterial
              color={isBreached ? '#ef4444' : '#1e293b'}
              roughness={0.2}
              metalness={0.88}
            />
          </mesh>
          {/* Glowing Violet Data Ring */}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.08, 24]} />
            <meshStandardMaterial
              color="#a855f7"
              emissive="#a855f7"
              emissiveIntensity={isBreached ? 1.8 : 0.9}
            />
          </mesh>
          {/* Brushed Metallic Lid */}
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.06, 24]} />
            <meshStandardMaterial color="#64748b" roughness={0.15} metalness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Hardware #6: Independent Witness :5000 (Obelisk: [0, 0.24, 2.8])
// ─────────────────────────────────────────────────────────────────────────────
export function MerkleTowerSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const crystalRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (crystalRef.current) {
      crystalRef.current.rotation.y += delta * 0.8
      crystalRef.current.rotation.x += delta * 0.3
    }
    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 1.1
    }
  })

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Stepped Pyramid Pedestal Base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.75, 0.2, 8]} />
        <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.48, 0.58, 0.15, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.2} metalness={0.9} />
      </mesh>

      {/* Obelisk Column Body */}
      <mesh position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.32, 0.42, 0.55, 8]} />
        <meshStandardMaterial color="#1e293b" roughness={0.25} metalness={0.8} />
      </mesh>

      {/* Slowly Rotating Golden Octahedron Crystal */}
      <mesh ref={crystalRef} position={[0, 1.05, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#f59e0b"
          emissiveIntensity={isSelected ? 1.6 : hovered ? 1.2 : 0.75}
          roughness={0.1}
          metalness={0.95}
        />
      </mesh>

      {/* Orbiting Notarization Ring */}
      <mesh ref={ringRef} position={[0, 1.05, 0]} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[0.46, 0.016, 16, 32]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={1.0}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Hardware #7: Compliance Cockpit :3000 (Console: [-5.2, 0.24, 2.7])
// ─────────────────────────────────────────────────────────────────────────────
export function CockpitSlabSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <group
      position={[node.position[0], node.position[1] + (hovered ? 0.08 : 0), node.position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(null)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Metallic Desk Plinth Base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[1.25, 0.2, 0.85]} />
        <meshStandardMaterial color="#334155" roughness={0.25} metalness={0.85} />
      </mesh>

      {/* Desk Surface Tabletop */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[1.15, 0.06, 0.75]} />
        <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.8} />
      </mesh>

      {/* Left Curved Translucent Frosted-Glass Telemetry Screen */}
      <group position={[-0.26, 0.48, 0]} rotation={[-0.28, 0.2, 0]}>
        <mesh>
          <boxGeometry args={[0.48, 0.38, 0.02]} />
          <meshStandardMaterial
            color="#ec4899"
            emissive="#ec4899"
            emissiveIntensity={isSelected ? 1.0 : hovered ? 0.8 : 0.45}
            transparent
            opacity={0.85}
            roughness={0.15}
          />
        </mesh>
        {/* Glowing Status Mini-Bar */}
        <mesh position={[0, -0.12, 0.015]}>
          <boxGeometry args={[0.38, 0.03, 0.005]} />
          <meshBasicMaterial color="#f472b6" />
        </mesh>
      </group>

      {/* Right Curved Translucent Frosted-Glass Telemetry Screen */}
      <group position={[0.26, 0.48, 0]} rotation={[-0.28, -0.2, 0]}>
        <mesh>
          <boxGeometry args={[0.48, 0.38, 0.02]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#38bdf8"
            emissiveIntensity={isSelected ? 1.0 : hovered ? 0.8 : 0.45}
            transparent
            opacity={0.85}
            roughness={0.15}
          />
        </mesh>
        {/* Glowing Status Mini-Bar */}
        <mesh position={[0, -0.12, 0.015]}>
          <boxGeometry args={[0.38, 0.03, 0.005]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      </group>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Reusable Export: Agent 3D Quarantine Wireframe Lock Cage (Scenario #5)
// ─────────────────────────────────────────────────────────────────────────────
export function AgentQuarantineCage({
  position = [-5.8, 0.7, -0.6],
  active = false,
}: {
  position?: [number, number, number]
  active?: boolean
}) {
  const cageRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (cageRef.current && active) {
      cageRef.current.rotation.y += delta * 0.45
    }
  })

  if (!active) return null

  return (
    <group position={position}>
      <mesh ref={cageRef}>
        <boxGeometry args={[1.7, 1.7, 1.7]} />
        <meshStandardMaterial
          color="#f43f5e"
          wireframe
          transparent
          opacity={0.9}
          emissive="#f43f5e"
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Reusable Export: Subterranean DB Tamper Crimson Spike (Scenario #7)
// ─────────────────────────────────────────────────────────────────────────────
export function DbTamperSpike({
  position = [4.8, 0.24, 2.5],
  active = false,
}: {
  position?: [number, number, number]
  active?: boolean
}) {
  const spikeRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (spikeRef.current && active) {
      spikeRef.current.rotation.y += delta * 1.5
    }
  })

  if (!active) return null

  return (
    <group position={position}>
      <mesh ref={spikeRef} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.42, 1.2, 6]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={1.8}
          roughness={0.2}
          metalness={0.7}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Master Sculpture Dispatcher
// ─────────────────────────────────────────────────────────────────────────────
export function ArchitecturalSculpture(props: SculptureProps) {
  switch (props.node.sculptureType) {
    case 'octahedron-agent':
      return <OctahedronAgentSculpture {...props} />
    case 'vault-gateway':
      return <VaultGatewaySculpture {...props} />
    case 'airlock-gate':
      return <AirlockGateSculpture {...props} />
    case 'hex-adapter':
      return <HexAdapterSculpture {...props} />
    case 'quorum-triad':
      return <QuorumTriadSculpture {...props} />
    case 'merkle-tower':
      return <MerkleTowerSculpture {...props} />
    case 'cockpit-slab':
      return <CockpitSlabSculpture {...props} />
    default:
      return <VaultGatewaySculpture {...props} />
  }
}
