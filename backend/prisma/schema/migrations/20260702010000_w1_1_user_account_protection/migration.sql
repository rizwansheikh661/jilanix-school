-- Auth Patch Plan W1.1 — basic account protection columns.
--
-- Additive only. Schema-level changes:
--   * users.failed_login_count INT NOT NULL DEFAULT 0
--   * users.locked_until       DATETIME(3) NULL
--
-- No index changes at W1.1; the lockout check happens by primary key. A
-- support index on `locked_until` may be added with the cleanup job in a
-- later wave.

ALTER TABLE `users`
  ADD COLUMN `failed_login_count` INT NOT NULL DEFAULT 0,
  ADD COLUMN `locked_until` DATETIME(3) NULL;
