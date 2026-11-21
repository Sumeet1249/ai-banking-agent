'use client'

import React, { useRef, useState, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import {
  TopologyNode,
  TopologyLink,
  TOPOLOGY_NODES,
  TOPOLOGY_LINKS,
  CameraPresetKey,
  CAMERA_PRESETS,
} from './service-nodes-data'
import {
  MotherboardDeck,
  ArchitecturalSculpture,
  AgentQuarantineCage,
  DbTamperSpike,
} from './topology-sculptures'
import { ScenarioFxLayer } from './scenario-fx-layer'

export interface Security3DSceneProps {
  nodes?: TopologyNode[]
  links?: TopologyLink[]
  selectedNodeId: string | null
  onSelectNode: (node: TopologyNode | null) => void
  cameraResetKey?: number
  protectionEnabled?: boolean
  globalFreeze?: boolean
  activeScenario?: any
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
  activeCameraPreset?: CameraPresetKey
  onPresetChange?: (preset: CameraPresetKey) => void
  onHoverNode?: (node: TopologyNode | null) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Camera Rig with Cinematic Lerping & User Drag Release
// ─────────────────────────────────────────────────────────────────────────────
function CameraRig({
  activePreset = 'orbit',
  cameraResetKey = 0,
}: {
  activePreset?: CameraPresetKey
  cameraResetKey?: number
}) {
  const { camera } = useThree()
  const controlsRef = useRef<any>(null)
  const isUserInteracting = useRef<boolean>(false)
  const lastPreset = useRef<CameraPresetKey>(activePreset)
  const lastResetKey = useRef<number>(cameraResetKey)

  useEffect(() => {
    isUserInteracting.current = false
    lastPreset.current = activePreset
  }, [activePreset])

  useEffect(() => {
    isUserInteracting.current = false
    lastResetKey.current = cameraResetKey
  }, [cameraResetKey])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return

    // If user is actively dragging or dollying, yield control immediately
    if (controls.state !== -1) {
      isUserInteracting.current = true
      return
    }

    if (!isUserInteracting.current) {
      const targetPreset = CAMERA_PRESETS[activePreset] || CAMERA_PRESETS.orbit
      const desiredPos = new THREE.Vector3(...targetPreset.position)
      const desiredTarget = new THREE.Vector3(...targetPreset.target)

      camera.position.lerp(desiredPos, Math.min(delta * 3.8, 0.18))
      controls.target.lerp(desiredTarget, Math.min(delta * 3.8, 0.18))
      controls.update()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={4}
      maxDistance={24}
      maxPolarAngle={Math.PI / 1.72}
      minPolarAngle={Math.PI / 6.5}
      target={CAMERA_PRESETS.orbit.target}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-Point Architectural Lighting Setup
// ─────────────────────────────────────────────────────────────────────────────
function DynamicLightingRig({
  protectionEnabled = true,
  globalFreeze = false,
  animatingRay = false,
}: {
  protectionEnabled?: boolean
  globalFreeze?: boolean
  animatingRay?: boolean
}) {
  const coreLightRef = useRef<THREE.PointLight>(null)

  useFrame((_, delta) => {
    if (coreLightRef.current) {
      const targetIntensity = globalFreeze
        ? 2.2
        : animatingRay && protectionEnabled
          ? 2.6
          : protectionEnabled
            ? 1.4
            : 1.1

      coreLightRef.current.intensity += (targetIntensity - coreLightRef.current.intensity) * delta * 4.0

      const targetColor = globalFreeze
        ? new THREE.Color('#F43F5E')
        : protectionEnabled
          ? new THREE.Color('#10B981')
          : new THREE.Color('#F43F5E')

      coreLightRef.current.color.lerp(targetColor, delta * 4.0)
    }
  })

  return (
    <>
      {/* 1. Cool Ambient Fill */}
      <ambientLight intensity={0.55} color="#94A3B8" />

      {/* 2. Directional Key Light (Warm Titanium Specular) */}
      <directionalLight
        position={[6, 12, 8]}
        intensity={1.2}
        color="#F8FAFC"
        castShadow
      />

      {/* 3. Directional Rim Light (Cool Cyan Edge) */}
      <directionalLight
        position={[-8, 6, -6]}
        intensity={0.7}
        color="#38BDF8"
      />

      {/* Dynamic Core Point Light Inside Gateway Fortress Bridge */}
      <pointLight
        ref={coreLightRef}
        position={[0.0, 0.45, 0.0]}
        intensity={1.4}
        color="#10B981"
        distance={10}
        decay={2}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Master Security3DScene Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Security3DScene({
  nodes = TOPOLOGY_NODES,
  selectedNodeId,
  onSelectNode,
  cameraResetKey = 0,
  protectionEnabled = true,
  globalFreeze = false,
  activeScenario = null,
  animatingRay = false,
  simulationVerdict = 'idle',
  activeCameraPreset = 'orbit',
  onHoverNode,
}: Security3DSceneProps) {
  // Scenario flags
  const isRunawayQuarantine =
    activeScenario?.owaspId === 'ASI-08' &&
    protectionEnabled &&
    (animatingRay || simulationVerdict === 'blocked')

  const isDbTamperActive =
    activeScenario?.owaspId === 'ASI-05' &&
    (animatingRay || simulationVerdict === 'blocked' || simulationVerdict === 'breached')

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 8.2, 13.4], fov: 34 }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      onPointerMissed={() => onSelectNode(null)}
    >
      {/* Dynamic Camera Rig with Presets & Free Drag Release */}
      <CameraRig
        activePreset={activeCameraPreset}
        cameraResetKey={cameraResetKey}
      />

      {/* 3-Point Architectural Lighting Setup */}
      <DynamicLightingRig
        protectionEnabled={protectionEnabled}
        globalFreeze={globalFreeze}
        animatingRay={animatingRay}
      />

      {/* ── Sovereign Vault Silicon Motherboard Deck (with Air-Gap Trench & 3D Silk-Screen Text) */}
      <MotherboardDeck
        nodes={nodes}
        protectionEnabled={protectionEnabled}
        globalFreeze={globalFreeze}
      />

      {/* ── 3.2s Synced 7-Scenario 3D Choreography FX Layer ───────────────── */}
      <ScenarioFxLayer
        nodes={nodes}
        activeScenario={activeScenario}
        animatingRay={animatingRay}
        simulationVerdict={simulationVerdict}
        protectionEnabled={protectionEnabled}
        globalFreeze={globalFreeze}
      />

      {/* ── 7 Precision Hardware Modules (Unified Machined Titanium PBR) ──── */}
      {nodes.map((node) => {
        const isBreached =
          simulationVerdict === 'breached' &&
          !protectionEnabled &&
          (node.id === 'tigerbeetle' || node.id === 'ledger-adapter')

        return (
          <ArchitecturalSculpture
            key={`sculpture-${node.id}`}
            node={node}
            isSelected={node.id === selectedNodeId}
            onSelect={() => onSelectNode(node.id === selectedNodeId ? null : node)}
            onHover={onHoverNode}
            protectionEnabled={protectionEnabled}
            globalFreeze={globalFreeze}
            animatingRay={animatingRay}
            simulationVerdict={simulationVerdict}
            isQuarantined={node.id === 'agent' && isRunawayQuarantine}
            isTampered={node.id === 'tigerbeetle' && isDbTamperActive}
          />
        )
      })}

      {/* Scenario #5: Agent 3D Quarantine Wireframe Lock Cage */}
      <AgentQuarantineCage
        position={[-5.6, -0.5, 0.0]}
        active={isRunawayQuarantine}
      />

      {/* Scenario #7: Subterranean Crimson DB Tamper Spike */}
      <DbTamperSpike
        position={[4.8, -0.9, 2.2]}
        active={isDbTamperActive}
      />
    </Canvas>
  )
}
