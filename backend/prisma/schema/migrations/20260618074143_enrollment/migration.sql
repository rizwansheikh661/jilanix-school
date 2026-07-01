-- CreateTable
CREATE TABLE `students` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `date_of_birth` DATE NOT NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    `blood_group` VARCHAR(5) NULL,
    `photo_url` VARCHAR(500) NULL,
    `admission_no` VARCHAR(80) NOT NULL,
    `roll_no` VARCHAR(20) NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `section_id` CHAR(36) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'GRADUATED', 'TC_ISSUED', 'EXPELLED') NOT NULL DEFAULT 'ACTIVE',
    `admitted_on` DATE NOT NULL,
    `emergency_contacts` JSON NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_students_school_status`(`school_id`, `status`),
    INDEX `ix_students_school_class_section`(`school_id`, `class_id`, `section_id`),
    INDEX `ix_students_section_year_roll`(`school_id`, `section_id`, `academic_year_id`, `roll_no`),
    INDEX `ix_students_school_name`(`school_id`, `last_name`, `first_name`),
    UNIQUE INDEX `uq_students_school_admission_no`(`school_id`, `admission_no`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parents` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `father_name` VARCHAR(200) NULL,
    `father_phone` VARCHAR(20) NULL,
    `father_email` VARCHAR(255) NULL,
    `father_occupation` VARCHAR(100) NULL,
    `mother_name` VARCHAR(200) NULL,
    `mother_phone` VARCHAR(20) NULL,
    `mother_email` VARCHAR(255) NULL,
    `mother_occupation` VARCHAR(100) NULL,
    `guardian_name` VARCHAR(200) NULL,
    `guardian_phone` VARCHAR(20) NULL,
    `guardian_email` VARCHAR(255) NULL,
    `guardian_occupation` VARCHAR(100) NULL,
    `guardian_relation` VARCHAR(50) NULL,
    `address_line1` VARCHAR(200) NOT NULL,
    `address_line2` VARCHAR(200) NULL,
    `city` VARCHAR(80) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `postal_code` VARCHAR(20) NOT NULL,
    `country` VARCHAR(80) NOT NULL DEFAULT 'IN',
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_parents_school_father_phone`(`school_id`, `father_phone`),
    INDEX `ix_parents_school_mother_phone`(`school_id`, `mother_phone`),
    INDEX `ix_parents_school_guardian_phone`(`school_id`, `guardian_phone`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parent_student_links` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `relation` ENUM('FATHER', 'MOTHER', 'GUARDIAN') NOT NULL,
    `is_primary_contact` BOOLEAN NOT NULL DEFAULT false,
    `can_pickup` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,

    INDEX `ix_pslink_school_student`(`school_id`, `student_id`),
    INDEX `ix_pslink_school_parent`(`school_id`, `parent_id`),
    UNIQUE INDEX `uq_pslink_parent_student_relation`(`school_id`, `parent_id`, `student_id`, `relation`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admissions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT',
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `date_of_birth` DATE NOT NULL,
    `gender` ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL,
    `blood_group` VARCHAR(5) NULL,
    `target_academic_year_id` CHAR(36) NOT NULL,
    `target_class_id` CHAR(36) NOT NULL,
    `target_section_id` CHAR(36) NOT NULL,
    `admission_no` VARCHAR(80) NULL,
    `roll_no` VARCHAR(20) NULL,
    `father_name` VARCHAR(200) NULL,
    `father_phone` VARCHAR(20) NULL,
    `father_email` VARCHAR(255) NULL,
    `father_occupation` VARCHAR(100) NULL,
    `mother_name` VARCHAR(200) NULL,
    `mother_phone` VARCHAR(20) NULL,
    `mother_email` VARCHAR(255) NULL,
    `mother_occupation` VARCHAR(100) NULL,
    `guardian_name` VARCHAR(200) NULL,
    `guardian_phone` VARCHAR(20) NULL,
    `guardian_email` VARCHAR(255) NULL,
    `guardian_occupation` VARCHAR(100) NULL,
    `guardian_relation` VARCHAR(50) NULL,
    `address_line1` VARCHAR(200) NOT NULL,
    `address_line2` VARCHAR(200) NULL,
    `city` VARCHAR(80) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `postal_code` VARCHAR(20) NOT NULL,
    `country` VARCHAR(80) NOT NULL DEFAULT 'IN',
    `decided_by` CHAR(36) NULL,
    `decided_at` TIMESTAMP(3) NULL,
    `decision_note` VARCHAR(500) NULL,
    `student_id` CHAR(36) NULL,
    `parent_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_admissions_school_status`(`school_id`, `status`),
    INDEX `ix_admissions_school_target`(`school_id`, `target_academic_year_id`, `target_class_id`),
    INDEX `ix_admissions_school_admission_no`(`school_id`, `admission_no`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_documents` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `admission_id` CHAR(36) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `storage_url` VARCHAR(1000) NOT NULL,
    `uploaded_by` CHAR(36) NULL,
    `uploaded_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_adoc_school_admission`(`school_id`, `admission_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admission_history` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `admission_id` CHAR(36) NOT NULL,
    `from_status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN') NULL,
    `to_status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL,
    `actor_id` CHAR(36) NULL,
    `note` VARCHAR(500) NULL,
    `occurred_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_ahist_school_admission_occurred`(`school_id`, `admission_id`, `occurred_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `fk_students_academic_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `fk_students_class` FOREIGN KEY (`school_id`, `class_id`) REFERENCES `classes`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `fk_students_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `parent_student_links` ADD CONSTRAINT `fk_pslink_parent` FOREIGN KEY (`school_id`, `parent_id`) REFERENCES `parents`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `parent_student_links` ADD CONSTRAINT `fk_pslink_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `admission_documents` ADD CONSTRAINT `fk_adoc_admission` FOREIGN KEY (`school_id`, `admission_id`) REFERENCES `admissions`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `admission_history` ADD CONSTRAINT `fk_ahist_admission` FOREIGN KEY (`school_id`, `admission_id`) REFERENCES `admissions`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
