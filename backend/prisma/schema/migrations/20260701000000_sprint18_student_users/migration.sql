-- Sprint 18 — Student Foundation Enhancement migration.
-- Hand-crafted (Sprint 7-17 precedent): mirrors the conventions of
-- `20260630000000_sprint17_parent_users_and_push_channel` (backticked
-- identifiers, composite (school_id, id) PK on tenant-owned tables,
-- STORED `deleted_at_key` for partial-unique on alive rows, '0' soft-delete
-- projection sentinel).
--
-- This migration adds a single new table:
--   1. CREATE TABLE `student_users` — Student ↔ User junction with
--      lifecycle FSM (PENDING_INVITE → ACTIVE → SUSPENDED → ARCHIVED).
--      Composite PK (school_id, id), composite FKs into
--      `students(school_id, id)` and `users(school_id, id)`, soft-delete
--      tail with STORED `deleted_at_key`. Strict 1:1 cardinality is
--      enforced in BOTH directions by two partial-unique indexes on
--      (school_id, *, deleted_at_key) — one alive User per Student AND
--      one alive Student per User. Strict-unique on (school_id, student_id,
--      user_id) prevents re-creating duplicate links inside the same
--      student-user pair regardless of soft-delete state.
--
-- No schema change needed for the notifications module — Sprint 17 already
-- added PUSH, channel_push, emergency_override, and the STUDENT audience.

-- ============================================================================
-- Section 1: CREATE TABLE student_users (TENANT_OWNED, soft-delete).
-- Composite (school_id, id) PK. Composite FKs back to students + users
-- preserve tenant scope at the DB layer (same pattern as parent_users).
-- STORED `deleted_at_key` projects deleted_at into a sortable sentinel.
-- Both partial-uniques use deleted_at_key so re-creating after archive is
-- allowed; the strict-unique on (school_id, student_id, user_id) catches
-- duplicates regardless of soft-delete state.
-- ============================================================================
CREATE TABLE `student_users` (
  `id`             CHAR(36)                                                NOT NULL,
  `school_id`      CHAR(36)                                                NOT NULL,
  `student_id`     CHAR(36)                                                NOT NULL,
  `user_id`        CHAR(36)                                                NOT NULL,
  `status`         ENUM('PENDING_INVITE','ACTIVE','SUSPENDED','ARCHIVED')  NOT NULL DEFAULT 'PENDING_INVITE',
  `invited_at`     TIMESTAMP(3)                                            NULL,
  `activated_at`   TIMESTAMP(3)                                            NULL,
  `suspended_at`   TIMESTAMP(3)                                            NULL,
  `archived_at`    TIMESTAMP(3)                                            NULL,
  `last_invite_at` TIMESTAMP(3)                                            NULL,
  `created_at`     TIMESTAMP(3)                                            NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     TIMESTAMP(3)                                            NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`     CHAR(36)                                                NULL,
  `updated_by`     CHAR(36)                                                NULL,
  `deleted_at`     TIMESTAMP(3)                                            NULL,
  `deleted_by`     CHAR(36)                                                NULL,
  `version`        INTEGER                                                 NOT NULL DEFAULT 1,
  `deleted_at_key` CHAR(26) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED,
  PRIMARY KEY (`school_id`, `id`),
  UNIQUE INDEX `uq_student_user_alive_user`     (`school_id`, `user_id`, `deleted_at_key`),
  UNIQUE INDEX `uq_student_user_alive_student`  (`school_id`, `student_id`, `deleted_at_key`),
  UNIQUE INDEX `uq_student_user_student_user`   (`school_id`, `student_id`, `user_id`),
  INDEX `ix_student_user_user`                  (`school_id`, `user_id`),
  INDEX `ix_student_user_student`               (`school_id`, `student_id`),
  INDEX `ix_student_user_deleted_at`            (`deleted_at`),
  CONSTRAINT `fk_student_users_student`
    FOREIGN KEY (`school_id`, `student_id`)
    REFERENCES `students` (`school_id`, `id`)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_student_users_user`
    FOREIGN KEY (`school_id`, `user_id`)
    REFERENCES `users` (`school_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
