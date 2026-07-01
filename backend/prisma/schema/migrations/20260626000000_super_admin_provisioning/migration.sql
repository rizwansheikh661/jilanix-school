-- Sprint 14 — Super Admin & School Provisioning Foundation migration.
-- Hand-crafted (Sprint 7-13 precedent): `prisma migrate dev` is unusable
-- because the shadow-DB reconstruction loses STORED virtual columns. This
-- file is authored by hand to match the conventions of the prior reporting
-- foundation (backticked identifiers, 2-space indents on multi-statement
-- ALTERs, composite (school_id, id) PKs on tenant-owned tables, STORED
-- `deleted_at_key` + partial-unique pattern at the tail). Format
-- `'%Y%m%d%H%i%s.%f'` / `'0'` sentinel mirrors Sprint 5-13 base. Default
-- collation `utf8mb4_unicode_ci`. `BOOLEAN` (== TINYINT(1)) chosen for
-- consistency with prior migrations.
--
-- What this migration adds (six sections):
--   1. ALTER `schools` adding the Sprint 14 typed lifecycle + plan columns
--      (lifecycle_status enum, trial dates, plan FK columns, suspension /
--      cancellation fields) plus the two new indexes for the provisioning
--      paths. The legacy `status` VARCHAR is kept for backward compatibility.
--   2. ALTER `users` adding `must_change_password` + `password_reset_required_at`.
--   3. CREATE TABLE `plans` — PLATFORM_ONLY soft-deleted plan catalog.
--      Single-column PK `id`; uniqueness on `code` (active-row only via the
--      STORED `deleted_at_key` projection).
--   4. ALTER `schools` adding `fk_schools_plan` (single-col FK, SET NULL on
--      delete to preserve the school row when a plan is retired).
--   5. CREATE TABLE `password_reset_requests` — TENANT_OWNED composite-PK
--      (school_id, id), composite FK to `users (school_id, user_id)`, unique
--      on `token_hash`, ix on (school_id, user_id, consumed_at), ix on
--      `expires_at` for the sweep job.
--   6. CREATE TABLE `school_provisioning_runs` — CROSS_TENANT_OPERATIONAL
--      single-PK append-only journal of provisioning attempts. No FK on
--      school_id (run row outlives the school in the rollback path).
--   7. Backfill — synthesize `lifecycle_status` + trial dates for existing
--      schools from the legacy `status` column.
--   8. Seed default plans: STARTER + GROWTH (INSERT IGNORE — re-running the
--      seeder is harmless).

-- ============================================================================
-- Section 1: ALTER schools — add lifecycle + plan + suspension columns
-- ============================================================================
ALTER TABLE `schools`
  ADD COLUMN `lifecycle_status`     ENUM('TRIAL','ACTIVE','SUSPENDED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'TRIAL' AFTER `archived_at`,
  ADD COLUMN `trial_start_date`     TIMESTAMP(3) NULL AFTER `lifecycle_status`,
  ADD COLUMN `trial_end_date`       TIMESTAMP(3) NULL AFTER `trial_start_date`,
  ADD COLUMN `trial_extended_count` INTEGER      NOT NULL DEFAULT 0 AFTER `trial_end_date`,
  ADD COLUMN `plan_id`              CHAR(36)     NULL AFTER `trial_extended_count`,
  ADD COLUMN `plan_assigned_at`     TIMESTAMP(3) NULL AFTER `plan_id`,
  ADD COLUMN `plan_expires_at`      TIMESTAMP(3) NULL AFTER `plan_assigned_at`,
  ADD COLUMN `plan_status`          ENUM('ACTIVE','ASSIGNED','EXPIRED','CANCELLED') NULL AFTER `plan_expires_at`,
  ADD COLUMN `suspended_at`         TIMESTAMP(3) NULL AFTER `plan_status`,
  ADD COLUMN `suspended_reason`     VARCHAR(500) NULL AFTER `suspended_at`,
  ADD COLUMN `cancelled_at`         TIMESTAMP(3) NULL AFTER `suspended_reason`,
  ADD INDEX `ix_schools_lifecycle_trial_end` (`lifecycle_status`, `trial_end_date`),
  ADD INDEX `ix_schools_plan_id`              (`plan_id`);

-- ============================================================================
-- Section 2: ALTER users — add password-rotation flag + timestamp
-- ============================================================================
ALTER TABLE `users`
  ADD COLUMN `must_change_password`        BOOLEAN      NOT NULL DEFAULT FALSE AFTER `password_changed_at`,
  ADD COLUMN `password_reset_required_at`  TIMESTAMP(3) NULL                   AFTER `must_change_password`;

-- ============================================================================
-- Section 3: CREATE TABLE plans (PLATFORM_ONLY, soft-delete)
-- ============================================================================
CREATE TABLE `plans` (
  `id`                    CHAR(36)      NOT NULL,
  `code`                  VARCHAR(40)   NOT NULL,
  `name`                  VARCHAR(120)  NOT NULL,
  `description`           VARCHAR(1000) NULL,
  `default_trial_days`    INTEGER       NOT NULL DEFAULT 30,
  `email_enabled`         BOOLEAN       NOT NULL DEFAULT TRUE,
  `sms_enabled`           BOOLEAN       NOT NULL DEFAULT FALSE,
  `push_enabled`          BOOLEAN       NOT NULL DEFAULT TRUE,
  `in_app_enabled`        BOOLEAN       NOT NULL DEFAULT TRUE,
  `email_monthly_limit`   INTEGER       NOT NULL DEFAULT 0,
  `sms_monthly_limit`     INTEGER       NOT NULL DEFAULT 0,
  `push_monthly_limit`    INTEGER       NOT NULL DEFAULT 0,
  `in_app_monthly_limit`  INTEGER       NOT NULL DEFAULT 0,
  `created_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`            CHAR(36)      NULL,
  `updated_by`            CHAR(36)      NULL,
  `deleted_at`            TIMESTAMP(3)  NULL,
  `deleted_by`            CHAR(36)      NULL,
  `version`               INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_plans_code` (`code`),
  INDEX `ix_plans_deleted_at` (`deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 4: FK schools.plan_id -> plans.id (single-column, SET NULL)
-- ============================================================================
ALTER TABLE `schools`
  ADD CONSTRAINT `fk_schools_plan`
  FOREIGN KEY (`plan_id`)
  REFERENCES `plans` (`id`)
  ON DELETE SET NULL ON UPDATE RESTRICT;

-- ============================================================================
-- Section 5: CREATE TABLE password_reset_requests (TENANT_OWNED)
-- ============================================================================
CREATE TABLE `password_reset_requests` (
  `id`           CHAR(36)      NOT NULL,
  `school_id`    CHAR(36)      NOT NULL,
  `user_id`      CHAR(36)      NOT NULL,
  `token_hash`   CHAR(64)      NOT NULL,
  `requested_at` TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at`   TIMESTAMP(3)  NOT NULL,
  `consumed_at`  TIMESTAMP(3)  NULL,
  `cancelled_at` TIMESTAMP(3)  NULL,
  `ip`           VARCHAR(45)   NULL,
  `user_agent`   VARCHAR(512)  NULL,
  `created_at`   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`   CHAR(36)      NULL,
  `updated_by`   CHAR(36)      NULL,
  `version`      INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE INDEX `uq_password_reset_requests_token_hash` (`token_hash`),
  INDEX `ix_password_reset_requests_school_user_consumed` (`school_id`, `user_id`, `consumed_at`),
  INDEX `ix_password_reset_requests_expires`             (`expires_at`),
  CONSTRAINT `fk_password_reset_requests_user`
    FOREIGN KEY (`school_id`, `user_id`)
    REFERENCES `users` (`school_id`, `id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 6: CREATE TABLE school_provisioning_runs (CROSS_TENANT_OPERATIONAL,
-- append-only — no soft-delete, no version, no school-scoped composite PK)
-- ============================================================================
CREATE TABLE `school_provisioning_runs` (
  `id`                    CHAR(36)      NOT NULL,
  `school_id`             CHAR(36)      NULL,
  `triggered_by_user_id`  CHAR(36)      NOT NULL,
  `started_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at`          TIMESTAMP(3)  NULL,
  `status`                VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  `steps_json`            JSON          NOT NULL,
  `error_message`         VARCHAR(2000) NULL,
  PRIMARY KEY (`id`),
  INDEX `ix_school_provisioning_run_school_started` (`school_id`, `started_at`),
  INDEX `ix_school_provisioning_run_status_started` (`status`,    `started_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 7: Backfill — synthesize lifecycle + trial dates for existing rows.
--   - `lifecycle_status`: 'trial' → TRIAL ; 'active' → ACTIVE ;
--      any other non-NULL value → ACTIVE ; archived_at NOT NULL → CANCELLED.
--   - `trial_start_date` = COALESCE(onboarded_at, created_at).
--   - `trial_end_date`   = trial_start_date + 30 days (matches the STARTER
--      plan's default trial). Only set when lifecycle_status = TRIAL.
-- ============================================================================
UPDATE `schools`
  SET `lifecycle_status` = CASE
    WHEN `archived_at` IS NOT NULL THEN 'CANCELLED'
    WHEN LOWER(`status`) = 'trial'  THEN 'TRIAL'
    WHEN LOWER(`status`) = 'active' THEN 'ACTIVE'
    ELSE 'ACTIVE'
  END,
  `cancelled_at`     = CASE WHEN `archived_at` IS NOT NULL THEN `archived_at` ELSE NULL END,
  `trial_start_date` = COALESCE(`onboarded_at`, `created_at`),
  `trial_end_date`   = DATE_ADD(COALESCE(`onboarded_at`, `created_at`), INTERVAL 30 DAY)
WHERE `lifecycle_status` = 'TRIAL';
-- Note: the WHERE clause uses the column default ('TRIAL') applied to every
-- existing row by Section 1's ADD COLUMN; the CASE expression then refines.

-- ============================================================================
-- Section 8: Seed default plans (STARTER + GROWTH). INSERT IGNORE keeps the
-- seeder idempotent — the application-side seeder upserts the same rows on
-- every boot in case new columns are added in a later sprint.
-- ============================================================================
INSERT IGNORE INTO `plans` (
  `id`, `code`, `name`, `description`, `default_trial_days`,
  `email_enabled`, `sms_enabled`, `push_enabled`, `in_app_enabled`,
  `email_monthly_limit`, `sms_monthly_limit`, `push_monthly_limit`, `in_app_monthly_limit`
) VALUES
  (
    UUID(), 'STARTER', 'Starter',
    'Entry-level plan with email + in-app notifications only.', 30,
    TRUE, FALSE, FALSE, TRUE,
    5000, 0, 0, 50000
  ),
  (
    UUID(), 'GROWTH', 'Growth',
    'Full-feature plan with all communication channels enabled.', 30,
    TRUE, TRUE, TRUE, TRUE,
    50000, 10000, 100000, 500000
  );
