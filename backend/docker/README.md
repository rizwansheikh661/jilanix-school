# Docker assets

This directory holds everything the local Docker Compose stack needs for
Sprint 1.

```
docker/
├── api.Dockerfile             # multi-stage runtime image for the NestJS API
├── docker-compose.yml         # compose file (api + mysql)
└── mysql/
    ├── my.cnf                 # tuned MySQL 8 config — utf8mb4, strict, slow log
    ├── init.sql               # privileges, charset, read-only user
    └── healthcheck.sh         # authenticated SELECT 1 probe
```

## Why an authenticated healthcheck?

`mysqladmin ping` returns success the moment the socket opens — including
during the first-boot data-directory init. The API container would then
race past compose's `depends_on` gate and crash at connect time. The
authenticated `SELECT 1` probe in `healthcheck.sh` only goes green once the
data dir is ready and the app user exists, which is the only signal that
matters for the API.

## Conventions

- Server timezone is **UTC**. The application converts to `Asia/Kolkata`
  for display only (the Zod env schema forbids drift).
- `lower_case_table_names=1` — Linux dev hosts and managed RDS instances
  have historically diverged on this setting, masking bugs that only show
  up in production. Pinning it here keeps `dev == prod`.
- Strict `sql_mode` is non-negotiable. Silent truncations / zero-dates have
  caused outages in adjacent codebases; we surface them at INSERT time.
- The slow-query threshold matches the application SLO (250 ms). Lower it
  in CI to catch N+1 patterns before they reach a human reviewer.

## Common ops

```bash
# from backend/
make up               # build api + start both
make logs             # tail api logs
make down             # stop
docker compose -f docker/docker-compose.yml exec mysql mysql -uapp -papp schoolos
bash scripts/mysql-reset.sh   # nuke volume + re-run migrations + seed
```
