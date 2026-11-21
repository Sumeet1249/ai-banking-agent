'use client'

import React, { useRef, useState, useMemo, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import {
  TopologyNode,
  TopologyLink,
  TOPOLOGY_NODES,
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

    // If user is actively dragging, dollying, or rotating, yield control immediately
    if (controls.state !== -1) {
      isUserInteracting.current = true
      return
    }

    if (!isUserInteracting.current) {
      const targetPreset = CAMERA_PRESETS[activePreset] || CAMERA_PRESETS.orbit
      const desiredPos = new THREE.Vector3(...targetPreset.position)
      const desiredTarget = new THREE.Vector3(...targetPreset.target)

      camera.position.lerp(desiredPos, Math.min(delta * 4.2, 0.2))
      controls.target.lerp(desiredTarget, Math.min(delta * 4.2, 0.2))
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
      enableDamping={true}
      dampingFactor={0.07}
      minDistance={10}
      maxDistance={24}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.35}
      target={CAMERA_PRESETS.orbit.target}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Studio Lighting Setup (Environment IBL + Softboxes + Directional Key + Accent)
// ─────────────────────────────────────────────────────────────────────────────
function StudioLightingRig({
  protectionEnabled = true,
  globalFreeze = false,
  simulationVerdict = 'idle',
}: {
  protectionEnabled?: boolean
  globalFreeze?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
}) {
  const accentLightRef = useRef<THREE.PointLight>(null)

  const accentColor = globalFreeze
    ? '#f59e0b'
    : simulationVerdict === 'breached'
      ? '#f43f5e'
      : protectionEnabled
        ? '#10b981'
        : '#f43f5e'

  useFrame((_, delta) => {
    if (accentLightRef.current) {
      const targetColor = new THREE.Color(accentColor)
      accentLightRef.current.color.lerp(targetColor, delta * 5.0)
      const targetIntensity = globalFreeze ? 2.5 : protectionEnabled ? 1.8 : 2.2
      accentLightRef.current.intensity += (targetIntensity - accentLightRef.current.intensity) * delta * 4.0
    }
  })

  return (
    <>
      {/* ── Procedural Studio IBL with 4 Positioned Softbox Lightformers ── */}
      <Environment resolution={256}>
        {/* 1. Overhead cool-white main softbox */}
        <Lightformer
          form="rect"
          intensity={2.4}
          color="#e0f2fe"
          position={[0, 12, 2]}
          scale={[18, 10, 1]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        {/* 2. Left cyan rim-light panel */}
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#38bdf8"
          position={[-14, 6, 4]}
          scale={[8, 8, 1]}
        />
        {/* 3. Right indigo/violet rim-light panel */}
        <Lightformer
          form="rect"
          intensity={2.0}
          color="#818cf8"
          position={[14, 6, -2]}
          scale={[8, 8, 1]}
        />
        {/* 4. Front subtle fill panel */}
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#cbd5e1"
          position={[0, 4, 14]}
          scale={[14, 5, 1]}
        />
      </Environment>

      {/* ── Hemisphere Fill (Prevents Undersides From Turning Black) ────── */}
      <hemisphereLight args={['#c7d2fe', '#1e293b', 0.95]} />

      {/* ── Key Directional Sunlight (Titanium Specular Highlights) ─────── */}
      <directionalLight
        position={[8, 16, 10]}
        intensity={1.8}
        color="#f8fafc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* ── Gateway Accent Point Light (Smooth State Color Shifting) ────── */}
      <pointLight
        ref={accentLightRef}
        position={[0, 3.2, 0]}
        intensity={1.8}
        color={accentColor}
        distance={14}
        decay={2}
      />

      {/* ── Grounding Contact Shadows On Deck ───────────────────────────── */}
      <ContactShadows
        position={[0, 0.02, 0]}
        opacity={0.55}
        scale={24}
        blur={2.2}
        far={6}
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
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.25,
        powerPreference: 'high-performance',
      }}
      camera={{ position: [0, 10.5, 13.8], fov: 34 }}
      style={{ width: '100%', height: '100%' }}
      onPointerMissed={() => onSelectNode(null)}
    >
      {/* Rich midnight navy-slate background (NOT pure black) */}
      <color attach="background" args={['#0b1120']} />
      {/* Subtle exponential depth fog that melts edges into viewport */}
      <fog attach="fog" args={['#0b1120', 22, 42]} />

      {/* Dynamic Camera Rig with Presets & Free Drag Release */}
      <CameraRig
        activePreset={activeCameraPreset}
        cameraResetKey={cameraResetKey}
      />

      {/* Studio Lighting Rig with Procedural Environment Softboxes */}
      <StudioLightingRig
        protectionEnabled={protectionEnabled}
        globalFreeze={globalFreeze}
        simulationVerdict={simulationVerdict}
      />

      {/* ── Base Deck, 3 Raised Zone Decks, Conduits, Pedestals & 3D Nameplates ─ */}
      <MotherboardDeck
        nodes={nodes}
        protectionEnabled={protectionEnabled}
        globalFreeze={globalFreeze}
        activeScenario={activeScenario}
        animatingRay={animatingRay}
        simulationVerdict={simulationVerdict}
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

      {/* ── 7 Precision Hardware Sculptures (Machined Titanium + Glass) ───── */}
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
        position={[-5.8, 0.7, -0.6]}
        active={isRunawayQuarantine}
      />

      {/* Scenario #7: Subterranean Crimson DB Tamper Spike */}
      <DbTamperSpike
        position={[4.8, 0.24, 2.5]}
        active={isDbTamperActive}
      />
    </Canvas>
  )
}
