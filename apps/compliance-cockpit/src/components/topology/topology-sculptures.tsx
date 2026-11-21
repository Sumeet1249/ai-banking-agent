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
// 1. Sovereign Vault Silicon Motherboard & Center Air-Gap Trench (y = -1.2)
// ─────────────────────────────────────────────────────────────────────────────
export function MotherboardDeck({
  nodes,
  protectionEnabled = true,
  globalFreeze = false,
}: {
  nodes: TopologyNode[]
  protectionEnabled?: boolean
  globalFreeze?: boolean
}) {
  return (
    <group position={[0, -1.2, 0]}>
      {/* ── Left Motherboard Half (Untrusted Zone) ────────────────────────── */}
      <mesh position={[-5.3, 0, 0]} receiveShadow>
        <boxGeometry args={[6.2, 0.45, 9.6]} />
        <meshStandardMaterial
          color="#0E131F"
          roughness={0.28}
          metalness={0.78}
        />
      </mesh>

      {/* ── Right Motherboard Half (Core Vault Zone) ──────────────────────── */}
      <mesh position={[5.3, 0, 0]} receiveShadow>
        <boxGeometry args={[6.2, 0.45, 9.6]} />
        <meshStandardMaterial
          color="#0E131F"
          roughness={0.28}
          metalness={0.78}
        />
      </mesh>

      {/* ── Recessed Air-Gap Trench Floor (Zero-Trust Chasm) ─────────────── */}
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[4.4, 0.16, 9.6]} />
        <meshStandardMaterial
          color="#05070C"
          roughness={0.65}
          metalness={0.3}
        />
      </mesh>

      {/* Trench Warning Hazard Strips (Physical Edge Borders) */}
      <mesh position={[-2.2, 0.23, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, 9.6]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.35} />
      </mesh>
      <mesh position={[2.2, 0.23, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, 9.6]} />
        <meshBasicMaterial color="#10B981" transparent opacity={0.35} />
      </mesh>

      {/* ── Raised PCB Fiber-Optic Bus Channels (45°-Chamfered Metal Tracks) ─ */}
      {/* Track 1: Agent [-5.6, 0] to Gateway [-1.2, 0] */}
      <mesh position={[-3.4, 0.235, 0]}>
        <boxGeometry args={[4.4, 0.04, 0.28]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Recessed Glowing Optic Core 1 */}
      <mesh position={[-3.4, 0.258, 0]}>
        <boxGeometry args={[4.4, 0.01, 0.08]} />
        <meshBasicMaterial color="#06B6D4" transparent opacity={0.65} />
      </mesh>

      {/* Track 2: Gateway [1.2, 0] to Bank Gate [4.2, -2.2] */}
      <mesh position={[2.7, 0.235, -1.1]} rotation={[0, 0.63, 0]}>
        <boxGeometry args={[3.6, 0.04, 0.28]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[2.7, 0.258, -1.1]} rotation={[0, 0.63, 0]}>
        <boxGeometry args={[3.6, 0.01, 0.08]} />
        <meshBasicMaterial color="#34D399" transparent opacity={0.6} />
      </mesh>

      {/* Track 3: Bank Gate [4.2, -2.2] to Ledger Adapter [6.0, 0] */}
      <mesh position={[5.1, 0.235, -1.1]} rotation={[0, -0.68, 0]}>
        <boxGeometry args={[3.0, 0.04, 0.28]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[5.1, 0.258, -1.1]} rotation={[0, -0.68, 0]}>
        <boxGeometry args={[3.0, 0.01, 0.08]} />
        <meshBasicMaterial color="#3B82F6" transparent opacity={0.6} />
      </mesh>

      {/* Track 4: Ledger Adapter [6.0, 0] to TigerBeetle [4.8, 2.2] */}
      <mesh position={[5.4, 0.235, 1.1]} rotation={[0, 0.52, 0]}>
        <boxGeometry args={[2.8, 0.04, 0.28]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[5.4, 0.258, 1.1]} rotation={[0, 0.52, 0]}>
        <boxGeometry args={[2.8, 0.01, 0.08]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.65} />
      </mesh>

      {/* Track 5: Gateway [0, 0] to Witness [0.8, 3.4] */}
      <mesh position={[0.4, 0.235, 1.7]} rotation={[0, -0.23, 0]}>
        <boxGeometry args={[0.28, 0.04, 3.5]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0.4, 0.258, 1.7]} rotation={[0, -0.23, 0]}>
        <boxGeometry args={[0.08, 0.01, 3.5]} />
        <meshBasicMaterial color="#F59E0B" transparent opacity={0.6} />
      </mesh>

      {/* Track 6: Witness [0.8, 3.4] to TigerBeetle [4.8, 2.2] (Merkle Scan Line) */}
      <mesh position={[2.8, 0.235, 2.8]} rotation={[0, 0.29, 0]}>
        <boxGeometry args={[4.2, 0.03, 0.2]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[2.8, 0.258, 2.8]} rotation={[0, 0.29, 0]}>
        <boxGeometry args={[4.2, 0.01, 0.06]} />
        <meshBasicMaterial color="#F59E0B" transparent opacity={0.5} />
      </mesh>

      {/* ── PCB Silk-Screen Monospace 3D Text (Zero Overlapping Pills!) ──── */}
      {/* Zone Header Labels at Rear of Motherboard */}
      <Text
        position={[-5.3, 0.24, -4.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.24}
        color="#64748B"
        letterSpacing={0.12}
      >
        01 · UNTRUSTED EDGE FOUNDRY
      </Text>
      <Text
        position={[0.0, 0.24, -4.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.24}
        color={protectionEnabled ? '#10B981' : '#F43F5E'}
        letterSpacing={0.12}
      >
        02 · ZERO-TRUST DMZ BRIDGE
      </Text>
      <Text
        position={[5.3, 0.24, -4.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.24}
        color="#38BDF8"
        letterSpacing={0.12}
      >
        03 · CORE BANKING VAULT CITADEL
      </Text>

      {/* Individual Hardware Module Silk-Screen Labels Printed Flat on Deck */}
      {nodes.map((n) => {
        const offsetZ = n.id === 'bank-gate' ? 1.05 : n.id === 'tigerbeetle' ? -1.05 : 0.95
        return (
          <group key={`silkscreen-${n.id}`} position={[n.position[0], 0.24, n.position[2] + offsetZ]}>
            <Text
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.19}
              color={n.color}
              letterSpacing={0.08}
              anchorX="center"
              anchorY="middle"
            >
              {n.silkScreenLabel}
            </Text>
            {n.port && (
              <Text
                position={[0, 0, 0.22]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.12}
                color="#64748B"
                letterSpacing={0.05}
                anchorX="center"
                anchorY="middle"
              >
                PORT :{n.port}
              </Text>
            )}
          </group>
        )
      })}

      {/* Beveled Titanium Mounting Pads Beneath Every Hardware Sculpture */}
      {nodes.map((node) => {
        const isGw = node.id === 'gateway'
        return (
          <group key={`plinth-pad-${node.id}`} position={[node.position[0], 0.23, node.position[2]]}>
            {/* Dark Machined Titanium Pad Disc */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.72, 0.88, 36]} />
              <meshStandardMaterial
                color={isGw ? (protectionEnabled ? '#10B981' : '#F43F5E') : node.color}
                emissive={isGw ? (protectionEnabled ? '#10B981' : '#F43F5E') : node.color}
                emissiveIntensity={0.35}
                roughness={0.2}
                metalness={0.8}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hardware #1: AI Agent Foundry (Octagonal Titanium Monolith + Neural Diamond)
// ─────────────────────────────────────────────────────────────────────────────
export function OctahedronAgentSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  isQuarantined = false,
}: SculptureProps) {
  const coreRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    if (coreRef.current) {
      coreRef.current.rotation.y += delta * (isQuarantined ? 2.5 : 0.6)
      coreRef.current.rotation.z += delta * (isQuarantined ? 1.8 : 0.3)
    }
    if (ringRef.current) {
      ringRef.current.rotation.z -= delta * 0.8
    }
  })

  const accentColor = isQuarantined ? '#F43F5E' : node.color

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
      {/* Octagonal Brushed Titanium Monolith Base */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.72, 0.78, 0.22, 8]} />
        <meshStandardMaterial color="#141B29" roughness={0.28} metalness={0.8} />
      </mesh>

      {/* Four Vertical Titanium Cage Struts */}
      {[-0.42, 0.42].map((x) =>
        [-0.42, 0.42].map((z) => (
          <mesh key={`strut-${x}-${z}`} position={[x, 0.3, z]}>
            <boxGeometry args={[0.06, 0.7, 0.06]} />
            <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.85} />
          </mesh>
        ))
      )}

      {/* Horizontal Rotating Telemetry Ring */}
      <mesh ref={ringRef} position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.016, 16, 36]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={isSelected ? 1.0 : hovered ? 0.8 : 0.35}
        />
      </mesh>

      {/* Suspended Faceted Neural Diamond Core */}
      <mesh ref={coreRef} position={[0, 0.3, 0]}>
        <octahedronGeometry args={[0.38, 0]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={isQuarantined ? 1.6 : isSelected ? 1.0 : hovered ? 0.8 : 0.45}
          roughness={0.15}
          metalness={0.85}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Hardware #2: AgentShield Gateway :8080 — Fortress Bridge across Air-Gap
// ─────────────────────────────────────────────────────────────────────────────
export function VaultGatewaySculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  protectionEnabled = true,
  globalFreeze = false,
  animatingRay = false,
}: SculptureProps) {
  const leftShutterRef = useRef<THREE.Mesh>(null)
  const rightShutterRef = useRef<THREE.Mesh>(null)
  const hexCurtainRef = useRef<THREE.Mesh>(null)
  const scanlineRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    // Mechanical Sliding Blast Shutters (Armed = closed together, Bypass = retracted into pylons)
    const targetLeftX = protectionEnabled ? -0.22 : -0.72
    const targetRightX = protectionEnabled ? 0.22 : 0.72

    if (leftShutterRef.current) {
      leftShutterRef.current.position.x += (targetLeftX - leftShutterRef.current.position.x) * delta * 6.0
    }
    if (rightShutterRef.current) {
      rightShutterRef.current.position.x += (targetRightX - rightShutterRef.current.position.x) * delta * 6.0
    }

    // Optical Forcefield Curtain (drops into floor slot when bypass)
    if (hexCurtainRef.current) {
      const targetCurtainY = protectionEnabled ? 0.45 : -0.4
      hexCurtainRef.current.position.y += (targetCurtainY - hexCurtainRef.current.position.y) * delta * 6.0
    }

    // Vertical Laser Scanline Sweep
    if (scanlineRef.current && protectionEnabled) {
      scanlineRef.current.position.y = 0.45 + Math.sin(Date.now() * 0.006) * 0.35
    }
  })

  const stateColor = globalFreeze ? '#F43F5E' : protectionEnabled ? '#10B981' : '#F43F5E'

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
      {/* ── Bridge Deck Spanning the Center Trench ────────────────────────── */}
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[2.4, 0.16, 1.2]} />
        <meshStandardMaterial color="#141B29" roughness={0.25} metalness={0.8} />
      </mesh>

      {/* ── Twin Dark-Titanium Vertical Gatehouse Pylons ──────────────────── */}
      {/* West Pylon (Facing Untrusted Edge) */}
      <mesh position={[-0.85, 0.45, 0]}>
        <boxGeometry args={[0.26, 1.05, 0.95]} />
        <meshStandardMaterial color="#0B101B" roughness={0.2} metalness={0.85} />
      </mesh>
      {/* Status LED Bar on West Pylon */}
      <mesh position={[-0.85, 0.85, 0.48]}>
        <boxGeometry args={[0.18, 0.04, 0.02]} />
        <meshBasicMaterial color={stateColor} />
      </mesh>

      {/* East Pylon (Facing Core Vault Rail) */}
      <mesh position={[0.85, 0.45, 0]}>
        <boxGeometry args={[0.26, 1.05, 0.95]} />
        <meshStandardMaterial color="#0B101B" roughness={0.2} metalness={0.85} />
      </mesh>
      {/* Status LED Bar on East Pylon */}
      <mesh position={[0.85, 0.85, 0.48]}>
        <boxGeometry args={[0.18, 0.04, 0.02]} />
        <meshBasicMaterial color={stateColor} />
      </mesh>

      {/* Top Lintel Archway linking Pylons */}
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[1.96, 0.12, 0.95]} />
        <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.8} />
      </mesh>

      {/* ── Mechanical Sliding Titanium Blast Shutters (Physical Animation) ─ */}
      <mesh ref={leftShutterRef} position={[-0.22, 0.42, 0]}>
        <boxGeometry args={[0.42, 0.85, 0.14]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.75} />
      </mesh>
      <mesh ref={rightShutterRef} position={[0.22, 0.42, 0]}>
        <boxGeometry args={[0.42, 0.85, 0.14]} />
        <meshStandardMaterial color="#1E293B" roughness={0.3} metalness={0.75} />
      </mesh>

      {/* ── Razor-Thin Hex Optical Forcefield Curtain (Between Pylons) ───── */}
      <mesh ref={hexCurtainRef} position={[0, 0.45, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.88, 0.82]} />
        <meshStandardMaterial
          color={stateColor}
          emissive={stateColor}
          emissiveIntensity={animatingRay && protectionEnabled ? 1.6 : protectionEnabled ? 0.6 : 0.1}
          transparent
          opacity={protectionEnabled ? 0.38 : 0.06}
          side={THREE.DoubleSide}
          wireframe={!protectionEnabled}
        />
      </mesh>

      {/* Animated Vertical Laser Scanline */}
      <mesh ref={scanlineRef} position={[0, 0.45, 0]}>
        <boxGeometry args={[1.4, 0.02, 0.04]} />
        <meshBasicMaterial color="#34D399" transparent opacity={protectionEnabled ? 0.85 : 0} />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hardware #3: Bank Gate :4000 (Cryptographic Airlock U-Arch)
// ─────────────────────────────────────────────────────────────────────────────
export function AirlockGateSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
  animatingRay = false,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const laserRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (laserRef.current) {
      laserRef.current.position.y = 0.45 + Math.sin(Date.now() * 0.005) * 0.28
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
      {/* Base Plinth */}
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[1.2, 0.2, 0.8]} />
        <meshStandardMaterial color="#141B29" roughness={0.3} metalness={0.78} />
      </mesh>

      {/* Inverted U-Arch Titanium Gate Straddling Incoming Rail */}
      <mesh position={[-0.42, 0.45, 0]}>
        <boxGeometry args={[0.16, 0.95, 0.24]} />
        <meshStandardMaterial color="#0B101B" roughness={0.2} metalness={0.85} />
      </mesh>
      <mesh position={[0.42, 0.45, 0]}>
        <boxGeometry args={[0.16, 0.95, 0.24]} />
        <meshStandardMaterial color="#0B101B" roughness={0.2} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[1.0, 0.16, 0.24]} />
        <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.8} />
      </mesh>

      {/* Dual Vertical Verification Laser Emitter Bars */}
      <mesh ref={laserRef} position={[0, 0.45, 0]}>
        <boxGeometry args={[0.65, 0.02, 0.02]} />
        <meshBasicMaterial color="#34D399" />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Hardware #4: Ledger Adapter :4001 (3-Blade Titanium Transformer Rack)
// ─────────────────────────────────────────────────────────────────────────────
export function HexAdapterSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const b1Ref = useRef<THREE.Mesh>(null)
  const b2Ref = useRef<THREE.Mesh>(null)
  const b3Ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (b1Ref.current) b1Ref.current.rotation.y += delta * 0.3
    if (b2Ref.current) b2Ref.current.rotation.y -= delta * 0.4
    if (b3Ref.current) b3Ref.current.rotation.y += delta * 0.3
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
      {/* Base Plinth */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.65, 0.72, 0.2, 6]} />
        <meshStandardMaterial color="#141B29" roughness={0.3} metalness={0.78} />
      </mesh>

      {/* 3 Horizontal Stacked Chamfered Titanium Transformer Blades */}
      <mesh ref={b1Ref} position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.14, 6]} />
        <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.8} />
      </mesh>
      {/* Cobalt Micro-LED Slit 1 */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.52, 0.52, 0.02, 6]} />
        <meshBasicMaterial color="#3B82F6" />
      </mesh>

      <mesh ref={b2Ref} position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.48, 0.48, 0.14, 6]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.85} />
      </mesh>
      {/* Cobalt Micro-LED Slit 2 */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.02, 6]} />
        <meshBasicMaterial color="#60A5FA" />
      </mesh>

      <mesh ref={b3Ref} position={[0, 0.54, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.14, 6]} />
        <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.8} />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Hardware #5: TigerBeetle Cluster :3001 (Tri-Vault Consensus Citadel)
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
      haloRef.current.rotation.z += delta * (isBreached ? 3.0 : 0.8)
    }
  })

  const clusterColor = isBreached ? '#F43F5E' : node.color

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
      {/* Triangular Citadel Base */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.2, 3]} />
        <meshStandardMaterial color="#141B29" roughness={0.3} metalness={0.78} />
      </mesh>

      {/* Floating Consensus Ring linking the Triad */}
      <mesh ref={haloRef} position={[0, 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.018, 16, 32]} />
        <meshStandardMaterial
          color={clusterColor}
          emissive={clusterColor}
          emissiveIntensity={isBreached ? 1.6 : isSelected ? 1.0 : 0.4}
        />
      </mesh>

      {/* 3 Machined Titanium Cylindrical Vault Drums */}
      {[
        [0, 0.28, -0.42],
        [-0.38, 0.28, 0.26],
        [0.38, 0.28, 0.26],
      ].map(([x, y, z], i) => (
        <group key={`vault-drum-${i}`} position={[x, y, z]}>
          <mesh>
            <cylinderGeometry args={[0.26, 0.28, 0.52, 24]} />
            <meshStandardMaterial
              color={isBreached ? '#EF4444' : '#1E293B'}
              roughness={0.25}
              metalness={0.8}
            />
          </mesh>
          {/* Brushed Metallic Lid */}
          <mesh position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.06, 24]} />
            <meshStandardMaterial color="#334155" roughness={0.15} metalness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Hardware #6: Independent Witness :5000 (Optical Merkle Notary Beacon)
// ─────────────────────────────────────────────────────────────────────────────
export function MerkleTowerSculpture({
  node,
  isSelected,
  onSelect,
  onHover,
}: SculptureProps) {
  const [hovered, setHovered] = useState(false)
  const turretRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (turretRef.current) {
      turretRef.current.rotation.y += delta * 0.9
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
      {/* Stepped Pedestal Base */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.55, 0.65, 0.2, 8]} />
        <meshStandardMaterial color="#141B29" roughness={0.3} metalness={0.78} />
      </mesh>

      {/* Tower Body */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.34, 0.42, 0.55, 8]} />
        <meshStandardMaterial color="#1E293B" roughness={0.25} metalness={0.8} />
      </mesh>

      {/* Rotating Amber Crystal Prism Turret (Aims directly at TigerBeetle) */}
      <mesh ref={turretRef} position={[0, 0.68, 0]}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial
          color="#F59E0B"
          emissive="#F59E0B"
          emissiveIntensity={isSelected ? 1.4 : hovered ? 1.0 : 0.6}
          roughness={0.1}
          metalness={0.9}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Hardware #7: Compliance Cockpit :3000 (Glass Telemetry Deck)
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
      {/* Low-Profile Titanium Console Base */}
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[1.05, 0.2, 0.8]} />
        <meshStandardMaterial color="#141B29" roughness={0.3} metalness={0.78} />
      </mesh>

      {/* Tilted Frosted-Glass Display Plane */}
      <mesh position={[0, 0.16, 0]} rotation={[-0.42, 0, 0]}>
        <boxGeometry args={[0.92, 0.05, 0.65]} />
        <meshStandardMaterial
          color="#0F172A"
          roughness={0.15}
          metalness={0.85}
        />
      </mesh>
      {/* Glowing Screen Surface */}
      <mesh position={[0, 0.19, 0]} rotation={[-0.42, 0, 0]}>
        <planeGeometry args={[0.82, 0.55]} />
        <meshStandardMaterial
          color="#EC4899"
          emissive="#EC4899"
          emissiveIntensity={isSelected ? 1.1 : hovered ? 0.8 : 0.45}
          roughness={0.1}
          metalness={0.3}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Reusable Export: Agent 3D Quarantine Wireframe Lock Cage (Scenario #5)
// ─────────────────────────────────────────────────────────────────────────────
export function AgentQuarantineCage({
  position = [-5.6, -0.5, 0.0],
  active = false,
}: {
  position?: [number, number, number]
  active?: boolean
}) {
  const cageRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (cageRef.current && active) {
      cageRef.current.rotation.y += delta * 0.4
    }
  })

  if (!active) return null

  return (
    <group position={position}>
      <mesh ref={cageRef}>
        <boxGeometry args={[1.65, 1.65, 1.65]} />
        <meshStandardMaterial
          color="#F43F5E"
          wireframe
          transparent
          opacity={0.85}
          emissive="#F43F5E"
          emissiveIntensity={1.4}
        />
      </mesh>
    </group>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Reusable Export: Subterranean DB Tamper Crimson Spike (Scenario #7)
// ─────────────────────────────────────────────────────────────────────────────
export function DbTamperSpike({
  position = [4.8, -0.9, 2.2],
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
          color="#EF4444"
          emissive="#EF4444"
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
