.PHONY: up down dev dev-api dev-web install test lint migrate

up:            ## Start everything (with Mailpit)
	docker compose --profile dev up --build

down:
	docker compose --profile dev down

install:       ## Install backend and frontend dependencies locally
	cd backend && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
	cd frontend && npm ci

dev-api:       ## Run the API with auto-reload (needs postgres: docker compose up postgres)
	cd backend && .venv/bin/uvicorn app.main:app --reload

dev-web:       ## Run the Vite dev server on http://localhost:5173
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest -q
	cd frontend && npm test

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy app tests
	cd frontend && npm run lint && npm run typecheck

migrate:
	cd backend && .venv/bin/alembic upgrade head
