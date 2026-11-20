#!/usr/bin/env bash
# shellcheck shell=bash
#
# AEGIS Docker Installer  ·  https://aegistraces.com
# ─────────────────────────────────────────────────────────────
# Automatically configures and launches AEGIS via Docker Compose.
#
set -eu

C_G=$'\033[0;32m'; C_R=$'\033[0;31m'; C_Y=$'\033[0;33m'; C_B=$'\033[1m'; C_N=$'\033[0m'
say()  { printf "%s\n" "$*"; }
ok()   { printf "${C_G}✓${C_N} %s\n" "$*"; }
warn() { printf "${C_Y}!${C_N} %s\n" "$*" >&2; }
err()  { printf "${C_R}✗${C_N} %s\n" "$*" >&2; exit 1; }
step() { printf "\n${C_B}▸${C_N} ${C_B}%s${C_N}\n" "$*"; }

step "Checking prerequisites"

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed or not in PATH. Please install Docker first: https://docs.docker.com/get-docker/"
fi

# Detect compose plugin or legacy docker-compose
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  err "Neither 'docker compose' nor 'docker-compose' was found."
fi

ok "Docker & Docker Compose detected"

# Resolve repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${REPO_DIR}/docker-compose.yml" ]; then
  cd "${REPO_DIR}"
else
  # Running standalone via curl | sh: clone into temporary or aegis directory
  TARGET_DIR="${HOME}/.aegis/docker"
  step "Setting up AEGIS Docker workspace in ${TARGET_DIR}"
  mkdir -p "${TARGET_DIR}"
  git clone --depth 1 "https://github.com/${REPO:-Sumeet1249/ai-trail}.git" "${TARGET_DIR}"
  cd "${TARGET_DIR}"
fi

step "Initializing TigerBeetle replicas"
if [ -f "./scripts/tigerbeetle-init.sh" ]; then
  bash ./scripts/tigerbeetle-init.sh || warn "TigerBeetle init skipped or already initialized"
fi

step "Starting AEGIS services"
$COMPOSE up -d

ok "AEGIS stack started successfully!"
say "Endpoints:"
say "  - Compliance Cockpit : http://localhost:3000"
say "  - Aegis Gateway     : http://localhost:8080"
say "  - Bank Gate         : http://localhost:4000"
say "  - Ledger Adapter    : http://localhost:4001"
say "  - Witness Notary    : http://localhost:5000"

