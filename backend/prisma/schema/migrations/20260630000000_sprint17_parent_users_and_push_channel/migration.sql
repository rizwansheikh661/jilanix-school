-- Sprint 17 — Parent Foundation Enhancement migration.
-- Hand-crafted (Sprint 7-15 precedent): follows the conventions of
-- `20260628000000_subscription_foundation` (backticked identifiers,
-- composite (school_id, id) PK on tenant-owned tables, STORED
-- `deleted_at_key` for partial-unique on alive rows, '0' soft-delete
-- projection sentinel).
--
-- This migration adds:
--   1. ALTER `notification_user_preferences` — channel_push +
--      emergency_override columns (NOT NULL DEFAULT TRUE for both).
--   2. ALTER enum `NotificationChannel` on `notification_templates` and
--      `notification_messages` — adds 'PUSH'.
--   3. ALTER enum `ParentRelation` on `parent_student_links` — adds
--      'GRANDPARENT' and 'OTHER'. (No data migration; existing rows keep
--      their FATHER/MOTHER/GUARDIAN values.)
--   4. CREATE TABLE `parent_users` — Parent ↔ User junction with
--      lifecycle FSM (PENDING_INVITE → ACTIVE → SUSPENDED → ARCHIVED).
--      Composite PK (school_id, id), composite FKs into
--      `parents(school_id, id)` and `users(school_id, id)`, soft-delete
--      tail with STORED `deleted_at_key`. Partial-unique on
--      (school_id, user_id, deleted_at_key) enforces "one User → one
--      family". Strict-unique on (school_id, parent_id, user_id) prevents
--      duplicate links inside the same family (alive or not).

-- ============================================================================
-- Section 1: ALTER notification_user_preferences — Sprint 17 channels.
-- ============================================================================
ALTER TABLE `notification_user_preferences`
  ADD COLUMN `channel_push`       BOOLEAN NOT NULL DEFAULT TRUE AFTER `channel_in_app`,
  ADD COLUMN `emergency_override` BOOLEAN NOT NULL DEFAULT TRUE AFTER `channel_push`;

-- ============================================================================
-- Section 2: Extend NotificationChannel enum to include PUSH.
-- Affects every column declared NotificationChannel — Sprint 10 has two:
-- `notification_templates.channel` and `notification_messages.channel`.
-- ============================================================================
ALTER TABLE `notification_templates`
  MODIFY COLUMN `channel` ENUM('EMAIL','SMS','WHATSAPP','IN_APP','PUSH') NOT NULL;

ALTER TABLE `notification_messages`
  MODIFY COLUMN `channel` ENUM('EMAIL','SMS','WHATSAPP','IN_APP','PUSH') NOT NULL;

-- ============================================================================
-- Section 3: Extend ParentRelation enum to include GRANDPARENT and OTHER.
-- Affects every column declared ParentRelation — Sprint 3 has one:
-- `parent_student_links.relation`. The new `parent_users.relation` column
-- is created with the extended enum below (Section 4).
-- ============================================================================
ALTER TABLE `parent_student_links`
  MODIFY COLUMN `relation` ENUM('FATHER','MOTHER','GUARDIAN','GRANDPARENT','OTHER') NOT NULL;

-- ============================================================================
-- Section 4: CREATE TABLE parent_users (TENANT_OWNED, soft-delete).
-- Composite (school_id, id) PK. Composite FKs back to parents + users
-- preserve tenant scope at the DB layer (same pattern as parent_student_links).
-- STORED `deleted_at_key` projects deleted_at into a sortable sentinel so the
-- (school_id, user_id) uniqueness only applies to alive rows ("one User →
-- one family" — re-creating after archive is allowed). The strict-unique
-- on (school_id, parent_id, user_id) catches duplicate links into the same
-- family regardless of soft-delete state — re-inviting the same user into
-- the same family must reuse the existing row.
-- ============================================================================
CREATE TABLE `parent_users` (
  `id`             CHAR(36)                                                          NOT NULL,
  `school_id`      CHAR(36)                                                          NOT NULL,
  `parent_id`      CHAR(36)                                                          NOT NULL,
  `user_id`        CHAR(36)                                                          NOT NULL,
  `relation`       ENUM('FATHER','MOTHER','GUARDIAN','GRANDPARENT','OTHER')          NOT NULL,
  `status`         ENUM('PENDING_INVITE','ACTIVE','SUSPENDED','ARCHIVED')            NOT NULL DEFAULT 'PENDING_INVITE',
  `invited_at`     TIMESTAMP(3)                                                      NULL,
  `activated_at`   TIMESTAMP(3)                                                      NULL,
  `suspended_at`   TIMESTAMP(3)                                                      NULL,
  `archived_at`    TIMESTAMP(3)                                                      NULL,
  `last_invite_at` TIMESTAMP(3)                                                      NULL,
  `created_at`     TIMESTAMP(3)                                                      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     TIMESTAMP(3)                                                      NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`     CHAR(36)                                                          NULL,
  `updated_by`     CHAR(36)                                                          NULL,
  `deleted_at`     TIMESTAMP(3)                                                      NULL,
  `deleted_by`     CHAR(36)                                                          NULL,
  `version`        INTEGER                                                           NOT NULL DEFAULT 1,
  `deleted_at_key` CHAR(26) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE INDEX `uq_parent_user_alive`        (`school_id`, `user_id`, `deleted_at_key`),
  UNIQUE INDEX `uq_parent_user_parent_user`  (`school_id`, `parent_id`, `user_id`),
  INDEX `ix_parent_user_user`                (`school_id`, `user_id`),
  INDEX `ix_parent_user_parent`              (`school_id`, `parent_id`),
  INDEX `ix_parent_user_deleted_at`          (`deleted_at`),
  CONSTRAINT `fk_parent_users_parent`
    FOREIGN KEY (`school_id`, `parent_id`)
    REFERENCES `parents` (`school_id`, `id`)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_parent_users_user`
    FOREIGN KEY (`school_id`, `user_id`)
    REFERENCES `users` (`school_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
