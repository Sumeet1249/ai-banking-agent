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

function createConduitCurve(
  p1: [number, number, number],
  p2: [number, number, number],
  archY: number = 0.35
): THREE.QuadraticBezierCurve3 {
  const v1 = new THREE.Vector3(p1[0], p1[1] + 0.4, p1[2])
  const v2 = new THREE.Vector3(p2[0], p2[1] + 0.4, p2[2])
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
  // Extract coordinate map
  const posMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>()
    nodes.forEach((n) => map.set(n.id, n.position))
    return map
  }, [nodes])

  const pAgent = posMap.get('agent') ?? [-5.8, 0.24, -0.6]
  const pCockpit = posMap.get('cockpit') ?? [-5.2, 0.24, 2.7]
  const pGateway = posMap.get('gateway') ?? [0.0, 0.24, -0.4]
  const pWitness = posMap.get('witness') ?? [0.0, 0.24, 2.8]
  const pBankGate = posMap.get('bank-gate') ?? [4.6, 0.24, -2.0]
  const pAdapter = posMap.get('ledger-adapter') ?? [6.5, 0.24, 0.3]
  const pTigerBeetle = posMap.get('tigerbeetle') ?? [4.8, 0.24, 2.5]

  // Direct Spline Curves
  const curveAgentGw = useMemo(() => createConduitCurve(pAgent, pGateway, 0.32), [pAgent, pGateway])
  const curveGwBank = useMemo(() => createConduitCurve(pGateway, pBankGate, 0.35), [pGateway, pBankGate])
  const curveBankAdapter = useMemo(() => createConduitCurve(pBankGate, pAdapter, 0.28), [pBankGate, pAdapter])
  const curveAdapterTb = useMemo(() => createConduitCurve(pAdapter, pTigerBeetle, 0.3), [pAdapter, pTigerBeetle])
  const curveGwWitness = useMemo(() => createConduitCurve(pGateway, pWitness, 0.35), [pGateway, pWitness])
  const curveGwCockpit = useMemo(() => createConduitCurve(pGateway, pCockpit, 0.34), [pGateway, pCockpit])
  const curveCockpitGw = useMemo(() => createConduitCurve(pCockpit, pGateway, 0.34), [pCockpit, pGateway])
  const curveTbWitness = useMemo(() => createConduitCurve(pTigerBeetle, pWitness, 0.36), [pTigerBeetle, pWitness])

  // Ambient Pulses
  const ambientPulse1 = useRef<THREE.Mesh>(null)
  const ambientPulse2 = useRef<THREE.Mesh>(null)

  // Scenario 1: Prompt Injection
  const s1Packet = useRef<THREE.Mesh>(null)
  const s1Shockwave = useRef<THREE.Mesh>(null)
  const s1ProofPulse = useRef<THREE.Mesh>(null)

  // Scenario 2: Limit Overreach
  const s2HeavyOrb = useRef<THREE.Mesh>(null)
  const s2ImpactBurst = useRef<THREE.Mesh>(null)
  const s2WitnessPulse = useRef<THREE.Mesh>(null)

  // Scenario 3: Stolen Token Replay
  const s3ValidPacket = useRef<THREE.Mesh>(null)
  const s3GhostPacket = useRef<THREE.Mesh>(null)
  const s3ReplayRing = useRef<THREE.Mesh>(null)

  // Scenario 4: Smurfing Burst
  const s4VolleyGroup = useRef<THREE.Group>(null)
  const s4ContainmentDome = useRef<THREE.Mesh>(null)

  // Scenario 6: Post-Revocation
  const s6RevokeWave = useRef<THREE.Mesh>(null)
  const s6StalePacket = useRef<THREE.Mesh>(null)
  const s6SealedShield = useRef<THREE.Mesh>(null)

  // Scenario 7: Insider DB Tamper
  const s7AlertPulse = useRef<THREE.Mesh>(null)

  // Determine scenario number (1-7)
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

  // Timer reference for 3.2s animation
  const animStart = useRef<number>(0)
  useEffect(() => {
    if (animatingRay) {
      animStart.current = performance.now()
    }
  }, [animatingRay, scenarioNum])

  // Precomputed reverse laser geometry (Gateway -> Agent for Scenario #5)
  const reverseLaserGeom = useMemo(() => {
    const pts = [
      new THREE.Vector3(pGateway[0], pGateway[1] + 1.0, pGateway[2]),
      new THREE.Vector3(pAgent[0], pAgent[1] + 0.75, pAgent[2]),
    ]
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [pGateway, pAgent])

  const reverseLaserLine = useMemo(() => {
    const line = new THREE.Line(reverseLaserGeom, new THREE.LineBasicMaterial({ color: '#f43f5e', linewidth: 3 }))
    line.visible = false
    return line
  }, [reverseLaserGeom])

  // Precomputed witness audit laser geometry (Witness -> TigerBeetle for Scenario #7)
  const witnessLaserGeom = useMemo(() => {
    const pts = [
      new THREE.Vector3(pWitness[0], pWitness[1] + 1.05, pWitness[2]),
      new THREE.Vector3(pTigerBeetle[0], pTigerBeetle[1] + 0.85, pTigerBeetle[2]),
    ]
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [pWitness, pTigerBeetle])

  const witnessLaserLine = useMemo(() => {
    const line = new THREE.Line(witnessLaserGeom, new THREE.LineBasicMaterial({ color: '#f59e0b', linewidth: 3 }))
    line.visible = false
    return line
  }, [witnessLaserGeom])

  // ─────────────────────────────────────────────────────────────────────────
  // 60FPS useFrame Animation Engine (3.2s Sequence, Zero React Re-renders!)
  // ─────────────────────────────────────────────────────────────────────────
  useFrame((state) => {
    const now = performance.now()
    const elapsed = animatingRay ? (now - animStart.current) / 1000 : 0
    const progress = Math.min(elapsed / 3.2, 1.0)
    const clk = state.clock.getElapsedTime()

    // ── 1. Ambient Idle Traffic (Frozen on Global Freeze) ───────────────────
    if (!globalFreeze) {
      if (ambientPulse1.current) {
        const t = (clk * 0.28) % 1
        ambientPulse1.current.position.copy(curveAgentGw.getPoint(t))
        ambientPulse1.current.visible = !animatingRay
      }
      if (ambientPulse2.current) {
        const t = (clk * 0.34) % 1
        ambientPulse2.current.position.copy(curveGwBank.getPoint(t))
        ambientPulse2.current.visible = !animatingRay
      }
    }

    // ── 2. Scenario #1: Prompt Injection / Payee Diversion (ASI-01) ─────────
    if (s1Packet.current) {
      if (animatingRay && scenarioNum === 1) {
        s1Packet.current.visible = true
        if (progress < 0.38) {
          // Phase 1 (0–1.2s): Agent -> Gateway
          const t = progress / 0.38
          const pos = curveAgentGw.getPoint(t)
          if (t > 0.45) {
            pos.z += Math.sin(now * 0.04) * 0.16
            pos.y += Math.cos(now * 0.05) * 0.1
          }
          s1Packet.current.position.copy(pos)
          const mat = s1Packet.current.material as THREE.MeshStandardMaterial
          if (t < 0.45) {
            mat.color.set('#06b6d4')
            mat.emissive.set('#06b6d4')
          } else {
            mat.color.set('#ef4444')
            mat.emissive.set('#ef4444')
          }
        } else if (!protectionEnabled && progress >= 0.38) {
          // Bypass: Blasts past open archway straight to TigerBeetle
          const t = (progress - 0.38) / 0.62
          if (t < 0.5) {
            s1Packet.current.position.copy(curveGwBank.getPoint(t * 2))
          } else {
            s1Packet.current.position.copy(curveAdapterTb.getPoint((t - 0.5) * 2))
          }
        } else {
          // Deflected at Gateway shield
          s1Packet.current.visible = false
        }
      } else {
        s1Packet.current.visible = false
      }
    }

    // Scenario 1: Shockwave Ring & Proof Pulse
    if (s1Shockwave.current) {
      if (animatingRay && scenarioNum === 1 && protectionEnabled && progress >= 0.38 && progress < 0.72) {
        s1Shockwave.current.visible = true
        const st = (progress - 0.38) / 0.34
        s1Shockwave.current.scale.set(1 + st * 4, 1 + st * 4, 1 + st * 4)
        const mat = s1Shockwave.current.material as THREE.MeshBasicMaterial
        mat.opacity = (1 - st) * 0.85
      } else {
        s1Shockwave.current.visible = false
      }
    }

    if (s1ProofPulse.current) {
      if (animatingRay && scenarioNum === 1 && protectionEnabled && progress >= 0.65) {
        s1ProofPulse.current.visible = true
        const pt = (progress - 0.65) / 0.35
        s1ProofPulse.current.position.copy(curveGwWitness.getPoint(pt))
      } else {
        s1ProofPulse.current.visible = false
      }
    }

    // ── 3. Scenario #2: Limit Overreach (ASI-02) ────────────────────────────
    if (s2HeavyOrb.current) {
      if (animatingRay && scenarioNum === 2) {
        s2HeavyOrb.current.visible = true
        if (progress < 0.38) {
          const t = progress / 0.38
          s2HeavyOrb.current.position.copy(curveAgentGw.getPoint(t))
        } else if (!protectionEnabled && progress >= 0.38) {
          const t = (progress - 0.38) / 0.62
          if (t < 0.5) {
            s2HeavyOrb.current.position.copy(curveGwBank.getPoint(t * 2))
          } else {
            s2HeavyOrb.current.position.copy(curveAdapterTb.getPoint((t - 0.5) * 2))
          }
        } else {
          s2HeavyOrb.current.visible = false
        }
      } else {
        s2HeavyOrb.current.visible = false
      }
    }

    if (s2ImpactBurst.current) {
      if (animatingRay && scenarioNum === 2 && protectionEnabled && progress >= 0.38 && progress < 0.75) {
        s2ImpactBurst.current.visible = true
        const st = (progress - 0.38) / 0.37
        s2ImpactBurst.current.scale.set(1 + st * 5, 1 + st * 5, 1 + st * 5)
        const mat = s2ImpactBurst.current.material as THREE.MeshBasicMaterial
        mat.opacity = (1 - st) * 0.9
      } else {
        s2ImpactBurst.current.visible = false
      }
    }

    if (s2WitnessPulse.current) {
      if (animatingRay && scenarioNum === 2 && protectionEnabled && progress >= 0.65) {
        s2WitnessPulse.current.visible = true
        const pt = (progress - 0.65) / 0.35
        s2WitnessPulse.current.position.copy(curveGwWitness.getPoint(pt))
      } else {
        s2WitnessPulse.current.visible = false
      }
    }

    // ── 4. Scenario #3: Stolen Token Replay (ASI-03) ─────────────────────────
    if (s3ValidPacket.current) {
      if (animatingRay && scenarioNum === 3) {
        s3ValidPacket.current.visible = true
        if (progress < 0.6) {
          const t = progress / 0.6
          s3ValidPacket.current.position.copy(curveGwBank.getPoint(t))
        } else {
          const t = (progress - 0.6) / 0.4
          s3ValidPacket.current.position.copy(curveBankAdapter.getPoint(t))
        }
      } else {
        s3ValidPacket.current.visible = false
      }
    }

    if (s3GhostPacket.current) {
      if (animatingRay && scenarioNum === 3 && progress >= 0.18) {
        s3GhostPacket.current.visible = true
        const gp = (progress - 0.18) / 0.82
        if (gp < 0.5) {
          s3GhostPacket.current.position.copy(curveGwBank.getPoint(gp * 2))
        } else if (!protectionEnabled) {
          s3GhostPacket.current.position.copy(curveBankAdapter.getPoint((gp - 0.5) * 2))
        } else {
          // Blocked at Bank Gate
          s3GhostPacket.current.visible = false
        }
      } else {
        s3GhostPacket.current.visible = false
      }
    }

    if (s3ReplayRing.current) {
      if (animatingRay && scenarioNum === 3 && protectionEnabled && progress >= 0.55 && progress < 0.88) {
        s3ReplayRing.current.visible = true
        const rt = (progress - 0.55) / 0.33
        s3ReplayRing.current.scale.set(1 + rt * 3.5, 1 + rt * 3.5, 1 + rt * 3.5)
        const mat = s3ReplayRing.current.material as THREE.MeshBasicMaterial
        mat.opacity = (1 - rt) * 0.95
      } else {
        s3ReplayRing.current.visible = false
      }
    }

    // ── 5. Scenario #4: Smurfing Burst (ASI-06) ─────────────────────────────
    if (s4VolleyGroup.current) {
      if (animatingRay && scenarioNum === 4) {
        s4VolleyGroup.current.visible = true
        const children = s4VolleyGroup.current.children as THREE.Mesh[]
        children.forEach((child, idx) => {
          const delay = idx * 0.075
          const p = Math.max(0, Math.min(1, (progress - delay) / 0.45))
          if (p <= 0 || p >= 1) {
            child.visible = false
          } else {
            child.visible = true
            if (protectionEnabled && idx >= 2 && p > 0.45) {
              // Blocked at Gateway
              child.visible = false
            } else if (!protectionEnabled) {
              if (p < 0.5) {
                child.position.copy(curveAgentGw.getPoint(p * 2))
              } else {
                child.position.copy(curveGwBank.getPoint((p - 0.5) * 2))
              }
            } else {
              child.position.copy(curveAgentGw.getPoint(p))
            }
          }
        })
      } else {
        s4VolleyGroup.current.visible = false
      }
    }

    if (s4ContainmentDome.current) {
      if (animatingRay && scenarioNum === 4 && protectionEnabled && progress >= 0.35 && progress < 0.85) {
        s4ContainmentDome.current.visible = true
        const dt = (progress - 0.35) / 0.5
        const scale = 0.5 + Math.sin(dt * Math.PI) * 1.5
        s4ContainmentDome.current.scale.set(scale, scale, scale)
      } else {
        s4ContainmentDome.current.visible = false
      }
    }

    // ── 6. Scenario #5: Runaway Loop (ASI-08) ────────────────────────────────
    if (animatingRay && scenarioNum === 5 && protectionEnabled && progress >= 0.32 && progress < 0.85) {
      reverseLaserLine.visible = true
    } else {
      reverseLaserLine.visible = false
    }

    // ── 7. Scenario #6: Post-Revocation (ASI-04) ─────────────────────────────
    if (s6RevokeWave.current) {
      if (animatingRay && scenarioNum === 6 && progress < 0.55) {
        s6RevokeWave.current.visible = true
        const wt = progress / 0.55
        s6RevokeWave.current.position.copy(curveCockpitGw.getPoint(wt))
        s6RevokeWave.current.scale.set(1 + wt * 2, 1 + wt * 2, 1 + wt * 2)
      } else {
        s6RevokeWave.current.visible = false
      }
    }

    if (s6StalePacket.current) {
      if (animatingRay && scenarioNum === 6 && progress >= 0.25) {
        s6StalePacket.current.visible = true
        const st = (progress - 0.25) / 0.75
        if (st < 0.48) {
          s6StalePacket.current.position.copy(curveAgentGw.getPoint(st * 2))
        } else if (!protectionEnabled) {
          s6StalePacket.current.position.copy(curveGwBank.getPoint((st - 0.48) * 2))
        } else {
          s6StalePacket.current.visible = false
        }
      } else {
        s6StalePacket.current.visible = false
      }
    }

    if (s6SealedShield.current) {
      if (animatingRay && scenarioNum === 6 && protectionEnabled && progress >= 0.45 && progress < 0.9) {
        s6SealedShield.current.visible = true
      } else {
        s6SealedShield.current.visible = false
      }
    }

    // ── 8. Scenario #7: Insider DB Tampering (ASI-05) ────────────────────────
    if (animatingRay && scenarioNum === 7 && protectionEnabled && progress >= 0.3 && progress < 0.88) {
      witnessLaserLine.visible = true
    } else {
      witnessLaserLine.visible = false
    }

    if (s7AlertPulse.current) {
      if (animatingRay && scenarioNum === 7 && protectionEnabled && progress >= 0.65) {
        s7AlertPulse.current.visible = true
        const at = (progress - 0.65) / 0.35
        s7AlertPulse.current.position.copy(curveGwCockpit.getPoint(at))
      } else {
        s7AlertPulse.current.visible = false
      }
    }
  })

  return (
    <group>
      {/* ── Ambient Traffic Light Capsules ─────────────────────────────────── */}
      <mesh ref={ambientPulse1} visible={false}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh ref={ambientPulse2} visible={false}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#34d399" />
      </mesh>

      {/* ── Scenario #1 Meshes ────────────────────────────────────────────── */}
      <mesh ref={s1Packet} visible={false}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={1.8} />
      </mesh>
      <mesh ref={s1Shockwave} position={[pGateway[0], pGateway[1] + 1.0, pGateway[2]]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <ringGeometry args={[0.1, 0.22, 32]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={s1ProofPulse} visible={false}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>

      {/* ── Scenario #2 Meshes ────────────────────────────────────────────── */}
      <mesh ref={s2HeavyOrb} visible={false}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.8} />
      </mesh>
      <mesh ref={s2ImpactBurst} position={[pGateway[0], pGateway[1] + 1.0, pGateway[2]]} visible={false}>
        <ringGeometry args={[0.15, 0.35, 32]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={s2WitnessPulse} visible={false}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>

      {/* ── Scenario #3 Meshes ────────────────────────────────────────────── */}
      <mesh ref={s3ValidPacket} visible={false}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1.6} />
      </mesh>
      <mesh ref={s3GhostPacket} visible={false}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.8} transparent opacity={0.7} />
      </mesh>
      <mesh ref={s3ReplayRing} position={[pBankGate[0], pBankGate[1] + 0.72, pBankGate[2]]} rotation={[0, 0, 0]} visible={false}>
        <ringGeometry args={[0.15, 0.35, 32]} />
        <meshBasicMaterial color="#f43f5e" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Scenario #4 Meshes: Smurfing Burst ─────────────────────────────── */}
      <group ref={s4VolleyGroup} visible={false}>
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={`smurf-${i}`}>
            <sphereGeometry args={[0.075, 12, 12]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.8} />
          </mesh>
        ))}
      </group>
      <mesh ref={s4ContainmentDome} position={[pGateway[0], pGateway[1] + 1.0, pGateway[2]]} visible={false}>
        <sphereGeometry args={[0.6, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1.0} transparent opacity={0.4} wireframe />
      </mesh>

      {/* ── Scenario #5 Meshes: Runaway Loop ──────────────────────────────── */}
      <primitive object={reverseLaserLine} />

      {/* ── Scenario #6 Meshes: Post-Revocation ───────────────────────────── */}
      <mesh ref={s6RevokeWave} visible={false}>
        <ringGeometry args={[0.2, 0.45, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={s6StalePacket} visible={false}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.8} />
      </mesh>
      <mesh ref={s6SealedShield} position={[pGateway[0], pGateway[1] + 1.0, pGateway[2]]} rotation={[0, Math.PI / 2, 0]} visible={false}>
        <planeGeometry args={[1.2, 1.8]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.2} transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Scenario #7 Meshes: DB Tampering ──────────────────────────────── */}
      <primitive object={witnessLaserLine} />
      <mesh ref={s7AlertPulse} visible={false}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.8} />
      </mesh>
    </group>
  )
}
