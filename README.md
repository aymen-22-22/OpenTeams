# OpenTeams

Self-hosted team chat and work platform: chat, files, kanban tasks, calendar, reminders and personal AI. The full specification is in [CLAUDE.md](CLAUDE.md).

**Status:** Phase 3 done: login, roles, presence, and real-time direct chat (replies, edit/delete, read state, typing, pins, search). Files per conversation (Nextcloud or local storage, versions). Kanban tasks with their own task chats. Personal AI per user (own API key). Reminders, notification center and HTML emails. Playbooks (automatic reports). Calendar with iCal feed. Leave and other requests, projects, manager dashboard. Hardened for production: backups, monitoring, end-to-end tests.

**Deploying on a server? Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).**

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

- `make test`: backend (pytest, real PostgreSQL) and frontend (Vitest).
- `make lint`: ruff, mypy, eslint, tsc.
- `make e2e`: Playwright smoke tests (login, send a message, upload a file, move a task, open a task chat), an accessibility scan (axe, WCAG 2.1 AA, French and Arabic) and a check that the app works under the production Content-Security-Policy. See the end of docs/DEPLOYMENT.md for the setup.

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

## Notifications, reminders and email

- **Notification center** (bell): new messages, files, task assignments, reminders, overdue tasks. Each user chooses per type: in the app and/or by email (*Notification preferences*).
- **Reminders**: one-time or recurring (daily, weekly, monthly), optionally attached to a message or task; shown in the side panel.
- **Emails** are never sent during a request: they go to the `email_outbox` table, and a scheduled job sends them with retries (exponential backoff, 5 attempts). Each email is responsive HTML with a plain-text version, a button that opens the right page (`APP_URL`), and a link to the preferences. Arabic emails are right-to-left.
- **Scheduled jobs** (APScheduler, inside the API): due reminders (30 s), outbox (20 s), overdue-task nudge (daily 08:30), deletion of real-time events older than 7 days (daily). Run a single API instance, or set `SCHEDULER_ENABLED=false` on extra ones.
- **Development**: emails arrive in Mailpit at http://localhost:8025. In production set the `SMTP_*` variables.

## Playbooks (automatic reports)

Open **Playbooks** in the left panel. A playbook builds a report on a schedule (every day, week or month at a given hour, in `TIMEZONE`) and delivers it as an in-app report and/or email.

| Kind | Content |
|---|---|
| Task summary | finished in the period, in progress, pending, overdue |
| Weekly / monthly report | the same, plus totals per person |
| Monday summary | each recipient gets their own open tasks; managers get the team view |

- **Permissions**: data is read with the owner's permissions (same rule as the task board). Only managers and admins can send reports to other people; employees can only send them to themselves. Playbooks never change data.
- **Approval**: with "I approve before sending", each run waits; the owner gets an *Approval* notification, reads every report and approves or rejects it.
- **AI (optional)**: "Written by my AI" uses the owner's personal AI (their key, budget and audit log) to rewrite the report from the data, which is marked as untrusted. Without a configured AI, the plain report is sent.
- **Run history**: every run keeps its period, counts, reports, recipients, tokens, cost, duration and attempts. Failed runs are retried after 5 and 10 minutes; after 3 attempts the owner is notified.
- **Preview** builds the reports without sending; **Run now** runs immediately.

## Calendar

Open **Calendar** in the left panel: month, week and day views, for me, for everything I can see, for one person, or for one team.

- **Automatic events** come from tasks: a due date shows as an all-day "task due" event, a finished task as a "task finished" event. They are computed when the calendar is read, so they always match the tasks (and follow the same visibility rule as the board).
- **Meetings** are created from the calendar or from a chat (*Schedule a meeting* invites the conversation's members). They are private to the organizer and attendees; attendees get a notification. Only the organizer can edit or delete a meeting. You can set a reminder on a meeting.
- **iCal feed**: *Subscribe (iCal)* creates a private link to add in Outlook, Google Calendar or a phone. The link is the only credential (stored hashed in the database); creating a new one disables the old one. It covers 60 days back and one year ahead.
- Approved leave shows as a day off (visible to the whole team, without the request's details). Project milestones and finished projects show for the project's members.

## Requests and approvals

Open **Requests**: leave (dates and type), equipment, expense (amount) or other. The requester chooses an approver among managers and admins; the approver gets a notification and decides in **To approve** with an optional comment; the requester is notified (in the app and by email). A pending request can be cancelled. Every step is kept in the history. Approved leave creates a day-off event in the calendar.

## Projects and manager dashboard

- **Projects**: name, description, status (active, on hold, finished), dates, members and milestones. Tasks can belong to a project (choose it when creating a task). The project page shows its milestones, tasks by status and the files of the task chats you belong to. Projects are visible to their members and to managers/admins; the owner, managers and admins can change them. Weekly and monthly reports include a per-project section; global search also finds tasks and projects.
- **Dashboard** (managers and admins): for this week or month, and optionally one team: open and overdue tasks per person, finished versus planned (tasks due in the period), and the list of delays.

## Real-time events

One WebSocket at `/ws`. Stored events have an `id`; reconnect with `/ws?last_event_id=<id>` to get what you missed.

| Event | When |
|---|---|
| `message.created`, `message.updated`, `message.deleted` | chat messages |
| `conversation.read` | a member read up to a message |
| `pin.added`, `pin.removed` | pins |
| `file.created` | a file was uploaded |
| `task.created`, `task.updated`, `task.moved` | tasks (sent to the task chat members) |
| `notification.created` | a new notification for this user (not stored as an event) |
| `presence.changed` | online / away / offline (not stored) |
| `typing` | someone is typing (not stored; client sends `{"type":"typing","conversation_id":...}`) |

## Layout

- `backend/app/core`: settings, database, logging, error format
- `backend/app/<module>`: one folder per feature (auth, chat, files, tasks, …)
- `backend/migrations`: Alembic migrations
- `frontend/src/features/shell`: the three-column app shell
- `frontend/src/i18n`: translations (fr, en, ar) and automatic RTL
