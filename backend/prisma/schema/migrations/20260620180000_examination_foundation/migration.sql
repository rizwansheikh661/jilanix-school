-- Sprint 8 — Examination Foundation migration.
-- Hand-edited from `prisma migrate diff` output:
--   * Removed spurious DROPs of STORED generated columns previously added by
--     earlier migrations (tenant_sequences.fiscal_year_key,
--     working_days_configuration.branch_key,
--     feature_flag_tenant_overrides.expires_at_key,
--     file_asset_acl_grants.revoked_key, attendance_*.deleted_at_key,
--     period_templates.deleted_at_key, staff_attendance.deleted_at_key,
--     teacher_load.deleted_at_key, timetable_entries.deleted_at_key,
--     timetable_versions.deleted_at_key/status_active_key).
--     Prisma's shadow-DB diff cannot see these columns and tries to drop them
--     on every regeneration.
--   * Removed spurious re-adds of pre-existing FKs unrelated to this sprint
--     (academic_year_promotions, user_login_events, school_documents,
--     staff_subject_qualifications, staff_section_assignments,
--     attendance_daily, feature_flag_tenant_overrides, period_templates,
--     staff_attendance, teacher_load, timetable_entries, timetable_versions,
--     file_asset_acl_grants).
--   * Removed duplicate AddForeignKey lines emitted by the diff (`fk_exam_scheme`,
--     `fk_exam_class_map_exam`, `fk_exam_result_exam` each appeared twice).
--   * Appended STORED `deleted_at_key` columns + partial-unique indexes for
--     active-row uniqueness on exam_schemes, exams, exam_schedules,
--     exam_marks, exam_results, exam_subject_results. Prisma cannot emit
--     STORED columns, so these are hand-added here. Pattern mirrors Sprints 5-7.

-- ---------------------------------------------------------------------------
-- CreateTable: exam_schemes
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_schemes` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `board_type` VARCHAR(60) NULL,
    `passing_pct` DECIMAL(5, 2) NOT NULL DEFAULT 33.00,
    `marks_edit_window_days` INTEGER NOT NULL DEFAULT 14,
    `description` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_scheme_school_name`(`school_id`, `name`),
    INDEX `ix_exam_scheme_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_scheme_bands
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_scheme_bands` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_scheme_id` CHAR(36) NOT NULL,
    `grade_letter` VARCHAR(8) NOT NULL,
    `grade_point` DECIMAL(4, 2) NULL,
    `min_pct` DECIMAL(5, 2) NOT NULL,
    `max_pct` DECIMAL(5, 2) NOT NULL,
    `ordering` INTEGER NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_scheme_band_school_scheme`(`school_id`, `exam_scheme_id`),
    UNIQUE INDEX `uq_exam_scheme_band_ordering`(`school_id`, `exam_scheme_id`, `ordering`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exams
-- ---------------------------------------------------------------------------
CREATE TABLE `exams` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `academic_term_id` CHAR(36) NULL,
    `exam_scheme_id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `type` ENUM('UNIT_TEST', 'MONTHLY_TEST', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'PRE_BOARD', 'OTHER') NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `default_max_marks` DECIMAL(6, 2) NOT NULL DEFAULT 100.00,
    `default_pass_marks` DECIMAL(6, 2) NOT NULL DEFAULT 33.00,
    `description` VARCHAR(500) NULL,
    `published_at` TIMESTAMP(3) NULL,
    `archived_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_school_year_type`(`school_id`, `academic_year_id`, `type`),
    INDEX `ix_exam_school_status`(`school_id`, `status`),
    INDEX `ix_exam_school_start_date`(`school_id`, `start_date`),
    INDEX `ix_exam_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_class_maps
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_class_maps` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_class_map_school_class`(`school_id`, `class_id`),
    UNIQUE INDEX `uq_exam_class_map_exam_class`(`school_id`, `exam_id`, `class_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_section_maps
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_section_maps` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_section_map_school_section`(`school_id`, `section_id`),
    UNIQUE INDEX `uq_exam_section_map_exam_section`(`school_id`, `exam_id`, `section_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_schedules` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `room_id` CHAR(36) NULL,
    `invigilator_staff_id` CHAR(36) NULL,
    `date` DATE NOT NULL,
    `start_time` TIME(0) NOT NULL,
    `end_time` TIME(0) NOT NULL,
    `max_marks` DECIMAL(6, 2) NOT NULL DEFAULT 100.00,
    `pass_marks` DECIMAL(6, 2) NOT NULL DEFAULT 33.00,
    `instructions` VARCHAR(1000) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_schedule_school_exam`(`school_id`, `exam_id`),
    INDEX `ix_exam_schedule_school_exam_date`(`school_id`, `exam_id`, `date`),
    INDEX `ix_exam_schedule_school_section_date`(`school_id`, `section_id`, `date`),
    INDEX `ix_exam_schedule_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_marks
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_marks` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `marks_obtained` DECIMAL(6, 2) NULL,
    `is_absent` BOOLEAN NOT NULL DEFAULT false,
    `remarks` VARCHAR(500) NULL,
    `entered_at` TIMESTAMP(3) NOT NULL,
    `entered_by` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_marks_school_exam_section_subject`(`school_id`, `exam_id`, `section_id`, `subject_id`),
    INDEX `ix_exam_marks_school_student`(`school_id`, `student_id`),
    INDEX `ix_exam_marks_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_marks_edit_history (APPEND_ONLY)
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_marks_edit_history` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_marks_id` CHAR(36) NOT NULL,
    `previous_marks` DECIMAL(6, 2) NULL,
    `new_marks` DECIMAL(6, 2) NULL,
    `previous_is_absent` BOOLEAN NOT NULL,
    `new_is_absent` BOOLEAN NOT NULL,
    `change_type` ENUM('ENTERED', 'EDITED', 'DELETED', 'RESTORED', 'RECOMPUTED', 'CORRECTED') NOT NULL,
    `changed_by` CHAR(36) NULL,
    `changed_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` VARCHAR(255) NULL,

    INDEX `ix_exam_marks_history_school_marks_changed`(`school_id`, `exam_marks_id`, `changed_at` DESC),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_results
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_results` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `total_marks_obtained` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `total_max_marks` DECIMAL(8, 2) NOT NULL DEFAULT 0.00,
    `percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `grade_letter` VARCHAR(8) NULL,
    `grade_point` DECIMAL(4, 2) NULL,
    `status` ENUM('PENDING', 'COMPUTED', 'PUBLISHED') NOT NULL DEFAULT 'COMPUTED',
    `is_passed` BOOLEAN NOT NULL DEFAULT false,
    `computed_at` TIMESTAMP(3) NOT NULL,
    `computed_by` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_result_school_exam_section`(`school_id`, `exam_id`, `section_id`),
    INDEX `ix_exam_result_school_student`(`school_id`, `student_id`),
    INDEX `ix_exam_result_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: exam_subject_results
-- ---------------------------------------------------------------------------
CREATE TABLE `exam_subject_results` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `exam_result_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `marks_obtained` DECIMAL(6, 2) NULL,
    `max_marks` DECIMAL(6, 2) NOT NULL DEFAULT 100.00,
    `percentage` DECIMAL(5, 2) NULL,
    `is_absent` BOOLEAN NOT NULL DEFAULT false,
    `is_passed` BOOLEAN NOT NULL DEFAULT false,
    `grade_letter` VARCHAR(8) NULL,
    `grade_point` DECIMAL(4, 2) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_exam_subject_result_school_result`(`school_id`, `exam_result_id`),
    INDEX `ix_exam_subject_result_school_subject`(`school_id`, `subject_id`),
    INDEX `ix_exam_subject_result_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Foreign keys (examination scope only)
-- ---------------------------------------------------------------------------
ALTER TABLE `exam_scheme_bands` ADD CONSTRAINT `fk_exam_scheme_band_scheme` FOREIGN KEY (`school_id`, `exam_scheme_id`) REFERENCES `exam_schemes`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `exams` ADD CONSTRAINT `fk_exam_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exams` ADD CONSTRAINT `fk_exam_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exams` ADD CONSTRAINT `fk_exam_term` FOREIGN KEY (`school_id`, `academic_term_id`) REFERENCES `academic_terms`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exams` ADD CONSTRAINT `fk_exam_scheme` FOREIGN KEY (`school_id`, `exam_scheme_id`) REFERENCES `exam_schemes`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exam_class_maps` ADD CONSTRAINT `fk_exam_class_map_exam` FOREIGN KEY (`school_id`, `exam_id`) REFERENCES `exams`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `exam_class_maps` ADD CONSTRAINT `fk_exam_class_map_class` FOREIGN KEY (`school_id`, `class_id`) REFERENCES `classes`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exam_section_maps` ADD CONSTRAINT `fk_exam_section_map_exam` FOREIGN KEY (`school_id`, `exam_id`) REFERENCES `exams`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `exam_section_maps` ADD CONSTRAINT `fk_exam_section_map_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exam_schedules` ADD CONSTRAINT `fk_exam_schedule_exam` FOREIGN KEY (`school_id`, `exam_id`) REFERENCES `exams`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `exam_schedules` ADD CONSTRAINT `fk_exam_schedule_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exam_schedules` ADD CONSTRAINT `fk_exam_schedule_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exam_schedules` ADD CONSTRAINT `fk_exam_schedule_room` FOREIGN KEY (`school_id`, `room_id`) REFERENCES `rooms`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exam_schedules` ADD CONSTRAINT `fk_exam_schedule_invigilator` FOREIGN KEY (`school_id`, `invigilator_staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exam_marks` ADD CONSTRAINT `fk_exam_marks_exam` FOREIGN KEY (`school_id`, `exam_id`) REFERENCES `exams`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `exam_marks` ADD CONSTRAINT `fk_exam_marks_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exam_marks` ADD CONSTRAINT `fk_exam_marks_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exam_marks` ADD CONSTRAINT `fk_exam_marks_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exam_marks_edit_history` ADD CONSTRAINT `fk_exam_marks_history_marks` FOREIGN KEY (`school_id`, `exam_marks_id`) REFERENCES `exam_marks`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `exam_results` ADD CONSTRAINT `fk_exam_result_exam` FOREIGN KEY (`school_id`, `exam_id`) REFERENCES `exams`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `exam_results` ADD CONSTRAINT `fk_exam_result_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `exam_results` ADD CONSTRAINT `fk_exam_result_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exam_subject_results` ADD CONSTRAINT `fk_exam_subject_result_result` FOREIGN KEY (`school_id`, `exam_result_id`) REFERENCES `exam_results`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `exam_subject_results` ADD CONSTRAINT `fk_exam_subject_result_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- STORED `deleted_at_key` + partial-unique indexes (NULL-collapse pattern).
-- Prisma cannot emit STORED columns; hand-added per SPRINT_8_REPORT.md.
-- ---------------------------------------------------------------------------

ALTER TABLE `exam_schemes`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_exam_scheme_active`
  ON `exam_schemes` (`school_id`, `name`, `deleted_at_key`);

ALTER TABLE `exams`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_exam_active`
  ON `exams` (`school_id`, `academic_year_id`, `name`, `deleted_at_key`);

ALTER TABLE `exam_schedules`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_exam_schedule_slot`
  ON `exam_schedules` (`school_id`, `exam_id`, `subject_id`, `section_id`, `deleted_at_key`);

ALTER TABLE `exam_marks`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_exam_marks_active`
  ON `exam_marks` (`school_id`, `exam_id`, `student_id`, `subject_id`, `deleted_at_key`);

ALTER TABLE `exam_results`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_exam_result_active`
  ON `exam_results` (`school_id`, `exam_id`, `student_id`, `deleted_at_key`);

ALTER TABLE `exam_subject_results`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_exam_subject_result_active`
  ON `exam_subject_results` (`school_id`, `exam_result_id`, `subject_id`, `deleted_at_key`);
