# AGENTGUARD AI — KNOWN LIMITATIONS & OPERATIONAL BOUNDARIES

**Notice**: A green test suite and a polished interface do not by themselves constitute a certified banking deployment. Real-world financial production requires external security certifications, regulatory audits, and physical infrastructure.

---

## 1. Known Architectural & Operational Boundaries

1. **Single-Node SQLite Write Locks**:
   - While `better-sqlite3`'s `.immediate()` lock guarantees strict write serialization on a single machine, high-throughput distributed multi-datacenter deployments will require migrating the category budget store to an active-active distributed SQL engine (e.g., CockroachDB or Spanner) or embedding the category ledger directly into TigerBeetle.
2. **Merchant Category Code (MCC) Heuristics**:
   - The current dictionary implements standard ISO 18245:2023 codes for core consumer and procurement categories. Unregistered or proprietary merchant aggregators without clear MCC metadata will fail-closed to manual customer review.
3. **Simulated Passkey Tokens in Local Development**:
   - In local developer mode, the WebAuthn passkey assertion token is simulated via SHA-256 digest assertions. Production deployment requires registering relying party credentials with FIDO2 hardware authenticators (YubiKey / Apple Touch ID / Windows Hello).
4. **Cloud KMS vs Local Keyring**:
   - Local development uses software-backed Ed25519 keyrings. Production environments must configure AWS KMS, Google Cloud KMS, or HashiCorp Vault with PKCS#11 hardware security modules for non-exportable permit signing keys.
5. **Regulatory & Compliance Disclaimer**:
   - AgentGuard AI provides technical governance, cryptographic auditability, and invariant enforcement. It does not replace formal regulatory approvals (e.g. RBI PA/PG guidelines, PCI-DSS Level 1 certification, SOC 2 Type II audit).
