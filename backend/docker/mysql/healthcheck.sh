#!/bin/sh
# Compose healthcheck: returns 0 only when MySQL is accepting authenticated
# connections (not just listening on the socket). `mysqladmin ping` returns 0
# even before the data directory finishes initialising on first boot, which
# triggers the API container to start too early. Authenticating with the app
# user closes that window.
set -eu

mysql \
  --protocol=TCP \
  --host=127.0.0.1 \
  --port="${MYSQL_TCP_PORT:-3306}" \
  --user="${MYSQL_USER:-app}" \
  --password="${MYSQL_PASSWORD:-app}" \
  --silent \
  --execute='SELECT 1' \
  "${MYSQL_DATABASE:-schoolos}" >/dev/null
