/*
  Warnings:

  - A unique constraint covering the columns `[school_id,apaar_id]` on the table `students` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `admissions` ADD COLUMN `aadhaar_encrypted` TEXT NULL,
    ADD COLUMN `aadhaar_last4` CHAR(4) NULL,
    ADD COLUMN `admission_type` ENUM('FRESH', 'TRANSFER', 'RTE', 'MANAGEMENT') NULL DEFAULT 'FRESH',
    ADD COLUMN `apaar_id` VARCHAR(20) NULL,
    ADD COLUMN `birth_cert_no` VARCHAR(60) NULL,
    ADD COLUMN `category` ENUM('GENERAL', 'OBC', 'SC', 'ST', 'EWS', 'NOT_DECLARED') NULL DEFAULT 'NOT_DECLARED',
    ADD COLUMN `disability_type` VARCHAR(80) NULL,
    ADD COLUMN `is_bpl` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_cwsn` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_minority` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_rte` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `minority_community` VARCHAR(40) NULL,
    ADD COLUMN `mother_tongue` VARCHAR(80) NULL,
    ADD COLUMN `nationality` VARCHAR(80) NOT NULL DEFAULT 'Indian',
    ADD COLUMN `place_of_birth` VARCHAR(120) NULL,
    ADD COLUMN `previous_school_name` VARCHAR(200) NULL,
    ADD COLUMN `previous_school_tc_date` DATE NULL,
    ADD COLUMN `previous_school_tc_no` VARCHAR(80) NULL,
    ADD COLUMN `religion` ENUM('HINDU', 'MUSLIM', 'CHRISTIAN', 'SIKH', 'BUDDHIST', 'JAIN', 'PARSI', 'JEWISH', 'OTHER', 'NOT_DECLARED') NULL DEFAULT 'NOT_DECLARED';

-- AlterTable
ALTER TABLE `students` ADD COLUMN `aadhaar_encrypted` TEXT NULL,
    ADD COLUMN `aadhaar_last4` CHAR(4) NULL,
    ADD COLUMN `admission_type` ENUM('FRESH', 'TRANSFER', 'RTE', 'MANAGEMENT') NULL DEFAULT 'FRESH',
    ADD COLUMN `apaar_id` VARCHAR(20) NULL,
    ADD COLUMN `birth_cert_no` VARCHAR(60) NULL,
    ADD COLUMN `category` ENUM('GENERAL', 'OBC', 'SC', 'ST', 'EWS', 'NOT_DECLARED') NULL DEFAULT 'NOT_DECLARED',
    ADD COLUMN `disability_type` VARCHAR(80) NULL,
    ADD COLUMN `is_bpl` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_cwsn` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_minority` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_rte` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `minority_community` VARCHAR(40) NULL,
    ADD COLUMN `mother_tongue` VARCHAR(80) NULL,
    ADD COLUMN `nationality` VARCHAR(80) NOT NULL DEFAULT 'Indian',
    ADD COLUMN `place_of_birth` VARCHAR(120) NULL,
    ADD COLUMN `previous_school_name` VARCHAR(200) NULL,
    ADD COLUMN `previous_school_tc_date` DATE NULL,
    ADD COLUMN `previous_school_tc_no` VARCHAR(80) NULL,
    ADD COLUMN `religion` ENUM('HINDU', 'MUSLIM', 'CHRISTIAN', 'SIKH', 'BUDDHIST', 'JAIN', 'PARSI', 'JEWISH', 'OTHER', 'NOT_DECLARED') NULL DEFAULT 'NOT_DECLARED';

-- CreateTable
CREATE TABLE `academic_terms` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_academic_term_school_year_start`(`school_id`, `academic_year_id`, `start_date`),
    UNIQUE INDEX `uq_academic_term_year_sequence`(`school_id`, `academic_year_id`, `sequence`),
    UNIQUE INDEX `uq_academic_term_year_name`(`school_id`, `academic_year_id`, `name`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_subjects` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `is_optional` BOOLEAN NOT NULL DEFAULT false,
    `weekly_periods` INTEGER NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_class_subject_school_subject`(`school_id`, `subject_id`),
    UNIQUE INDEX `uq_class_subject_class_subject`(`school_id`, `class_id`, `subject_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `section_subjects` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `mode` ENUM('ADD', 'REMOVE', 'REPLACE') NOT NULL,
    `replaces_subject_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_section_subject_school_section`(`school_id`, `section_id`),
    UNIQUE INDEX `uq_section_subject_section_subject`(`school_id`, `section_id`, `subject_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_year_promotions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `source_academic_year_id` CHAR(36) NOT NULL,
    `target_academic_year_id` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `started_at` TIMESTAMP(3) NULL,
    `finished_at` TIMESTAMP(3) NULL,
    `summary_json` JSON NULL,
    `triggered_by` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_promotion_school_status`(`school_id`, `status`),
    INDEX `ix_promotion_school_source`(`school_id`, `source_academic_year_id`),
    INDEX `ix_promotion_school_target`(`school_id`, `target_academic_year_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_sequences` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `sequence_name` VARCHAR(100) NOT NULL,
    `fiscal_year` CHAR(7) NULL,
    `last_value` BIGINT NOT NULL DEFAULT 0,
    `updated_at` TIMESTAMP(3) NOT NULL,

    INDEX `ix_tenant_sequences_school_name_fy`(`school_id`, `sequence_name`, `fiscal_year`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `date_of_birth` DATE NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    `blood_group` VARCHAR(5) NULL,
    `photo_url` VARCHAR(500) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NOT NULL,
    `alternate_phone` VARCHAR(20) NULL,
    `pan_encrypted` TEXT NULL,
    `pan_last4` CHAR(4) NULL,
    `aadhaar_encrypted` TEXT NULL,
    `aadhaar_last4` CHAR(4) NULL,
    `address_line1` VARCHAR(200) NOT NULL,
    `address_line2` VARCHAR(200) NULL,
    `city` VARCHAR(80) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `postal_code` VARCHAR(20) NOT NULL,
    `country` VARCHAR(80) NOT NULL DEFAULT 'IN',
    `employee_code` VARCHAR(40) NOT NULL,
    `designation` VARCHAR(100) NOT NULL,
    `department` VARCHAR(100) NULL,
    `date_of_joining` DATE NOT NULL,
    `date_of_leaving` DATE NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'RETIRED') NOT NULL DEFAULT 'ACTIVE',
    `bank_account_encrypted` TEXT NULL,
    `bank_account_last4` CHAR(4) NULL,
    `bank_ifsc` VARCHAR(20) NULL,
    `user_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_staff_school_status`(`school_id`, `status`),
    INDEX `ix_staff_school_designation`(`school_id`, `designation`),
    INDEX `ix_staff_school_department`(`school_id`, `department`),
    INDEX `ix_staff_school_phone`(`school_id`, `phone`),
    INDEX `ix_staff_school_aadhaar_last4`(`school_id`, `aadhaar_last4`),
    INDEX `ix_staff_school_pan_last4`(`school_id`, `pan_last4`),
    INDEX `ix_staff_school_name`(`school_id`, `last_name`, `first_name`),
    UNIQUE INDEX `uq_staff_school_employee_code`(`school_id`, `employee_code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_employment_history` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `event` ENUM('JOINED', 'ROLE_CHANGED', 'DEPARTMENT_CHANGED', 'PROMOTED', 'DEMOTED', 'RESIGNED', 'TERMINATED', 'RETIRED', 'REJOINED') NOT NULL,
    `effective_date` DATE NOT NULL,
    `from_value` VARCHAR(255) NULL,
    `to_value` VARCHAR(255) NULL,
    `note` VARCHAR(500) NULL,
    `actor_id` CHAR(36) NULL,
    `occurred_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_staff_emp_history_school_staff_occurred`(`school_id`, `staff_id`, `occurred_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_qualifications` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `qualification_type` VARCHAR(40) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `institution` VARCHAR(200) NULL,
    `year_awarded` INTEGER NULL,
    `grade_or_score` VARCHAR(40) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,

    INDEX `ix_staff_qual_school_staff`(`school_id`, `staff_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_subject_qualifications` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `proficiency` VARCHAR(20) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,

    INDEX `ix_staff_subj_qual_school_subject`(`school_id`, `subject_id`),
    UNIQUE INDEX `uq_staff_subj_qual_school_staff_subject`(`school_id`, `staff_id`, `subject_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_section_assignments` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `periods_per_week` INTEGER NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,

    INDEX `ix_staff_sec_assign_school_staff`(`school_id`, `staff_id`),
    INDEX `ix_staff_sec_assign_school_section_subject`(`school_id`, `section_id`, `subject_id`),
    INDEX `ix_staff_sec_assign_school_year`(`school_id`, `academic_year_id`),
    UNIQUE INDEX `uq_staff_sec_assign_year_section_subject_staff`(`school_id`, `academic_year_id`, `section_id`, `subject_id`, `staff_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_teachers` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `assigned_on` DATE NOT NULL,
    `revoked_on` DATE NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,
    `updated_at` TIMESTAMP(3) NOT NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_class_teacher_school_section_year_revoked`(`school_id`, `section_id`, `academic_year_id`, `revoked_on`),
    INDEX `ix_class_teacher_school_staff`(`school_id`, `staff_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_leaves` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `leave_type` ENUM('CASUAL', 'SICK', 'EARNED', 'MATERNITY', 'PATERNITY', 'UNPAID', 'OTHER') NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `days` DECIMAL(4, 1) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `decided_by` CHAR(36) NULL,
    `decided_at` TIMESTAMP(3) NULL,
    `decision_note` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_staff_leave_school_staff_start`(`school_id`, `staff_id`, `start_date`),
    INDEX `ix_staff_leave_school_status`(`school_id`, `status`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_documents` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `storage_url` VARCHAR(1000) NOT NULL,
    `uploaded_by` CHAR(36) NULL,
    `uploaded_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_staff_doc_school_staff`(`school_id`, `staff_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ix_students_school_aadhaar_last4` ON `students`(`school_id`, `aadhaar_last4`);

-- CreateIndex
CREATE INDEX `ix_students_school_category` ON `students`(`school_id`, `category`);

-- CreateIndex
CREATE INDEX `ix_students_school_rte` ON `students`(`school_id`, `is_rte`);

-- CreateIndex
CREATE UNIQUE INDEX `uq_students_school_apaar` ON `students`(`school_id`, `apaar_id`);

-- AddForeignKey
ALTER TABLE `academic_terms` ADD CONSTRAINT `fk_academic_term_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_subjects` ADD CONSTRAINT `fk_class_subject_class` FOREIGN KEY (`school_id`, `class_id`) REFERENCES `classes`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_subjects` ADD CONSTRAINT `fk_class_subject_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `section_subjects` ADD CONSTRAINT `fk_section_subject_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `section_subjects` ADD CONSTRAINT `fk_section_subject_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `section_subjects` ADD CONSTRAINT `fk_section_subject_replaces` FOREIGN KEY (`school_id`, `replaces_subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `academic_year_promotions` ADD CONSTRAINT `fk_promotion_source_year` FOREIGN KEY (`school_id`, `source_academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `academic_year_promotions` ADD CONSTRAINT `fk_promotion_target_year` FOREIGN KEY (`school_id`, `target_academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_employment_history` ADD CONSTRAINT `fk_staff_emp_history_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_qualifications` ADD CONSTRAINT `fk_staff_qual_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_subject_qualifications` ADD CONSTRAINT `fk_staff_subj_qual_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_subject_qualifications` ADD CONSTRAINT `fk_staff_subj_qual_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_section_assignments` ADD CONSTRAINT `fk_staff_sec_assign_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_section_assignments` ADD CONSTRAINT `fk_staff_sec_assign_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_section_assignments` ADD CONSTRAINT `fk_staff_sec_assign_subject` FOREIGN KEY (`school_id`, `subject_id`) REFERENCES `subjects`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_section_assignments` ADD CONSTRAINT `fk_staff_sec_assign_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `fk_class_teacher_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `fk_class_teacher_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_teachers` ADD CONSTRAINT `fk_class_teacher_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_leaves` ADD CONSTRAINT `fk_staff_leave_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_documents` ADD CONSTRAINT `fk_staff_doc_staff` FOREIGN KEY (`school_id`, `staff_id`) REFERENCES `staff`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
