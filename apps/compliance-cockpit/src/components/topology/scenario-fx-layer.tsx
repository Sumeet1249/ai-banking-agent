'use client'

import React, { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TopologyNode } from './service-nodes-data'

export interface ScenarioFxLayerProps {
  nodes: TopologyNode[]
  activeScenario?: any
  animatingRay?: boolean
  simulationVerdict?: 'idle' | 'blocked' | 'breached'
  protectionEnabled?: boolean
  globalFreeze?: boolean
}

// Helper to build direct low-altitude physical bus paths along the motherboard
function createBusPath(
  p1: [number, number, number],
  p2: [number, number, number],
  archY: number = 0.35
): THREE.QuadraticBezierCurve3 {
  const v1 = new THREE.Vector3(p1[0], p1[1] + 0.3, p1[2])
  const v2 = new THREE.Vector3(p2[0], p2[1] + 0.3, p2[2])
  const mid = new THREE.Vector3()
    .addVectors(v1, v2)
    .multiplyScalar(0.5)
    .add(new THREE.Vector3(0, archY, 0))
  return new THREE.QuadraticBezierCurve3(v1, mid, v2)
}

export function ScenarioFxLayer({
  nodes,
  activeScenario,
  animatingRay = false,
  simulationVerdict = 'idle',
  protectionEnabled = true,
  globalFreeze = false,
}: ScenarioFxLayerProps) {
  // Coordinates lookup
  const posMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>()
    nodes.forEach((n) => map.set(n.id, n.position))
    return map
  }, [nodes])

  const pAgent = posMap.get('agent') ?? [-5.6, -0.95, 0.0]
  const pGateway = posMap.get('gateway') ?? [0.0, -0.95, 0.0]
  const pBankGate = posMap.get('bank-gate') ?? [4.2, -0.95, -2.2]
  const pAdapter = posMap.get('ledger-adapter') ?? [6.0, -0.95, 0.0]
  const pTigerBeetle = posMap.get('tigerbeetle') ?? [4.8, -0.95, 2.2]
  const pWitness = posMap.get('witness') ?? [0.8, -0.95, 3.4]
  const pCockpit = posMap.get('cockpit') ?? [-2.8, -0.95, 3.4]

  // Bus Rail Trajectories
  const curveAgentGw = useMemo(() => createBusPath(pAgent, pGateway, 0.25), [pAgent, pGateway])
  const curveGwBank = useMemo(() => createBusPath(pGateway, pBankGate, 0.28), [pGateway, pBankGate])
  const curveBankAdapter = useMemo(() => createBusPath(pBankGate, pAdapter, 0.2), [pBankGate, pAdapter])
  const curveAdapterTb = useMemo(() => createBusPath(pAdapter, pTigerBeetle, 0.22), [pAdapter, pTigerBeetle])
  const curveGwWitness = useMemo(() => createBusPath(pGateway, pWitness, 0.25), [pGateway, pWitness])
  const curveGwCockpit = useMemo(() => createBusPath(pGateway, pCockpit, 0.25), [pGateway, pCockpit])
  const curveWitnessTb = useMemo(() => createBusPath(pWitness, pTigerBeetle, 0.3), [pWitness, pTigerBeetle])
  const curveCockpitGw = useMemo(() => createBusPath(pCockpit, pGateway, 0.28), [pCockpit, pGateway])

  // Scenario 1: Prompt Injection
  const s1PacketRef = useRef<THREE.Mesh>(null)
  const s1SparksRef = useRef<THREE.Group>(null)
  const s1AlertBeamRef = useRef<THREE.Mesh>(null)

  // Scenario 2: Limit Overreach
  const s2HeavyOrbRef = useRef<THREE.Mesh>(null)
  const s2ShockwaveRef = useRef<THREE.Mesh>(null)
  const s2BreachRingRef = useRef<THREE.Mesh>(null)
  const s2ReceiptBeamRef = useRef<THREE.Mesh>(null)

  // Scenario 3: Token Replay
  const s3ValidRef = useRef<THREE.Mesh>(null)
  const s3GhostRef = useRef<THREE.Mesh>(null)
  const s3LockBarRef = useRef<THREE.Mesh>(null)

  // Scenario 4: Smurfing Volley
  const s4VolleyRef = useRef<THREE.Group>(null)
  const s4DomeRef = useRef<THREE.Mesh>(null)

  // Scenario 5: Runaway Agent
  const s5OverheatRef = useRef<THREE.Mesh>(null)
  const s5ReverseLaserRef = useRef<THREE.Line>(null)

  // Scenario 6: Post-Revocation
  const s6WaveRef = useRef<THREE.Mesh>(null)
  const s6StaleRef = useRef<THREE.Mesh>(null)
  const s6SealedPlaneRef = useRef<THREE.Mesh>(null)

  // Scenario 7: DB Tamper Merkle Laser
  const s7AuditLaserRef = useRef<THREE.Line>(null)
  const s7AlertArcRef = useRef<THREE.Mesh>(null)

  // Ambient Heartbeat pulses
  const ambientPulse1 = useRef<THREE.Mesh>(null)
  const ambientPulse2 = useRef<THREE.Mesh>(null)

  // Active scenario number (1-7)
  const scenarioNum = useMemo(() => {
    if (!activeScenario) return 1
    const code = (activeScenario.owaspId || activeScenario.code || '').toUpperCase()
    if (code.includes('ASI-01')) return 1
    if (code.includes('ASI-02')) return 2
    if (code.includes('ASI-03')) return 3
    if (code.includes('ASI-06')) return 4
    if (code.includes('ASI-08')) return 5
    if (code.includes('ASI-04')) return 6
    if (code.includes('ASI-05')) return 7
    return 1
  }, [activeScenario])

  // Start time tracker for 3.2s choreography
  const animStart = useRef<number>(0)
  useEffect(() => {
    if (animatingRay) {
      animStart.current = performance.now()
    }
  }, [animatingRay, scenarioNum])

  // Precompute reverse laser line geometry for Scenario #5 Gateway -> Agent
  const reverseLaserGeom = useMemo(() => {
    const pts = [
      new THREE.Vector3(pGateway[0], pGateway[1] + 0.45, pGateway[2]),
      new THREE.Vector3(pAgent[0], pAgent[1] + 0.35, pAgent[2]),
    ]
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [pGateway, pAgent])

  // Precompute Merkle Audit laser line geometry for Scenario #7 Witness -> TigerBeetle
  const merkleAuditLaserGeom = useMemo(() => {
    const pts = [
      new THREE.Vector3(pWitness[0], pWitness[1] + 0.65, pWitness[2]),
      new THREE.Vector3(pTigerBeetle[0], pTigerBeetle[1] + 0.45, pTigerBeetle[2]),
    ]
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [pWitness, pTigerBeetle])

  // ─────────────────────────────────────────────────────────────────────────
  // 60FPS useFrame Animation Engine (3.2s Duration, Zero React Re-renders!)
  // ─────────────────────────────────────────────────────────────────────────
  useFrame((state) => {
    const now = performance.now()
    const elapsed = animatingRay ? (now - animStart.current) / 1000 : 0
    // Clamped progress from 0.0 to 1.0 over 3.2 seconds
    const progress = Math.min(elapsed / 3.2, 1.0)

    // Ambient Heartbeat Conduits
    if (!globalFreeze) {
      const clk = state.clock.getElapsedTime()
      if (ambientPulse1.current) {
        const t = (clk * 0.28) % 1
        ambientPulse1.current.position.copy(curveAgentGw.getPoint(t))
        ambientPulse1.current.visible = !animatingRay
      }
      if (ambientPulse2.current) {
        const t = (clk * 0.32) % 1
        ambientPulse2.current.position.copy(curveGwBank.getPoint(t))
        ambientPulse2.current.visible = !animatingRay
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #1: Prompt Injection / Payee Diversion (ASI-01)
    // ───────────────────────────────────────────────────────────────────────
    if (s1PacketRef.current) {
      if (animatingRay && scenarioNum === 1) {
        s1PacketRef.current.visible = true

        if (progress < 0.42) {
          // Phase 1 (0.0 - 1.34s): Travels Agent -> Gateway
          const t = progress / 0.42
          const pos = curveAgentGw.getPoint(t)
          // Fracture into jagged bolt mid-flight at t > 0.45
          if (t > 0.45) {
            pos.z += Math.sin(now * 0.04) * 0.16
            pos.y += Math.cos(now * 0.05) * 0.1
          }
          s1PacketRef.current.position.copy(pos)
          const mat = s1PacketRef.current.material as THREE.MeshStandardMaterial
          if (t < 0.45) {
            mat.color.set('#06B6D4')
            mat.emissive.set('#06B6D4')
          } else {
            mat.color.set('#EF4444')
            mat.emissive.set('#EF4444')
          }
        } else if (!protectionEnabled && progress >= 0.42) {
          // Phase 2/3 Bypass: Sails past open shutters to Bank Gate -> TigerBeetle
          const t = (progress - 0.42) / 0.58
          if (t < 0.5) {
            s1PacketRef.current.position.copy(curveGwBank.getPoint(t * 2))
          } else {
            s1PacketRef.current.position.copy(curveAdapterTb.getPoint((t - 0.5) * 2))
          }
        } else {
          // Shield deflected at bridge
          s1PacketRef.current.visible = false
        }
      } else {
        s1PacketRef.current.visible = false
      }
    }

    // Spark cluster shatter at Gateway curtain (Scenario #1 ON)
    if (s1SparksRef.current) {
      if (animatingRay && scenarioNum === 1 && protectionEnabled && progress >= 0.42 && progress < 0.75) {
        s1SparksRef.current.visible = true
        s1SparksRef.current.position.set(-0.15, 0.45, 0)
        s1SparksRef.current.rotation.y += 0.2
        const s = 1.0 + (progress - 0.42) * 3.5
        s1SparksRef.current.scale.set(s, s, s)
      } else {
        s1SparksRef.current.visible = false
      }
    }

    // Alert beam to Compliance Cockpit (Scenario #1 ON)
    if (s1AlertBeamRef.current) {
      if (animatingRay && scenarioNum === 1 && protectionEnabled && progress >= 0.6) {
        s1AlertBeamRef.current.visible = true
        const t = Math.min((progress - 0.6) / 0.35, 1.0)
        s1AlertBeamRef.current.position.copy(curveGwCockpit.getPoint(t))
      } else {
        s1AlertBeamRef.current.visible = false
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #2: Limit Overreach (ASI-02)
    // ───────────────────────────────────────────────────────────────────────
    if (s2HeavyOrbRef.current) {
      if (animatingRay && scenarioNum === 2) {
        s2HeavyOrbRef.current.visible = true
        if (progress < 0.44) {
          const t = progress / 0.44
          s2HeavyOrbRef.current.position.copy(curveAgentGw.getPoint(t))
        } else if (!protectionEnabled) {
          // Smashes into TigerBeetle
          const t = (progress - 0.44) / 0.56
          if (t < 0.5) {
            s2HeavyOrbRef.current.position.copy(curveGwBank.getPoint(t * 2))
          } else {
            s2HeavyOrbRef.current.position.copy(curveAdapterTb.getPoint((t - 0.5) * 2))
          }
        } else {
          // Rebounds back from optical curtain
          s2HeavyOrbRef.current.position.x = -0.2 - (progress - 0.44) * 0.9
        }
      } else {
        s2HeavyOrbRef.current.visible = false
      }
    }

    // Concentric Hexagonal Shockwave Ripple across Forcefield (Scenario #2 ON)
    if (s2ShockwaveRef.current) {
      if (animatingRay && scenarioNum === 2 && protectionEnabled && progress >= 0.42 && progress < 0.8) {
        s2ShockwaveRef.current.visible = true
        const scale = 1.0 + (progress - 0.42) * 5.0
        s2ShockwaveRef.current.scale.set(scale, scale, scale)
        const mat = s2ShockwaveRef.current.material as THREE.MeshBasicMaterial
        mat.opacity = Math.max(0, 0.9 - (progress - 0.42) * 2.2)
      } else {
        s2ShockwaveRef.current.visible = false
      }
    }

    // Receipt Log Beam to Witness :5000 (Scenario #2 ON)
    if (s2ReceiptBeamRef.current) {
      if (animatingRay && scenarioNum === 2 && protectionEnabled && progress >= 0.55) {
        s2ReceiptBeamRef.current.visible = true
        const t = Math.min((progress - 0.55) / 0.38, 1.0)
        s2ReceiptBeamRef.current.position.copy(curveGwWitness.getPoint(t))
      } else {
        s2ReceiptBeamRef.current.visible = false
      }
    }

    // Triple Breach Ring on TigerBeetle (Scenario #2 OFF)
    if (s2BreachRingRef.current) {
      if (animatingRay && scenarioNum === 2 && !protectionEnabled && progress >= 0.8) {
        s2BreachRingRef.current.visible = true
        const scale = 1.0 + (progress - 0.8) * 6.0
        s2BreachRingRef.current.scale.set(scale, scale, scale)
      } else {
        s2BreachRingRef.current.visible = false
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #3: Stolen Token & Nonce Replay (ASI-03)
    // ───────────────────────────────────────────────────────────────────────
    if (s3ValidRef.current && s3GhostRef.current) {
      if (animatingRay && scenarioNum === 3) {
        // Valid packet passes into Bank Gate :4000
        if (progress < 0.45) {
          s3ValidRef.current.visible = true
          const t = progress / 0.45
          if (t < 0.5) {
            s3ValidRef.current.position.copy(curveAgentGw.getPoint(t * 2))
          } else {
            s3ValidRef.current.position.copy(curveGwBank.getPoint((t - 0.5) * 2))
          }
        } else {
          s3ValidRef.current.visible = false
        }

        // Ghost twin spawns at +400ms (progress 0.22)
        if (progress >= 0.22) {
          s3GhostRef.current.visible = true
          const gt = (progress - 0.22) / 0.58
          if (gt < 0.5) {
            s3GhostRef.current.position.copy(curveAgentGw.getPoint(gt * 2))
          } else if (gt < 1.0) {
            s3GhostRef.current.position.copy(curveGwBank.getPoint((gt - 0.5) * 2))
          } else if (!protectionEnabled) {
            // Replay bypass hits TigerBeetle
            s3GhostRef.current.position.copy(curveAdapterTb.getPoint(Math.min((gt - 1.0) * 2, 1.0)))
          } else {
            // Vaporized at Bank Gate airlock
            s3GhostRef.current.visible = false
          }
        } else {
          s3GhostRef.current.visible = false
        }
      } else {
        s3ValidRef.current.visible = false
        s3GhostRef.current.visible = false
      }
    }

    // Red Lock Bars at Bank Gate :4000 (Scenario #3 ON)
    if (s3LockBarRef.current) {
      if (animatingRay && scenarioNum === 3 && protectionEnabled && progress >= 0.58 && progress < 0.95) {
        s3LockBarRef.current.visible = true
      } else {
        s3LockBarRef.current.visible = false
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #4: Smurfing Burst (ASI-06)
    // ───────────────────────────────────────────────────────────────────────
    if (s4VolleyRef.current) {
      if (animatingRay && scenarioNum === 4) {
        s4VolleyRef.current.visible = true
        const bolts = s4VolleyRef.current.children as THREE.Mesh[]
        bolts.forEach((b, idx) => {
          const delay = idx * 0.05
          const p = progress - delay
          if (p > 0 && p < 1.0) {
            b.visible = true
            const t = Math.min(p / 0.55, 1.0)
            if (protectionEnabled && idx >= 2 && t > 0.45) {
              // Caught in containment dome at Gateway
              b.position.set(
                pGateway[0] - 0.3 + Math.sin(now * 0.01 + idx) * 0.28,
                pGateway[1] + 0.35 + Math.cos(now * 0.01 + idx) * 0.28,
                pGateway[2] + Math.sin(now * 0.015 + idx) * 0.2
              )
              const mat = b.material as THREE.MeshBasicMaterial
              mat.color.set('#F59E0B')
            } else if (!protectionEnabled) {
              // Streams straight through into TigerBeetle
              if (t < 0.33) {
                b.position.copy(curveAgentGw.getPoint(t * 3))
              } else if (t < 0.66) {
                b.position.copy(curveGwBank.getPoint((t - 0.33) * 3))
              } else {
                b.position.copy(curveAdapterTb.getPoint((t - 0.66) * 3))
              }
              const mat = b.material as THREE.MeshBasicMaterial
              mat.color.set('#EF4444')
            } else {
              b.position.copy(curveAgentGw.getPoint(t))
            }
          } else {
            b.visible = false
          }
        })
      } else {
        s4VolleyRef.current.visible = false
      }
    }

    // Glowing Containment Dome (Scenario #4 ON)
    if (s4DomeRef.current) {
      if (animatingRay && scenarioNum === 4 && protectionEnabled && progress >= 0.38) {
        s4DomeRef.current.visible = true
        const scale = 1.0 + Math.sin((progress - 0.38) * Math.PI) * 0.35
        s4DomeRef.current.scale.set(scale, scale, scale)
      } else {
        s4DomeRef.current.visible = false
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #5: Runaway Compromised Agent (ASI-08)
    // ───────────────────────────────────────────────────────────────────────
    if (s5OverheatRef.current) {
      if (animatingRay && scenarioNum === 5) {
        s5OverheatRef.current.visible = true
        s5OverheatRef.current.rotation.y += 0.2
      } else {
        s5OverheatRef.current.visible = false
      }
    }

    // Reverse Lock Laser Beam from Gateway to Agent (Scenario #5 ON)
    if (s5ReverseLaserRef.current) {
      if (animatingRay && scenarioNum === 5 && protectionEnabled && progress >= 0.35) {
        s5ReverseLaserRef.current.visible = true
      } else {
        s5ReverseLaserRef.current.visible = false
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #6: Post-Revocation Unauthorized Call (ASI-04)
    // ───────────────────────────────────────────────────────────────────────
    if (s6WaveRef.current) {
      if (animatingRay && scenarioNum === 6 && progress < 0.55) {
        s6WaveRef.current.visible = true
        const scale = 1.0 + progress * 9.0
        s6WaveRef.current.scale.set(scale, scale, scale)
        const mat = s6WaveRef.current.material as THREE.MeshBasicMaterial
        mat.opacity = Math.max(0, 0.85 - progress * 1.5)
      } else {
        s6WaveRef.current.visible = false
      }
    }

    if (s6StaleRef.current) {
      if (animatingRay && scenarioNum === 6 && progress >= 0.24) {
        s6StaleRef.current.visible = true
        const t = (progress - 0.24) / 0.55
        if (t < 0.85) {
          s6StaleRef.current.position.copy(curveAgentGw.getPoint(t))
        } else if (!protectionEnabled) {
          s6StaleRef.current.position.copy(curveGwBank.getPoint((t - 0.85) * 3))
        } else {
          s6StaleRef.current.visible = false
        }
      } else {
        s6StaleRef.current.visible = false
      }
    }

    if (s6SealedPlaneRef.current) {
      if (animatingRay && scenarioNum === 6 && protectionEnabled && progress >= 0.3) {
        s6SealedPlaneRef.current.visible = true
      } else {
        s6SealedPlaneRef.current.visible = false
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // SCENARIO #7: Insider DB Tampering (ASI-05) - Merkle Audit Laser
    // ───────────────────────────────────────────────────────────────────────
    if (s7AuditLaserRef.current) {
      if (animatingRay && scenarioNum === 7 && protectionEnabled && progress >= 0.3) {
        s7AuditLaserRef.current.visible = true
      } else {
        s7AuditLaserRef.current.visible = false
      }
    }

    if (s7AlertArcRef.current) {
      if (animatingRay && scenarioNum === 7 && protectionEnabled && progress >= 0.58) {
        s7AlertArcRef.current.visible = true
        const t = (progress - 0.58) / 0.4
        s7AlertArcRef.current.position.copy(curveWitnessTb.getPoint(1.0 - t))
      } else {
        s7AlertArcRef.current.visible = false
      }
    }
  })

  return (
    <group>
      {/* ── Ambient Flowing Optic Pulses ─────────────────────────────────── */}
      <mesh ref={ambientPulse1}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={protectionEnabled ? '#06B6D4' : '#F43F5E'} />
      </mesh>
      <mesh ref={ambientPulse2}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={protectionEnabled ? '#10B981' : '#F43F5E'} />
      </mesh>

      {/* ── Scenario #1: Prompt Injection Payload + Shatter Cluster ──────── */}
      <mesh ref={s1PacketRef} visible={false}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color="#06B6D4" emissive="#06B6D4" emissiveIntensity={1.4} />
      </mesh>
      <group ref={s1SparksRef} visible={false}>
        {[-0.2, 0, 0.2].map((x, i) => (
          <mesh key={`spark-${i}`} position={[x, (i - 1) * 0.15, 0]}>
            <octahedronGeometry args={[0.06, 0]} />
            <meshBasicMaterial color="#34D399" />
          </mesh>
        ))}
      </group>
      <mesh ref={s1AlertBeamRef} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#38BDF8" />
      </mesh>

      {/* ── Scenario #2: Overreach Heavy Orb + Hex Shockwave ─────────────── */}
      <mesh ref={s2HeavyOrbRef} visible={false}>
        <sphereGeometry args={[0.26, 20, 20]} />
        <meshStandardMaterial
          color="#F59E0B"
          emissive="#EF4444"
          emissiveIntensity={1.8}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      <mesh ref={s2ShockwaveRef} position={[-0.15, 0.45, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.3, 1.2, 32]} />
        <meshBasicMaterial color="#10B981" transparent side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={s2ReceiptBeamRef} visible={false}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshBasicMaterial color="#F59E0B" />
      </mesh>
      <mesh
        ref={s2BreachRingRef}
        position={[pTigerBeetle[0], pTigerBeetle[1] + 0.3, pTigerBeetle[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      >
        <ringGeometry args={[0.5, 1.5, 32]} />
        <meshBasicMaterial color="#EF4444" transparent side={THREE.DoubleSide} opacity={0.85} />
      </mesh>

      {/* ── Scenario #3: Token Replay Ghost ──────────────────────────────── */}
      <mesh ref={s3ValidRef} visible={false}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#10B981" />
      </mesh>
      <mesh ref={s3GhostRef} visible={false}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial
          color="#A7F3D0"
          emissive="#34D399"
          emissiveIntensity={1.8}
          transparent
          opacity={0.65}
        />
      </mesh>
      <mesh ref={s3LockBarRef} position={[pBankGate[0], pBankGate[1] + 0.45, pBankGate[2]]} visible={false}>
        <boxGeometry args={[0.04, 0.85, 0.04]} />
        <meshBasicMaterial color="#EF4444" />
      </mesh>

      {/* ── Scenario #4: Smurfing Volley of 10 Micro-Bolts ───────────────── */}
      <group ref={s4VolleyRef} visible={false}>
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh key={`bolt-${i}`}>
            <sphereGeometry args={[0.065, 10, 10]} />
            <meshBasicMaterial color="#F59E0B" />
          </mesh>
        ))}
      </group>
      <mesh ref={s4DomeRef} position={[-0.3, 0.45, 0]} visible={false}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial color="#10B981" wireframe transparent opacity={0.5} />
      </mesh>

      {/* ── Scenario #5: Runaway Agent Overheat & Reverse Lock Laser ──────── */}
      <mesh ref={s5OverheatRef} position={[pAgent[0], pAgent[1] + 0.35, pAgent[2]]} visible={false}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color="#EF4444" wireframe />
      </mesh>
      <primitive
        ref={s5ReverseLaserRef}
        object={new THREE.Line(reverseLaserGeom, new THREE.LineBasicMaterial({ color: '#F43F5E', linewidth: 2 }))}
        visible={false}
      />

      {/* ── Scenario #6: Post-Revocation Radial Wave ─────────────────────── */}
      <mesh ref={s6WaveRef} position={[pCockpit[0], pCockpit[1] + 0.25, pCockpit[2]]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.3, 0.65, 36]} />
        <meshBasicMaterial color="#8B5CF6" transparent side={THREE.DoubleSide} opacity={0.8} />
      </mesh>
      <mesh ref={s6StaleRef} visible={false}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshBasicMaterial color="#94A3B8" />
      </mesh>
      <mesh ref={s6SealedPlaneRef} position={[-0.35, 0.45, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <planeGeometry args={[0.8, 1.1]} />
        <meshBasicMaterial color="#EF4444" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Scenario #7: Merkle Audit Laser (Witness -> TigerBeetle) ──────── */}
      <primitive
        ref={s7AuditLaserRef}
        object={new THREE.Line(merkleAuditLaserGeom, new THREE.LineBasicMaterial({ color: '#EF4444', linewidth: 2.5 }))}
        visible={false}
      />
      <mesh ref={s7AlertArcRef} visible={false}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshBasicMaterial color="#EF4444" />
      </mesh>
    </group>
  )
}
