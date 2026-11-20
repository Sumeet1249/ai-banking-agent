# OWASP Top 10 for Agentic Applications (2026) — AgentShield / AgentGuard Mapping

This document provides a comprehensive mapping between the **OWASP Top 10 for Agentic AI Applications (2026)** and the zero-trust security controls implemented in **AgentShield / AgentGuard AI**.

---

## Executive Summary

Autonomous AI agents executing high-privilege financial operations (such as utility bill payments, supplier remittances, and treasury rebalancing) face novel attack surfaces that traditional API gateways and firewalls cannot prevent. 

AgentShield acts as a **Zero-Trust Financial Kernel** positioned directly between AI agents and core banking systems. Every action is strictly gated by customer-delegated mandates, cryptographic Ed25519 permits, and real-time behavioral anomaly detection.

---

## Detailed Risk Matrix

| OWASP ID | Vulnerability Category | Threat Vector in Banking | AgentShield Mitigation Architecture | Enforcement Point |
| :--- | :--- | :--- | :--- | :--- |
| **ASI-01** | **Prompt Injection & Goal Hijacking** | Hidden prompt inside utility PDF directs agent to divert funds to an offshore crypto account. | **Semantic Intent-Drift Detector & Mandate Payee Whitelisting.** Compares stated user intent with actual tool parameters. Rejects non-whitelisted payees deterministically in `<4ms`. | Gateway & Bank Gate |
| **ASI-02** | **Overreliance & Limit Overreach** | Agent hallucinates or executes an excessive transfer amount beyond customer expectations. | **Scoped Mandates with Strict Financial Limits.** Every mandate enforces integer-paise caps: `per_tx_limit_paise` (e.g. ₹5,000) and `daily_limit_paise` (e.g. ₹15,000). | Gateway & Bank Gate |
| **ASI-03** | **Insecure Direct API Execution & Token Replay** | Adversary captures bearer token or permit envelope in transit and replays it to double-spend. | **Cryptographic Anti-Replay Engine.** Single-use UUIDv4 atomic nonces verified against an in-memory/distributed state machine; Ed25519 signature binding. | Bank Gate (:4000) |
| **ASI-04** | **Uncontrolled Agent Autonomy & Stale Revocation** | Customer revokes agent mandate, but cached OAuth tokens allow the agent to transact for hours. | **Sub-Second Global Revocation.** In-memory reactive cache invalidation propagates mandate revocation in `<1s` (`0.8ms` in test benchmarks). | Gateway & Bank Gate |
| **ASI-05** | **Privilege Escalation & Ledger Tampering** | Rogue insider with root database access edits historical transactions to conceal theft. | **Witness Notary SHA-256 Merkle Chaining.** Every transaction block is linked by cryptographic hash chaining with independent witness signatures. Tampering breaks the chain immediately. | Witness (:4002) |
| **ASI-06** | **Structuring & Smurfing Evasion** | Compromised agent evades single-tx limit by executing 10 micro-transfers of ₹4,900 each. | **Multi-Transaction Structuring Detector.** Analyzes sliding-window ratios (85%–99.9% of limit) and enforces daily cumulative caps. | Gateway MCP Anomaly Engine |
| **ASI-07** | **Insecure Output Handling / Cross-Tool Injection** | Poisoned tool return value triggers downstream unverified execution in another bank tool. | **Transaction-Bound Permit Envelopes (TBP).** Downstream execution requires a cryptographically signed permit binding all 7 canonical financial fields. | Bank Gate & Ledger |
| **ASI-08** | **Cascading Failures & Runaway Agent Loops** | Agent enters infinite retry loop or velocity burst (e.g. 40 calls/minute), draining balances. | **Automatic Quarantine Circuit Breaker & Emergency Kill-Switch.** After 3 consecutive security violations, agent keys are revoked and status set to `QUARANTINED`. | Gateway Anomaly FSM |
| **ASI-09** | **Misconfigured Identity & Impersonation** | Rogue worker impersonates a legitimate billing agent without cryptographic proof of identity. | **Hardware/Software Ed25519 Agent Identity.** Agent requests must be signed with private keys; Gateway verifies public keys against active registry. | Banking Agent Identity Service |
| **ASI-10** | **Insufficient Governance & Auditability** | Financial regulators cannot reconstruct why an agent was permitted to move institutional funds. | **WORM Audit Trails & Exportable Evidence Packs.** Complete RFC 3161 timestamps, Merkle inclusion proofs, and KMS key rotation history packaged into verifiable evidence archives. | Witness Service |

---

## Architectural Invariants Enforced

1. **Deterministic Financial Math:** All currency calculations are executed strictly in integer paise (`INR`) to eliminate floating-point rounding errors.
2. **Separation of Concerns:** Gateway evaluates policy and mints permits; Bank Gate performs authoritative reservations; Ledger Adapter records two-phase settlement; Witness notarizes audit blocks.
3. **Fail-Closed Default:** Any cryptographic verification failure, clock-skew anomaly (`>90s`), or database error immediately halts execution and enters `DENY` mode.
