# BP-3.4 — Compliance Cockpit Enterprise Integration

## Overview

The Compliance Cockpit frontend (`apps/compliance-cockpit`) has been upgraded from a static, mock-driven prototype into an enterprise-grade administrative and governance interface for autonomous AI agent budget pools.

The target page `/budget-pools` renders `AnonymousBudgetPoolsView`, which now features a comprehensive 4-tab architecture connecting directly to live backend endpoints in Bank Gate (:4000).

---

## Architecture & Tab Structure

### Tab 1: Category Pools (`pools`)
- **Authoritative Data Source**: Connects to `GET /api/v1/category-pools` via client-side fetch.
- **Budget Metrics**: Renders live monthly, weekly, and daily caps, spent amounts, and reserved capacity.
- **Autonomy Modes**:
  - `ASK_BEFORE_EVERY_PAYMENT` (Human-in-the-loop escalation)
  - `PAY_WITH_RESTRICTION` (Constrained autonomy within strict thresholds)
  - `NEVER_PAY_WITHOUT_ASK` (Hard mandatory block on automated execution)
- **Controls**: Real-time mode switching, pool creation modal with integer-paise validation, and pool status management.

### Tab 2: Multi-Agent Quotas (`agents`)
- **Agent Allocation Management**:
  - Displays agent sub-allocations per category pool (`GET /api/v1/category-pools/:poolId/agents`).
  - Enforces child allocation rules: subordinate limits cannot exceed pool parent thresholds.
  - Granular control over allowed and blocked categories (`blocked_categories` evaluated first).
  - Agent status lifecycle: `ACTIVE`, `SUSPENDED`, `REVOKED`.
- **Form Controls**: Dynamic allocation assignment modal supporting monthly caps, weekly caps, and per-transaction limits.

### Tab 3: Merchant Intelligence (`merchants`)
- **ISO 18245 MCC Registry**:
  - Displays verified merchant entries (`GET /api/v1/merchants`).
  - Visual indicators for 5-tier evidence hierarchy:
    - Tier 1: Verified Bank Feed / Statement
    - Tier 2: Validated Invoice with GSTIN/PAN / Cryptographic Signature
    - Tier 3: Curated Directory Match
    - Tier 4: Self-Asserted Payee Metadata
    - Tier 5: Pure AI Inference (Strictly non-authoritative)
  - Category mismatch alerts when merchant MCC does not align with requested category pool.
  - Customer override management (`POST /api/v1/merchants/override`) allowing trusted customer-defined reclassifications.

### Tab 4: Merkle Proof Verifier (`merkle`)
- **Cryptographic Audit Verification**:
  - Lists historical audit batches with Merkle root hashes (`GET /api/v1/audit/merkle/batches`).
  - Interactive inclusion proof validator (`POST /api/v1/audit/merkle/verify`):
    - Validates leaf hashes computed under RFC 6962 (`0x00` prefix).
    - Verifies internal nodes computed with `0x01` prefix and deterministic odd-leaf self-pairing.
    - Demonstrates tamper detection when event payloads or root hashes are manipulated.
  - Displays Witness co-signatures and Merkle transparency logs.

---

## State Management & Resilience

1. **Elimination of Mock Data Dependency**:
   - The production UI no longer falls back silently to mock data without user indication.
   - If Bank Gate (:4000) is unreachable, an explicit error banner is rendered with a retry button.
2. **Real Loading & Empty States**:
   - Skeleton loaders during data fetch.
   - Informative empty states with actionable buttons (e.g., "Create First Budget Pool", "Assign Sub-Agent Allocation").
3. **Integer Paise Formatting**:
   - Currency display strictly uses utility formatters (`formatPaise(amount) => ₹X,XXX.XX`).
   - Inputs accept human-readable Rupees and convert deterministically to integer paise before API submission.

---

## Verification & Status

- **TypeScript Compilation**: Clean (`npx tsc --noEmit` exited with code 0).
- **Component Isolation**: Zero leaked private keys, zero TigerBeetle imports in frontend (satisfies Rule E4).
- **Responsive Layout**: Tailwind CSS dark-mode optimized layout suitable for fintech operations teams.
