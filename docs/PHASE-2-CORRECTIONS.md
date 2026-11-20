# Phase 2.3.1 — Security and Architecture Corrections

**Document:** `docs/PHASE-2-CORRECTIONS.md`  
**Target Branch:** `feat/agentguard-banking`  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Identified Architecture Defects & Mitigations

### Defect 1: Gateway Maintaining Duplicate Ledger / Authoritative Budget Reservation
- **Finding:** Initial `permit-engine.ts` created a local `budget_reservations` SQLite table and verified liquid account balance during permit evaluation.
- **Root Cause & Risk:** Gateway is an evaluation and policy enforcement engine. If Gateway maintains authoritative budget holds, it introduces split-brain financial state with the Bank Gate (:4000) and TigerBeetle Ledger Adapter (:4001).
- **Correction:** Removed authoritative financial reservations from `permit-engine.ts`. Gateway now generates an advisory `reservation_id` (UUIDv4) correlation token bound into the 22-field TBP permit. Authoritative funds availability verification, two-phase transfer creation, and 120s TTL lock are strictly delegated to Bank Gate and the Ledger Adapter.

### Defect 2: Permit TTL Inconsistency (120s vs 90s)
- **Finding:** The initial draft used 120s permit TTL inherited from the reservation TTL.
- **Correction:** Aligned with `CONTRACTS.md` Section 6 and `BANKING-ARCHITECTURE.md`. Permit TTL is strictly **90 seconds** (`expires_at = issued_at + 90_000`), independent of the ledger's 120s pending transfer hold window.

### Defect 3: PIN Demo Mode Isolation
- **Finding:** `customer.ts` allowed PIN `2468` authentication without verifying whether `DEMO_MODE=1` or development environment was active.
- **Correction:** Added explicit guard in `/api/customer/login`:
  ```typescript
  const isDemoMode = process.env.DEMO_MODE === '1' || process.env.NODE_ENV !== 'production';
  if (!isDemoMode) {
    res.status(403).json({
      error: 'PIN-based login is only permitted in DEMO_MODE=1. Production requires enterprise IdP / WebAuthn.',
      reason_code: 'DEMO_AUTH_DISABLED_IN_PRODUCTION'
    });
    return;
  }
  ```

### Defect 4: Multi-Level Cascading Delegation Revocation
- **Finding:** `validateDelegationChain()` only verified immediate parent standing without traversing recursive delegation ancestry.
- **Correction:** Enhanced `validateDelegationChain()` to recursively traverse the ancestor delegation tree with cycle detection (`visitedRefs`). If any ancestor agent or delegation in the chain is `SUSPENDED` or `REVOKED`, authorization fails with `ANCESTOR_PARENT_AGENT_SUSPENDED` or `ANCESTOR_PARENT_AGENT_REVOKED`.

---

## 2. Updated Security Invariants

- **Invariant I1 (TBP Cryptographic Binding):** Gateway Ed25519 signs exactly 22 fields. Bank Gate verifies this signature using the Gateway's public key only.
- **Invariant I6 (Mandate Version Invalidation):** Any update to customer mandates bumps `mandate_version`. Older permits evaluated with stale versions are rejected at Bank Gate authorization time.
- **Invariant I9 (Single Financial Authority):** TigerBeetle Ledger via Ledger Adapter is the sole source of truth for accounts and balances.
