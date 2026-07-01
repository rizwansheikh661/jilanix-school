-- Sprint 10 — Notifications & Communication Foundation migration.
-- Hand-crafted (Sprint 7-9 precedent): `prisma migrate dev` is unusable
-- because the shadow-DB reconstruction loses STORED virtual columns. This
-- file is authored by hand to match the conventions of the prior fees
-- foundation (backticked identifiers, 2-space indents on multi-statement
-- ALTERs, composite (school_id, id) PKs, STORED `deleted_at_key` + partial-
-- unique pattern at the tail). Format `'%Y%m%d%H%i%s.%f'` / `'0'` sentinel
-- mirrors Sprint 9 base. Default collation `utf8mb4_unicode_ci`. `BOOLEAN`
-- (== TINYINT(1)) chosen for consistency with prior migrations.
--
-- What this migration adds (six sections):
--   1. 8 CREATE TABLE statements for the notifications schema:
--      - notification_templates                  (header, soft-delete)
--      - notification_template_versions          (APPEND_ONLY versioned body)
--      - notification_messages                   (envelope, soft-delete)
--      - notification_message_events             (APPEND_ONLY delivery log)
--      - notification_user_preferences           (per-user matrix, soft-delete)
--      - notification_campaigns                  (broadcast envelope, soft-delete)
--      - notification_campaign_recipients        (APPEND_ONLY resolution log)
--      - school_communication_entitlements       (singleton per school)
--   2. Composite (school_id, *_id) foreign keys on the relations:
--      - notification_template_versions  → notification_templates
--      - notification_messages           → notification_templates  (NULLable)
--      - notification_messages           → notification_campaigns  (NULLable)
--      - notification_message_events     → notification_messages
--      - notification_campaigns          → notification_templates
--      - notification_campaign_recipients → notification_campaigns
--   3. STORED `deleted_at_key` projection on the 4 soft-deleted tables:
--      notification_templates, notification_messages,
--      notification_user_preferences, notification_campaigns. Prisma cannot
--      emit GENERATED ALWAYS AS; format `'%Y%m%d%H%i%s.%f'` → '0' sentinel
--      mirrors the Sprint 5-9 base migrations.
--   4. Partial-unique indexes guarding active-row uniqueness:
--      - uq_notification_template_active          (school_id, channel, code, deleted_at_key)
--      - uq_notification_message_dedupe_active    (school_id, dedupe_key, deleted_at_key)
--      - uq_notification_preference_user_active   (school_id, user_id, deleted_at_key)
--      - uq_notification_campaign_code_active     (school_id, code, deleted_at_key)
--      Null-permissive on dedupe_key / code: NULLs are not deduplicated by
--      MySQL unique constraints (per ANSI), so ad-hoc sends and DRAFT
--      campaigns without a code coexist freely.
--   5. school_communication_entitlements singleton uniqueness:
--      uq_school_communication_entitlement_school (school_id).
--   6. No backfill required — all tables are net-new. Existing rows are
--      unaffected (only fees / examination / timetable tables touched in
--      prior sprints).

-- ============================================================================
-- Section 1: notification_templates
-- ============================================================================
CREATE TABLE `notification_templates` (
  `id`                  CHAR(36)     NOT NULL,
  `school_id`           CHAR(36)     NOT NULL,
  `code`                VARCHAR(60)  NOT NULL,
  `name`                VARCHAR(160) NOT NULL,
  `description`         VARCHAR(500) NULL,
  `channel`             ENUM('EMAIL','SMS','WHATSAPP','IN_APP') NOT NULL,
  `category`            ENUM('ACADEMIC','ATTENDANCE','EXAMINATION','FEES','ADMISSIONS','STAFF','TIMETABLE','FINANCE','COMMUNICATION','SYSTEM') NOT NULL,
  `event_key`           VARCHAR(80)  NULL,
  `default_priority`    ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `locale`              CHAR(5)      NOT NULL DEFAULT 'en-IN',
  `is_active`           BOOLEAN      NOT NULL DEFAULT true,
  `active_version_no`   INTEGER      NOT NULL DEFAULT 1,
  `audience`            ENUM('USER','PARENT','STUDENT') NOT NULL DEFAULT 'USER',
  `variables_spec`      JSON         NULL,
  `created_at`          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`          CHAR(36)     NULL,
  `updated_by`          CHAR(36)     NULL,
  `deleted_at`          TIMESTAMP(3) NULL,
  `deleted_by`          CHAR(36)     NULL,
  `version`             INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_notification_template_school_channel_category` (`school_id`, `channel`, `category`),
  INDEX `ix_notification_template_school_event`            (`school_id`, `event_key`),
  INDEX `ix_notification_template_school_active`           (`school_id`, `is_active`),
  INDEX `ix_notification_template_deleted_at`              (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: notification_template_versions
-- ============================================================================
CREATE TABLE `notification_template_versions` (
  `id`                       CHAR(36)     NOT NULL,
  `school_id`                CHAR(36)     NOT NULL,
  `notification_template_id` CHAR(36)     NOT NULL,
  `version_no`               INTEGER      NOT NULL,
  `subject`                  VARCHAR(255) NULL,
  `body_text`                TEXT         NOT NULL,
  `body_html`                TEXT         NULL,
  `variables_snapshot`       JSON         NULL,
  `created_at`               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)     NULL,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE KEY `uq_notification_template_version` (`school_id`, `notification_template_id`, `version_no`),
  INDEX `ix_notification_template_version_school_template_no` (`school_id`, `notification_template_id`, `version_no`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: notification_messages
-- ============================================================================
CREATE TABLE `notification_messages` (
  `id`                       CHAR(36)     NOT NULL,
  `school_id`                CHAR(36)     NOT NULL,
  `message_no`               VARCHAR(40)  NULL,
  `recipient_user_id`        CHAR(36)     NOT NULL,
  `recipient_audience`       ENUM('USER','PARENT','STUDENT') NOT NULL DEFAULT 'USER',
  `recipient_address`        VARCHAR(255) NOT NULL,
  `channel`                  ENUM('EMAIL','SMS','WHATSAPP','IN_APP') NOT NULL,
  `category`                 ENUM('ACADEMIC','ATTENDANCE','EXAMINATION','FEES','ADMISSIONS','STAFF','TIMETABLE','FINANCE','COMMUNICATION','SYSTEM') NOT NULL,
  `priority`                 ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `notification_template_id` CHAR(36)     NULL,
  `template_version_no`      INTEGER      NULL,
  `event_key`                VARCHAR(80)  NULL,
  `aggregate_type`           VARCHAR(60)  NULL,
  `aggregate_id`             CHAR(36)     NULL,
  `subject_rendered`         VARCHAR(255) NULL,
  `body_rendered`            TEXT         NOT NULL,
  `data_payload`             JSON         NULL,
  `deep_link`                VARCHAR(500) NULL,
  `dedupe_key`               VARCHAR(120) NULL,
  `status`                   ENUM('QUEUED','SENDING','SENT','DELIVERED','FAILED','DEAD_LETTER','CANCELLED','READ') NOT NULL DEFAULT 'QUEUED',
  `scheduled_at`             TIMESTAMP(3) NULL,
  `sent_at`                  TIMESTAMP(3) NULL,
  `delivered_at`             TIMESTAMP(3) NULL,
  `read_at`                  TIMESTAMP(3) NULL,
  `failed_at`                TIMESTAMP(3) NULL,
  `last_error`               VARCHAR(500) NULL,
  `attempt_count`            INTEGER      NOT NULL DEFAULT 0,
  `max_attempts`             INTEGER      NOT NULL DEFAULT 5,
  `campaign_id`              CHAR(36)     NULL,
  `created_at`               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)     NULL,
  `updated_by`               CHAR(36)     NULL,
  `deleted_at`               TIMESTAMP(3) NULL,
  `deleted_by`               CHAR(36)     NULL,
  `version`                  INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_notification_message_school_recipient_channel_status`  (`school_id`, `recipient_user_id`, `channel`, `status`),
  INDEX `ix_notification_message_school_status_scheduled`          (`school_id`, `status`, `scheduled_at`),
  INDEX `ix_notification_message_school_channel_status_created`    (`school_id`, `channel`, `status`, `created_at`),
  INDEX `ix_notification_message_school_recipient_read`            (`school_id`, `recipient_user_id`, `read_at`),
  INDEX `ix_notification_message_school_dedupe`                    (`school_id`, `dedupe_key`),
  INDEX `ix_notification_message_school_campaign`                  (`school_id`, `campaign_id`),
  INDEX `ix_notification_message_deleted_at`                       (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: notification_message_events
-- ============================================================================
CREATE TABLE `notification_message_events` (
  `id`                      CHAR(36)     NOT NULL,
  `school_id`               CHAR(36)     NOT NULL,
  `notification_message_id` CHAR(36)     NOT NULL,
  `event_type`              VARCHAR(40)  NOT NULL,
  `occurred_at`             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `provider_code`           VARCHAR(40)  NULL,
  `provider_message_id`     VARCHAR(120) NULL,
  `error_code`              VARCHAR(80)  NULL,
  `error_message`           VARCHAR(500) NULL,
  `metadata`                JSON         NULL,
  `created_at`              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`              CHAR(36)     NULL,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_notification_message_event_school_message_occurred` (`school_id`, `notification_message_id`, `occurred_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: notification_user_preferences
-- ============================================================================
CREATE TABLE `notification_user_preferences` (
  `id`                   CHAR(36)     NOT NULL,
  `school_id`            CHAR(36)     NOT NULL,
  `user_id`              CHAR(36)     NOT NULL,
  `channel_email`        BOOLEAN      NOT NULL DEFAULT true,
  `channel_sms`          BOOLEAN      NOT NULL DEFAULT true,
  `channel_whatsapp`     BOOLEAN      NOT NULL DEFAULT true,
  `channel_in_app`       BOOLEAN      NOT NULL DEFAULT true,
  `category_opt_outs`    JSON         NULL,
  `quiet_hours_start`    VARCHAR(5)   NULL DEFAULT '21:00',
  `quiet_hours_end`      VARCHAR(5)   NULL DEFAULT '07:00',
  `quiet_hours_timezone` VARCHAR(40)  NULL DEFAULT 'Asia/Kolkata',
  `locale`               CHAR(5)      NOT NULL DEFAULT 'en-IN',
  `created_at`           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`           CHAR(36)     NULL,
  `updated_by`           CHAR(36)     NULL,
  `deleted_at`           TIMESTAMP(3) NULL,
  `deleted_by`           CHAR(36)     NULL,
  `version`              INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_notification_preference_school_user`  (`school_id`, `user_id`),
  INDEX `ix_notification_preference_deleted_at`   (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: notification_campaigns
-- ============================================================================
CREATE TABLE `notification_campaigns` (
  `id`                       CHAR(36)     NOT NULL,
  `school_id`                CHAR(36)     NOT NULL,
  `code`                     VARCHAR(40)  NULL,
  `name`                     VARCHAR(160) NOT NULL,
  `description`              VARCHAR(500) NULL,
  `channels`                 JSON         NOT NULL,
  `notification_template_id` CHAR(36)     NOT NULL,
  `target_type`              ENUM('SCHOOL','BRANCH','CLASS','SECTION') NOT NULL,
  `target_id`                CHAR(36)     NULL,
  `audience`                 ENUM('USER','PARENT','STUDENT') NOT NULL DEFAULT 'USER',
  `scheduled_at`             TIMESTAMP(3) NULL,
  `started_at`               TIMESTAMP(3) NULL,
  `completed_at`             TIMESTAMP(3) NULL,
  `cancelled_at`             TIMESTAMP(3) NULL,
  `status`                   ENUM('DRAFT','QUEUED','SENDING','COMPLETED','CANCELLED','FAILED') NOT NULL DEFAULT 'DRAFT',
  `recipient_count`          INTEGER      NOT NULL DEFAULT 0,
  `sent_count`               INTEGER      NOT NULL DEFAULT 0,
  `failed_count`             INTEGER      NOT NULL DEFAULT 0,
  `created_at`               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)     NULL,
  `updated_by`               CHAR(36)     NULL,
  `deleted_at`               TIMESTAMP(3) NULL,
  `deleted_by`               CHAR(36)     NULL,
  `version`                  INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_notification_campaign_school_status_scheduled` (`school_id`, `status`, `scheduled_at`),
  INDEX `ix_notification_campaign_school_template`         (`school_id`, `notification_template_id`),
  INDEX `ix_notification_campaign_school_target`           (`school_id`, `target_type`, `target_id`),
  INDEX `ix_notification_campaign_deleted_at`              (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: notification_campaign_recipients
-- ============================================================================
CREATE TABLE `notification_campaign_recipients` (
  `id`                        CHAR(36)     NOT NULL,
  `school_id`                 CHAR(36)     NOT NULL,
  `notification_campaign_id`  CHAR(36)     NOT NULL,
  `recipient_user_id`         CHAR(36)     NOT NULL,
  `recipient_audience`        ENUM('USER','PARENT','STUDENT') NOT NULL DEFAULT 'USER',
  `resolved_at`               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolution_reason`         VARCHAR(120) NULL,
  `skipped`                   BOOLEAN      NOT NULL DEFAULT false,
  `skip_reason`               VARCHAR(120) NULL,
  `created_at`                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`                CHAR(36)     NULL,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_notification_campaign_recipient_school_campaign` (`school_id`, `notification_campaign_id`),
  INDEX `ix_notification_campaign_recipient_school_user`     (`school_id`, `recipient_user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: school_communication_entitlements (singleton per school)
-- ============================================================================
CREATE TABLE `school_communication_entitlements` (
  `id`                         CHAR(36)     NOT NULL,
  `school_id`                  CHAR(36)     NOT NULL,
  `email_enabled`              BOOLEAN      NOT NULL DEFAULT true,
  `sms_enabled`                BOOLEAN      NOT NULL DEFAULT false,
  `whatsapp_enabled`           BOOLEAN      NOT NULL DEFAULT false,
  `in_app_enabled`             BOOLEAN      NOT NULL DEFAULT true,
  `email_monthly_limit`        INTEGER      NULL,
  `sms_monthly_limit`          INTEGER      NULL,
  `whatsapp_monthly_limit`     INTEGER      NULL,
  `email_used_this_period`     INTEGER      NOT NULL DEFAULT 0,
  `sms_used_this_period`       INTEGER      NOT NULL DEFAULT 0,
  `whatsapp_used_this_period`  INTEGER      NOT NULL DEFAULT 0,
  `usage_period_start`         DATE         NOT NULL,
  `usage_period_end`           DATE         NOT NULL,
  `is_trial`                   BOOLEAN      NOT NULL DEFAULT false,
  `trial_expires_at`           TIMESTAMP(3) NULL,
  `created_at`                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`                 CHAR(36)     NULL,
  `updated_by`                 CHAR(36)     NULL,
  `version`                    INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE KEY `uq_school_communication_entitlement_school` (`school_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 2: Composite (school_id, *_id) foreign keys.
-- All RESTRICT on UPDATE for tenant integrity. CASCADE on DELETE only for the
-- two APPEND_ONLY child tables (versions / events / recipients) so a hard
-- delete of the parent (operator-only path) cleans up history. Cross-aggregate
-- FKs (template ↔ message, campaign ↔ message, template ↔ campaign) RESTRICT
-- to force soft-delete or explicit purge.
-- ============================================================================
ALTER TABLE `notification_template_versions`
  ADD CONSTRAINT `fk_notification_template_version_template`
  FOREIGN KEY (`school_id`, `notification_template_id`)
  REFERENCES `notification_templates` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `notification_messages`
  ADD CONSTRAINT `fk_notification_message_template`
  FOREIGN KEY (`school_id`, `notification_template_id`)
  REFERENCES `notification_templates` (`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `notification_messages`
  ADD CONSTRAINT `fk_notification_message_campaign`
  FOREIGN KEY (`school_id`, `campaign_id`)
  REFERENCES `notification_campaigns` (`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `notification_message_events`
  ADD CONSTRAINT `fk_notification_message_event_message`
  FOREIGN KEY (`school_id`, `notification_message_id`)
  REFERENCES `notification_messages` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `notification_campaigns`
  ADD CONSTRAINT `fk_notification_campaign_template`
  FOREIGN KEY (`school_id`, `notification_template_id`)
  REFERENCES `notification_templates` (`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `notification_campaign_recipients`
  ADD CONSTRAINT `fk_notification_campaign_recipient_campaign`
  FOREIGN KEY (`school_id`, `notification_campaign_id`)
  REFERENCES `notification_campaigns` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- ============================================================================
-- Section 3 & 4: STORED `deleted_at_key` projections + partial-unique indexes
-- for the 4 soft-deleted tables. Format `'%Y%m%d%H%i%s.%f'` → '0' sentinel
-- mirrors Sprint 5-9 base migrations. Prisma cannot emit GENERATED ALWAYS AS.
-- ============================================================================
ALTER TABLE `notification_templates`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_notification_template_active`
  ON `notification_templates` (`school_id`, `channel`, `code`, `deleted_at_key`);

ALTER TABLE `notification_messages`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_notification_message_dedupe_active`
  ON `notification_messages` (`school_id`, `dedupe_key`, `deleted_at_key`);

ALTER TABLE `notification_user_preferences`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_notification_preference_user_active`
  ON `notification_user_preferences` (`school_id`, `user_id`, `deleted_at_key`);

ALTER TABLE `notification_campaigns`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_notification_campaign_code_active`
  ON `notification_campaigns` (`school_id`, `code`, `deleted_at_key`);
