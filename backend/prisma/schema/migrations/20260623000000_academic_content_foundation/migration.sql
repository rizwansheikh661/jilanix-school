-- Sprint 12 — Academic Content (Homework, Assignments & Syllabus) Foundation
-- migration.
-- Hand-crafted (Sprint 7-11 precedent): `prisma migrate dev` is unusable
-- because the shadow-DB reconstruction loses STORED virtual columns. This
-- file is authored by hand to match the conventions of prior foundations
-- (backticked identifiers, 2-space indents on multi-statement ALTERs,
-- composite (school_id, id) PKs, STORED `deleted_at_key` + partial-unique
-- pattern at the tail). Format `'%Y%m%d%H%i%s.%f'` / `'0'` sentinel mirrors
-- Sprint 9-11 base. Default collation `utf8mb4_unicode_ci`. `BOOLEAN`
-- (== TINYINT(1)) chosen for consistency with prior migrations.
--
-- What this migration adds (four sections):
--   1. 8 CREATE TABLE statements for the academic-content schema:
--      - homeworks                            (header, soft-delete)
--      - homework_attachments                 (FileAsset-backed, soft-delete)
--      - assignments                          (header + marks, soft-delete)
--      - assignment_attachments               (FileAsset-backed, soft-delete)
--      - assignment_submissions               (teacher-mediated, soft-delete)
--      - assignment_submission_attachments    (FileAsset-backed, soft-delete)
--      - syllabi                              (container, soft-delete)
--      - syllabus_nodes                       (self-ref tree, soft-delete)
--   2. Composite (school_id, *_id) foreign keys on the relations:
--      - homework_attachments                  → homeworks
--      - assignment_attachments                → assignments
--      - assignment_submissions                → assignments
--      - assignment_submission_attachments     → assignment_submissions
--      - syllabus_nodes                        → syllabi
--      - syllabus_nodes                        → syllabus_nodes (self,
--                                                parent_node_id nullable)
--      Single-column FKs on file_asset_id columns NOT added: FileAsset is
--      TENANT_SHARED_PLATFORM (school_id nullable for platform assets) so a
--      composite (school_id, file_asset_id) FK would refuse platform-owned
--      rows. Cross-tenant safety enforced in the service via
--      assertTenantRefs (single-column FK precedent from Sprint 11
--      event_documents).
--   3. STORED `deleted_at_key` projection on 4 of the 8 soft-deleted tables:
--      homeworks, assignments, assignment_submissions, syllabi. These are the
--      tables with active-row uniqueness requirements:
--        - uq_homework_code_active            (school_id, code, deleted_at_key)
--        - uq_assignment_code_active          (school_id, code, deleted_at_key)
--        - uq_assignment_submission_active    (school_id, assignment_id,
--                                              student_id, deleted_at_key)
--        - uq_syllabus_active                 (school_id, academic_year_id,
--                                              class_id, subject_id,
--                                              deleted_at_key)
--      The 4 attachment / node tables have NO active-row uniqueness —
--      duplicate attachments per parent are permitted; multiple nodes can
--      share names within a syllabus.
--      Prisma cannot emit GENERATED ALWAYS AS; format `'%Y%m%d%H%i%s.%f'`
--      → '0' sentinel mirrors the Sprint 5-11 base migrations.
--   4. No backfill required — all 8 tables are net-new. Existing rows are
--      unaffected (only prior fees / notifications / events / etc. tables
--      touched in previous sprints).

-- ============================================================================
-- Section 1: homeworks
-- ============================================================================
CREATE TABLE `homeworks` (
  `id`                    CHAR(36)      NOT NULL,
  `school_id`             CHAR(36)      NOT NULL,
  `code`                  VARCHAR(40)   NOT NULL,
  `title`                 VARCHAR(200)  NOT NULL,
  `description`           TEXT          NULL,
  `instructions`          TEXT          NULL,
  `academic_year_id`      CHAR(36)      NOT NULL,
  `class_id`              CHAR(36)      NOT NULL,
  `section_id`            CHAR(36)      NOT NULL,
  `subject_id`            CHAR(36)      NOT NULL,
  `assigned_by_staff_id`  CHAR(36)      NOT NULL,
  `assigned_date`         DATE          NOT NULL,
  `due_date`              DATE          NOT NULL,
  `priority`              ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  `status`                ENUM('DRAFT','PUBLISHED','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `published_at`          TIMESTAMP(3)  NULL,
  `closed_at`             TIMESTAMP(3)  NULL,
  `cancelled_at`          TIMESTAMP(3)  NULL,
  `cancellation_reason`   VARCHAR(500)  NULL,
  `attachment_count`      INTEGER       NOT NULL DEFAULT 0,
  `created_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`            CHAR(36)      NULL,
  `updated_by`            CHAR(36)      NULL,
  `deleted_at`            TIMESTAMP(3)  NULL,
  `deleted_by`            CHAR(36)      NULL,
  `version`               INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_homework_school_status_due`            (`school_id`, `status`, `due_date`),
  INDEX `ix_homework_school_section_subject_due`   (`school_id`, `section_id`, `subject_id`, `due_date`),
  INDEX `ix_homework_school_assigned_by`           (`school_id`, `assigned_by_staff_id`),
  INDEX `ix_homework_school_year_class`            (`school_id`, `academic_year_id`, `class_id`),
  INDEX `ix_homework_deleted_at`                   (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: homework_attachments
-- ============================================================================
CREATE TABLE `homework_attachments` (
  `id`                     CHAR(36)      NOT NULL,
  `school_id`              CHAR(36)      NOT NULL,
  `homework_id`            CHAR(36)      NOT NULL,
  `file_asset_id`          CHAR(36)      NOT NULL,
  `attachment_type`        ENUM('PDF','DOC','DOCX','IMAGE','WORKSHEET','NOTE','OTHER') NOT NULL,
  `title`                  VARCHAR(200)  NOT NULL,
  `uploaded_by_staff_id`   CHAR(36)      NULL,
  `created_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`             CHAR(36)      NULL,
  `updated_by`             CHAR(36)      NULL,
  `deleted_at`             TIMESTAMP(3)  NULL,
  `deleted_by`             CHAR(36)      NULL,
  `version`                INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_homework_attachment_school_homework`     (`school_id`, `homework_id`),
  INDEX `ix_homework_attachment_school_file_asset`   (`school_id`, `file_asset_id`),
  INDEX `ix_homework_attachment_deleted_at`          (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: assignments
-- ============================================================================
CREATE TABLE `assignments` (
  `id`                    CHAR(36)      NOT NULL,
  `school_id`             CHAR(36)      NOT NULL,
  `code`                  VARCHAR(40)   NOT NULL,
  `title`                 VARCHAR(200)  NOT NULL,
  `description`           TEXT          NULL,
  `academic_year_id`      CHAR(36)      NOT NULL,
  `class_id`              CHAR(36)      NOT NULL,
  `section_id`            CHAR(36)      NOT NULL,
  `subject_id`            CHAR(36)      NOT NULL,
  `assigned_by_staff_id`  CHAR(36)      NOT NULL,
  `assigned_date`         DATE          NOT NULL,
  `due_date`              DATE          NOT NULL,
  `max_marks`             DECIMAL(8,2)  NOT NULL,
  `passing_marks`         DECIMAL(8,2)  NOT NULL,
  `status`                ENUM('DRAFT','PUBLISHED','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `published_at`          TIMESTAMP(3)  NULL,
  `closed_at`             TIMESTAMP(3)  NULL,
  `cancelled_at`          TIMESTAMP(3)  NULL,
  `cancellation_reason`   VARCHAR(500)  NULL,
  `submission_count`      INTEGER       NOT NULL DEFAULT 0,
  `evaluated_count`       INTEGER       NOT NULL DEFAULT 0,
  `late_count`            INTEGER       NOT NULL DEFAULT 0,
  `created_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`            CHAR(36)      NULL,
  `updated_by`            CHAR(36)      NULL,
  `deleted_at`            TIMESTAMP(3)  NULL,
  `deleted_by`            CHAR(36)      NULL,
  `version`               INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_assignment_school_status_due`            (`school_id`, `status`, `due_date`),
  INDEX `ix_assignment_school_section_subject_due`   (`school_id`, `section_id`, `subject_id`, `due_date`),
  INDEX `ix_assignment_school_assigned_by`           (`school_id`, `assigned_by_staff_id`),
  INDEX `ix_assignment_school_year_class`            (`school_id`, `academic_year_id`, `class_id`),
  INDEX `ix_assignment_deleted_at`                   (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: assignment_attachments
-- ============================================================================
CREATE TABLE `assignment_attachments` (
  `id`                     CHAR(36)      NOT NULL,
  `school_id`              CHAR(36)      NOT NULL,
  `assignment_id`          CHAR(36)      NOT NULL,
  `file_asset_id`          CHAR(36)      NOT NULL,
  `attachment_type`        ENUM('PDF','DOC','DOCX','IMAGE','WORKSHEET','NOTE','OTHER') NOT NULL,
  `title`                  VARCHAR(200)  NOT NULL,
  `uploaded_by_staff_id`   CHAR(36)      NULL,
  `created_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`             CHAR(36)      NULL,
  `updated_by`             CHAR(36)      NULL,
  `deleted_at`             TIMESTAMP(3)  NULL,
  `deleted_by`             CHAR(36)      NULL,
  `version`                INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_assignment_attachment_school_assignment` (`school_id`, `assignment_id`),
  INDEX `ix_assignment_attachment_school_file_asset` (`school_id`, `file_asset_id`),
  INDEX `ix_assignment_attachment_deleted_at`        (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: assignment_submissions
-- ============================================================================
CREATE TABLE `assignment_submissions` (
  `id`                       CHAR(36)      NOT NULL,
  `school_id`                CHAR(36)      NOT NULL,
  `assignment_id`            CHAR(36)      NOT NULL,
  `student_id`               CHAR(36)      NOT NULL,
  `submitted_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_late`                  BOOLEAN       NOT NULL DEFAULT false,
  `status`                   ENUM('SUBMITTED','LATE_SUBMITTED','EVALUATED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  `recorded_by_staff_id`     CHAR(36)      NULL,
  `remarks`                  VARCHAR(1000) NULL,
  `marks_obtained`           DECIMAL(8,2)  NULL,
  `evaluated_at`             TIMESTAMP(3)  NULL,
  `evaluated_by_staff_id`    CHAR(36)      NULL,
  `evaluation_remarks`       VARCHAR(1000) NULL,
  `rubric_snapshot`          JSON          NULL,
  `rejected_at`              TIMESTAMP(3)  NULL,
  `rejection_reason`         VARCHAR(500)  NULL,
  `created_at`               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)      NULL,
  `updated_by`               CHAR(36)      NULL,
  `deleted_at`               TIMESTAMP(3)  NULL,
  `deleted_by`               CHAR(36)      NULL,
  `version`                  INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_assignment_submission_school_assignment_status`  (`school_id`, `assignment_id`, `status`),
  INDEX `ix_assignment_submission_school_assignment_student` (`school_id`, `assignment_id`, `student_id`),
  INDEX `ix_assignment_submission_school_student`            (`school_id`, `student_id`),
  INDEX `ix_assignment_submission_school_evaluated_by`       (`school_id`, `evaluated_by_staff_id`),
  INDEX `ix_assignment_submission_deleted_at`                (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: assignment_submission_attachments
-- ============================================================================
CREATE TABLE `assignment_submission_attachments` (
  `id`                     CHAR(36)      NOT NULL,
  `school_id`              CHAR(36)      NOT NULL,
  `submission_id`          CHAR(36)      NOT NULL,
  `file_asset_id`          CHAR(36)      NOT NULL,
  `attachment_type`        ENUM('PDF','DOC','DOCX','IMAGE','WORKSHEET','NOTE','OTHER') NOT NULL,
  `title`                  VARCHAR(200)  NOT NULL,
  `uploaded_by_staff_id`   CHAR(36)      NULL,
  `created_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`             CHAR(36)      NULL,
  `updated_by`             CHAR(36)      NULL,
  `deleted_at`             TIMESTAMP(3)  NULL,
  `deleted_by`             CHAR(36)      NULL,
  `version`                INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_assignment_submission_attachment_school_submission` (`school_id`, `submission_id`),
  INDEX `ix_assignment_submission_attachment_school_file_asset` (`school_id`, `file_asset_id`),
  INDEX `ix_assignment_submission_attachment_deleted_at`        (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: syllabi
-- ============================================================================
CREATE TABLE `syllabi` (
  `id`                        CHAR(36)      NOT NULL,
  `school_id`                 CHAR(36)      NOT NULL,
  `academic_year_id`          CHAR(36)      NOT NULL,
  `class_id`                  CHAR(36)      NOT NULL,
  `subject_id`                CHAR(36)      NOT NULL,
  `status`                    ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  `planned_completion_date`   DATE          NULL,
  `actual_completion_date`    DATE          NULL,
  `completion_percent`        DECIMAL(5,2)  NOT NULL DEFAULT 0,
  `owned_by_staff_id`         CHAR(36)      NULL,
  `created_at`                TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`                CHAR(36)      NULL,
  `updated_by`                CHAR(36)      NULL,
  `deleted_at`                TIMESTAMP(3)  NULL,
  `deleted_by`                CHAR(36)      NULL,
  `version`                   INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_syllabus_school_year_class`  (`school_id`, `academic_year_id`, `class_id`),
  INDEX `ix_syllabus_school_subject`     (`school_id`, `subject_id`),
  INDEX `ix_syllabus_school_owned_by`    (`school_id`, `owned_by_staff_id`),
  INDEX `ix_syllabus_deleted_at`         (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: syllabus_nodes
-- ============================================================================
CREATE TABLE `syllabus_nodes` (
  `id`                        CHAR(36)      NOT NULL,
  `school_id`                 CHAR(36)      NOT NULL,
  `syllabus_id`               CHAR(36)      NOT NULL,
  `parent_node_id`            CHAR(36)      NULL,
  `node_type`                 ENUM('UNIT','CHAPTER','TOPIC') NOT NULL,
  `name`                      VARCHAR(200)  NOT NULL,
  `sequence`                  INTEGER       NOT NULL,
  `planned_completion_date`   DATE          NULL,
  `actual_completion_date`    DATE          NULL,
  `status`                    ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  `completed_by_staff_id`     CHAR(36)      NULL,
  `created_at`                TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`                CHAR(36)      NULL,
  `updated_by`                CHAR(36)      NULL,
  `deleted_at`                TIMESTAMP(3)  NULL,
  `deleted_by`                CHAR(36)      NULL,
  `version`                   INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_syllabus_node_school_syllabus_parent_sequence` (`school_id`, `syllabus_id`, `parent_node_id`, `sequence`),
  INDEX `ix_syllabus_node_school_syllabus_type_status`     (`school_id`, `syllabus_id`, `node_type`, `status`),
  INDEX `ix_syllabus_node_deleted_at`                      (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 2: composite (school_id, *_id) foreign keys
-- ============================================================================
ALTER TABLE `homework_attachments`
  ADD CONSTRAINT `fk_homework_attachment_homework`
  FOREIGN KEY (`school_id`, `homework_id`)
  REFERENCES `homeworks` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `assignment_attachments`
  ADD CONSTRAINT `fk_assignment_attachment_assignment`
  FOREIGN KEY (`school_id`, `assignment_id`)
  REFERENCES `assignments` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `assignment_submissions`
  ADD CONSTRAINT `fk_assignment_submission_assignment`
  FOREIGN KEY (`school_id`, `assignment_id`)
  REFERENCES `assignments` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `assignment_submission_attachments`
  ADD CONSTRAINT `fk_assignment_submission_attachment_submission`
  FOREIGN KEY (`school_id`, `submission_id`)
  REFERENCES `assignment_submissions` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `syllabus_nodes`
  ADD CONSTRAINT `fk_syllabus_node_syllabus`
  FOREIGN KEY (`school_id`, `syllabus_id`)
  REFERENCES `syllabi` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `syllabus_nodes`
  ADD CONSTRAINT `fk_syllabus_node_parent`
  FOREIGN KEY (`school_id`, `parent_node_id`)
  REFERENCES `syllabus_nodes` (`school_id`, `id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ============================================================================
-- Section 3: STORED `deleted_at_key` projections + partial-unique indexes
-- for the 4 soft-deleted tables that need active-row uniqueness.
-- Format `'%Y%m%d%H%i%s.%f'` → '0' sentinel mirrors Sprint 5-11 migrations.
-- Prisma cannot emit GENERATED ALWAYS AS.
-- ============================================================================
ALTER TABLE `homeworks`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_homework_code_active`
  ON `homeworks` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `assignments`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_assignment_code_active`
  ON `assignments` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `assignment_submissions`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_assignment_submission_active`
  ON `assignment_submissions` (`school_id`, `assignment_id`, `student_id`, `deleted_at_key`);

ALTER TABLE `syllabi`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_syllabus_active`
  ON `syllabi` (`school_id`, `academic_year_id`, `class_id`, `subject_id`, `deleted_at_key`);

-- ---------------------------------------------------------------------------
-- Section 4: Extend file_assets.purpose enum for Sprint 11 + Sprint 12 file
-- purposes (EVENT_DOCUMENT carried over from Sprint 11 — its migration omitted
-- the ALTER; consolidated here so HOMEWORK_ATTACHMENT / ASSIGNMENT_ATTACHMENT /
-- ASSIGNMENT_SUBMISSION inserts succeed at the DB layer).
-- ---------------------------------------------------------------------------
ALTER TABLE `file_assets` MODIFY COLUMN `purpose` ENUM(
  'STUDENT_PHOTO',
  'STAFF_PHOTO',
  'ADMISSION_DOCUMENT',
  'SCHOOL_DOCUMENT',
  'SCHOOL_LOGO',
  'MESSAGE_ATTACHMENT',
  'REPORT_EXPORT',
  'BULK_IMPORT',
  'EVENT_DOCUMENT',
  'HOMEWORK_ATTACHMENT',
  'ASSIGNMENT_ATTACHMENT',
  'ASSIGNMENT_SUBMISSION',
  'OTHER'
) NOT NULL;
