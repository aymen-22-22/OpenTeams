# Deployment guide

How to run OpenTeams on your own server for a small team (about 10 people).

## 1. Server

- Linux server with Docker and the Docker Compose plugin.
- 2 vCPU, 4 GB RAM and 20 GB disk are plenty for 10 users (files live in Nextcloud).
- A DNS name pointing to the server, for example `team.example.com`.
- Ports 80 and 443 open to the users (Caddy gets the HTTPS certificate automatically). Nothing else needs to be published.

## 2. Configuration

```bash
git clone <your repository> openteams && cd openteams
cp .env.example .env
```

Edit `.env`. The values that **must** change:

| Variable | What to put |
|---|---|
| `ENVIRONMENT` | `production` (turns off the API docs and refuses a weak `SECRET_KEY`) |
| `SITE_ADDRESS` | your domain, e.g. `team.example.com` |
| `APP_URL` | `https://team.example.com` (used in email links) |
| `ALLOWED_ORIGINS` | `["https://team.example.com"]` (WebSocket origin check) |
| `SECRET_KEY` | output of `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `AI_ENCRYPTION_KEY` | output of `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `POSTGRES_PASSWORD` | a long random password |
| `GRAFANA_ADMIN_PASSWORD` | a long random password (if you use monitoring) |

Keep `SECRET_KEY` and `AI_ENCRYPTION_KEY` safe and stable: changing `SECRET_KEY` signs everybody out; losing `AI_ENCRYPTION_KEY` makes the saved AI API keys unreadable (users then enter them again).

**Files in Nextcloud** (recommended): create a Nextcloud user (e.g. `openteams`), log in as it, create an app password in *Settings → Security → Devices & sessions*, then set `STORAGE_BACKEND=nextcloud`, `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_APP_PASSWORD`. Without Nextcloud, leave `STORAGE_BACKEND=local` (files go to a Docker volume, included in backups).

**Email**: easiest from the app: *Administration → E-mail* (server, port, security, user, password, sender, then *Send a test*). Alternatively set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS=true` and `MAIL_FROM` in `.env`; they are used when no server is set in the app.

**Push notifications** (optional): run `docker compose run --rm api python -m app.cli vapid-keys` once and copy the two lines into `.env` (plus `VAPID_SUBJECT=mailto:you@yourdomain`). Keep the keys stable. Push needs HTTPS (Caddy provides it). The API container must reach the push services over HTTPS: `fcm.googleapis.com` (Chrome, Edge, Android), `updates.push.services.mozilla.com` (Firefox), `web.push.apple.com` (Safari, iPhone); allow them if your firewall filters outgoing traffic.

**Email bridge** (optional): create a mailbox, e.g. `team@example.com`, check that `team+test@example.com` is delivered to it (plus-addressing), then set `BRIDGE_ADDRESS`, `BRIDGE_IMAP_HOST`, `BRIDGE_IMAP_PORT` (993, TLS), `BRIDGE_IMAP_USER` and `BRIDGE_IMAP_PASSWORD`. Send yourself a test: open a conversation, create its address in the side panel, and email it from your OpenTeams address. If nothing appears, look at the latest rows of `inbound_emails` (column `reason`): `not_authenticated` means your server does not add `dmarc=pass` (fix DMARC, or set `BRIDGE_REQUIRE_DMARC=false` for an internal-only server).

### Behind an existing Apache (ports 80/443 already used)

When Apache already serves other sites on this host (e.g. OpenProject), let Apache handle HTTPS
for a new subdomain and forward it to OpenTeams on a local port:

1. In `.env`: `SITE_ADDRESS=:80`, `HTTP_BIND=127.0.0.1:8080`, `HTTPS_BIND=127.0.0.1:8443`, and
   `APP_URL=https://teams.example.com`, `ALLOWED_ORIGINS=["https://teams.example.com"]`.
2. Point the subdomain's DNS to the server, then enable the modules once:
   `a2enmod proxy proxy_http proxy_wstunnel headers ssl rewrite`.
3. Create `/etc/apache2/sites-available/openteams.conf`:

```apache
<VirtualHost *:80>
    ServerName teams.example.com
    RewriteEngine On
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,R=permanent]
</VirtualHost>

<VirtualHost *:443>
    ServerName teams.example.com
    SSLEngine on
    # Filled in by certbot (step 4), or your own certificate files:
    # SSLCertificateFile    /etc/letsencrypt/live/teams.example.com/fullchain.pem
    # SSLCertificateKeyFile /etc/letsencrypt/live/teams.example.com/privkey.pem
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    LimitRequestBody 115343360
    ProxyTimeout 300
    # upgrade=websocket keeps the real-time connection (/ws) working.
    ProxyPass        / http://127.0.0.1:8080/ upgrade=websocket
    ProxyPassReverse / http://127.0.0.1:8080/
</VirtualHost>
```

4. `a2ensite openteams && apache2ctl configtest && systemctl reload apache2`, then the certificate:
   `certbot --apache -d teams.example.com` (or your own certificate in the two lines above).

Caddy still adds the security headers (CSP, HSTS); OpenTeams is only reachable through Apache.

### Behind a reverse proxy on another machine (SafeLine, Nginx Proxy Manager, HAProxy…)

When HTTPS is handled by a separate reverse proxy that cannot tell two applications apart on the
same upstream, give OpenTeams its own port on the server's LAN address and point the proxy there:

- `.env`: `SITE_ADDRESS=:80`, `HTTP_BIND=<server LAN IP>:8080`, `TRUSTED_PROXIES=<proxy IP>/32`.
- Reverse proxy: upstream `http://<server LAN IP>:8080`, WebSocket enabled, uploads ≥ 110 MB.
- Allow port 8080 only from the proxy (Docker bypasses ufw, so use the `DOCKER-USER` chain):
  `iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8080 ! -s <proxy IP> -j DROP`

## 3. Start

```bash
docker compose up -d --build
docker compose ps            # all services "running", api "healthy"
docker compose exec api python -m app.cli create-admin you@example.com "Your Name"
```

Open `https://team.example.com`, sign in, and create the other users (API `POST /api/v1/admin/users`, or `python -m app.cli create-user EMAIL "Name" --role employee|manager`). Each user can change their password from the app; an admin can reset one (`PATCH /api/v1/admin/users/<id>` with `new_password`), which signs that user out everywhere.

Do **not** use `--profile dev` in production (it starts Mailpit, a fake mail server).

## 4. Updates

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically when the API starts. Make a backup first (`make backup`).

## 5. Backups and restore

The `backup` service dumps the database every 24 hours into the `backups` volume (and the files volume when `STORAGE_BACKEND=local`), keeping `BACKUP_KEEP_DAYS` days (default 14). Backup files are readable by their owner only.

- Run one now: `make backup`
- List them: `docker compose run --rm --entrypoint ls backup -l /backups`
- **Copy them off the server** regularly (e.g. `rsync` or `restic` from `/var/lib/docker/volumes/<project>_backups/_data`). A backup that only lives on the same disk does not protect against losing the server.
- Files stored in Nextcloud are backed up with your Nextcloud backups.

Restore (tested: row counts, files and login were checked after a restore):

```bash
docker compose stop api
docker compose run --rm --entrypoint /scripts/restore.sh backup /backups/db-YYYYMMDD-HHMMSS.dump [/backups/files-YYYYMMDD-HHMMSS.tar.gz]
docker compose start api
```

For the files archive, mount the files volume writable for that one command: add `-v openteams_files-data:/data/files` (the service mounts it read-only).

## 6. Monitoring

```bash
make monitoring        # Prometheus + Grafana
ssh -L 3000:127.0.0.1:3000 you@team.example.com   # then open http://localhost:3000
```

Grafana (user `admin`, password `GRAFANA_ADMIN_PASSWORD`) has an **OpenTeams** dashboard: requests per second, 5xx errors, p95 latency per route, connected users, emails waiting/failed, failed playbook runs. The API's `/metrics` endpoint is only reachable inside the Docker network; Caddy answers 404 for it.

Useful alerts to add: emails failing (`openteams_email_outbox_failed > 0`), playbook failures, 5xx rate, and the `api` container health.

## 7. Security checklist

- [ ] `ENVIRONMENT=production`, strong `SECRET_KEY`, `AI_ENCRYPTION_KEY` and database password.
- [ ] Only ports 80/443 open (firewall); SSH with keys only.
- [ ] Backups copied off the server and a restore tried once.
- [ ] Real SMTP configured; first admin created; test users removed.
- [ ] `COOKIE_SECURE=true` (default).

What is already in place: argon2 passwords, httpOnly/Secure/SameSite session cookies with server-side revocation, CSRF protection, login and AI rate limits, permission checks on every endpoint and WebSocket event (outsiders get 404), HSTS and a strict Content-Security-Policy, uploads limited by size and type and always downloaded as attachments, short-lived signed download links, encrypted AI keys never sent to browsers, an audit log, and logs that contain route patterns only (no tokens, no message content).

## 8. Scaling note

The API runs as **one** process: the scheduler (reminders, emails, playbooks) and the real-time hub live in it. That is enough for a small team. Running several API instances would need Redis for the real-time events and `SCHEDULER_ENABLED=false` on all instances but one.

## End-to-end tests

The Playwright tests (`e2e/`) run in CI on every push. To run them locally: start PostgreSQL, the API with `ALLOWED_ORIGINS='["http://localhost:4173"]'`, create the users `e2e-admin@example.com` (admin) and `e2e-member@example.com` with the password `e2e-password-123` (`OPENTEAMS_PASSWORD=e2e-password-123 python -m app.cli create-admin ...`), then `make e2e`.
