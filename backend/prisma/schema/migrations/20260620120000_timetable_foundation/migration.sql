-- Sprint 7 — Timetable Foundation migration.
-- Hand-edited from `prisma migrate diff` output:
--   * Removed spurious DROPs of STORED generated columns previously added by
--     earlier migrations (`tenant_sequences.fiscal_year_key`,
--     `working_days_configuration.branch_key`,
--     `feature_flag_tenant_overrides.expires_at_key`,
--     `file_asset_acl_grants.revoked_key`,
--     `attendance_daily.deleted_at_key`,
--     `staff_attendance.deleted_at_key`,
--     `attendance_configurations.deleted_at_key`/`branch_id_key`).
--     Prisma's shadow-database diff cannot see these columns and tries to drop
--     them on every regeneration.
--   * Removed spurious re-adds of pre-existing FKs (`fk_promotion_target_year`,
--     `fk_ff_tenant_override_school`, `fk_ff_rollout_flag`,
--     `fk_staff_emp_history_staff`) — these already exist; the diff proposes
--     them again because the shadow DB simulation loses them when adjacent
--     STORED columns are removed.
--   * Appended STORED generated columns + partial unique indexes for active-row
--     uniqueness on `period_templates`, `timetable_versions`,
--     `timetable_entries`, `teacher_load`. Mirrors the established pattern.

-- ---------------------------------------------------------------------------
-- CreateTable: period_templates
-- ---------------------------------------------------------------------------
CREATE TABLE `period_templates` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `days_json` JSON NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_period_tpl_school_branch_year`(`school_id`, `branch_id`, `academic_year_id`),
    INDEX `ix_period_tpl_school_default`(`school_id`, `is_default`),
    INDEX `ix_period_tpl_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: period_template_periods
-- ---------------------------------------------------------------------------
CREATE TABLE `period_template_periods` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `period_template_id` CHAR(36) NOT NULL,
    `index` INTEGER NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `type` ENUM('TEACHING', 'BREAK', 'ASSEMBLY', 'LUNCH', 'OTHER') NOT NULL DEFAULT 'TEACHING',
    `start_time` TIME(0) NOT NULL,
    `end_time` TIME(0) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_period_tpl_period_tpl_type`(`school_id`, `period_template_id`, `type`),
    UNIQUE INDEX `uq_period_tpl_period_template_index`(`school_id`, `period_template_id`, `index`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: timetable_versions
-- ---------------------------------------------------------------------------
CREATE TABLE `timetable_versions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `period_template_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `activated_at` TIMESTAMP(3) NULL,
    `archived_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_tt_ver_school_branch_year_status`(`school_id`, `branch_id`, `academic_year_id`, `status`),
    INDEX `ix_tt_ver_school_effective_from`(`school_id`, `effective_from`),
    INDEX `ix_tt_ver_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: timetable_entries
-- ---------------------------------------------------------------------------
CREATE TABLE `timetable_entries` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `timetable_version_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `room_id` CHAR(36) NULL,
    `day_of_week` INTEGER NOT NULL,
    `period_index` INTEGER NOT NULL,
    `notes` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_tt_entry_ver_section_day_period`(`school_id`, `timetable_version_id`, `section_id`, `day_of_week`, `period_index`),
    INDEX `ix_tt_entry_ver_staff_day_period`(`school_id`, `timetable_version_id`, `staff_id`, `day_of_week`, `period_index`),
    INDEX `ix_tt_entry_ver_room_day_period`(`school_id`, `timetable_version_id`, `room_id`, `day_of_week`, `period_index`),
    INDEX `ix_tt_entry_school_section`(`school_id`, `section_id`),
    INDEX `ix_tt_entry_school_staff`(`school_id`, `staff_id`),
    INDEX `ix_tt_entry_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: teacher_load
-- ---------------------------------------------------------------------------
CREATE TABLE `teacher_load` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `timetable_version_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `periods_per_week` INTEGER NOT NULL DEFAULT 0,
    `max_consecutive` INTEGER NOT NULL DEFAULT 0,
    `daily_counts_json` JSON NOT NULL,
    `subject_mix_json` JSON NOT NULL,
    `computed_at` TIMESTAMP(3) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_teacher_load_school_version`(`school_id`, `timetable_version_id`),
    INDEX `ix_teacher_load_school_staff`(`school_id`, `staff_id`),
    INDEX `ix_teacher_load_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: teacher_availability
-- ---------------------------------------------------------------------------
CREATE TABLE `teacher_availability` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `kind` ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `period_index` INTEGER NULL,
    `reason` VARCHAR(255) NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_teacher_avail_school_staff_year_dow`(`school_id`, `staff_id`, `academic_year_id`, `day_of_week`),
    INDEX `ix_teacher_avail_school_staff_kind`(`school_id`, `staff_id`, `kind`),
    INDEX `ix_teacher_avail_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: timetable_conflicts (APPEND-ONLY)
-- ---------------------------------------------------------------------------
CREATE TABLE `timetable_conflicts` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `timetable_version_id` CHAR(36) NOT NULL,
    `type` ENUM('TEACHER_DOUBLE_BOOKED', 'ROOM_DOUBLE_BOOKED', 'SECTION_DOUBLE_BOOKED', 'TEACHER_NOT_QUALIFIED', 'ROOM_DISALLOWED_TYPE', 'PERIOD_OUT_OF_TEMPLATE', 'NON_WORKING_DAY', 'TEACHER_UNAVAILABLE') NOT NULL,
    `context_json` JSON NOT NULL,
    `entry_a_id` CHAR(36) NOT NULL,
    `entry_b_id` CHAR(36) NULL,
    `detected_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `detected_by` CHAR(36) NULL,

    INDEX `ix_tt_conflict_school_ver_detected`(`school_id`, `timetable_version_id`, `detected_at` DESC),
    INDEX `ix_tt_conflict_school_type_detected`(`school_id`, `type`, `detected_at` DESC),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: timetable_substitutions (SCAFFOLD; no service this sprint)
-- ---------------------------------------------------------------------------
CREATE TABLE `timetable_substitutions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `timetable_version_id` CHAR(36) NOT NULL,
    `original_entry_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `substitute_staff_id` CHAR(36) NULL,
    `reason` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED') NOT NULL DEFAULT 'PENDING',
    `decided_by` CHAR(36) NULL,
    `decided_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_tt_sub_school_date_status`(`school_id`, `date`, `status`),
    INDEX `ix_tt_sub_school_substitute_date`(`school_id`, `substitute_staff_id`, `date`),
    INDEX `ix_tt_sub_school_original_entry`(`school_id`, `original_entry_id`),
    INDEX `ix_tt_sub_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- ForeignKeys
-- ---------------------------------------------------------------------------
ALTER TABLE `period_templates` ADD CONSTRAINT `fk_period_tpl_branch`
  FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `period_templates` ADD CONSTRAINT `fk_period_tpl_year`
  FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `period_template_periods` ADD CONSTRAINT `fk_period_tpl_period_tpl`
  FOREIGN KEY (`school_id`, `period_template_id`) REFERENCES `period_templates`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `timetable_versions` ADD CONSTRAINT `fk_tt_ver_branch`
  FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_versions` ADD CONSTRAINT `fk_tt_ver_year`
  FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_versions` ADD CONSTRAINT `fk_tt_ver_tpl`
  FOREIGN KEY (`school_id`, `period_template_id`) REFERENCES `period_templates`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_tt_entry_version`
  FOREIGN KEY (`school_id`, `timetable_version_id`) REFERENCES `timetable_versions`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_tt_entry_section`
  FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_tt_entry_subject`
  FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_tt_entry_staff`
  FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_tt_entry_room`
  FOREIGN KEY (`school_id`, `room_id`) REFERENCES `rooms`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `teacher_load` ADD CONSTRAINT `fk_teacher_load_ver`
  FOREIGN KEY (`school_id`, `timetable_version_id`) REFERENCES `timetable_versions`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `teacher_load` ADD CONSTRAINT `fk_teacher_load_staff`
  FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `teacher_availability` ADD CONSTRAINT `fk_teacher_avail_staff`
  FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `teacher_availability` ADD CONSTRAINT `fk_teacher_avail_year`
  FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `timetable_conflicts` ADD CONSTRAINT `fk_tt_conflict_ver`
  FOREIGN KEY (`school_id`, `timetable_version_id`) REFERENCES `timetable_versions`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `timetable_substitutions` ADD CONSTRAINT `fk_tt_sub_ver`
  FOREIGN KEY (`school_id`, `timetable_version_id`) REFERENCES `timetable_versions`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `timetable_substitutions` ADD CONSTRAINT `fk_tt_sub_entry`
  FOREIGN KEY (`school_id`, `original_entry_id`) REFERENCES `timetable_entries`(`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `timetable_substitutions` ADD CONSTRAINT `fk_tt_sub_substitute_staff`
  FOREIGN KEY (`school_id`, `substitute_staff_id`) REFERENCES `staff`(`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- STORED generated columns + partial-unique indexes (NULL-collapse trick).
-- Prisma cannot emit STORED columns, so these are hand-added here.
-- ---------------------------------------------------------------------------

-- period_templates: one active template per (school, branch, year, name)
ALTER TABLE `period_templates`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_period_tpl_active`
  ON `period_templates` (`school_id`, `branch_id`, `academic_year_id`, `name`, `deleted_at_key`);

-- timetable_versions: only one ACTIVE version per (school, branch, year). The
-- STORED key collapses non-ACTIVE rows to '0' so soft-deleted/non-active rows
-- never collide with each other or with the live ACTIVE row.
ALTER TABLE `timetable_versions`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

ALTER TABLE `timetable_versions`
  ADD COLUMN `status_active_key` CHAR(1) GENERATED ALWAYS AS
    (CASE WHEN `status` = 'ACTIVE' THEN 'A' ELSE NULL END) STORED;

CREATE UNIQUE INDEX `uq_tt_ver_active_per_year`
  ON `timetable_versions` (`school_id`, `branch_id`, `academic_year_id`, `status_active_key`, `deleted_at_key`);

-- timetable_entries: one active entry per (version, section, day, period).
-- Teacher/room overlap is enforced at the service layer.
ALTER TABLE `timetable_entries`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_tt_entry_section_slot`
  ON `timetable_entries` (`school_id`, `timetable_version_id`, `section_id`, `day_of_week`, `period_index`, `deleted_at_key`);

-- teacher_load: one active load row per (version, staff).
ALTER TABLE `teacher_load`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_teacher_load_active`
  ON `teacher_load` (`school_id`, `timetable_version_id`, `staff_id`, `deleted_at_key`);
