# Enterprise Deployment & Production Observability Runbook
**System:** AgentGuard AI Banking Security Platform  
**Target Environments:** Kubernetes (EKS / GKE / On-Prem OpenShift), Bare-Metal Bank Private Clouds, Air-Gapped Clusters  
**Compliance Standard:** PCI DSS v4.0 Req 10 & RBI Cyber Resilience Directions Para 4.1

---

## 1. Production Architecture Overview

AgentGuard AI enforces a zero-trust, multi-tiered network boundary:

```
[ External / AI Agent DMZ ]
            │
            ▼
┌─────────────────────────┐
│ Gateway MCP Proxy       │  (Port 8080) - Node.js / Express
│  - Mandate Evaluation   │
│  - Anomaly Detector     │
│  - KMS / HSM Client     │  <--- Hardware Security Module (Thales / CloudHSM)
└───────────┬─────────────┘
            │ Signed Permits (Permit v1)
            ▼
[ Internal Core Banking Subnet ]
┌─────────────────────────┐
│ Bank Gate Execution     │  (Port 4000) - Standalone Verifier
│  - TrustedKeyring       │
│  - Nonce Registry       │
│  - State Machine        │
└───────────┬─────────────┘
            │
      ┌─────┴──────────────────────┐
      ▼                            ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│ Ledger Adapter          │  │ Independent Witness     │ (Port 5000)
│  - TigerBeetle Driver   │  │  - Merkle Notary Log    │ - Ed25519 Detached Keys
│  - Fail-Closed Gate     │  │  - Audit Evidences      │ - Isolated SQLite / PG
└───────────┬─────────────┘  └─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│ TigerBeetle Cluster     │  (Ports 3001-3003) - 3-Node Consensus
│  - Double-Entry Engine  │
│  - Integer Paise Store  │
└─────────────────────────┘
```

---

## 2. Infrastructure Prerequisites & Production Hardening

### 1. Hardware Security Module (HSM) Configuration
- For institutional production deployments (`NODE_ENV=production`), configure PKCS#11 environment variables:
  ```env
  KMS_PROVIDER=pkcs11
  PKCS11_LIB_PATH=/usr/lib/softhsm/libsofthsm2.so   # Or /opt/nfast/toolkits/pkcs11/libcknfast.so
  PKCS11_SLOT_INDEX=0
  PKCS11_PIN_SECRET_ARN=arn:aws:secretsmanager:...
  ```
- Any attempt to run `MockHsmProvider` in `production` will intentionally throw a fatal startup exception and fail closed.

### 2. Time Synchronization (Stratum-1 NTP)
- AgentGuard enforces a **5,000ms maximum forward clock skew** on permit issuance.
- Host servers must sync via Chrony or PTP (Precision Time Protocol) against internal Stratum-1 time servers:
  ```bash
  chronyc sources -v
  chronyc tracking
  ```

### 3. PostgreSQL Multi-Tenancy & Row-Level Security (RLS)
- For PostgreSQL ledger and gateway deployments, ensure the application connects with a tenant-restricted role:
  ```sql
  ALTER TABLE mandates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
  ```
- Every pooled database connection must execute:
  ```sql
  SET LOCAL app.current_tenant_id = 'tenant_xyz';
  ```

---

## 3. Production Health Probes & Monitoring

All services implement standard Kubernetes liveness and readiness endpoints:

| Service | Port | Health Endpoint | Healthy HTTP Status | Key Checks |
|---|---|---|---|---|
| **Gateway** | `8080` | `GET /health` | 200 | KMS provider status, active key ID, DB pool |
| **Bank Gate** | `4000` | `GET /health` | 200 | Trusted keyring size, Ledger Adapter reachability |
| **Ledger Adapter** | `4001` | `GET /health` | 200 | TigerBeetle replica consensus, backend mode |
| **Witness** | `5000` | `GET /health` | 200 | Checkpoint tree size, active Witness key ID |

### Kubernetes Deployment Spec Sample (bank-gate)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentguard-bank-gate
  namespace: agentguard-prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: bank-gate
  template:
    metadata:
      labels:
        app: bank-gate
    spec:
      containers:
        - name: bank-gate
          image: internal-registry.bank/agentguard/bank-gate:1.0.0
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "4000"
            - name: LEDGER_ADAPTER_URL
              value: "http://ledger-adapter.agentguard-prod.svc:4001"
            - name: GATEWAY_JWKS_URL
              value: "http://gateway.agentguard-prod.svc:8080/api/v1/keys/jwks"
          ports:
            - containerPort: 4000
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            limits:
              cpu: "1000m"
              memory: "1Gi"
            requests:
              cpu: "250m"
              memory: "512Mi"
```

---

## 4. Operational Maintenance & Zero-Downtime Drills

### Automated Key Rotation Drill (Monthly Schedule)
1. Trigger zero-downtime rotation via cron or automated SecOps pipeline:
   ```bash
   curl -X POST https://gateway.internal.bank/api/v1/keys/rotate \
     -H "Authorization: Bearer ${CRON_AUTH_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"reason": "Monthly automated cryptoperiod rollover"}'
   ```
2. Monitor Bank Gate logs:
   - Within 60 seconds, Bank Gate fetches updated JWKS from Gateway.
   - Bank Gate retains the retired key for exactly 180 seconds to settle in-flight transactions.
   - Any permit issued prior to the rotation timestamp completes successfully.
   - Invariant verified: zero 5xx errors or dropped transactions.

---

## 5. Summary of Compliance Assurance

Deploying according to this runbook guarantees that:
- **Keys cannot be silently extracted from software memory.**
- **No single component compromise enables ledger tampering.**
- **Auditors receive mathematically indisputable evidence packs for every transaction.**
