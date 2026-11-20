# PHASE-7.1.1-FRONTEND-DESIGN.md — Enterprise Compliance Cockpit & 3D Security Visualisation
**Document:** `docs/PHASE-7.1.1-FRONTEND-DESIGN.md`  
**Version:** 1.0.0 (Phase 7.1.1 Frontend Modernisation)  
**Status:** APPROVED DESIGN SPECIFICATION  
**Target Git Branch:** `main` (tracked at `Sumeet1249/ai-trail.git`)  

---

## 1. Executive Summary

Phase 7.1.1 modernises the **AgentGuard Compliance Cockpit** (`apps/compliance-cockpit`) into an institutional banking security command centre. The interface is engineered to convey confidence to risk officers, bank auditors, and executive teams that autonomous AI agents are rigorously bounded by cryptographic perimeters.

Key enhancements delivered in Phase 7.1.1:
1. **Interactive 3D Security Architecture Topology**:
   - Built on **React Three Fiber (R3F)**, **Three.js**, and **Drei**.
   - Renders the 7 foundational services as 3D glowing meshes with directional quadratic bezier links and real-time travelling particle beams representing transactional event pulses.
   - Dynamic SSR-safe loading via Next.js `dynamic(..., { ssr: false })` with zero server-side hydration failure.
   - Accessible, zero-overhead 2D schematic fallback for low-power devices and environments lacking WebGL hardware acceleration.
   - Slide-out **Service Node Details Inspector** detailing runtime process type, database path, key material isolation, and enforced security invariants.
2. **Unified Banking Operations Command Centre (`/banking`)**:
   - Live Cluster Telemetry strip tracking TigerBeetle 3-replica VSR quorum, Bank Gate, Gateway private key isolation, and Witness notarization.
   - Tabbed operations interface: 2D Topology, Customer Mandate Matrix, Passkeys (FIDO2), and Reconciliation FSM.
   - Transaction-Bound Step-Up Customer Approval card displaying the 7 canonical transaction fields, SHA-256 digest, mandate version, and WebAuthn step-up trigger.

---

## 2. Visual Design System

The visual design system adheres to modern institutional cybersecurity command centre principles:

- **Color Palette**:
  - Background: Deep Space Navy / Graphite (`hsl(222, 47%, 7%)` to `hsl(224, 71%, 4%)`).
  - Card Surfaces: Slate Glassmorphism (`hsl(222, 47%, 11%)` with 40–80% opacity and `backdrop-blur-md`).
  - Accent Primary: Deep Indigo / Violet (`#6366f1` / `#8b5cf6`).
  - Status Healthy: Emerald / Mint Glow (`#10b981` / `#34d399`).
  - Status Active Hold / Alert: Warm Amber (`#f59e0b` / `#fbbf24`).
  - Status Blocked / Revoked: Crimson Red (`#ef4444`).
  - Telemetry Accent: Cyber Cyan (`#06b6d4` / `#38bdf8`).
- **Typography**:
  - Interface Typography: `Geist Sans` for crisp UI hierarchies and high scannability.
  - Data / Identifiers: `Geist Mono` for UUIDs, paise amounts, hashes, ports, and addresses.
- **Micro-Interactions**:
  - Restrained rotation and glow transitions (`200ms ease-out`).
  - Smooth camera damping in 3D scene with strict polar angle limits (`minPolarAngle: PI/4`, `maxPolarAngle: PI/1.7`) preventing disorienting camera flips.

---

## 3. Interactive 3D Security Architecture Topology

### 3.1 3D Node Mesh Architecture
Each service node is rendered as a composite 3D object:
1. **Core Sphere**: High-metalness (`0.7`), low-roughness (`0.2`) standard mesh material with emissive glow matching service status.
2. **Outer Glow Halo Ring**: Rotating 2D ring geometry aligned to camera plane indicating active process health.
3. **Selection Wireframe Shell**: Outer wireframe sphere (`radius: 0.85`) pulsating when selected.
4. **Floating HTML Label**: CSS2D/HTML billboard rendered via Drei's `<Html distanceFactor={14}>` displaying service name, port, and role without blurriness at varying zoom levels.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   3D SECURITY TOPOLOGY SERVICE NODES                   │
├─────────────────────┬──────────────┬───────────────────────────────────┤
│ Node Name           │ Position     │ Primary Security Invariant        │
├─────────────────────┼──────────────┼───────────────────────────────────┤
│ AI Agent Runtime    │ [-5, 1.5, 0] │ Rule E5: Ed25519 Request Signing  │
│ Gateway (:8080)     │ [-1.8, 1.8,0]│ Decision D1: Isolated Private Key │
│ Bank Gate (:4000)   │ [1.8, 1.8, 0]│ Rule E4 & I1: Public Key ONLY     │
│ Ledger Adapter(:4001│ [5, 1.5, 0]  │ Decision D19: Explicit Backend    │
│ TigerBeetle (:3001) │ [5, -1.8, 0] │ Decision D19: 3-Replica VSR Quorum│
│ Witness (:5000)     │ [0, -2.2, 0] │ Invariant I9: Standalone DB (D17) │
│ Cockpit (:3000)     │ [-3.5,-1.8,0]│ Decision D21: 7-Field WebAuthn    │
└─────────────────────┴──────────────┴───────────────────────────────────┘
```

### 3.2 Directional Communication Links with Particle Beams
Links between nodes are computed using 3D quadratic bezier curves (`QuadraticBezierCurve3`):
- Line: Semi-transparent indigo beam (`opacity: 0.35`).
- Particle: Travelling cyan pulse traversing the curve in real time based on `state.clock.getElapsedTime() * 0.4 % 1.0`, illustrating transactional flow between components.

### 3.3 Dynamic SSR-Safe Loading & 2D Fallback
In Next.js 14 App Router, Three.js canvas components fail if evaluated during server-side pre-rendering because `window` and `WebGLRenderingContext` are undefined on the server.
- **Dynamic Import**:
  ```typescript
  const Dynamic3DScene = dynamic(() => import('./security-3d-scene'), {
    ssr: false,
    loading: () => <LoadingSpinner />,
  });
  ```
- **WebGL Capability Check**: `Security3DTopology` tests for WebGL context on mount. If unsupported or disabled, it automatically presents the 2D Schematic Grid.
- **Manual Toggle**: A dedicated `3D Mesh` vs `2D Schematic` toggle is always available in the overlay control bar.

---

## 4. Banking Operations View Architecture

The main banking page (`apps/compliance-cockpit/src/app/banking/page.tsx`) organizes financial controls into clear functional domains:

1. **Top Cluster Health Strip**: Instant visual check of the 5 active infrastructure services.
2. **Metric Summary Cards**: Liquid balance, active budget holds (120s TTL), authentication state, and single-use replay defense.
3. **Step-Up Approval Card**: Displays when a transaction exceeds mandate limits, showcasing:
   - 7 canonical fields: `account_ref`, `action`, `amount_paise`, `currency`, `invoice_ref`, `payee_id`, `purpose`.
   - Canonical SHA-256 Digest and bound Mandate Version.
   - Interactive WebAuthn assertion button calling `@simplewebauthn/browser`'s `startAuthentication`.
4. **Tabbed Governance Panel**:
   - `2D Topology`: Clean flow schematic.
   - `Mandate Matrix`: Full mandate limits, allowed payees, and version numbers.
   - `Passkeys (FIDO2)`: Passkey list and registration modal trigger (`startRegistration`).
   - `Reconciliation`: FSM synchronization telemetry.
5. **Two-Phase Settlement Activity Feed**: Real-time transaction cards displaying status (`SETTLED`, `PENDING_TRANSFER`, `VOIDED`), request IDs, and agent references.

---
*AgentGuard AI Frontend Architecture Team — Phase 7.1.1 Specification*
