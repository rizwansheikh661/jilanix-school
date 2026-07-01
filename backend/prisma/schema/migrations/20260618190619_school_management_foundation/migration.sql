/*
  Sprint 4.5 — School Management Foundation.

  HAND-EDITED. Two changes vs `prisma migrate dev` output:

  1) Removed the auto-generated DROP COLUMN / DROP INDEX for
     `tenant_sequences.fiscal_year_key`. That column is a MySQL STORED
     computed column added by hand in migration
     `20260618094700_tenant_sequence_fiscal_year_key`. Prisma's
     introspection does not see it, so `migrate dev` proposes to drop it.
     Removing those statements preserves the existing column + unique.

  2) Appended `working_days_configuration.branch_key` MySQL STORED
     computed column + a composite unique on
     (school_id, branch_key, day_of_week, effective_from) — needed
     because Prisma cannot emit GENERATED columns. The sentinel
     `'__none__'` (padded to CHAR(36) by MySQL) lets the nullable
     `branch_id` participate in the unique without collisions.
*/

-- AlterTable
ALTER TABLE `staff` ADD COLUMN `department_id` CHAR(36) NULL,
    ADD COLUMN `designation_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `students` ADD COLUMN `house_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `branches` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `parent_branch_id` CHAR(36) NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `address_line1` VARCHAR(255) NULL,
    `address_line2` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state_code` VARCHAR(10) NULL,
    `pincode` VARCHAR(10) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(255) NULL,
    `established_date` DATE NULL,
    `manager_staff_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_branch_school_status`(`school_id`, `status`),
    INDEX `ix_branch_school_primary`(`school_id`, `is_primary`),
    INDEX `ix_branch_school_parent`(`school_id`, `parent_branch_id`),
    UNIQUE INDEX `uq_branch_school_code`(`school_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branch_settings` (
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NOT NULL,
    `working_days_json` JSON NULL,
    `period_settings_json` JSON NULL,
    `attendance_window_override_hours` INTEGER NULL,
    `primary_language` VARCHAR(40) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`school_id`, `branch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `working_days_configuration` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `day_of_week` INTEGER NOT NULL,
    `is_working` BOOLEAN NOT NULL,
    `session_type` ENUM('FULL', 'HALF', 'ALTERNATE_SAT', 'FIRST_THIRD_SAT', 'SECOND_FOURTH_SAT') NOT NULL DEFAULT 'FULL',
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `note` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_wdc_school_branch_dow`(`school_id`, `branch_id`, `day_of_week`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_events` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `academic_year_id` CHAR(36) NULL,
    `type` ENUM('EVENT', 'PTM', 'EXAM_WINDOW', 'TERM_START', 'TERM_END', 'OTHER') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `all_day` BOOLEAN NOT NULL DEFAULT true,
    `start_time` TIME(0) NULL,
    `end_time` TIME(0) NULL,
    `audience_json` JSON NULL,
    `color_hex` CHAR(7) NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT false,
    `recurrence_rule` VARCHAR(200) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_calendar_event_school_branch_start`(`school_id`, `branch_id`, `start_date`),
    INDEX `ix_calendar_event_school_type_start`(`school_id`, `type`, `start_date`),
    INDEX `ix_calendar_event_school_year`(`school_id`, `academic_year_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `name` VARCHAR(120) NOT NULL,
    `date` DATE NOT NULL,
    `type` ENUM('NATIONAL', 'STATE', 'SCHOOL', 'RELIGIOUS', 'OPTIONAL') NOT NULL,
    `is_full_day` BOOLEAN NOT NULL DEFAULT true,
    `half_day_session` ENUM('FIRST_HALF', 'SECOND_HALF') NULL,
    `attendance_treatment` ENUM('HOLIDAY', 'WORKING_DAY') NOT NULL DEFAULT 'HOLIDAY',
    `notes` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_holiday_school_branch_date`(`school_id`, `branch_id`, `date`),
    INDEX `ix_holiday_school_date_type`(`school_id`, `date`, `type`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `houses` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color_hex` CHAR(7) NOT NULL,
    `motto` VARCHAR(255) NULL,
    `captain_student_id` CHAR(36) NULL,
    `vice_captain_student_id` CHAR(36) NULL,
    `photo_url` VARCHAR(1000) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_house_school_sort`(`school_id`, `sort_order`),
    UNIQUE INDEX `uq_house_school_code`(`school_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `house_assignments` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `house_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `assigned_on` DATE NOT NULL,
    `ended_on` DATE NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,
    `updated_at` TIMESTAMP(3) NOT NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_house_assignment_school_house_year`(`school_id`, `house_id`, `academic_year_id`),
    INDEX `ix_house_assignment_school_student`(`school_id`, `student_id`),
    UNIQUE INDEX `uq_house_assignment_year_student_assigned`(`school_id`, `academic_year_id`, `student_id`, `assigned_on`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `parent_department_id` CHAR(36) NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('ACADEMIC', 'ADMIN', 'SUPPORT', 'FINANCE', 'HR', 'IT') NOT NULL,
    `description` VARCHAR(500) NULL,
    `head_staff_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_department_school_branch`(`school_id`, `branch_id`),
    INDEX `ix_department_school_parent`(`school_id`, `parent_department_id`),
    INDEX `ix_department_school_type`(`school_id`, `type`),
    UNIQUE INDEX `uq_department_school_code`(`school_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `designations` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `rank` INTEGER NOT NULL,
    `is_teaching` BOOLEAN NOT NULL DEFAULT false,
    `is_management` BOOLEAN NOT NULL DEFAULT false,
    `description` VARCHAR(500) NULL,
    `reports_to_designation_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_designation_school_rank`(`school_id`, `rank`),
    INDEX `ix_designation_school_teaching`(`school_id`, `is_teaching`),
    UNIQUE INDEX `uq_designation_school_code`(`school_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_types` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `default_capacity` INTEGER NULL,
    `allows_exam` BOOLEAN NOT NULL DEFAULT false,
    `allows_timetable` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `uq_room_type_school_code`(`school_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NOT NULL,
    `room_type_id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `floor` VARCHAR(20) NULL,
    `block` VARCHAR(40) NULL,
    `status` ENUM('ACTIVE', 'UNDER_MAINTENANCE', 'RETIRED') NOT NULL DEFAULT 'ACTIVE',
    `notes` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_room_school_branch_type`(`school_id`, `branch_id`, `room_type_id`),
    INDEX `ix_room_school_status`(`school_id`, `status`),
    UNIQUE INDEX `uq_room_school_branch_code`(`school_id`, `branch_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_profiles` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `board` ENUM('CBSE', 'ICSE', 'IB', 'IGCSE', 'STATE_BOARD', 'NIOS', 'OTHER') NULL,
    `affiliation_number` VARCHAR(40) NULL,
    `affiliation_valid_till` DATE NULL,
    `school_type` ENUM('PRIVATE', 'GOVT', 'AIDED', 'TRUST') NOT NULL DEFAULT 'PRIVATE',
    `school_category` ENUM('PRESCHOOL', 'PRIMARY', 'MIDDLE', 'SECONDARY', 'HIGHER_SECONDARY', 'COMPOSITE') NOT NULL DEFAULT 'COMPOSITE',
    `gender_type` ENUM('BOYS', 'GIRLS', 'COED') NOT NULL DEFAULT 'COED',
    `medium_of_instruction` VARCHAR(40) NOT NULL DEFAULT 'English',
    `established_year` INTEGER NULL,
    `registration_number` VARCHAR(60) NULL,
    `trust_name` VARCHAR(200) NULL,
    `principal_name` VARCHAR(120) NULL,
    `principal_phone` VARCHAR(20) NULL,
    `principal_email` VARCHAR(255) NULL,
    `total_area_sqft` INTEGER NULL,
    `built_up_area_sqft` INTEGER NULL,
    `student_capacity` INTEGER NULL,
    `motto` VARCHAR(255) NULL,
    `mission` TEXT NULL,
    `vision` TEXT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `uq_school_profile_school_id`(`school_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_branding` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `logo_url` VARCHAR(1000) NULL,
    `favicon_url` VARCHAR(1000) NULL,
    `letterhead_url` VARCHAR(1000) NULL,
    `brand_primary_hex` CHAR(7) NULL,
    `brand_secondary_hex` CHAR(7) NULL,
    `brand_accent_hex` CHAR(7) NULL,
    `font_family` VARCHAR(80) NULL,
    `tagline` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `uq_school_branding_school_id`(`school_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_contact_information` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `contact_type` ENUM('PHONE', 'EMAIL', 'PERSON', 'SOCIAL', 'EMERGENCY') NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `value` VARCHAR(255) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_school_contact_school_type`(`school_id`, `contact_type`),
    INDEX `ix_school_contact_school_primary`(`school_id`, `contact_type`, `is_primary`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_documents` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `document_type` ENUM('REGISTRATION_CERT', 'AFFILIATION_CERT', 'NOC', 'GST_CERT', 'PAN_CERT', 'TRUST_DEED', 'SOCIETY_DEED', 'OTHER') NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `storage_url` VARCHAR(1000) NOT NULL,
    `issue_date` DATE NULL,
    `expiry_date` DATE NULL,
    `issuing_authority` VARCHAR(200) NULL,
    `doc_number` VARCHAR(80) NULL,
    `notes` VARCHAR(500) NULL,
    `uploaded_by` CHAR(36) NULL,
    `uploaded_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_school_doc_school_type`(`school_id`, `document_type`),
    INDEX `ix_school_doc_school_expiry`(`school_id`, `expiry_date`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ix_staff_school_department_id` ON `staff`(`school_id`, `department_id`);

-- CreateIndex
CREATE INDEX `ix_staff_school_designation_id` ON `staff`(`school_id`, `designation_id`);

-- CreateIndex
CREATE INDEX `ix_students_school_house` ON `students`(`school_id`, `house_id`);

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `fk_branch_parent` FOREIGN KEY (`school_id`, `parent_branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `fk_branch_manager` FOREIGN KEY (`school_id`, `manager_staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `branch_settings` ADD CONSTRAINT `fk_branch_settings_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `working_days_configuration` ADD CONSTRAINT `fk_wdc_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `calendar_events` ADD CONSTRAINT `fk_calendar_event_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `calendar_events` ADD CONSTRAINT `fk_calendar_event_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `fk_holiday_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `houses` ADD CONSTRAINT `fk_house_captain` FOREIGN KEY (`school_id`, `captain_student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `houses` ADD CONSTRAINT `fk_house_vice_captain` FOREIGN KEY (`school_id`, `vice_captain_student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `house_assignments` ADD CONSTRAINT `fk_house_assign_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `house_assignments` ADD CONSTRAINT `fk_house_assign_house` FOREIGN KEY (`school_id`, `house_id`) REFERENCES `houses`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `house_assignments` ADD CONSTRAINT `fk_house_assign_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `fk_department_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `fk_department_parent` FOREIGN KEY (`school_id`, `parent_department_id`) REFERENCES `departments`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `fk_department_head` FOREIGN KEY (`school_id`, `head_staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `designations` ADD CONSTRAINT `fk_designation_reports_to` FOREIGN KEY (`school_id`, `reports_to_designation_id`) REFERENCES `designations`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `fk_room_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `rooms` ADD CONSTRAINT `fk_room_type` FOREIGN KEY (`school_id`, `room_type_id`) REFERENCES `room_types`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `school_profiles` ADD CONSTRAINT `fk_school_profile_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `school_branding` ADD CONSTRAINT `fk_school_branding_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `school_contact_information` ADD CONSTRAINT `fk_school_contact_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `school_documents` ADD CONSTRAINT `fk_school_doc_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `fk_staff_department` FOREIGN KEY (`school_id`, `department_id`) REFERENCES `departments`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `fk_staff_designation` FOREIGN KEY (`school_id`, `designation_id`) REFERENCES `designations`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `fk_students_house` FOREIGN KEY (`school_id`, `house_id`) REFERENCES `houses`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- HAND-EDIT: STORED computed column on working_days_configuration so the
-- nullable branch_id can participate in a composite unique. Mirrors the
-- tenant_sequences.fiscal_year_key pattern (migration 20260618094700).
ALTER TABLE `working_days_configuration`
    ADD COLUMN `branch_key` CHAR(36) GENERATED ALWAYS AS (COALESCE(`branch_id`, '__none__')) STORED;

CREATE UNIQUE INDEX `uq_wdc_school_branchkey_dow_from`
    ON `working_days_configuration` (`school_id`, `branch_key`, `day_of_week`, `effective_from`);

