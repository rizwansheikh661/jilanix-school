-- CreateTable
CREATE TABLE `audit_log` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `actor_user_id` CHAR(36) NULL,
    `actor_scope` VARCHAR(10) NOT NULL DEFAULT 'tenant',
    `impersonator_user_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `category` VARCHAR(20) NOT NULL DEFAULT 'general',
    `resource_type` VARCHAR(50) NULL,
    `resource_id` CHAR(36) NULL,
    `before_json` JSON NULL,
    `after_json` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `request_id` CHAR(26) NULL,
    `prev_hash` CHAR(64) NULL,
    `row_hash` CHAR(64) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_audit_log_school_created`(`school_id`, `created_at` DESC),
    INDEX `ix_audit_log_resource`(`school_id`, `resource_type`, `resource_id`, `created_at` DESC),
    INDEX `ix_audit_log_actor`(`actor_user_id`, `created_at` DESC),
    INDEX `ix_audit_log_category`(`category`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_anchors` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `category` VARCHAR(20) NOT NULL,
    `period_start` TIMESTAMP(3) NOT NULL,
    `period_end` TIMESTAMP(3) NOT NULL,
    `last_row_hash` CHAR(64) NOT NULL,
    `external_storage_uri` VARCHAR(500) NULL,
    `external_object_etag` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_audit_anchors_school_category_period`(`school_id`, `category`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `email_verified_at` TIMESTAMP(3) NULL,
    `phone` VARCHAR(20) NULL,
    `phone_verified_at` TIMESTAMP(3) NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `actor_scope` VARCHAR(10) NOT NULL DEFAULT 'tenant',
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
    `token_salt` VARCHAR(32) NOT NULL DEFAULT '',
    `last_login_at` TIMESTAMP(3) NULL,
    `password_changed_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_users_school_status`(`school_id`, `status`),
    INDEX `ix_users_email`(`email`),
    UNIQUE INDEX `uq_users_school_email`(`school_id`, `email`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_passwords` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `algorithm` VARCHAR(16) NOT NULL DEFAULT 'argon2id',
    `params_json` JSON NOT NULL,
    `pepper_version` INTEGER NOT NULL DEFAULT 1,
    `force_rotate_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_user_passwords_school_user`(`school_id`, `user_id`),
    UNIQUE INDEX `uq_user_passwords_user`(`school_id`, `user_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `refresh_token_hash` CHAR(64) NOT NULL,
    `parent_session_id` CHAR(36) NULL,
    `replaced_by_session_id` CHAR(36) NULL,
    `chain_id` CHAR(36) NOT NULL,
    `device_id` VARCHAR(64) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(512) NULL,
    `issued_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` TIMESTAMP(3) NOT NULL,
    `last_used_at` TIMESTAMP(3) NULL,
    `revoked_at` TIMESTAMP(3) NULL,
    `revoked_reason` VARCHAR(32) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `uq_user_sessions_token_hash`(`refresh_token_hash`),
    INDEX `ix_user_sessions_user_revoked`(`school_id`, `user_id`, `revoked_at`),
    INDEX `ix_user_sessions_chain`(`chain_id`),
    INDEX `ix_user_sessions_expires`(`expires_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_login_events` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_type` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(64) NULL,
    `identifier_hash` CHAR(64) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(512) NULL,
    `occurred_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_user_login_events_user_time`(`school_id`, `user_id`, `occurred_at`),
    INDEX `ix_user_login_events_type_time`(`school_id`, `event_type`, `occurred_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(512) NULL,
    `scope` VARCHAR(10) NOT NULL DEFAULT 'tenant',
    `is_system` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `uq_roles_key`(`key`),
    INDEX `ix_roles_scope`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `resource` VARCHAR(64) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `description` VARCHAR(512) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `uq_permissions_key`(`key`),
    INDEX `ix_permissions_resource`(`resource`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `permission_key` VARCHAR(128) NOT NULL,
    `permission_id` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` CHAR(36) NULL,

    INDEX `ix_role_permissions_role`(`role_id`),
    INDEX `ix_role_permissions_permission`(`permission_id`),
    UNIQUE INDEX `uq_role_permissions_role_key`(`role_id`, `permission_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `assigned_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assigned_by` CHAR(36) NULL,
    `expires_at` TIMESTAMP(3) NULL,
    `revoked_at` TIMESTAMP(3) NULL,
    `revoked_by` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_user_roles_user_revoked`(`school_id`, `user_id`, `revoked_at`),
    INDEX `ix_user_roles_role`(`role_id`),
    INDEX `ix_user_roles_expires`(`expires_at`),
    UNIQUE INDEX `uq_user_roles_user_role`(`school_id`, `user_id`, `role_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `topic` VARCHAR(100) NOT NULL,
    `aggregate_type` VARCHAR(50) NOT NULL,
    `aggregate_id` CHAR(36) NOT NULL,
    `event_id` CHAR(26) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `payload` JSON NOT NULL,
    `headers` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `next_attempt_at` TIMESTAMP(3) NULL,
    `delivered_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_outbox_dispatch`(`status`, `next_attempt_at`),
    INDEX `ix_outbox_school_topic`(`school_id`, `topic`, `created_at` DESC),
    UNIQUE INDEX `uq_outbox_event_id`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `key` VARCHAR(255) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `resource_type` VARCHAR(50) NULL,
    `resource_id` CHAR(36) NULL,
    `response_status` INTEGER NULL,
    `response_body` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    `expires_at` TIMESTAMP(3) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` TIMESTAMP(3) NULL,

    INDEX `ix_idempotency_keys_expires_at`(`expires_at`),
    UNIQUE INDEX `uq_idempotency_keys_school_key`(`school_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NULL,
    `queue` VARCHAR(50) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `payload` JSON NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `run_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimed_at` TIMESTAMP(3) NULL,
    `claimed_by` VARCHAR(100) NULL,
    `started_at` TIMESTAMP(3) NULL,
    `completed_at` TIMESTAMP(3) NULL,
    `last_error` TEXT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_jobs_dispatch`(`queue`, `status`, `run_at`, `priority`),
    INDEX `ix_jobs_school_type_status`(`school_id`, `type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schools` (
    `id` CHAR(36) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `legal_name` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `country_code` CHAR(2) NOT NULL DEFAULT 'IN',
    `gstin` VARCHAR(15) NULL,
    `pan` VARCHAR(10) NULL,
    `address_line1` VARCHAR(255) NULL,
    `address_line2` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state_code` VARCHAR(10) NULL,
    `pincode` VARCHAR(10) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(255) NULL,
    `website` VARCHAR(255) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    `locale_default` VARCHAR(16) NOT NULL DEFAULT 'en-IN',
    `status` VARCHAR(20) NOT NULL DEFAULT 'trial',
    `onboarded_at` TIMESTAMP(3) NULL,
    `archived_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_schools_status_created_at`(`status`, `created_at`),
    INDEX `ix_schools_gstin`(`gstin`),
    INDEX `ix_schools_deleted_at`(`deleted_at`),
    UNIQUE INDEX `uq_schools_slug`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_settings` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `working_days_json` JSON NOT NULL,
    `attendance_window_hours` INTEGER NOT NULL DEFAULT 24,
    `exam_edit_window_hours` INTEGER NOT NULL DEFAULT 48,
    `invoice_number_format` VARCHAR(100) NOT NULL DEFAULT 'INV/{FY}/{SEQ}',
    `default_communication_language` VARCHAR(16) NOT NULL DEFAULT 'en-IN',
    `quiet_hours_start` VARCHAR(8) NULL,
    `quiet_hours_end` VARCHAR(8) NULL,
    `privacy_policy_version` VARCHAR(32) NULL,
    `privacy_policy_accepted_at` TIMESTAMP(3) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_school_settings_school_id`(`school_id`),
    UNIQUE INDEX `uq_school_settings_school_id`(`school_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `regions` (
    `code` CHAR(2) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `parent_code` CHAR(2) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_passwords` ADD CONSTRAINT `fk_user_passwords_user` FOREIGN KEY (`school_id`, `user_id`) REFERENCES `users`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`school_id`, `user_id`) REFERENCES `users`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_login_events` ADD CONSTRAINT `fk_user_login_events_user` FOREIGN KEY (`school_id`, `user_id`) REFERENCES `users`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`school_id`, `user_id`) REFERENCES `users`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `school_settings` ADD CONSTRAINT `fk_school_settings_school` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
