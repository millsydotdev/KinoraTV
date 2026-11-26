#!/bin/bash
# Kinora Developer Onboarding Pre-Flight & Setup Script (v0.6.0)
#
# Validates system requirements, installs project dependencies,
# configures local environment, and verifies Docker availability.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================================="
echo "         KINORA DEVELOPER ONBOARDING & SETUP             "
echo "=========================================================="
echo "Target: Kinora v0.6.0 Desktop Entertainment Platform"
echo "Repository: $REPO_ROOT"
echo "Timestamp:  $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================================="
echo ""

# 1. Check Node.js
echo "[1/6] Checking Node.js runtime..."
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v)
  NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_MAJOR" -ge 22 ]; then
    echo "  PASS: Node.js $NODE_VER detected (>= 22 required)"
  else
    echo "  WARNING: Node.js $NODE_VER detected. Version 22+ is strongly recommended."
  fi
else
  echo "  ERROR: Node.js not found. Please install Node.js 22+."
  exit 1
fi

# 2. Check Rust & Cargo
echo ""
echo "[2/6] Checking Rust toolchain..."
if command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then
  RUST_VER=$(rustc --version)
  echo "  PASS: $RUST_VER detected"
else
  echo "  WARNING: Rust toolchain not detected on host."
  echo "  Note: You can still run the web frontend or use Docker for builds."
fi

# 3. Environment configuration
echo ""
echo "[3/6] Setting up environment configuration..."
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "  PASS: Created .env from .env.example template"
  else
    echo "  WARNING: .env.example not found."
  fi
else
  echo "  PASS: Existing .env file detected (preserving user configuration)"
fi

# 4. Frontend dependencies
echo ""
echo "[4/6] Installing frontend dependencies via npm ci..."
npm ci
echo "  PASS: Node modules installed cleanly"

# 5. Native Linux desktop library checks (Linux only)
echo ""
echo "[5/6] Checking native system build libraries..."
if [ "$(uname -s)" = "Linux" ]; then
  MISSING_LIBS=()
  for pkg in libwebkit2gtk-4.1 libssl patchelf; do
    if ! ldconfig -p 2>/dev/null | grep -q "$pkg"; then
      MISSING_LIBS+=("$pkg")
    fi
  done
  if [ ${#MISSING_LIBS[@]} -eq 0 ]; then
    echo "  PASS: Core native Linux development libraries detected"
  else
    echo "  INFO: Some native desktop libraries were not detected: ${MISSING_LIBS[*]}"
    echo "  For local native Tauri development on Ubuntu/Debian:"
    echo "    sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev patchelf rpm"
    echo "  Or on Fedora/RHEL:"
    echo "    sudo dnf install -y webkit2gtk4.1-devel libayatana-appindicator-gtk3-devel librsvg2-devel openssl-devel patchelf"
  fi
else
  echo "  PASS: Non-Linux host ($(uname -s)); skipping Linux library audit"
fi

# 6. Docker & Docker Compose
echo ""
echo "[6/6] Checking Docker container environment..."
if command -v docker >/dev/null 2>&1; then
  DOCKER_VER=$(docker --version)
  echo "  PASS: $DOCKER_VER detected"
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_VER=$(docker compose version)
    echo "  PASS: $COMPOSE_VER detected"
  else
    echo "  INFO: Docker Compose plugin not found."
  fi
else
  echo "  INFO: Docker not detected on host (optional for host-native development)"
fi

echo ""
echo "=========================================================="
echo "           ONBOARDING COMPLETED SUCCESSFULLY              "
echo "=========================================================="
echo ""
echo "Next Steps:"
echo "  - Run full desktop app (native):   npm run tauri:dev  (or 'make dev')"
echo "  - Run web UI in browser:           npm run dev        (or 'make dev-web')"
echo "  - Run mock fixtures in Docker:     make docker-fixtures"
echo "  - Run master quality gate:         npm run test:gate  (or 'make gate')"
echo "  - Build staging desktop package:   make build-staging"
echo ""
