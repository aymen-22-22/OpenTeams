#!/bin/sh
# End-to-end tests against the production build of the frontend.
# Needs the API running on :8000 with ALLOWED_ORIGINS containing http://localhost:4173
# and the two test users (see docs/DEPLOYMENT.md, "End-to-end tests").
set -eu
cd "$(dirname "$0")/.."

(cd frontend && npm run build)
(cd frontend && npx vite preview --port 4173) &
preview=$!
trap 'kill "$preview"' EXIT

(cd e2e && npm ci && npx playwright test)
