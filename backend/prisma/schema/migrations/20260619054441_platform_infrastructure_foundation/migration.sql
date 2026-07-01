-- Sprint 5 — Platform Infrastructure Foundation.
-- Hand-edits applied (per plan partitioned-yawning-widget):
--   * Removed re-introspection DROPs for tenant_sequences.fiscal_year_key
--     and working_days_configuration.branch_key — both are STORED generated
--     columns Prisma cannot model. They must stay.
--   * Appended STORED generated column + unique index for
--     feature_flag_tenant_overrides.expires_at_key (active-row uniqueness).
--   * Appended STORED generated column + unique index for
--     file_asset_acl_grants.revoked_key (active-grant uniqueness).
--
-- CreateTable
CREATE TABLE `file_assets` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `purpose` ENUM('STUDENT_PHOTO', 'STAFF_PHOTO', 'ADMISSION_DOCUMENT', 'SCHOOL_DOCUMENT', 'SCHOOL_LOGO', 'MESSAGE_ATTACHMENT', 'REPORT_EXPORT', 'BULK_IMPORT', 'OTHER') NOT NULL,
    `bucket` VARCHAR(100) NOT NULL,
    `storage_key` VARCHAR(500) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` BIGINT NOT NULL,
    `checksum_sha256` CHAR(64) NOT NULL,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `scan_status` ENUM('PENDING', 'CLEAN', 'INFECTED', 'SCAN_FAILED') NOT NULL DEFAULT 'PENDING',
    `scan_completed_at` TIMESTAMP(3) NULL,
    `owner_user_id` CHAR(36) NULL,
    `expires_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_file_asset_school_purpose_created`(`school_id`, `purpose`, `created_at` DESC),
    INDEX `ix_file_asset_bucket_key`(`bucket`, `storage_key`),
    INDEX `ix_file_asset_owner`(`owner_user_id`),
    INDEX `ix_file_asset_scan_status`(`scan_status`),
    INDEX `ix_file_asset_deleted_at`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_asset_acl_grants` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `file_asset_id` CHAR(36) NOT NULL,
    `principal_type` ENUM('USER', 'ROLE', 'PUBLIC') NOT NULL,
    `principal_id` CHAR(36) NULL,
    `granted_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` TIMESTAMP(3) NULL,
    `granted_by` CHAR(36) NULL,
    `revoked_by` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_file_acl_file_principal`(`file_asset_id`, `principal_type`, `principal_id`),
    INDEX `ix_file_acl_principal`(`principal_type`, `principal_id`),
    INDEX `ix_file_acl_school`(`school_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_definitions` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `kind` ENUM('MODULE', 'RELEASE', 'EXPERIMENT', 'KILL_SWITCH', 'ENTITLEMENT') NOT NULL DEFAULT 'MODULE',
    `owner` VARCHAR(80) NULL,
    `default_value` BOOLEAN NOT NULL DEFAULT false,
    `lifecycle` ENUM('INTRODUCED', 'ACTIVE', 'DEPRECATED', 'RETIRED') NOT NULL DEFAULT 'INTRODUCED',
    `cleanup_due_at` DATE NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_ff_def_kind`(`kind`),
    INDEX `ix_ff_def_lifecycle`(`lifecycle`),
    UNIQUE INDEX `uq_ff_def_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_plan_map` (
    `id` CHAR(36) NOT NULL,
    `plan_id` CHAR(36) NOT NULL,
    `flag_id` CHAR(36) NOT NULL,
    `value` BOOLEAN NOT NULL,
    `quota_int` INTEGER NULL,
    `quota_window` VARCHAR(20) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_ff_plan_map_flag`(`flag_id`),
    UNIQUE INDEX `uq_ff_plan_map`(`plan_id`, `flag_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_tenant_overrides` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `flag_id` CHAR(36) NOT NULL,
    `value` BOOLEAN NOT NULL,
    `quota_int` INTEGER NULL,
    `reason` VARCHAR(255) NULL,
    `set_by` CHAR(36) NULL,
    `set_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_ff_tenant_override_school_flag`(`school_id`, `flag_id`),
    INDEX `ix_ff_tenant_override_flag`(`flag_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_rollouts` (
    `id` CHAR(36) NOT NULL,
    `flag_id` CHAR(36) NOT NULL,
    `strategy` ENUM('PERCENTAGE', 'TENANT_LIST', 'PLAN_LIST', 'REGION_LIST') NOT NULL,
    `percentage` INTEGER NULL,
    `tenant_ids_json` JSON NULL,
    `plan_ids_json` JSON NULL,
    `regions_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `starts_at` TIMESTAMP(3) NULL,
    `ends_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_ff_rollout_flag`(`flag_id`, `is_active`),
    INDEX `ix_ff_rollout_strategy`(`strategy`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feature_flag_audit` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `flag_id` CHAR(36) NOT NULL,
    `scope` VARCHAR(20) NOT NULL,
    `before_value` JSON NULL,
    `after_value` JSON NULL,
    `actor_user_id` CHAR(36) NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_ff_audit_flag_created`(`flag_id`, `created_at` DESC),
    INDEX `ix_ff_audit_school_created`(`school_id`, `created_at` DESC),
    INDEX `ix_ff_audit_scope_created`(`scope`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_definitions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `name` VARCHAR(100) NOT NULL,
    `queue` VARCHAR(50) NOT NULL,
    `handler_name` VARCHAR(120) NOT NULL,
    `schedule_cron` VARCHAR(100) NULL,
    `payload_template` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_job_def_queue_active`(`queue`, `is_active`),
    INDEX `ix_job_def_handler`(`handler_name`),
    UNIQUE INDEX `uq_job_def_school_name`(`school_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_runs` (
    `id` CHAR(36) NOT NULL,
    `job_id` CHAR(36) NULL,
    `definition_id` CHAR(36) NULL,
    `school_id` CHAR(36) NULL,
    `queue` VARCHAR(50) NOT NULL,
    `handler_name` VARCHAR(120) NOT NULL,
    `attempt` INTEGER NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL,
    `started_at` TIMESTAMP(3) NOT NULL,
    `finished_at` TIMESTAMP(3) NULL,
    `error_message` TEXT NULL,
    `error_code` VARCHAR(100) NULL,
    `output_json` JSON NULL,
    `duration_ms` INTEGER NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_job_run_definition_started`(`definition_id`, `started_at` DESC),
    INDEX `ix_job_run_job`(`job_id`),
    INDEX `ix_job_run_school_started`(`school_id`, `started_at` DESC),
    INDEX `ix_job_run_status_started`(`status`, `started_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_dead_letters` (
    `id` CHAR(36) NOT NULL,
    `job_id` CHAR(36) NOT NULL,
    `definition_id` CHAR(36) NULL,
    `school_id` CHAR(36) NULL,
    `queue` VARCHAR(50) NOT NULL,
    `handler_name` VARCHAR(120) NOT NULL,
    `payload` JSON NOT NULL,
    `attempts` INTEGER NOT NULL,
    `first_failed_at` TIMESTAMP(3) NOT NULL,
    `last_failed_at` TIMESTAMP(3) NOT NULL,
    `last_error` TEXT NULL,
    `status` ENUM('PENDING', 'REPLAYED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
    `replayed_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_jdl_status_lastfailed`(`status`, `last_failed_at` DESC),
    INDEX `ix_jdl_school_status`(`school_id`, `status`),
    INDEX `ix_jdl_job`(`job_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `file_assets` ADD CONSTRAINT `fk_file_asset_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file_asset_acl_grants` ADD CONSTRAINT `fk_file_acl_file` FOREIGN KEY (`file_asset_id`) REFERENCES `file_assets`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `feature_flag_plan_map` ADD CONSTRAINT `fk_ff_plan_map_flag` FOREIGN KEY (`flag_id`) REFERENCES `feature_flag_definitions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `feature_flag_tenant_overrides` ADD CONSTRAINT `fk_ff_tenant_override_flag` FOREIGN KEY (`flag_id`) REFERENCES `feature_flag_definitions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `feature_flag_tenant_overrides` ADD CONSTRAINT `fk_ff_tenant_override_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `feature_flag_rollouts` ADD CONSTRAINT `fk_ff_rollout_flag` FOREIGN KEY (`flag_id`) REFERENCES `feature_flag_definitions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `feature_flag_audit` ADD CONSTRAINT `fk_ff_audit_flag` FOREIGN KEY (`flag_id`) REFERENCES `feature_flag_definitions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `job_definitions` ADD CONSTRAINT `fk_job_def_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `job_runs` ADD CONSTRAINT `fk_job_run_definition` FOREIGN KEY (`definition_id`) REFERENCES `job_definitions`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `job_dead_letters` ADD CONSTRAINT `fk_jdl_definition` FOREIGN KEY (`definition_id`) REFERENCES `job_definitions`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-edit: STORED generated column on file_asset_acl_grants for
-- "active grant uniqueness". MySQL has no partial unique index, so we
-- collapse NULL revoked_at to the sentinel 'NONE' and include it in the
-- unique key. Mirrors working_days_configuration.branch_key pattern.
-- ---------------------------------------------------------------------------
ALTER TABLE `file_asset_acl_grants`
  ADD COLUMN `revoked_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`revoked_at`,'%Y%m%d%H%i%s'),'NONE')) STORED;

CREATE UNIQUE INDEX `uq_file_acl_active`
  ON `file_asset_acl_grants` (`file_asset_id`, `principal_type`, `principal_id`, `revoked_key`);

-- ---------------------------------------------------------------------------
-- Hand-edit: STORED generated column on feature_flag_tenant_overrides for
-- "one active override per (school, flag) regardless of historical rows".
-- Same NULL-collapse trick.
-- ---------------------------------------------------------------------------
ALTER TABLE `feature_flag_tenant_overrides`
  ADD COLUMN `expires_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`expires_at`,'%Y%m%d%H%i%s'),'NONE')) STORED;

CREATE UNIQUE INDEX `uq_ff_tenant`
  ON `feature_flag_tenant_overrides` (`school_id`, `flag_id`, `expires_at_key`);

