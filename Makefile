# Kinora Master Makefile (v0.6.0)
#
# Provides simple, memorable developer commands for onboarding, local execution,
# automated testing, Docker services, native packaging, and security audits.

.DEFAULT_GOAL := help
SHELL := /bin/bash

# ==============================================================================
# Help & Documentation Target
# ==============================================================================
.PHONY: help
help:
	@echo "Kinora v0.6.0 Development & DevOps Commands"
	@echo "============================================"
	@echo "Onboarding & Environment:"
	@echo "  make setup            Validate prerequisites and setup environment"
	@echo "  make clean            Clean dist, build caches, and test artifacts"
	@echo ""
	@echo "Local Application Execution:"
	@echo "  make dev              Launch full native desktop application (Tauri dev)"
	@echo "  make dev-web          Launch React web UI in browser (http://localhost:5199)"
	@echo "  make dev-staging      Launch desktop app with staging configuration"
	@echo ""
	@echo "Docker Supporting Services:"
	@echo "  make docker-up        Start all supporting Docker services in background"
	@echo "  make docker-down      Stop all running Docker services"
	@echo "  make docker-fixtures  Start local mock IPTV/EPG streaming fixture server"
	@echo "  make docker-logs      Follow logs from running Docker services"
	@echo ""
	@echo "Testing & Quality Gates:"
	@echo "  make test             Run frontend Vitest test suite"
	@echo "  make test-rust        Run native Rust unit and integration tests"
	@echo "  make typecheck        Run TypeScript static compilation check"
	@echo "  make gate             Execute complete 5-gate application quality gate"
	@echo "  make audit            Execute dependency security and vulnerability audits"
	@echo ""
	@echo "Packaging & Distribution:"
	@echo "  make build            Build production desktop packages (Linux RPM, DEB, AppImage)"
	@echo "  make build-staging    Build isolated staging desktop packages"
	@echo "  make build-unsigned   Build unsigned desktop packages"

# ==============================================================================
# Onboarding & Setup
# ==============================================================================
.PHONY: setup
setup:
	@bash scripts/onboarding.sh

.PHONY: clean
clean:
	@echo "Cleaning build artifacts and temporary files..."
	@rm -rf dist src-tauri/target/release/bundle/build /tmp/kinora-staging-test
	@echo "Clean completed."

# ==============================================================================
# Development
# ==============================================================================
.PHONY: dev
dev:
	npm run tauri:dev

.PHONY: dev-web
dev-web:
	npm run dev

.PHONY: dev-staging
dev-staging:
	npm run tauri:dev:staging

# ==============================================================================
# Docker Services
# ==============================================================================
.PHONY: docker-up
docker-up:
	docker compose up -d fixtures web

.PHONY: docker-down
docker-down:
	docker compose down

.PHONY: docker-fixtures
docker-fixtures:
	docker compose up -d fixtures
	@echo "Fixtures server running at http://localhost:18765"
	@echo "Healthcheck: http://localhost:18765/health"

.PHONY: docker-logs
docker-logs:
	docker compose logs -f

# ==============================================================================
# Testing & Verification
# ==============================================================================
.PHONY: typecheck
typecheck:
	npm run typecheck

.PHONY: test
test:
	npm test

.PHONY: test-rust
test-rust:
	npm run test:rust

.PHONY: gate
gate:
	bash scripts/quality-gate.sh

.PHONY: audit
audit:
	@echo "Running NPM dependency audit..."
	npm audit
	@echo "Running Cargo dependency vulnerability audit..."
	cargo audit --file src-tauri/Cargo.lock --ignore RUSTSEC-2024-0429 --ignore RUSTSEC-2024-0370 --ignore RUSTSEC-2026-0486
	@echo "Running Cargo licensing and dependency policy checks..."
	cargo deny --manifest-path src-tauri/Cargo.toml check advisories licenses bans sources
	@echo "Checking third-party notices..."
	python3 scripts/third-party-notices.py --check
	@echo "All security audits passed."

# ==============================================================================
# Desktop Packaging
# ==============================================================================
.PHONY: build
build:
	npm run tauri:build

.PHONY: build-staging
build-staging:
	npm run tauri:build:staging

.PHONY: build-unsigned
build-unsigned:
	npm run tauri:build -- --no-sign
