#!/usr/bin/env bash
# One-command launcher for the Loop Engineering Platform.
# Idempotent: ensures pnpm, Postgres, deps, and schema, then starts API + web.
#
#   ./start.sh
#
set -euo pipefail
cd "$(dirname "$0")"

# ── pnpm on PATH ─────────────────────────────────────────────
export PATH="$HOME/.npm-global/bin:$PATH"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "✗ pnpm not found. Install it with:  npm i -g pnpm  (or enable corepack)"
  exit 1
fi

# State dir for Postgres data (compose reads $DEPUTY_HOME); keep in sync with `deputy`.
export DEPUTY_HOME="${DEPUTY_HOME:-$HOME/.deputy}"
mkdir -p "$DEPUTY_HOME/pgdata"
PG_CONTAINER="deputy-pg"

# ── Postgres (docker compose) ────────────────────────────────
if docker compose version >/dev/null 2>&1; then
  echo "▸ Starting Postgres via docker compose…"
  docker compose up -d db >/dev/null
  echo -n "▸ Waiting for Postgres"
  for _ in $(seq 1 30); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || echo none)
    if [ "$status" = "healthy" ]; then break; fi
    echo -n "."; sleep 1
  done
  echo " ready"
elif command -v docker >/dev/null 2>&1; then
  # Fallback: no compose plugin — run the container directly.
  if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    docker start "$PG_CONTAINER" >/dev/null 2>&1 || docker run -d --name "$PG_CONTAINER" \
      -e POSTGRES_PASSWORD=loop -e POSTGRES_USER=loop -e POSTGRES_DB=loop \
      -p 5433:5432 postgres:16-alpine >/dev/null
  fi
  echo -n "▸ Waiting for Postgres"
  for _ in $(seq 1 30); do
    if docker exec "$PG_CONTAINER" pg_isready -U loop >/dev/null 2>&1; then break; fi
    echo -n "."; sleep 1
  done
  echo " ready"
else
  echo "! docker not found — assuming DATABASE_URL points at a running Postgres"
fi

# ── First-run bootstrap ──────────────────────────────────────
if [ ! -d node_modules ]; then
  echo "▸ Installing dependencies (first run)…"
  pnpm install
fi

echo "▸ Syncing database schema…"
pnpm db:push >/dev/null 2>&1 || pnpm db:push

# Seed the demo project once, if the DB has no projects yet.
if [ ! -f .data/.seeded ]; then
  echo "▸ Seeding demo project (first run)…"
  if pnpm db:seed >/dev/null 2>&1; then mkdir -p .data && touch .data/.seeded; fi
fi

# ── Preflight: ports free? ───────────────────────────────────
for port in 4000 5173; do
  if ss -ltn 2>/dev/null | grep -q ":$port "; then
    echo "✗ Port $port is already in use — the platform may already be running."
    echo "  Stop it first (Ctrl-C in its terminal, or: kill \$(ss -ltnp | grep :$port | grep -oE 'pid=[0-9]+' | cut -d= -f2))"
    exit 1
  fi
done

# ── Launch ───────────────────────────────────────────────────
echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  Loop Engineering Platform                    │"
echo "  │  Dashboard : http://localhost:5173            │"
echo "  │  API       : http://localhost:4000/health     │"
echo "  │  Stop      : Ctrl-C                            │"
echo "  └─────────────────────────────────────────────┘"
echo ""
exec pnpm dev
