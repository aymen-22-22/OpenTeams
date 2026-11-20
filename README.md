# OpenTeams

Self-hosted team chat and work platform: chat, files, kanban tasks, calendar, reminders and personal AI. The full specification is in [CLAUDE.md](CLAUDE.md).

**Status:** Phase 1 (skeleton) is done: health endpoint, and an app shell with placeholder data in French, English and Arabic.

## Run everything with Docker

```bash
cp .env.example .env      # then change the passwords
docker compose --profile dev up --build
```

| URL | What |
|---|---|
| https://localhost | App (Caddy, local certificate) |
| https://localhost/api/v1/health | Health check |
| https://localhost/api/docs | API docs (OpenAPI) |
| http://localhost:8025 | Mailpit (development emails) |
| http://localhost:9001 | MinIO console |

Migrations run automatically when the API starts. In production, drop `--profile dev` (no Mailpit) and set `SITE_ADDRESS` to your domain.

## Local development (fast reload)

Requirements: Python 3.12+, Node 22, Docker.

```bash
make install                 # backend venv + frontend packages
docker compose up -d postgres
make migrate
make dev-api                 # http://localhost:8000
make dev-web                 # http://localhost:5173 (proxies /api to the API)
```

## Tests and checks

```bash
make test    # pytest + vitest
make lint    # ruff, mypy, eslint, tsc
```

CI (GitHub Actions) runs the same checks, plus `pip-audit` and `npm audit`.

## Layout

- `backend/app/core`: settings, database, logging, error format
- `backend/app/<module>`: one folder per feature (auth, chat, files, tasks, …)
- `backend/migrations`: Alembic migrations
- `frontend/src/features/shell`: the three-column app shell
- `frontend/src/i18n`: translations (fr, en, ar) and automatic RTL
