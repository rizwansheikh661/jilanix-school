#!/usr/bin/env bash
# Hard-reset the local MySQL volume and re-apply the Prisma schema.
#
# Usage:
#   bash scripts/mysql-reset.sh           # confirm prompt
#   bash scripts/mysql-reset.sh --yes     # CI / scripted use
#
# Refuses to run when MYSQL_HOST is anything other than localhost / 127.0.0.1
# / mysql (compose dns). Deleting a staging or prod volume by accident is
# exactly the class of mistake worth blocking with a guard rather than a
# code-review comment.

set -euo pipefail

CONFIRM="${1:-}"
ALLOWED_HOSTS=("localhost" "127.0.0.1" "mysql" "::1")
DB_URL="${DB_URL:-}"

# Best-effort host extraction from DB_URL: mysql://user:pass@HOST:PORT/db?...
host_from_url() {
  local url="$1"
  local stripped="${url#*://}"      # user:pass@host:port/db?...
  stripped="${stripped#*@}"         # host:port/db?...
  stripped="${stripped%%/*}"        # host:port
  stripped="${stripped%%:*}"        # host
  printf '%s' "$stripped"
}

if [ -n "$DB_URL" ]; then
  HOST="$(host_from_url "$DB_URL")"
  ok=0
  for allowed in "${ALLOWED_HOSTS[@]}"; do
    if [ "$HOST" = "$allowed" ]; then
      ok=1
      break
    fi
  done
  if [ "$ok" -ne 1 ]; then
    echo "[mysql-reset] refusing — DB_URL host '$HOST' is not in {${ALLOWED_HOSTS[*]}}." >&2
    echo "[mysql-reset] this script is for local dev only." >&2
    exit 2
  fi
fi

if [ "$CONFIRM" != "--yes" ]; then
  printf 'This will DELETE the local mysql volume and re-run migrations + seed. Type "reset" to continue: '
  read -r reply
  if [ "$reply" != "reset" ]; then
    echo "[mysql-reset] aborted."
    exit 1
  fi
fi

echo "[mysql-reset] stopping containers..."
docker compose -f docker/docker-compose.yml down

echo "[mysql-reset] removing data volume..."
docker volume rm -f schoolos-mysql-data >/dev/null 2>&1 || true
docker volume rm -f schoolos-mysql-logs >/dev/null 2>&1 || true

echo "[mysql-reset] starting fresh mysql..."
docker compose -f docker/docker-compose.yml up -d mysql

echo "[mysql-reset] waiting for healthy state..."
for _ in $(seq 1 60); do
  state="$(docker inspect -f '{{.State.Health.Status}}' schoolos-mysql 2>/dev/null || echo unknown)"
  if [ "$state" = "healthy" ]; then
    break
  fi
  sleep 1
done

if [ "$state" != "healthy" ]; then
  echo "[mysql-reset] mysql did not become healthy within 60s — check 'docker logs schoolos-mysql'." >&2
  exit 3
fi

echo "[mysql-reset] applying migrations..."
npm run prisma:migrate:deploy

echo "[mysql-reset] seeding..."
npm run prisma:seed

echo "[mysql-reset] done."
