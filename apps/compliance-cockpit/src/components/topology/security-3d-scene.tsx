'use client'

import { useRef, useState, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Float, Html } from '@react-three/drei'
import * as THREE from 'three'
import { TopologyNode, TopologyLink, TOPOLOGY_NODES, TOPOLOGY_LINKS } from './service-nodes-data'

export interface Security3DSceneProps {
  nodes?: TopologyNode[]
  links?: TopologyLink[]
  selectedNodeId: string | null
  onSelectNode: (node: TopologyNode | null) => void
  cameraResetKey?: number
  protectionEnabled?: boolean
  activeScenario?: any
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
}

// 3D Node Mesh with Decluttered Badges & Holographic Gateway Shield
function ServiceNode3D({
  node,
  isSelected,
  onSelect,
  protectionEnabled = true,
  animatingRay = false,
  simulationVerdict = 'idle',
}: {
  node: TopologyNode
  isSelected: boolean
  onSelect: () => void
  protectionEnabled?: boolean
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const shieldRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  const isGateway = node.id === 'gateway'
  const isBreached = simulationVerdict === 'breached' && !protectionEnabled && (node.id === 'tigerbeetle' || node.id === 'ledger-adapter')

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.7
      if (isSelected) {
        ringRef.current.rotation.x += delta * 0.5
      }
    }
    if (shieldRef.current) {
      shieldRef.current.rotation.y += delta * 0.4
      shieldRef.current.rotation.x += delta * 0.2
      if (animatingRay && protectionEnabled) {
        const pulse = 1 + Math.sin(Date.now() * 0.012) * 0.15
        shieldRef.current.scale.set(pulse, pulse, pulse)
      } else {
        shieldRef.current.scale.set(1, 1, 1)
      }
    }
    if (meshRef.current && (hovered || isSelected)) {
      meshRef.current.rotation.y += delta * 1.4
    }
  })

  const statusColor = useMemo(() => {
    if (isBreached) return '#ef4444' // Crimson alert on breached node
    if (isGateway) {
      return protectionEnabled ? '#10b981' : '#f43f5e'
    }
    switch (node.status) {
      case 'HEALTHY':
        return node.color
      case 'DEGRADED':
        return '#f59e0b'
      case 'OFFLINE':
        return '#64748b'
      case 'BLOCKED':
        return '#ef4444'
      default:
        return node.color
    }
  }, [node.status, node.color, isGateway, protectionEnabled, isBreached])

  return (
    <group position={node.position}>
      <Float speed={1.8} rotationIntensity={0.15} floatIntensity={0.25}>
        {/* Outer Glow Halo Ring */}
        <mesh ref={ringRef}>
          <ringGeometry args={[0.65, 0.74, 32]} />
          <meshBasicMaterial
            color={statusColor}
            side={THREE.DoubleSide}
            transparent
            opacity={isSelected ? 0.9 : hovered ? 0.65 : isBreached ? 0.85 : 0.22}
          />
        </mesh>

        {/* Selected Highlight Shell */}
        {isSelected && (
          <mesh>
            <sphereGeometry args={[0.82, 24, 24]} />
            <meshBasicMaterial color={statusColor} wireframe transparent opacity={0.35} />
          </mesh>
        )}

        {/* Breach Alert Pulse Shell */}
        {isBreached && (
          <mesh>
            <sphereGeometry args={[0.9, 16, 16]} />
            <meshBasicMaterial color="#ef4444" wireframe transparent opacity={0.45} />
          </mesh>
        )}

        {/* Gateway Holographic Perimeter Shield */}
        {isGateway && (
          <mesh ref={shieldRef}>
            <icosahedronGeometry args={[0.95, 1]} />
            <meshBasicMaterial
              color={protectionEnabled ? '#10b981' : '#f43f5e'}
              wireframe
              transparent
              opacity={
                animatingRay && protectionEnabled
                  ? 0.75
                  : protectionEnabled
                    ? 0.38
                    : 0.14
              }
            />
          </mesh>
        )}

        {/* Core Node Mesh */}
        <mesh
          ref={meshRef}
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
          <sphereGeometry args={[isGateway ? 0.58 : 0.48, 32, 32]} />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={
              animatingRay && isGateway && protectionEnabled
                ? 1.4
                : isSelected
                  ? 0.85
                  : hovered
                    ? 0.65
                    : isBreached
                      ? 0.9
                      : 0.35
            }
            roughness={0.2}
            metalness={0.7}
          />
        </mesh>

        {/* Decluttered Pill Badge - Positioned Cleanly Below Mesh with occlude={false} */}
        <Html distanceFactor={18} position={[0, -1.15, 0]} center pointerEvents="none" occlude={false}>
          <div className="flex flex-col items-center select-none whitespace-nowrap transition-transform duration-150">
            <div
            className={`px-2 py-0.5 rounded-full text-[11px] font-mono backdrop-blur-md shadow-lg flex items-center gap-1.5 transition-all duration-150 ${isSelected
                ? 'bg-indigo-600/95 text-white border border-indigo-400/80 shadow-indigo-600/40 scale-105 ring-2 ring-indigo-500/20'
                : hovered
                  ? 'bg-slate-900/95 text-cyan-300 border border-cyan-500/60 shadow-cyan-500/20 scale-105'
                  : isGateway
                    ? protectionEnabled
                      ? 'bg-slate-950/90 text-emerald-300 border border-emerald-500/50'
                      : 'bg-slate-950/90 text-rose-300 border border-rose-500/50'
                    : isBreached
                      ? 'bg-rose-950/90 text-rose-300 border border-rose-500/70 ring-1 ring-rose-500/40'
                      : 'bg-slate-950/85 text-slate-200 border border-slate-800/80'
              }`}
              >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
              style={{ backgroundColor: statusColor }}
            />
            <span className="font-semibold">{node.name}</span>
            {node.port ? (
              <span className="opacity-60 text-[9px]">:{node.port}</span>
            ) : null}
          </div>

          {/* Hover / Selected Detail Micro-Tooltip */}
          {(hovered || isSelected) && (
            <div className="text-[9px] text-slate-300 font-mono tracking-wider mt-1 px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700/60 shadow animate-in fade-in zoom-in-95 duration-100">
              {node.role}
            </div>
          )}
        </div>
      </Html>
    </Float>
    </group >
  )
}

// 3D Connecting Link with Traveling Particles
function ServiceLink3D({
  link,
  sourcePos,
  targetPos,
  isAttackLink,
  isNotarizeLink,
  isBreachLink,
}: {
  link: TopologyLink
  sourcePos: [number, number, number]
  targetPos: [number, number, number]
  isAttackLink?: boolean
  isNotarizeLink?: boolean
  isBreachLink?: boolean
}) {
  const particleRef = useRef<THREE.Mesh>(null)

  const curve = useMemo(() => {
    const v1 = new THREE.Vector3(...sourcePos)
    const v2 = new THREE.Vector3(...targetPos)
    const mid = new THREE.Vector3()
      .addVectors(v1, v2)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.45, 0.25))

    return new THREE.QuadraticBezierCurve3(v1, mid, v2)
  }, [sourcePos, targetPos])

  const points = useMemo(() => curve.getPoints(32), [curve])
  const lineGeometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points])

  useFrame((state) => {
    if (particleRef.current) {
      const speed = isAttackLink || isBreachLink ? 1.0 : isNotarizeLink ? 0.7 : 0.35
      const t = (state.clock.getElapsedTime() * speed) % 1
      const pos = curve.getPoint(t)
      particleRef.current.position.copy(pos)
    }
  })

  const linkColor = useMemo(() => {
    if (isAttackLink || isBreachLink) return 0xf43f5e // Crimson
    if (isNotarizeLink) return 0x10b981 // Emerald
    return link.status === 'ACTIVE' ? 0x6366f1 : 0x475569
  }, [isAttackLink, isBreachLink, isNotarizeLink, link.status])

  const lineObject = useMemo(() => {
    return new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: linkColor,
        transparent: true,
        opacity: isAttackLink || isBreachLink ? 0.75 : isNotarizeLink ? 0.6 : 0.3,
        linewidth: 1,
      })
    )
  }, [lineGeometry, linkColor, isAttackLink, isBreachLink, isNotarizeLink])

  return (
    <group>
      {/* Curved connecting line */}
      <primitive object={lineObject} />

      {/* Traveling particle pulse */}
      {link.status === 'ACTIVE' && (
        <mesh ref={particleRef}>
          <sphereGeometry args={[isAttackLink || isBreachLink ? 0.12 : 0.075, 12, 12]} />
          <meshBasicMaterial
            color={
              isAttackLink || isBreachLink
                ? '#f43f5e'
                : isNotarizeLink
                  ? '#10b981'
                  : '#38bdf8'
            }
          />
        </mesh>
      )}
    </group>
  )
}

// Live Attack Ray Choreography (Beam Traveling from Agent to Gateway -> Deflect/Breach)
function LiveAttackRay3D({
  agentPos,
  gatewayPos,
  witnessPos,
  bankGatePos,
  protectionEnabled,
  animatingRay,
}: {
  agentPos: [number, number, number]
  gatewayPos: [number, number, number]
  witnessPos: [number, number, number]
  bankGatePos: [number, number, number]
  protectionEnabled: boolean
  animatingRay: boolean
}) {
  const attackMeshRef = useRef<THREE.Mesh>(null)
  const notarizeMeshRef = useRef<THREE.Mesh>(null)
  const breachMeshRef = useRef<THREE.Mesh>(null)

  const attackCurve = useMemo(() => {
    const v1 = new THREE.Vector3(...agentPos)
    const v2 = new THREE.Vector3(...gatewayPos)
    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.6, 0.4))
    return new THREE.QuadraticBezierCurve3(v1, mid, v2)
  }, [agentPos, gatewayPos])

  const notarizeCurve = useMemo(() => {
    const v1 = new THREE.Vector3(...gatewayPos)
    const v2 = new THREE.Vector3(...witnessPos)
    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.4, 0.3))
    return new THREE.QuadraticBezierCurve3(v1, mid, v2)
  }, [gatewayPos, witnessPos])

  const breachCurve = useMemo(() => {
    const v1 = new THREE.Vector3(...gatewayPos)
    const v2 = new THREE.Vector3(...bankGatePos)
    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.5, 0.3))
    return new THREE.QuadraticBezierCurve3(v1, mid, v2)
  }, [gatewayPos, bankGatePos])

  useFrame((state) => {
    if (!animatingRay) return
    const t = (state.clock.getElapsedTime() * 1.4) % 1

    // Phase 1: Attack travels agent -> gateway (t: 0 -> 0.55)
    if (attackMeshRef.current) {
      if (t <= 0.55) {
        const segT = t / 0.55
        attackMeshRef.current.position.copy(attackCurve.getPoint(segT))
        attackMeshRef.current.visible = true
      } else {
        attackMeshRef.current.visible = false
      }
    }

    // Phase 2A: Deflected & Notarized to Witness (protection ON)
    if (notarizeMeshRef.current) {
      if (protectionEnabled && t > 0.5) {
        const segT = (t - 0.5) / 0.5
        notarizeMeshRef.current.position.copy(notarizeCurve.getPoint(segT))
        notarizeMeshRef.current.visible = true
      } else {
        notarizeMeshRef.current.visible = false
      }
    }

    // Phase 2B: Breached to Bank Gate (protection OFF)
    if (breachMeshRef.current) {
      if (!protectionEnabled && t > 0.5) {
        const segT = (t - 0.5) / 0.5
        breachMeshRef.current.position.copy(breachCurve.getPoint(segT))
        breachMeshRef.current.visible = true
      } else {
        breachMeshRef.current.visible = false
      }
    }
  })

  if (!animatingRay) return null

  return (
    <group>
      {/* High-speed Crimson Attack Projectile */}
      <mesh ref={attackMeshRef}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>

      {/* Emerald Deflection Notarization Pulse */}
      {protectionEnabled && (
        <mesh ref={notarizeMeshRef}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      )}

      {/* Crimson Breach Blast */}
      {!protectionEnabled && (
        <mesh ref={breachMeshRef}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshBasicMaterial color="#f43f5e" />
        </mesh>
      )}
    </group>
  )
}

export default function Security3DScene({
  nodes = TOPOLOGY_NODES,
  links = TOPOLOGY_LINKS,
  selectedNodeId,
  onSelectNode,
  cameraResetKey = 0,
  protectionEnabled = true,
  activeScenario = null,
  animatingRay = false,
  simulationVerdict = 'idle',
}: Security3DSceneProps) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>()
    nodes.forEach((n) => map.set(n.id, n.position))
    return map
  }, [nodes])

  const agentPos = nodeMap.get('agent') ?? [-6.2, 0.6, 0.5]
  const gatewayPos = nodeMap.get('gateway') ?? [-1.4, 0.8, 1.2]
  const witnessPos = nodeMap.get('witness') ?? [2.2, -2.4, 0.8]
  const bankGatePos = nodeMap.get('bank-gate') ?? [2.6, 1.8, 0.4]

  return (
    <Canvas
      key={cameraResetKey}
      camera={{ position: [0, 0, 11.8], fov: 42 }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      onPointerMissed={() => onSelectNode(null)}
    >
      {/* Ambient & Multi-Point Atmospheric Lighting */}
      <ambientLight intensity={0.75} />
      <pointLight position={[12, 12, 10]} intensity={1.3} color="#ffffff" />
      <pointLight position={[-10, -6, -4]} intensity={0.7} color="#06b6d4" />
      <pointLight position={[8, -8, 6]} intensity={0.7} color="#8b5cf6" />
      <pointLight
        position={[-1.4, 0.8, 2.5]}
        intensity={animatingRay && protectionEnabled ? 2.5 : 1.0}
        color={protectionEnabled ? '#10b981' : '#f43f5e'}
      />

      {/* Interactive Orbit Controls with Widened Restrained Bounds */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={15}
        maxPolarAngle={Math.PI / 1.65}
        minPolarAngle={Math.PI / 4}
      />

      {/* Render Communication Links */}
      {links.map((link) => {
        const sourcePos = nodeMap.get(link.source)
        const targetPos = nodeMap.get(link.target)
        if (!sourcePos || !targetPos) return null

        const isAttackLink = animatingRay && link.source === 'agent' && link.target === 'gateway'
        const isNotarizeLink = animatingRay && protectionEnabled && link.source === 'gateway' && link.target === 'witness'
        const isBreachLink = (animatingRay || simulationVerdict === 'breached') && !protectionEnabled && link.source === 'gateway' && link.target === 'bank-gate'

        return (
          <ServiceLink3D
            key={link.id}
            link={link}
            sourcePos={sourcePos}
            targetPos={targetPos}
            isAttackLink={isAttackLink}
            isNotarizeLink={isNotarizeLink}
            isBreachLink={isBreachLink}
          />
        )
      })}

      {/* Live Animated Attack Ray / Shield Deflection */}
      <LiveAttackRay3D
        agentPos={agentPos}
        gatewayPos={gatewayPos}
        witnessPos={witnessPos}
        bankGatePos={bankGatePos}
        protectionEnabled={protectionEnabled}
        animatingRay={animatingRay}
      />

      {/* Render Service Nodes with Extended Simulation Props */}
      {nodes.map((node) => (
        <ServiceNode3D
          key={node.id}
          node={node}
          isSelected={node.id === selectedNodeId}
          onSelect={() => onSelectNode(node.id === selectedNodeId ? null : node)}
          protectionEnabled={protectionEnabled}
          animatingRay={animatingRay}
          simulationVerdict={simulationVerdict}
        />
      ))}
    </Canvas>
  )
}
