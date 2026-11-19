# Syntax=docker/dockerfile:1.4
# Kinora Multi-Stage Dockerfile (v0.6.0)
#
# Targets:
#   1. web-dev: Isolated React 19 + Vite frontend development environment (port 5199)
#   2. frontend-builder: Compiles production web bundle
#   3. builder: Full Linux desktop build and CI test environment (Ubuntu 24.04 + Rust + WebKitGTK)

# ==============================================================================
# Stage 1: Frontend Base
# ==============================================================================
FROM node:22-bookworm-slim AS frontend-base

# Install curl for container healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Establish non-root app directory
WORKDIR /app
RUN chown -R node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./

# ==============================================================================
# Target: web-dev (for developers running React frontend inside container)
# ==============================================================================
FROM frontend-base AS web-dev

ENV NODE_ENV=development \
    VITE_DEV_HOST=0.0.0.0

RUN npm ci

COPY --chown=node:node . .

EXPOSE 5199

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5199/ || exit 1

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5199"]

# ==============================================================================
# Stage 2: Frontend Production Compiler
# ==============================================================================
FROM frontend-base AS frontend-builder

ENV NODE_ENV=production

RUN npm ci

COPY --chown=node:node . .

RUN npm run build

# ==============================================================================
# Target: builder (Full Linux CI runner and native packaging environment)
# ==============================================================================
FROM ubuntu:24.04 AS builder

LABEL maintainer="millsydotdev" \
      description="Kinora Linux desktop build and CI quality gate environment" \
      version="0.6.0"

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH \
    NODE_VERSION=22.x

# Install Linux native dependencies for Tauri 2 & WebKitGTK 4.1
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    build-essential \
    pkg-config \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    patchelf \
    rpm \
    file \
    git \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Rust stable toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile default \
    && rustup component add clippy rustfmt

# Install Node.js 22 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root developer user (UID 1000)
RUN useradd -m -s /bin/bash -u 1000 developer \
    && mkdir -p /home/developer/.cargo /home/developer/.npm /app \
    && chown -R developer:developer /home/developer /app /usr/local/cargo /usr/local/rustup

WORKDIR /app
USER developer

# Copy dependencies definitions
COPY --chown=developer:developer package.json package-lock.json ./
COPY --chown=developer:developer src-tauri/Cargo.toml src-tauri/Cargo.lock ./src-tauri/

# Install frontend dependencies
RUN npm ci

# Copy full source tree
COPY --chown=developer:developer . .

# Default command runs the master quality gate
CMD ["bash", "scripts/quality-gate.sh"]
