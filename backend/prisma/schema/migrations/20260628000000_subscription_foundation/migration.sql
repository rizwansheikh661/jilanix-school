-- Sprint 15 — SaaS Subscription & Plan Management Foundation migration.
-- Hand-crafted (Sprint 7-14 precedent): `prisma migrate dev` is unusable
-- because the shadow-DB reconstruction loses STORED virtual columns. This
-- file follows the conventions of `20260626000000_super_admin_provisioning`
-- (backticked identifiers, 2-space indents on multi-statement ALTERs,
-- composite (school_id, id) PKs on tenant-owned tables, STORED
-- `deleted_at_key` + partial-unique pattern, '0' sentinel for the
-- soft-delete projection).
--
-- Billing / invoicing / payments are explicitly OUT of scope for this
-- sprint (no SubscriptionInvoice / SubscriptionPayment tables).
--
-- What this migration adds (nine sections):
--   1. ALTER `plans` — pricing/catalog cols (monthly_price, yearly_price,
--      currency, trial_days, is_active, sort_order) + ix_plans_active_sort.
--   2. CREATE TABLE `plan_features` (PLATFORM_ONLY, soft-delete with STORED
--      `deleted_at_key`, UNIQUE (plan_id, feature_key, deleted_at_key)).
--   3. CREATE TABLE `subscriptions` (TENANT_OWNED, composite (school_id, id)
--      PK, STORED `active_key` + UNIQUE for one-ACTIVE-per-school invariant,
--      STORED `deleted_at_key`).
--   4. CREATE TABLE `subscription_history` (TENANT_OWNED APPEND_ONLY
--      composite PK; FK to subscriptions(school_id, id)).
--   5. CREATE TABLE `school_usage` (TENANT_OWNED singleton per school,
--      composite PK, UNIQUE on school_id).
--   6. CREATE TABLE `usage_events` (TENANT_OWNED APPEND_ONLY composite PK).
--   7. CREATE TABLE `usage_threshold_state` (TENANT_OWNED singleton per
--      (school, feature_key), composite PK, UNIQUE (school_id, feature_key)).
--   8. Backfill — set pricing defaults on existing STARTER + GROWTH rows;
--      seed ENTERPRISE plan via INSERT IGNORE.
--   9. Seed `plan_features` — 14 canonical keys × 3 plans = 42 rows. INSERT
--      IGNORE; the application-side seeder re-runs idempotently on every
--      boot (per `plan.seeder.ts` precedent).

-- ============================================================================
-- Section 1: ALTER plans — pricing + catalog metadata
-- ============================================================================
ALTER TABLE `plans`
  ADD COLUMN `monthly_price` DECIMAL(12, 2) NOT NULL DEFAULT 0      AFTER `in_app_monthly_limit`,
  ADD COLUMN `yearly_price`  DECIMAL(12, 2) NOT NULL DEFAULT 0      AFTER `monthly_price`,
  ADD COLUMN `currency`      CHAR(3)        NOT NULL DEFAULT 'INR'  AFTER `yearly_price`,
  ADD COLUMN `trial_days`    INTEGER        NOT NULL DEFAULT 30     AFTER `currency`,
  ADD COLUMN `is_active`     BOOLEAN        NOT NULL DEFAULT TRUE   AFTER `trial_days`,
  ADD COLUMN `sort_order`    INTEGER        NOT NULL DEFAULT 0      AFTER `is_active`,
  ADD INDEX  `ix_plans_active_sort` (`is_active`, `sort_order`);

-- ============================================================================
-- Section 2: CREATE TABLE plan_features (PLATFORM_ONLY, soft-delete)
-- STORED `deleted_at_key` projects deleted_at into a CHAR(36) sentinel so
-- the (plan_id, feature_key) uniqueness only applies to live rows.
-- ============================================================================
CREATE TABLE `plan_features` (
  `id`             CHAR(36)                                                  NOT NULL,
  `plan_id`        CHAR(36)                                                  NOT NULL,
  `feature_key`    VARCHAR(80)                                               NOT NULL,
  `feature_type`   ENUM('LIMIT','TOGGLE')                                    NOT NULL,
  `mode`           ENUM('LIMITED','UNLIMITED','DISABLED','ENABLED')          NOT NULL,
  `limit`          INTEGER                                                   NULL,
  `sort_order`     INTEGER                                                   NOT NULL DEFAULT 0,
  `description`    VARCHAR(500)                                              NULL,
  `created_at`     TIMESTAMP(3)                                              NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     TIMESTAMP(3)                                              NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`     CHAR(36)                                                  NULL,
  `updated_by`     CHAR(36)                                                  NULL,
  `deleted_at`     TIMESTAMP(3)                                              NULL,
  `deleted_by`     CHAR(36)                                                  NULL,
  `version`        INTEGER                                                   NOT NULL DEFAULT 1,
  `deleted_at_key` CHAR(26) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_plan_features_plan_key` (`plan_id`, `feature_key`, `deleted_at_key`),
  INDEX `ix_plan_features_plan`       (`plan_id`, `feature_type`, `sort_order`),
  INDEX `ix_plan_features_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_plan_features_plan`
    FOREIGN KEY (`plan_id`)
    REFERENCES `plans` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 3: CREATE TABLE subscriptions (TENANT_OWNED, soft-delete)
-- STORED `active_key`: when status='ACTIVE' it carries school_id, else NULL.
-- The UNIQUE index on `active_key` structurally enforces "one ACTIVE
-- subscription per school". Application code soft-cancels the previous
-- ACTIVE row before assigning a new plan.
-- ============================================================================
CREATE TABLE `subscriptions` (
  `id`                  CHAR(36)                                                                     NOT NULL,
  `school_id`           CHAR(36)                                                                     NOT NULL,
  `plan_id`             CHAR(36)                                                                     NOT NULL,
  `status`              ENUM('PENDING','TRIAL','ACTIVE','EXPIRING','EXPIRED','SUSPENDED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `billing_cycle`       ENUM('MONTHLY','YEARLY','TRIAL','CUSTOM')                                    NOT NULL,
  `currency`            CHAR(3)                                                                      NOT NULL DEFAULT 'INR',
  `monthly_price`       DECIMAL(12, 2)                                                               NOT NULL DEFAULT 0,
  `yearly_price`        DECIMAL(12, 2)                                                               NOT NULL DEFAULT 0,
  `assigned_by`         CHAR(36)                                                                     NULL,
  `assigned_at`         TIMESTAMP(3)                                                                 NULL,
  `started_at`          TIMESTAMP(3)                                                                 NULL,
  `expiry_date`         TIMESTAMP(3)                                                                 NULL,
  `cancelled_at`        TIMESTAMP(3)                                                                 NULL,
  `cancellation_reason` VARCHAR(500)                                                                 NULL,
  `trial_ends_at`       TIMESTAMP(3)                                                                 NULL,
  `last_renewed_at`     TIMESTAMP(3)                                                                 NULL,
  `next_renewal_at`     TIMESTAMP(3)                                                                 NULL,
  `auto_renew`          BOOLEAN                                                                      NOT NULL DEFAULT FALSE,
  `created_at`          TIMESTAMP(3)                                                                 NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          TIMESTAMP(3)                                                                 NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`          CHAR(36)                                                                     NULL,
  `updated_by`          CHAR(36)                                                                     NULL,
  `deleted_at`          TIMESTAMP(3)                                                                 NULL,
  `deleted_by`          CHAR(36)                                                                     NULL,
  `version`             INTEGER                                                                      NOT NULL DEFAULT 1,
  `active_key`          CHAR(36) GENERATED ALWAYS AS
    (CASE WHEN `status` = 'ACTIVE' THEN `school_id` ELSE NULL END) STORED,
  `deleted_at_key`      CHAR(26) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE INDEX `uq_subscriptions_active_school` (`active_key`),
  INDEX `ix_subscriptions_school_status` (`school_id`, `status`),
  INDEX `ix_subscriptions_expiry`        (`status`, `expiry_date`),
  INDEX `ix_subscriptions_plan`          (`plan_id`),
  INDEX `ix_subscriptions_deleted_at`    (`deleted_at`),
  CONSTRAINT `fk_subscriptions_plan`
    FOREIGN KEY (`plan_id`)
    REFERENCES `plans` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 4: CREATE TABLE subscription_history (TENANT_OWNED, APPEND_ONLY)
-- ============================================================================
CREATE TABLE `subscription_history` (
  `id`              CHAR(36)                                                                                                NOT NULL,
  `school_id`       CHAR(36)                                                                                                NOT NULL,
  `subscription_id` CHAR(36)                                                                                                NOT NULL,
  `action`          ENUM('ASSIGNED','ACTIVATED','UPGRADED','DOWNGRADED','RENEWED','EXPIRING','EXPIRED','SUSPENDED','REACTIVATED','CANCELLED') NOT NULL,
  `from_plan_id`    CHAR(36)                                                                                                NULL,
  `to_plan_id`      CHAR(36)                                                                                                NULL,
  `from_status`     VARCHAR(20)                                                                                             NULL,
  `to_status`       VARCHAR(20)                                                                                             NULL,
  `actor_user_id`   CHAR(36)                                                                                                NULL,
  `actor_reason`    VARCHAR(500)                                                                                            NULL,
  `metadata_json`   JSON                                                                                                    NULL,
  `occurred_at`     TIMESTAMP(3)                                                                                            NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_subscription_history_subscription` (`school_id`, `subscription_id`, `occurred_at`),
  CONSTRAINT `fk_subscription_history_subscription`
    FOREIGN KEY (`school_id`, `subscription_id`)
    REFERENCES `subscriptions` (`school_id`, `id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 5: CREATE TABLE school_usage (TENANT_OWNED singleton per school)
-- ============================================================================
CREATE TABLE `school_usage` (
  `id`                        CHAR(36)     NOT NULL,
  `school_id`                 CHAR(36)     NOT NULL,
  `student_count`             INTEGER      NOT NULL DEFAULT 0,
  `staff_count`               INTEGER      NOT NULL DEFAULT 0,
  `branch_count`              INTEGER      NOT NULL DEFAULT 0,
  `sms_used_this_period`      INTEGER      NOT NULL DEFAULT 0,
  `whatsapp_used_this_period` INTEGER      NOT NULL DEFAULT 0,
  `email_used_this_period`    INTEGER      NOT NULL DEFAULT 0,
  `storage_bytes_used`        BIGINT       NOT NULL DEFAULT 0,
  `usage_period_start`        DATE         NOT NULL,
  `usage_period_end`          DATE         NOT NULL,
  `last_recomputed_at`        TIMESTAMP(3) NULL,
  `created_at`                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`                CHAR(36)     NULL,
  `updated_by`                CHAR(36)     NULL,
  `version`                   INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE INDEX `uq_school_usage_school` (`school_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 6: CREATE TABLE usage_events (TENANT_OWNED, APPEND_ONLY ledger)
-- ============================================================================
CREATE TABLE `usage_events` (
  `id`            CHAR(36)     NOT NULL,
  `school_id`     CHAR(36)     NOT NULL,
  `feature_key`   VARCHAR(80)  NOT NULL,
  `delta`         INTEGER      NOT NULL,
  `actor_user_id` CHAR(36)     NULL,
  `source_ref`    VARCHAR(200) NULL,
  `occurred_at`   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_usage_events_school_key_time` (`school_id`, `feature_key`, `occurred_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 7: CREATE TABLE usage_threshold_state
--   (TENANT_OWNED singleton per (school, feature_key))
-- ============================================================================
CREATE TABLE `usage_threshold_state` (
  `id`                       CHAR(36)                                       NOT NULL,
  `school_id`                CHAR(36)                                       NOT NULL,
  `feature_key`              VARCHAR(80)                                    NOT NULL,
  `last_notified_threshold`  ENUM('THRESHOLD_80','THRESHOLD_90','LIMIT_REACHED') NULL,
  `last_notified_at`         TIMESTAMP(3)                                   NULL,
  `current_percent`          INTEGER                                        NOT NULL DEFAULT 0,
  `created_at`               TIMESTAMP(3)                                   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)                                   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `version`                  INTEGER                                        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE INDEX `uq_usage_threshold_school_key` (`school_id`, `feature_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 8: Backfill existing plans + seed ENTERPRISE row.
-- Sprint 14 seeded STARTER (0/0) + GROWTH (0/0) pricing; Sprint 15 sets
-- presentation defaults so the catalog API returns deterministic ordering.
-- ENTERPRISE row inserted via INSERT IGNORE so re-runs are harmless.
-- ============================================================================
UPDATE `plans` SET
  `monthly_price` = 999.00,
  `yearly_price`  = 9990.00,
  `currency`      = 'INR',
  `trial_days`    = 30,
  `is_active`     = TRUE,
  `sort_order`    = 10
WHERE `code` = 'STARTER';

UPDATE `plans` SET
  `monthly_price` = 2999.00,
  `yearly_price`  = 29990.00,
  `currency`      = 'INR',
  `trial_days`    = 30,
  `is_active`     = TRUE,
  `sort_order`    = 20
WHERE `code` = 'GROWTH';

INSERT IGNORE INTO `plans` (
  `id`, `code`, `name`, `description`, `default_trial_days`,
  `email_enabled`, `sms_enabled`, `push_enabled`, `in_app_enabled`,
  `email_monthly_limit`, `sms_monthly_limit`, `push_monthly_limit`, `in_app_monthly_limit`,
  `monthly_price`, `yearly_price`, `currency`, `trial_days`, `is_active`, `sort_order`
) VALUES (
  UUID(), 'ENTERPRISE', 'Enterprise',
  'Top-tier plan with unlimited usage on every feature key.', 30,
  TRUE, TRUE, TRUE, TRUE,
  0, 0, 0, 0,
  9999.00, 99990.00, 'INR', 30, TRUE, 30
);

-- ============================================================================
-- Section 9: Seed plan_features — 14 canonical keys × 3 plans = 42 rows.
-- INSERT IGNORE; the application-side seeder re-asserts the same rows on
-- every boot (per `plan.seeder.ts` precedent), so this seed is purely a
-- cold-start convenience.
--
-- LIMIT keys (7): student_count, staff_count, branch_count,
-- email_monthly, sms_monthly, whatsapp_monthly, storage_bytes.
-- TOGGLE keys (7): parent_portal, student_portal, payroll, accounting,
-- advanced_reporting, multi_branch, event_management.
-- ============================================================================

-- STARTER plan features
INSERT IGNORE INTO `plan_features` (`id`, `plan_id`, `feature_key`, `feature_type`, `mode`, `limit`, `sort_order`)
SELECT UUID(), `id`, 'student_count',      'LIMIT',  'LIMITED',   500,                10 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'staff_count',        'LIMIT',  'LIMITED',   50,                 20 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'branch_count',       'LIMIT',  'LIMITED',   1,                  30 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'email_monthly',      'LIMIT',  'LIMITED',   5000,               40 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'sms_monthly',        'LIMIT',  'DISABLED',  NULL,               50 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'whatsapp_monthly',   'LIMIT',  'DISABLED',  NULL,               60 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'storage_bytes',      'LIMIT',  'LIMITED',   5368709120,         70 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'parent_portal',      'TOGGLE', 'ENABLED',   NULL,              100 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'student_portal',     'TOGGLE', 'DISABLED',  NULL,              110 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'payroll',            'TOGGLE', 'DISABLED',  NULL,              120 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'accounting',         'TOGGLE', 'DISABLED',  NULL,              130 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'advanced_reporting', 'TOGGLE', 'DISABLED',  NULL,              140 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'multi_branch',       'TOGGLE', 'DISABLED',  NULL,              150 FROM `plans` WHERE `code` = 'STARTER'
UNION ALL SELECT UUID(), `id`, 'event_management',   'TOGGLE', 'ENABLED',   NULL,              160 FROM `plans` WHERE `code` = 'STARTER';

-- GROWTH plan features
INSERT IGNORE INTO `plan_features` (`id`, `plan_id`, `feature_key`, `feature_type`, `mode`, `limit`, `sort_order`)
SELECT UUID(), `id`, 'student_count',      'LIMIT',  'LIMITED',   2500,               10 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'staff_count',        'LIMIT',  'LIMITED',   250,                20 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'branch_count',       'LIMIT',  'LIMITED',   3,                  30 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'email_monthly',      'LIMIT',  'LIMITED',   50000,              40 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'sms_monthly',        'LIMIT',  'LIMITED',   10000,              50 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'whatsapp_monthly',   'LIMIT',  'LIMITED',   5000,               60 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'storage_bytes',      'LIMIT',  'LIMITED',   53687091200,        70 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'parent_portal',      'TOGGLE', 'ENABLED',   NULL,              100 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'student_portal',     'TOGGLE', 'ENABLED',   NULL,              110 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'payroll',            'TOGGLE', 'DISABLED',  NULL,              120 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'accounting',         'TOGGLE', 'DISABLED',  NULL,              130 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'advanced_reporting', 'TOGGLE', 'ENABLED',   NULL,              140 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'multi_branch',       'TOGGLE', 'ENABLED',   NULL,              150 FROM `plans` WHERE `code` = 'GROWTH'
UNION ALL SELECT UUID(), `id`, 'event_management',   'TOGGLE', 'ENABLED',   NULL,              160 FROM `plans` WHERE `code` = 'GROWTH';

-- ENTERPRISE plan features (UNLIMITED on every LIMIT key, every TOGGLE ENABLED)
INSERT IGNORE INTO `plan_features` (`id`, `plan_id`, `feature_key`, `feature_type`, `mode`, `limit`, `sort_order`)
SELECT UUID(), `id`, 'student_count',      'LIMIT',  'UNLIMITED', NULL,               10 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'staff_count',        'LIMIT',  'UNLIMITED', NULL,               20 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'branch_count',       'LIMIT',  'UNLIMITED', NULL,               30 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'email_monthly',      'LIMIT',  'UNLIMITED', NULL,               40 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'sms_monthly',        'LIMIT',  'UNLIMITED', NULL,               50 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'whatsapp_monthly',   'LIMIT',  'UNLIMITED', NULL,               60 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'storage_bytes',      'LIMIT',  'UNLIMITED', NULL,               70 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'parent_portal',      'TOGGLE', 'ENABLED',   NULL,              100 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'student_portal',     'TOGGLE', 'ENABLED',   NULL,              110 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'payroll',            'TOGGLE', 'ENABLED',   NULL,              120 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'accounting',         'TOGGLE', 'ENABLED',   NULL,              130 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'advanced_reporting', 'TOGGLE', 'ENABLED',   NULL,              140 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'multi_branch',       'TOGGLE', 'ENABLED',   NULL,              150 FROM `plans` WHERE `code` = 'ENTERPRISE'
UNION ALL SELECT UUID(), `id`, 'event_management',   'TOGGLE', 'ENABLED',   NULL,              160 FROM `plans` WHERE `code` = 'ENTERPRISE';
