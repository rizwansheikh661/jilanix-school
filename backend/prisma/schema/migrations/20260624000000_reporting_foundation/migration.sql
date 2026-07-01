-- Sprint 13 — Reporting, Import/Export & Bulk Operations Foundation migration.
-- Hand-crafted (Sprint 7-12 precedent): `prisma migrate dev` is unusable
-- because the shadow-DB reconstruction loses STORED virtual columns. This
-- file is authored by hand to match the conventions of prior foundations
-- (backticked identifiers, 2-space indents on multi-statement ALTERs,
-- composite (school_id, id) PKs, STORED `deleted_at_key` + partial-unique
-- pattern at the tail). Format `'%Y%m%d%H%i%s.%f'` / `'0'` sentinel mirrors
-- Sprint 9-12 base. Default collation `utf8mb4_unicode_ci`. `BOOLEAN`
-- (== TINYINT(1)) chosen for consistency with prior migrations.
--
-- What this migration adds (three sections):
--   1. 8 CREATE TABLE statements for the reporting / import-export / bulk
--      operations schema:
--      - report_runs                  (header, soft-delete, code-active uq)
--      - import_jobs                  (header, soft-delete, code-active uq)
--      - import_job_issues            (per-row validator output, soft-delete)
--      - bulk_operations              (header, soft-delete, code-active uq)
--      - dashboards                   (container, soft-delete, code-active uq)
--      - dashboard_widgets            (widget config, soft-delete)
--      - report_schedules             (saved schedule, soft-delete, code uq)
--      - report_templates             (saved filter set, soft-delete, code uq)
--   2. Foreign keys.
--      (a) Composite (school_id, *_id) FKs on the two tenant-owned
--          parent-child relations:
--            - import_job_issues       → import_jobs
--            - dashboard_widgets       → dashboards
--          ON DELETE CASCADE ON UPDATE RESTRICT (matches Sprint 12
--          academic-content composite-FK convention; matches Prisma
--          `onDelete: Cascade, onUpdate: Restrict` declared in the schema).
--      (b) Single-column FKs to file_assets(id) for the two FileAsset-
--          backed columns:
--            - report_runs.file_asset_id          (nullable) → file_assets(id)
--                ON DELETE SET NULL ON UPDATE RESTRICT
--            - import_jobs.source_file_asset_id   (not null) → file_assets(id)
--                ON DELETE RESTRICT ON UPDATE RESTRICT
--          FileAsset is TENANT_SHARED_PLATFORM (school_id nullable for
--          platform assets) so a composite (school_id, file_asset_id) FK
--          would refuse platform-owned rows. Single-column FK precedent
--          comes from Sprint 5 platform foundation `file_asset_acl_grants`.
--          Cross-tenant safety is still enforced in the service layer via
--          assertTenantRefs.
--   3. STORED `deleted_at_key` projection on 6 of the 8 soft-deleted tables:
--      report_runs, import_jobs, bulk_operations, dashboards,
--      report_schedules, report_templates. These are the tables with
--      active-row uniqueness requirements on the auto-generated `code`:
--        - uq_report_run_code_active        (school_id, code, deleted_at_key)
--        - uq_import_job_code_active        (school_id, code, deleted_at_key)
--        - uq_bulk_op_code_active           (school_id, code, deleted_at_key)
--        - uq_dashboard_code_active         (school_id, code, deleted_at_key)
--        - uq_report_schedule_code_active   (school_id, code, deleted_at_key)
--        - uq_report_template_code_active   (school_id, code, deleted_at_key)
--      The 2 child tables (import_job_issues, dashboard_widgets) have NO
--      active-row uniqueness — issues are append-only per import, multiple
--      widgets of the same kind can live on a dashboard.
--      Prisma cannot emit GENERATED ALWAYS AS; format `'%Y%m%d%H%i%s.%f'`
--      → '0' sentinel mirrors the Sprint 5-12 base migrations.
--
-- No backfill required — all 8 tables are net-new.
-- No file_assets.purpose enum change — Sprint 13 reuses REPORT_EXPORT and
-- BULK_IMPORT, both registered in the platform foundation migration.

-- ============================================================================
-- Section 1: report_runs
-- ============================================================================
CREATE TABLE `report_runs` (
  `id`                       CHAR(36)       NOT NULL,
  `school_id`                CHAR(36)       NOT NULL,
  `code`                     VARCHAR(40)    NOT NULL,
  `kind`                     ENUM('STUDENT_LIST','STUDENT_ATTENDANCE_SUMMARY','STAFF_ATTENDANCE_SUMMARY','EXAM_MARKS_SHEET','EXAM_RESULT_SUMMARY','FEE_COLLECTION_SUMMARY','FEE_OUTSTANDING','HOMEWORK_COMPLIANCE','SYLLABUS_PROGRESS') NOT NULL,
  `format`                   ENUM('CSV','EXCEL','PDF') NOT NULL,
  `status`                   ENUM('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `requested_by_user_id`     CHAR(36)       NOT NULL,
  `requested_at`             TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `params`                   JSON           NOT NULL,
  `queued_job_id`            CHAR(36)       NULL,
  `started_at`               TIMESTAMP(3)   NULL,
  `ended_at`                 TIMESTAMP(3)   NULL,
  `error_message`            VARCHAR(2000)  NULL,
  `file_asset_id`            CHAR(36)       NULL,
  `row_count`                INTEGER        NOT NULL DEFAULT 0,
  `created_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)       NULL,
  `updated_by`               CHAR(36)       NULL,
  `deleted_at`               TIMESTAMP(3)   NULL,
  `deleted_by`               CHAR(36)       NULL,
  `version`                  INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_report_run_school_status_requested`  (`school_id`, `status`, `requested_at`),
  INDEX `ix_report_run_school_kind_requested`    (`school_id`, `kind`, `requested_at`),
  INDEX `ix_report_run_school_requested_by`      (`school_id`, `requested_by_user_id`),
  INDEX `ix_report_run_deleted_at`               (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: import_jobs
-- ============================================================================
CREATE TABLE `import_jobs` (
  `id`                       CHAR(36)       NOT NULL,
  `school_id`                CHAR(36)       NOT NULL,
  `code`                     VARCHAR(40)    NOT NULL,
  `kind`                     ENUM('STUDENT','STAFF','EXAM_MARKS','ATTENDANCE','FEE_PAYMENT') NOT NULL,
  `status`                   ENUM('PENDING','VALIDATING','VALIDATED','COMMITTING','COMMITTED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `requested_by_user_id`     CHAR(36)       NOT NULL,
  `requested_at`             TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `source_file_asset_id`     CHAR(36)       NOT NULL,
  `options`                  JSON           NOT NULL,
  `queued_job_id`            CHAR(36)       NULL,
  `total_rows`               INTEGER        NOT NULL DEFAULT 0,
  `valid_rows`               INTEGER        NOT NULL DEFAULT 0,
  `error_rows`               INTEGER        NOT NULL DEFAULT 0,
  `committed_rows`           INTEGER        NOT NULL DEFAULT 0,
  `started_at`               TIMESTAMP(3)   NULL,
  `ended_at`                 TIMESTAMP(3)   NULL,
  `error_message`            VARCHAR(2000)  NULL,
  `created_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)       NULL,
  `updated_by`               CHAR(36)       NULL,
  `deleted_at`               TIMESTAMP(3)   NULL,
  `deleted_by`               CHAR(36)       NULL,
  `version`                  INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_import_job_school_status_requested`  (`school_id`, `status`, `requested_at`),
  INDEX `ix_import_job_school_kind_requested`    (`school_id`, `kind`, `requested_at`),
  INDEX `ix_import_job_school_requested_by`      (`school_id`, `requested_by_user_id`),
  INDEX `ix_import_job_deleted_at`               (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: import_job_issues
-- ============================================================================
CREATE TABLE `import_job_issues` (
  `id`             CHAR(36)       NOT NULL,
  `school_id`      CHAR(36)       NOT NULL,
  `import_job_id`  CHAR(36)       NOT NULL,
  `row_number`     INTEGER        NOT NULL,
  `column_name`    VARCHAR(100)   NULL,
  `severity`       ENUM('ERROR','WARNING','INFO') NOT NULL,
  `code`           VARCHAR(80)    NOT NULL,
  `message`        VARCHAR(1000)  NOT NULL,
  `row_snapshot`   JSON           NULL,
  `created_at`     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`     CHAR(36)       NULL,
  `updated_by`     CHAR(36)       NULL,
  `deleted_at`     TIMESTAMP(3)   NULL,
  `deleted_by`     CHAR(36)       NULL,
  `version`        INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_import_job_issue_school_job_severity` (`school_id`, `import_job_id`, `severity`),
  INDEX `ix_import_job_issue_school_job_row`      (`school_id`, `import_job_id`, `row_number`),
  INDEX `ix_import_job_issue_deleted_at`          (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: bulk_operations
-- ============================================================================
CREATE TABLE `bulk_operations` (
  `id`                       CHAR(36)       NOT NULL,
  `school_id`                CHAR(36)       NOT NULL,
  `code`                     VARCHAR(40)    NOT NULL,
  `kind`                     ENUM('STUDENT_PROMOTE','STUDENT_TRANSFER_SECTION','STUDENT_DEACTIVATE','STAFF_DEACTIVATE','FEE_WAIVE','HOMEWORK_CLOSE','ASSIGNMENT_CLOSE') NOT NULL,
  `mode`                     ENUM('PREVIEW','VALIDATE','EXECUTE') NOT NULL,
  `status`                   ENUM('DRAFT','PREVIEWED','VALIDATED','EXECUTING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `requested_by_user_id`     CHAR(36)       NOT NULL,
  `requested_at`             TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `params`                   JSON           NOT NULL,
  `queued_job_id`            CHAR(36)       NULL,
  `target_count`             INTEGER        NOT NULL DEFAULT 0,
  `processed_count`          INTEGER        NOT NULL DEFAULT 0,
  `succeeded_count`          INTEGER        NOT NULL DEFAULT 0,
  `failed_count`             INTEGER        NOT NULL DEFAULT 0,
  `preview_result`           JSON           NULL,
  `validation_result`        JSON           NULL,
  `started_at`               TIMESTAMP(3)   NULL,
  `ended_at`                 TIMESTAMP(3)   NULL,
  `error_message`            VARCHAR(2000)  NULL,
  `created_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)       NULL,
  `updated_by`               CHAR(36)       NULL,
  `deleted_at`               TIMESTAMP(3)   NULL,
  `deleted_by`               CHAR(36)       NULL,
  `version`                  INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_bulk_op_school_status_requested`  (`school_id`, `status`, `requested_at`),
  INDEX `ix_bulk_op_school_kind_requested`    (`school_id`, `kind`, `requested_at`),
  INDEX `ix_bulk_op_school_requested_by`      (`school_id`, `requested_by_user_id`),
  INDEX `ix_bulk_op_deleted_at`               (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: dashboards
-- ============================================================================
CREATE TABLE `dashboards` (
  `id`                  CHAR(36)       NOT NULL,
  `school_id`           CHAR(36)       NOT NULL,
  `code`                VARCHAR(40)    NOT NULL,
  `name`                VARCHAR(200)   NOT NULL,
  `description`         VARCHAR(1000)  NULL,
  `is_default`          BOOLEAN        NOT NULL DEFAULT false,
  `owned_by_user_id`    CHAR(36)       NOT NULL,
  `created_at`          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`          CHAR(36)       NULL,
  `updated_by`          CHAR(36)       NULL,
  `deleted_at`          TIMESTAMP(3)   NULL,
  `deleted_by`          CHAR(36)       NULL,
  `version`             INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_dashboard_school_owned_by`  (`school_id`, `owned_by_user_id`),
  INDEX `ix_dashboard_deleted_at`       (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: dashboard_widgets
-- ============================================================================
CREATE TABLE `dashboard_widgets` (
  `id`             CHAR(36)       NOT NULL,
  `school_id`      CHAR(36)       NOT NULL,
  `dashboard_id`   CHAR(36)       NOT NULL,
  `kind`           ENUM('METRIC','CHART_LINE','CHART_BAR','CHART_PIE','TABLE','LIST','TEXT') NOT NULL,
  `position`       INTEGER        NOT NULL,
  `title`          VARCHAR(200)   NOT NULL,
  `config`         JSON           NOT NULL,
  `created_at`     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`     CHAR(36)       NULL,
  `updated_by`     CHAR(36)       NULL,
  `deleted_at`     TIMESTAMP(3)   NULL,
  `deleted_by`     CHAR(36)       NULL,
  `version`        INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_dashboard_widget_school_dashboard_position` (`school_id`, `dashboard_id`, `position`),
  INDEX `ix_dashboard_widget_deleted_at`                (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: report_schedules
-- ============================================================================
CREATE TABLE `report_schedules` (
  `id`                       CHAR(36)       NOT NULL,
  `school_id`                CHAR(36)       NOT NULL,
  `code`                     VARCHAR(40)    NOT NULL,
  `name`                     VARCHAR(200)   NOT NULL,
  `report_kind`              ENUM('STUDENT_LIST','STUDENT_ATTENDANCE_SUMMARY','STAFF_ATTENDANCE_SUMMARY','EXAM_MARKS_SHEET','EXAM_RESULT_SUMMARY','FEE_COLLECTION_SUMMARY','FEE_OUTSTANDING','HOMEWORK_COMPLIANCE','SYLLABUS_PROGRESS') NOT NULL,
  `format`                   ENUM('CSV','EXCEL','PDF') NOT NULL,
  `frequency`                ENUM('DAILY','WEEKLY','MONTHLY','CUSTOM_CRON') NOT NULL,
  `cron`                     VARCHAR(120)   NOT NULL,
  `params`                   JSON           NOT NULL,
  `recipients`               JSON           NOT NULL,
  `is_enabled`               BOOLEAN        NOT NULL DEFAULT true,
  `next_run_at`              TIMESTAMP(3)   NULL,
  `last_run_at`              TIMESTAMP(3)   NULL,
  `last_report_run_id`       CHAR(36)       NULL,
  `owned_by_user_id`         CHAR(36)       NOT NULL,
  `created_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)       NULL,
  `updated_by`               CHAR(36)       NULL,
  `deleted_at`               TIMESTAMP(3)   NULL,
  `deleted_by`               CHAR(36)       NULL,
  `version`                  INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_report_schedule_school_enabled_next` (`school_id`, `is_enabled`, `next_run_at`),
  INDEX `ix_report_schedule_school_kind`         (`school_id`, `report_kind`),
  INDEX `ix_report_schedule_school_owned_by`     (`school_id`, `owned_by_user_id`),
  INDEX `ix_report_schedule_deleted_at`          (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: report_templates
-- ============================================================================
CREATE TABLE `report_templates` (
  `id`                  CHAR(36)       NOT NULL,
  `school_id`           CHAR(36)       NOT NULL,
  `code`                VARCHAR(40)    NOT NULL,
  `name`                VARCHAR(200)   NOT NULL,
  `description`         VARCHAR(1000)  NULL,
  `report_kind`         ENUM('STUDENT_LIST','STUDENT_ATTENDANCE_SUMMARY','STAFF_ATTENDANCE_SUMMARY','EXAM_MARKS_SHEET','EXAM_RESULT_SUMMARY','FEE_COLLECTION_SUMMARY','FEE_OUTSTANDING','HOMEWORK_COMPLIANCE','SYLLABUS_PROGRESS') NOT NULL,
  `params`              JSON           NOT NULL,
  `is_shared`           BOOLEAN        NOT NULL DEFAULT false,
  `owned_by_user_id`    CHAR(36)       NOT NULL,
  `created_at`          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`          CHAR(36)       NULL,
  `updated_by`          CHAR(36)       NULL,
  `deleted_at`          TIMESTAMP(3)   NULL,
  `deleted_by`          CHAR(36)       NULL,
  `version`             INTEGER        NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_report_template_school_kind`      (`school_id`, `report_kind`),
  INDEX `ix_report_template_school_owned_by`  (`school_id`, `owned_by_user_id`),
  INDEX `ix_report_template_school_shared`    (`school_id`, `is_shared`),
  INDEX `ix_report_template_deleted_at`       (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 2a: composite (school_id, *_id) foreign keys
-- ============================================================================
ALTER TABLE `import_job_issues`
  ADD CONSTRAINT `fk_import_job_issue_job`
  FOREIGN KEY (`school_id`, `import_job_id`)
  REFERENCES `import_jobs` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `dashboard_widgets`
  ADD CONSTRAINT `fk_dashboard_widget_dashboard`
  FOREIGN KEY (`school_id`, `dashboard_id`)
  REFERENCES `dashboards` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- ============================================================================
-- Section 2b: single-column foreign keys to file_assets(id)
-- FileAsset is TENANT_SHARED_PLATFORM (school_id nullable for platform
-- assets); composite (school_id, file_asset_id) FK would refuse platform-
-- owned rows. Single-column FK precedent: Sprint 5 file_asset_acl_grants.
-- ============================================================================
ALTER TABLE `report_runs`
  ADD CONSTRAINT `fk_report_run_file_asset`
  FOREIGN KEY (`file_asset_id`)
  REFERENCES `file_assets` (`id`)
  ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE `import_jobs`
  ADD CONSTRAINT `fk_import_job_source_file_asset`
  FOREIGN KEY (`source_file_asset_id`)
  REFERENCES `file_assets` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ============================================================================
-- Section 3: STORED `deleted_at_key` projections + partial-unique indexes
-- for the 6 soft-deleted tables that need active-row uniqueness on `code`.
-- Format `'%Y%m%d%H%i%s.%f'` → '0' sentinel mirrors Sprint 5-12 migrations.
-- Prisma cannot emit GENERATED ALWAYS AS.
-- ============================================================================
ALTER TABLE `report_runs`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_report_run_code_active`
  ON `report_runs` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `import_jobs`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_import_job_code_active`
  ON `import_jobs` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `bulk_operations`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_bulk_op_code_active`
  ON `bulk_operations` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `dashboards`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_dashboard_code_active`
  ON `dashboards` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `report_schedules`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_report_schedule_code_active`
  ON `report_schedules` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `report_templates`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_report_template_code_active`
  ON `report_templates` (`school_id`, `code`, `deleted_at_key`);
