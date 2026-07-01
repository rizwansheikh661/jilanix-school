-- CreateTable
CREATE TABLE `academic_years` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_current` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_academic_years_school_start`(`school_id`, `start_date`),
    INDEX `ix_academic_years_school_current`(`school_id`, `is_current`),
    UNIQUE INDEX `uq_academic_years_school_name`(`school_id`, `name`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classes` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `grade_level` INTEGER NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_classes_school_grade`(`school_id`, `grade_level`),
    UNIQUE INDEX `uq_classes_school_name`(`school_id`, `name`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sections` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `name` VARCHAR(20) NOT NULL,
    `capacity` INTEGER NULL,
    `class_teacher_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_sections_school_class`(`school_id`, `class_id`),
    INDEX `ix_sections_school_teacher`(`school_id`, `class_teacher_id`),
    UNIQUE INDEX `uq_sections_school_class_name`(`school_id`, `class_id`, `name`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subjects` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `type` ENUM('CORE', 'ELECTIVE', 'LANGUAGE', 'OTHER') NOT NULL DEFAULT 'CORE',
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_subjects_school_type`(`school_id`, `type`),
    INDEX `ix_subjects_school_name`(`school_id`, `name`),
    UNIQUE INDEX `uq_subjects_school_code`(`school_id`, `code`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sections` ADD CONSTRAINT `fk_sections_class` FOREIGN KEY (`school_id`, `class_id`) REFERENCES `classes`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sections` ADD CONSTRAINT `fk_sections_class_teacher` FOREIGN KEY (`school_id`, `class_teacher_id`) REFERENCES `users`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
