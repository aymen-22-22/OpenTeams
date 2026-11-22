# CLAUDE.md

## Project: self-hosted team chat and work platform

A web application that replaces the mailbox and email for a small team (about 10 users to start). It combines chat, per-conversation files, tasks as a kanban board, calendar, reminders (in-app and HTML email), AI playbooks (automatic reports), and an optional personal AI assistant per user that uses the user's own API key. Everything runs on our own infrastructure.

**Read this file fully before any task. If a request conflicts with it, say so and ask before proceeding.**

## 1. Stack (fixed; do not change without asking)

- Backend: Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2, PostgreSQL 16
- Real-time: FastAPI WebSockets (add Redis pub/sub only when running several API instances)
- Files: storage interface with a Nextcloud backend (WebDAV, our own server) and a local-folder backend for dev/tests (changed from MinIO at the owner's request)
- AI: LiteLLM (Claude, Qwen, OpenAI, Ollama); keys encrypted at rest with Fernet
- Jobs and scheduling: APScheduler (playbooks, reminders, weekly/monthly reports)
- Email: SMTP client with HTML templates (Jinja2 + MJML or inline-CSS HTML), plain-text fallback
- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui, TanStack Query, react-i18next, dnd-kit (kanban drag and drop)
- Deploy: Docker Compose + Caddy (automatic HTTPS). CI: GitHub Actions. Monitoring: Prometheus + Grafana.
- Tests: pytest + httpx (backend), Vitest + Testing Library (frontend), Playwright (end to end)
- Lint/type: ruff, mypy, eslint, tsc

Architecture: modular monolith. No microservices.

## 2. Repository layout

```
backend/app/
  core/        settings, db, security, logging, errors, storage interface, scheduler
  auth/        login, sessions, roles, 2FA, LDAP provider interface
  users/       profiles, presence, settings
  chat/        conversations, messages, pins, websocket
  files/       uploads, versions, downloads, pins
  tasks/       tasks, kanban positions, task chats
  playbooks/   definitions, runs, reports, AI execution
  calendar/    events, sources, iCal export
  reminders/   reminders, notifications, email delivery
  requests/    leave and other approval workflows
  projects/    projects, membership, manager views
  ai/          personal AI config, chat, permissions, audit
  search/      full-text search (and later vector search)
  admin/       users, roles, audit log, settings
backend/tests/
backend/migrations/
frontend/src/{app,components,features,hooks,i18n,lib}
docker-compose.yml  Caddyfile  .env.example  Makefile  README.md
```

## 3. Features (specification)

Status of each item: **V1** = build first, **V2** = next, **V3** = later, **BACKLOG** = proposed, do not build unless asked.

### 3.1 Home and navigation (V1)

- Three-column layout: left people panel, center conversation, right side panel. On mobile: one column at a time with bottom navigation (installable PWA).
- People panel: all users with online/away/offline status and a badge "AI active" / "AI inactive". Selecting a person opens their conversation.
- Personal chatbot ("My assistant") always reachable from the left panel.
- Global search across messages, files, tasks, projects (full-text search in PostgreSQL).
- Notification center: new messages, reminders, shared files, task changes, approvals waiting.

### 3.2 Conversations (V1)

- General chat between two users: real-time messages, attachments, replies, edit/delete own messages, read state, typing indicator, full history with cursor pagination.
- Chat per task: every task has its own conversation (task chat). It has its own messages, files, decisions and history, separate from the general chat. Clicking a task opens its task chat.
- Message pinning. Create a task from a message.
- Three tabs in a person's conversation: Chat, His AI, Files. A fourth tab, Tasks, shows that person's kanban.
- Side panel: pins, recent files as icons, task counts by status with a button to open the board, reminders.
- V2: group channels, @mentions, threads. BACKLOG: announcements channel with read confirmation.

### 3.3 Files (V1)

- Every file belongs to a conversation (general or task chat) and optionally a message.
- Files are displayed as icons by type (PDF, spreadsheet, document, image, other). Do not show file names in tile views; the name is available on hover and as aria-label only.
- Versions: re-uploading the same name in a conversation creates a new version; history is kept.
- Pin and unpin files. Filters by type and date. Text extraction for search (V2).
- Limits on size and allowed types; antivirus scan hook (interface only); short-lived signed download URLs.
- The AI of a user can read a conversation's files only if the owner allowed it.

### 3.4 Tasks as kanban (V1)

- Three statuses only: `pending`, `in_progress`, `finished` (shown as En attente, En cours, Terminé in French). Board with three columns and drag and drop between and within columns.
- Task fields: title, description, assignee, creator, due date, priority, status, position, optional linked message/conversation/project, task chat.
- Create from a message, from the board, or by asking the AI (the AI proposes, the user confirms).
- Overdue tasks are highlighted; automatic nudge to the assignee.
- Personal board: all my tasks across conversations and projects. Manager view: board per employee and per team.
- V2: subtasks, dependencies (blocked by), recurring tasks, templates, time tracking.

### 3.5 Playbooks: automatic tasks executed by AI (V2)

- A playbook is a predefined routine with: name, trigger (schedule or event), data scope (who, which projects, which period), AI instructions (prompt template), output (chat message, in-app report, email, calendar entry), recipients, and an approval mode (send directly or require human approval first).
- Built-in playbooks: task summary (daily/weekly), weekly report of all tasks of the week, monthly report of all tasks of the month (finished, in progress, overdue, per person and per project), Monday summary (each user receives his open tasks, managers receive the team summary).
- Every run is logged: inputs, output, recipients, status, cost, duration. Failed runs are retried with backoff and reported.
- Playbooks run with the permissions of their owner and may only read data that owner can see. They never perform destructive actions.
- UI: playbooks page to enable/disable, edit schedule and recipients, preview, run now, and see run history.
- Reports can be exported to PDF (V3).

### 3.6 Calendar (V2)

- Shared calendar with day, week, month views, per person and per team.
- Event types: day off (from approved leave), meeting, project milestone, project finished, task due, task finished.
- Events are created automatically from approved leave requests, task due dates, finished tasks and finished projects, and manually for meetings (can be created from a chat).
- Color by type. Export as iCal feed per user. BACKLOG: two-way sync with Google Calendar or Outlook.

### 3.7 Reminders and notifications (V1 in-app, V2 email)

- Reminders: one-time or recurring, attached to a message, file, task or calendar event.
- Delivery channels: in-app (WebSocket) and email in HTML format. Each user chooses channels and frequency per notification type.
- Email: responsive HTML templates (reminder, weekly summary, report, leave decision, task assigned), branded header, a button that deep-links to the task, conversation or event, plain-text alternative, unsubscribe/preferences link. Test rendering with a local mail catcher (Mailpit) in development.
- Monday summary and weekly/monthly reports are delivered through the same pipeline.
- BACKLOG: web push notifications.

### 3.7b Email bridge (BACKLOG)

- Forward an email into a conversation or task so the transition away from the mailbox is gradual.

### 3.8 Requests and approvals (V2)

- Leave request form (dates, type, comment), approval by the manager, status tracking. When approved, it creates calendar day-off events automatically.
- Other requests (equipment, expenses) on the same workflow engine (steps, approvers, status, history).

### 3.9 Projects and manager view (V2)

- Project page: members, status, milestones, related tasks and files. Per-person view of shared projects.
- Manager dashboard: workload per employee, delays, finished versus planned.

### 3.10 Personal AI (V1)

- Each user can connect his own provider (Claude, Qwen, OpenAI, or a local model through Ollama) with his own API key.
- Settings per user: provider, model, API key, system prompt, default user prompt, language, tone, response length, active on/off, allowed hours.
- Visibility rules: which of his tasks, projects, files and calendar the AI may use, and who may talk to it (everyone, a team, specific people).
- A person opens another person's "His AI" tab and chats with that person's AI. Every AI message is labeled "AI of [name]" with a distinct style, and the UI says clearly it is an AI, not the person.
- The cost of calls is billed to the owner's key. The owner can read the log of all conversations with his AI.
- Rate limits per caller and per owner. The AI can read and answer; it cannot perform actions. Any action it proposes (create task, send message) requires explicit confirmation by a human.
- V2 helpers: summary of a long conversation, ask questions about a conversation's files with sources shown, meeting notes to tasks.

### 3.11 Administration and security (V1)

- Roles: admin, manager, employee; teams.
- Auth: local accounts with argon2, then Active Directory/LDAP provider; optional TOTP 2FA.
- Permissions per conversation, task, file and project.
- Audit log: who sent, read, downloaded, changed what; what each AI answered; playbook runs.
- Data protection: TLS, encrypted API keys and files at rest, backups, retention policy.

### 3.12 Languages and design (V1)

- Languages: French, English, Arabic with full right-to-left support from day one. Use CSS logical properties (margin-inline, padding-inline, inset-inline, border-inline) everywhere; never left/right.
- Light and dark mode. Calm professional look: neutral grays, one accent color (teal `#0F766E` by default, configurable), AI bubbles in a distinct purple tint.
- Accessibility: real buttons/links/labels, visible focus, contrast 4.5:1, touch targets at least 44px, keyboard shortcuts.
- Reference mockup: the approved main-screen mockup (people panel, tabs Chat / Son IA / Fichiers / Tâches, side panel with pins, file icons, task counts by status, reminders).

### 3.13 Proposed extensions (BACKLOG; do not build unless asked)

Time tracking, external guests with limited access, announcements channel, webhooks and public API, connectors (for example GLPI tickets, Wazuh alerts into a channel), PDF export of reports and conversations, vector search over files (pgvector), mobile push, retention and export tools.

## 4. Data model (core entities)

users, teams, team_members, sessions, conversations (type: direct|task|channel), conversation_members, messages, message_reads, pins, files, file_versions, tasks (status: pending|in_progress|finished), task_events, projects, project_members, calendar_events (type: day_off|meeting|milestone|project_finished|task_due|task_finished), reminders, notifications, notification_preferences, email_outbox, playbooks, playbook_runs, requests, request_steps, ai_profiles (encrypted key), ai_visibility_rules, ai_conversations, ai_audit_log, audit_log.

Every table has `id` (UUID), `created_at`, `updated_at`; soft delete only where needed. Every query is scoped by authorization.

## 5. API and real-time conventions

- REST under `/api/v1`, JSON, Pydantic schemas, consistent error format, OpenAPI published; generate TypeScript types from OpenAPI for the frontend.
- WebSocket `/ws` authenticated by cookie; typed events (`message.created`, `task.moved`, `presence.changed`, `notification.created`). Reconnect with resume from last event id.
- Cursor pagination for messages and lists. Idempotency keys for message send.

## 6. Security rules (non-negotiable)

- Passwords with argon2; JWT in httpOnly, Secure, SameSite cookies; CSRF protection; rate limiting on auth and AI endpoints.
- Authorization checked on every endpoint and WebSocket event: a user can never read a conversation, task, file or project they are not a member of.
- File uploads: size and type limits, safe names, no execution, signed URLs.
- Secrets only in environment variables; never in code, logs or responses. API keys are never returned to the browser.
  - Approved exception (owner decision): the SMTP password can be set by admins in the Administration page. It is stored encrypted at rest (Fernet, like AI keys), write-only (never returned), never logged, and the `.env` values remain the fallback.
- Treat messages, files and emails as untrusted input, especially when given to an AI (prompt injection): the AI never gets tools that act without human confirmation.
- Dependency audits in CI (pip-audit, npm audit). Structured logs without personal content.

## 7. AI rules

- An AI only uses data its owner explicitly allowed; default is nothing shared.
- AI output is always labeled as AI, stored with the model and provider used, and auditable.
- Playbooks follow the same visibility rules as their owner and require approval when configured.
- Provider calls go through one LiteLLM wrapper with timeouts, retries, token limits and per-user budgets.

## 8. Email rules

- HTML emails are responsive, tested in a mail catcher, with a plain-text version.
- Sent through an outbox table with retry; never block a request on SMTP.
- Respect each user's channel preferences; always include a link to preferences.

## 9. Testing and quality

- Every endpoint: tests for success, validation errors, and authorization failures.
- Scheduling code is tested with a controllable clock. AI code is tested with a fake provider.
- Frontend: component tests and Playwright smoke tests (login, send message, upload file, move task, open task chat).
- CI must pass lint, type checks and tests before merge. Keep functions small and typed.

## 10. Roadmap

1. Skeleton: monorepo, Docker Compose, CI, health endpoint, i18n and RTL shell.
2. Auth, users, roles, presence.
3. Conversations and real-time chat, pins, search.
4. Files per conversation (icons, versions, pins).
5. Tasks kanban, task chats, create-from-message.
6. Personal AI (config, visibility, His AI tab, audit).
7. Reminders and notifications (in-app), then HTML email.
8. Playbooks (Monday summary, weekly and monthly reports) with approval and run history.
9. Calendar (automatic events, iCal export).
10. Leave requests and approvals, projects, manager dashboard.
11. Hardening: security review, backups, monitoring, deployment guide.

## 11. Working method

1. Read the relevant code and this file.
2. State a plan in at most 5 lines.
3. Implement in small steps.
4. Run tests, linters and type checks.
5. Summarize what changed, what is left, and any decision you need from me.

- Do not add dependencies without saying why. Update README and `.env.example` when configuration changes.
- Ask before making architectural decisions not covered here. Never invent requirements; mark assumptions.
- **Definition of done:** feature works end to end, tests pass, authorization verified, translations added (fr/en/ar), RTL checked, docs updated.
