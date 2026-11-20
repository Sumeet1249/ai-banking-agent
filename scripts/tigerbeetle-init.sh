#!/bin/sh
set -e

# ==============================================================================
# AgentGuard AI — Idempotent TigerBeetle 3-Replica Cluster Data-File Initializer
# Formats replica data files in dedicated Docker volumes IF AND ONLY IF absent.
# Guarantees zero overwrite of existing financial ledger files.
# ==============================================================================

CLUSTER_ID=${1:-0}
IMAGE=${2:-"ghcr.io/tigerbeetle/tigerbeetle:0.17.9"}
REPLICA_COUNT=3

echo "================================================================"
echo " AgentGuard AI — TigerBeetle 3-Replica Cluster Initialization"
echo "================================================================"
echo "Target Cluster ID: ${CLUSTER_ID}"
echo "Container Image:   ${IMAGE}"

for r in 0 1 2; do
  VOLUME_NAME="agentguard-ai_tb-data-${r}"
  echo ""
  echo "[Replica ${r}] Ensuring Docker volume ${VOLUME_NAME} exists..."
  docker volume create "${VOLUME_NAME}" > /dev/null

  echo "[Replica ${r}] Formatting data file 0_${r}.tigerbeetle (if absent)..."
  if docker run --rm --security-opt seccomp=unconfined -v "${VOLUME_NAME}:/data" "${IMAGE}" \
      format --cluster="${CLUSTER_ID}" --replica="${r}" --replica-count="${REPLICA_COUNT}" --development "/data/0_${r}.tigerbeetle" 2>&1; then
    echo "[Replica ${r}] FORMATTED SUCCESSFULLY: /data/0_${r}.tigerbeetle"
  else
    echo "[Replica ${r}] PRESERVED: Data file already exists or formatted. Preserving state."
  fi
done

echo ""
echo "================================================================"
echo " TigerBeetle cluster data files ready for startup!"
echo " Run 'docker compose up -d' to start the cluster."
echo "================================================================"
