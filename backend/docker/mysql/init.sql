-- ---------------------------------------------------------------------------
-- SchoolOS MySQL bootstrap — runs once per fresh data volume.
--
-- Notes:
--   * The root user / primary database / app user are also configurable via
--     compose env vars (MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER,
--     MYSQL_PASSWORD). This file enforces the things compose cannot:
--       - schema-level utf8mb4 collation,
--       - principle-of-least-privilege grants for the app user,
--       - a separate read-only user for analytics / shadow reads.
--   * Idempotent: re-running is harmless on the same volume because the
--     entrypoint only runs *.sql when the data dir is empty.
-- ---------------------------------------------------------------------------

-- Pin the database collation so CREATE TABLE inherits it consistently. This
-- guards against a future reset spinning up MySQL with a different default.
ALTER DATABASE `schoolos`
  CHARACTER SET = utf8mb4
  COLLATE       = utf8mb4_0900_ai_ci;

-- App user — used by the API process. Can DDL the application schema (Prisma
-- migrations need this) but explicitly cannot SUPER, FILE, PROCESS, or grant.
GRANT
    SELECT, INSERT, UPDATE, DELETE,
    CREATE, ALTER, DROP, INDEX, REFERENCES,
    CREATE TEMPORARY TABLES, LOCK TABLES,
    EXECUTE, TRIGGER,
    CREATE VIEW, SHOW VIEW
  ON `schoolos`.*
  TO 'app'@'%';

-- Read-only user — used by analytics, BI mirrors, support tooling. No DDL,
-- no writes. Created here so the compose env never has to ship a second
-- password by mistake.
CREATE USER IF NOT EXISTS 'app_ro'@'%' IDENTIFIED BY 'app_ro';
GRANT SELECT, SHOW VIEW ON `schoolos`.* TO 'app_ro'@'%';

-- Make the changes visible immediately.
FLUSH PRIVILEGES;
