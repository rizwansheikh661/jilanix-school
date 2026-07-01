# SchoolOS backend developer entrypoints. Run from backend/.
#
# Targets are intentionally thin wrappers around npm scripts so editor/CI
# behavior matches local behavior exactly.

SHELL := /bin/bash
.DEFAULT_GOAL := help

NPM ?= npm

.PHONY: help install dev start build clean lint lint-fix format format-check typecheck \
        test test-unit test-e2e test-watch validate-env check-env-example \
        up down logs shell \
        db-up db-down db-reset db-shell prisma-format prisma-validate prisma-generate \
        prisma-migrate prisma-deploy prisma-status prisma-reset prisma-studio prisma-seed

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"; printf "Available targets:\n"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install dependencies
	$(NPM) ci --no-audit --no-fund

dev: ## Run API in watch mode
	$(NPM) run start:dev

start: ## Run API (production-style, requires build)
	$(NPM) run start:prod

build: ## Compile to dist/
	$(NPM) run build

clean: ## Remove dist/ and coverage/
	rm -rf dist coverage

lint: ## Run ESLint
	$(NPM) run lint

lint-fix: ## Run ESLint with --fix
	$(NPM) run lint:fix

format: ## Run Prettier --write
	$(NPM) run format

format-check: ## Run Prettier --check (CI mode)
	$(NPM) run format:check

typecheck: ## Run tsc --noEmit
	$(NPM) run typecheck

test: test-unit test-e2e ## Run unit + e2e suites

test-unit: ## Unit tests
	$(NPM) run test:unit

test-e2e: ## End-to-end smoke tests
	$(NPM) run test:e2e

test-watch: ## Unit tests in watch mode
	$(NPM) run test:watch

validate-env: ## Validate current env against the Zod schema
	$(NPM) run validate:env

check-env-example: ## Verify .env.example documents every schema key
	$(NPM) run check:env-example

up: ## Build + start the API container (Sprint 1: API only)
	docker compose -f docker/docker-compose.yml up --build -d

down: ## Stop the API container
	docker compose -f docker/docker-compose.yml down

logs: ## Tail API container logs
	docker compose -f docker/docker-compose.yml logs -f api

shell: ## Open a shell inside the running API container
	docker compose -f docker/docker-compose.yml exec api sh

# ---------------------------------------------------------------------------
# Database (MySQL 8 via compose) + Prisma
# ---------------------------------------------------------------------------

db-up: ## Start MySQL only
	$(NPM) run db:up

db-down: ## Stop MySQL (and the rest of the stack)
	$(NPM) run db:down

db-reset: ## DELETE local mysql volume, re-run migrations + seed (DEV ONLY)
	$(NPM) run db:reset

db-shell: ## Open a mysql shell as the app user
	docker compose -f docker/docker-compose.yml exec mysql mysql -uapp -papp schoolos

prisma-format: ## prisma format
	$(NPM) run prisma:format

prisma-validate: ## prisma validate
	$(NPM) run prisma:validate

prisma-generate: ## prisma generate (regenerate client)
	$(NPM) run prisma:generate

prisma-migrate: ## prisma migrate dev (interactive, dev only)
	$(NPM) run prisma:migrate:dev

prisma-deploy: ## prisma migrate deploy (CI / staging / prod)
	$(NPM) run prisma:migrate:deploy

prisma-status: ## prisma migrate status
	$(NPM) run prisma:migrate:status

prisma-reset: ## prisma migrate reset (DEV ONLY — wipes data)
	$(NPM) run prisma:migrate:reset

prisma-studio: ## Launch Prisma Studio at http://localhost:5555
	$(NPM) run prisma:studio

prisma-seed: ## Seed the database (SEED_TARGET=prod-core|staging|dev)
	$(NPM) run prisma:seed
