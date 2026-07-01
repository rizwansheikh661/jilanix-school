-- Sprint 6 — Attendance Foundation migration.
-- Hand-edited from `prisma migrate diff` output:
--   * Removed spurious DROPs of STORED generated columns previously added
--     by hand-edits in migrations 20260618094700, 20260618190619, 20260619054441
--     (`tenant_sequences.fiscal_year_key`, `working_days_configuration.branch_key`,
--     `feature_flag_tenant_overrides.expires_at_key`, `file_asset_acl_grants.revoked_key`).
--     Prisma's shadow-database diff cannot see these columns and tries to drop them
--     on every regeneration.
--   * Removed spurious re-adds of `fk_branch_settings_branch` / `fk_wdc_branch`
--     (already created in 20260618190619_school_management_foundation; the diff
--      proposes them again because the shadow DB simulation loses them when the
--      adjacent STORED columns are removed).
--   * Appended STORED generated columns + partial unique indexes for active-row
--     uniqueness on `attendance_daily`, `staff_attendance`, `attendance_configurations`.
--     Mirrors the `tenant_sequences.fiscal_year_key` + `working_days_configuration.branch_key`
--     pattern.

-- ---------------------------------------------------------------------------
-- CreateTable: attendance_daily
-- ---------------------------------------------------------------------------
CREATE TABLE `attendance_daily` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NOT NULL,
    `source` ENUM('MANUAL', 'BIOMETRIC', 'RFID', 'FACE_RECOGNITION', 'MOBILE_APP') NOT NULL DEFAULT 'MANUAL',
    `marked_at` TIMESTAMP(3) NOT NULL,
    `marked_by` CHAR(36) NULL,
    `check_in_time` TIMESTAMP(3) NULL,
    `check_out_time` TIMESTAMP(3) NULL,
    `remarks` VARCHAR(500) NULL,
    `mode` ENUM('DAILY', 'PERIOD') NOT NULL DEFAULT 'DAILY',
    `period_number` INTEGER NULL,
    `subject_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_att_daily_school_section_date`(`school_id`, `section_id`, `date`),
    INDEX `ix_att_daily_school_date_status`(`school_id`, `date`, `status`),
    INDEX `ix_att_daily_school_student_date`(`school_id`, `student_id`, `date` DESC),
    INDEX `ix_att_daily_school_branch_date`(`school_id`, `branch_id`, `date`),
    INDEX `ix_att_daily_school_year`(`school_id`, `academic_year_id`),
    INDEX `ix_att_daily_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: staff_attendance
-- ---------------------------------------------------------------------------
CREATE TABLE `staff_attendance` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `staff_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NOT NULL,
    `source` ENUM('MANUAL', 'BIOMETRIC', 'RFID', 'FACE_RECOGNITION', 'MOBILE_APP') NOT NULL DEFAULT 'MANUAL',
    `marked_at` TIMESTAMP(3) NOT NULL,
    `marked_by` CHAR(36) NULL,
    `check_in_time` TIMESTAMP(3) NULL,
    `check_out_time` TIMESTAMP(3) NULL,
    `remarks` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_staff_att_school_staff_date`(`school_id`, `staff_id`, `date` DESC),
    INDEX `ix_staff_att_school_date_status`(`school_id`, `date`, `status`),
    INDEX `ix_staff_att_school_branch_date`(`school_id`, `branch_id`, `date`),
    INDEX `ix_staff_att_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: attendance_lock_windows
-- ---------------------------------------------------------------------------
CREATE TABLE `attendance_lock_windows` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `scope` ENUM('SCHOOL', 'BRANCH', 'SECTION') NOT NULL,
    `branch_id` CHAR(36) NULL,
    `section_id` CHAR(36) NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `reason` VARCHAR(255) NULL,
    `locked_by` CHAR(36) NULL,
    `locked_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_att_lock_school_branch_range`(`school_id`, `branch_id`, `start_date`, `end_date`),
    INDEX `ix_att_lock_school_section_range`(`school_id`, `section_id`, `start_date`, `end_date`),
    INDEX `ix_att_lock_school_scope_range`(`school_id`, `scope`, `start_date`, `end_date`),
    INDEX `ix_att_lock_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: attendance_corrections
-- ---------------------------------------------------------------------------
CREATE TABLE `attendance_corrections` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `attendance_daily_id` CHAR(36) NOT NULL,
    `requested_by` CHAR(36) NOT NULL,
    `requested_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `previous_status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NOT NULL,
    `new_status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `supporting_file_id` CHAR(36) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `decided_by` CHAR(36) NULL,
    `decided_at` TIMESTAMP(3) NULL,
    `decision_reason` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_att_correction_school_status_requested`(`school_id`, `status`, `requested_at` DESC),
    INDEX `ix_att_correction_school_daily`(`school_id`, `attendance_daily_id`),
    INDEX `ix_att_correction_school_requester`(`school_id`, `requested_by`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: attendance_status_history (APPEND-ONLY)
-- ---------------------------------------------------------------------------
CREATE TABLE `attendance_status_history` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `attendance_daily_id` CHAR(36) NOT NULL,
    `previous_status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NULL,
    `new_status` ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY') NOT NULL,
    `change_type` ENUM('MARKED', 'EDITED', 'CORRECTED', 'SYSTEM') NOT NULL,
    `changed_by` CHAR(36) NULL,
    `changed_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` VARCHAR(255) NULL,
    `correction_id` CHAR(36) NULL,

    INDEX `ix_att_history_school_daily_changed`(`school_id`, `attendance_daily_id`, `changed_at` DESC),
    INDEX `ix_att_history_school_changed`(`school_id`, `changed_at` DESC),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: attendance_configurations
-- ---------------------------------------------------------------------------
CREATE TABLE `attendance_configurations` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `edit_window_hours` INTEGER NOT NULL DEFAULT 24,
    `late_threshold_minutes` INTEGER NOT NULL DEFAULT 15,
    `corrections_require_approval` BOOLEAN NOT NULL DEFAULT true,
    `allowed_sources` JSON NOT NULL,
    `holiday_auto_mark` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_att_config_school_branch`(`school_id`, `branch_id`),
    INDEX `ix_att_config_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- ForeignKeys
-- ---------------------------------------------------------------------------
ALTER TABLE `attendance_daily` ADD CONSTRAINT `fk_att_daily_year`
  FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `attendance_daily` ADD CONSTRAINT `fk_att_daily_section`
  FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `attendance_daily` ADD CONSTRAINT `fk_att_daily_student`
  FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `attendance_daily` ADD CONSTRAINT `fk_att_daily_branch`
  FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `staff_attendance` ADD CONSTRAINT `fk_staff_att_staff`
  FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `staff_attendance` ADD CONSTRAINT `fk_staff_att_branch`
  FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `attendance_lock_windows` ADD CONSTRAINT `fk_att_lock_branch`
  FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `attendance_lock_windows` ADD CONSTRAINT `fk_att_lock_section`
  FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `attendance_corrections` ADD CONSTRAINT `fk_att_correction_daily`
  FOREIGN KEY (`school_id`, `attendance_daily_id`) REFERENCES `attendance_daily`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `attendance_status_history` ADD CONSTRAINT `fk_att_history_daily`
  FOREIGN KEY (`school_id`, `attendance_daily_id`) REFERENCES `attendance_daily`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `attendance_configurations` ADD CONSTRAINT `fk_att_config_branch`
  FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- STORED generated columns + partial-unique indexes (NULL-collapse trick).
-- Mirrors `tenant_sequences.fiscal_year_key` + `working_days_configuration.branch_key`
-- (see 20260618094700 / 20260618190619). Prisma cannot emit STORED columns,
-- so these are hand-added here.
--
-- Semantics: a STORED column derived from `deleted_at` (or `branch_id`) gives
-- a deterministic value for NULL, allowing a UNIQUE index to enforce
-- "active row" uniqueness without forbidding duplicate soft-deleted rows.
-- ---------------------------------------------------------------------------

-- attendance_daily: one active row per (school, student, date)
ALTER TABLE `attendance_daily`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_att_daily_active`
  ON `attendance_daily` (`school_id`, `student_id`, `date`, `deleted_at_key`);

-- staff_attendance: one active row per (school, staff, date)
ALTER TABLE `staff_attendance`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_staff_att_active`
  ON `staff_attendance` (`school_id`, `staff_id`, `date`, `deleted_at_key`);

-- attendance_configurations: one active row per (school, branch) with NULL branch
-- collapsing to '__none__' so the school-default row is unique too.
ALTER TABLE `attendance_configurations`
  ADD COLUMN `branch_id_key` CHAR(36) GENERATED ALWAYS AS
    (COALESCE(`branch_id`, '__none__')) STORED;

ALTER TABLE `attendance_configurations`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_att_config_active`
  ON `attendance_configurations` (`school_id`, `branch_id_key`, `deleted_at_key`);
