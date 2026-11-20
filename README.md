# OpenTeams

Self-hosted team chat and work platform: chat, files, kanban tasks, calendar, reminders and personal AI. The full specification is in [CLAUDE.md](CLAUDE.md).

**Status:** Phase 3 done: login, roles, presence, and real-time direct chat (replies, edit/delete, read state, typing, pins, search). Files per conversation (Nextcloud or local storage, versions). Kanban tasks with their own task chats. Personal AI per user (own API key). Reminders are still placeholders.

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

Migrations run automatically when the API starts. Create the first admin (asks for a password):

```bash
docker compose exec api python -m app.cli create-admin admin@example.com "Admin"
```

The admin creates other users through the API (`POST /api/v1/admin/users`, see `/api/docs`). An admin screen comes later. In production, drop `--profile dev` (no Mailpit) and set `SITE_ADDRESS` to your domain.

## File storage (Nextcloud)

Files can be stored directly in your Nextcloud server:

1. In Nextcloud, create a user (for example `openteams`) and, logged in as it, an app password: *Settings → Security → Devices & sessions*.
2. In `.env`: `STORAGE_BACKEND=nextcloud`, `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_APP_PASSWORD`, optionally `NEXTCLOUD_FOLDER` (default `OpenTeams`).
3. Restart the API. Files appear in that user's folder under random names; names, versions and permissions are kept by OpenTeams.

Uploads are streamed from the browser through the API to Nextcloud (no temp files). Downloads use short-lived signed links (5 minutes) and are always sent as attachments. Without Nextcloud, `STORAGE_BACKEND=local` stores files in a Docker volume.

## Local development (fast reload)

Requirements: Python 3.12+, Node 22, Docker.

```bash
make install                 # backend venv + frontend packages
docker compose up -d postgres
make migrate
cd backend && .venv/bin/python -m app.cli create-admin admin@example.com "Admin" && cd ..
make dev-api                 # http://localhost:8000
make dev-web                 # http://localhost:5173 (proxies /api to the API)
```

## Tests and checks

Backend tests need PostgreSQL with a database `openteams_test` (user/password `openteams`), or set `TEST_DATABASE_URL`. Quick way:

```bash
docker run -d --name ot-test-db -p 5432:5432 -e POSTGRES_USER=openteams -e POSTGRES_PASSWORD=openteams -e POSTGRES_DB=openteams_test postgres:16-alpine
```

```bash
make test    # pytest + vitest
make lint    # ruff, mypy, eslint, tsc
```

CI (GitHub Actions) runs the same checks, plus `pip-audit` and `npm audit`.

## Security in short

- Passwords hashed with argon2. Session = JWT in an httpOnly, Secure, SameSite cookie, linked to a `sessions` row so logout revokes it.
- CSRF: every POST/PATCH/DELETE must send the `csrf_token` cookie value in the `X-CSRF-Token` header (the frontend does it).
- Login is rate-limited (5 attempts / 5 minutes per IP and email). Logins and admin actions go to `audit_log`.
- The WebSocket `/ws` requires the session cookie and an allowed `Origin` (`ALLOWED_ORIGINS`).
- Tasks are visible to the members of their task chat (creator, assignee) and to managers/admins.
- Only members of a conversation can read it, write in it, search it, or receive its events; outsiders get 404.

## Personal AI

Each user can connect their own AI in **My assistant → Settings**: Claude, OpenAI, Qwen, or a local model with Ollama.

- The API key is encrypted in the database (Fernet, `AI_ENCRYPTION_KEY`) and never sent back to the browser.
- By default the AI shares nothing and only its owner can talk to it. The owner chooses who may talk to it (everyone, some people, some teams), whether it may read their tasks, and its hours.
- Colleagues talk to it in the **His AI** tab. Every answer is labelled "AI of <name>". The AI can only read and answer; it has no tools, so it never acts by itself.
- The owner sees every conversation in **My assistant → Log**. Every call is recorded in `ai_audit_log` (model, tokens, cost, duration).
- Limits: per caller per minute, per owner per hour, and a daily token budget per owner (`AI_*` settings).
- Ollama and Qwen server addresses are set by the admin (`OLLAMA_URL`, `QWEN_URL`), not by users.

## Real-time events

One WebSocket at `/ws`. Stored events have an `id`; reconnect with `/ws?last_event_id=<id>` to get what you missed.

| Event | When |
|---|---|
| `message.created`, `message.updated`, `message.deleted` | chat messages |
| `conversation.read` | a member read up to a message |
| `pin.added`, `pin.removed` | pins |
| `file.created` | a file was uploaded |
| `task.created`, `task.updated`, `task.moved` | tasks (sent to the task chat members) |
| `presence.changed` | online / away / offline (not stored) |
| `typing` | someone is typing (not stored; client sends `{"type":"typing","conversation_id":...}`) |

## Layout

- `backend/app/core`: settings, database, logging, error format
- `backend/app/<module>`: one folder per feature (auth, chat, files, tasks, …)
- `backend/migrations`: Alembic migrations
- `frontend/src/features/shell`: the three-column app shell
- `frontend/src/i18n`: translations (fr, en, ar) and automatic RTL
