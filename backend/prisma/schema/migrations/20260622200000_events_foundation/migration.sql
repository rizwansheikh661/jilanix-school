-- Sprint 11 — Events & Activities Foundation migration.
-- Hand-crafted (Sprint 7-10 precedent): `prisma migrate dev` is unusable
-- because the shadow-DB reconstruction loses STORED virtual columns. This
-- file is authored by hand to match the conventions of prior foundations
-- (backticked identifiers, 2-space indents on multi-statement ALTERs,
-- composite (school_id, id) PKs, STORED `deleted_at_key` + partial-unique
-- pattern at the tail). Format `'%Y%m%d%H%i%s.%f'` / `'0'` sentinel mirrors
-- Sprint 9 base. Default collation `utf8mb4_unicode_ci`. `BOOLEAN`
-- (== TINYINT(1)) chosen for consistency with prior migrations.
--
-- What this migration adds (four sections):
--   1. 6 CREATE TABLE statements for the events schema:
--      - events                  (header, soft-delete)
--      - event_participants      (per-event registration, soft-delete)
--      - event_attendance        (APPEND_ONLY ledger — no soft-delete column)
--      - event_documents         (FileAsset-backed attachments, soft-delete)
--      - event_fee_assignments   (paid-event bridge → Sprint 9 fees,
--                                 soft-delete)
--      - event_results           (rank/position/score, soft-delete)
--   2. Composite (school_id, *_id) foreign keys on the relations:
--      - event_participants     → events
--      - event_attendance       → events, event_participants
--      - event_documents        → events
--      - event_fee_assignments  → events, event_participants
--      - event_results          → events, event_participants
--      Single-column FK on event_documents.file_asset_id NOT added here:
--      FileAsset is TENANT_SHARED_PLATFORM (school_id nullable for platform
--      assets) so a composite (school_id, file_asset_id) FK would refuse
--      platform-owned rows. Cross-tenant safety is enforced in the service
--      via assertTenantRefs.
--   3. STORED `deleted_at_key` projection on 3 of the 5 soft-deleted tables:
--      events, event_participants, event_fee_assignments. These are the
--      tables with active-row uniqueness requirements:
--        - uq_event_code_active                  (school_id, code, deleted_at_key)
--        - uq_event_participant_user_active      (school_id, event_id, user_id, deleted_at_key)
--        - uq_event_fee_assignment_active        (school_id, event_id, participant_id, deleted_at_key)
--      event_documents and event_results have no active-row uniqueness —
--      duplicate documents/results per participant are allowed.
--      Prisma cannot emit GENERATED ALWAYS AS; format `'%Y%m%d%H%i%s.%f'`
--      → '0' sentinel mirrors the Sprint 5-10 base migrations.
--   4. No backfill required — all 6 tables are net-new. Existing rows are
--      unaffected (only prior fees / notifications / etc. tables touched in
--      previous sprints).

-- ============================================================================
-- Section 1: events
-- ============================================================================
CREATE TABLE `events` (
  `id`                      CHAR(36)      NOT NULL,
  `school_id`               CHAR(36)      NOT NULL,
  `code`                    VARCHAR(40)   NOT NULL,
  `name`                    VARCHAR(200)  NOT NULL,
  `description`             TEXT          NULL,
  `event_type`              ENUM('ACADEMIC','CULTURAL','SPORTS','NATIONAL','SCHOOL_FUNCTION','WORKSHOP','SEMINAR','COMPETITION','EDUCATIONAL_TOUR','PICNIC','CUSTOM') NOT NULL,
  `category`                ENUM('ACADEMIC','CULTURAL','SPORTS','NATIONAL','ADMINISTRATIVE','EDUCATIONAL_TOUR','COMPETITION','WORKSHOP','SEMINAR','CUSTOM') NOT NULL,
  `sub_type`                VARCHAR(80)   NULL,
  `status`                  ENUM('DRAFT','SCHEDULED','PUBLISHED','ONGOING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `start_date`              DATE          NOT NULL,
  `end_date`                DATE          NOT NULL,
  `start_time`              TIME          NULL,
  `end_time`                TIME          NULL,
  `timezone`                VARCHAR(40)   NOT NULL DEFAULT 'Asia/Kolkata',
  `branch_id`               CHAR(36)      NULL,
  `venue`                   VARCHAR(200)  NULL,
  `organizer_staff_id`      CHAR(36)      NULL,
  `registration_type`       ENUM('OPEN','APPROVAL_REQUIRED','INVITATION_ONLY') NOT NULL DEFAULT 'OPEN',
  `registration_open`       BOOLEAN       NOT NULL DEFAULT false,
  `registration_open_at`    TIMESTAMP(3)  NULL,
  `registration_closed_at`  TIMESTAMP(3)  NULL,
  `registration_capacity`   INTEGER       NULL,
  `is_free`                 BOOLEAN       NOT NULL DEFAULT true,
  `fee_head_id`             CHAR(36)      NULL,
  `fee_structure_id`        CHAR(36)      NULL,
  `fee_amount`              DECIMAL(12,2) NULL,
  `estimated_cost`          DECIMAL(12,2) NULL,
  `actual_cost`             DECIMAL(12,2) NULL,
  `sponsorship_amount`      DECIMAL(12,2) NULL,
  `published_at`            TIMESTAMP(3)  NULL,
  `started_at`              TIMESTAMP(3)  NULL,
  `completed_at`            TIMESTAMP(3)  NULL,
  `cancelled_at`            TIMESTAMP(3)  NULL,
  `cancellation_reason`     VARCHAR(500)  NULL,
  `registered_count`        INTEGER       NOT NULL DEFAULT 0,
  `attended_count`          INTEGER       NOT NULL DEFAULT 0,
  `absent_count`            INTEGER       NOT NULL DEFAULT 0,
  `created_at`              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`              TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`              CHAR(36)      NULL,
  `updated_by`              CHAR(36)      NULL,
  `deleted_at`              TIMESTAMP(3)  NULL,
  `deleted_by`              CHAR(36)      NULL,
  `version`                 INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_event_school_status_start`   (`school_id`, `status`, `start_date`),
  INDEX `ix_event_school_type_category`  (`school_id`, `event_type`, `category`),
  INDEX `ix_event_school_branch_start`   (`school_id`, `branch_id`, `start_date`),
  INDEX `ix_event_school_organizer`      (`school_id`, `organizer_staff_id`),
  INDEX `ix_event_deleted_at`            (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: event_participants
-- ============================================================================
CREATE TABLE `event_participants` (
  `id`                    CHAR(36)     NOT NULL,
  `school_id`             CHAR(36)     NOT NULL,
  `event_id`              CHAR(36)     NOT NULL,
  `audience`              ENUM('STUDENT','STAFF','TEACHER') NOT NULL,
  `user_id`               CHAR(36)     NOT NULL,
  `student_id`            CHAR(36)     NULL,
  `staff_id`              CHAR(36)     NULL,
  `class_id`              CHAR(36)     NULL,
  `section_id`            CHAR(36)     NULL,
  `status`                ENUM('PENDING','REGISTERED','INVITED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `registration_type`     ENUM('OPEN','APPROVAL_REQUIRED','INVITATION_ONLY') NOT NULL,
  `registered_at`         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `approved_at`           TIMESTAMP(3) NULL,
  `approved_by`           CHAR(36)     NULL,
  `rejected_at`           TIMESTAMP(3) NULL,
  `rejected_by`           CHAR(36)     NULL,
  `rejection_reason`      VARCHAR(500) NULL,
  `cancelled_at`          TIMESTAMP(3) NULL,
  `cancellation_reason`   VARCHAR(500) NULL,
  `registration_source`   VARCHAR(40)  NOT NULL,
  `created_at`            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`            CHAR(36)     NULL,
  `updated_by`            CHAR(36)     NULL,
  `deleted_at`            TIMESTAMP(3) NULL,
  `deleted_by`            CHAR(36)     NULL,
  `version`               INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_event_participant_school_event_audience_status` (`school_id`, `event_id`, `audience`, `status`),
  INDEX `ix_event_participant_school_event_user`            (`school_id`, `event_id`, `user_id`),
  INDEX `ix_event_participant_school_user`                  (`school_id`, `user_id`),
  INDEX `ix_event_participant_deleted_at`                   (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: event_attendance (APPEND_ONLY — no deleted_at / version columns)
-- ============================================================================
CREATE TABLE `event_attendance` (
  `id`              CHAR(36)     NOT NULL,
  `school_id`       CHAR(36)     NOT NULL,
  `event_id`        CHAR(36)     NOT NULL,
  `participant_id`  CHAR(36)     NOT NULL,
  `status`          ENUM('REGISTERED','ATTENDED','ABSENT','CANCELLED') NOT NULL,
  `method`          ENUM('MANUAL','QR','RFID') NOT NULL DEFAULT 'MANUAL',
  `occurred_at`     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `marked_by`       CHAR(36)     NULL,
  `device_ref`      VARCHAR(80)  NULL,
  `notes`           VARCHAR(500) NULL,
  `created_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by`      CHAR(36)     NULL,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_event_attendance_school_event_participant_occurred` (`school_id`, `event_id`, `participant_id`, `occurred_at`),
  INDEX `ix_event_attendance_school_event_status`               (`school_id`, `event_id`, `status`),
  INDEX `ix_event_attendance_school_participant`                (`school_id`, `participant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: event_documents
-- ============================================================================
CREATE TABLE `event_documents` (
  `id`              CHAR(36)     NOT NULL,
  `school_id`       CHAR(36)     NOT NULL,
  `event_id`        CHAR(36)     NOT NULL,
  `file_asset_id`   CHAR(36)     NOT NULL,
  `document_type`   ENUM('CIRCULAR','GUIDELINE','PERMISSION_FORM','IMAGE','ATTACHMENT') NOT NULL,
  `title`           VARCHAR(200) NOT NULL,
  `description`     TEXT         NULL,
  `is_public`       BOOLEAN      NOT NULL DEFAULT false,
  `uploaded_by`     CHAR(36)     NULL,
  `created_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`      CHAR(36)     NULL,
  `updated_by`      CHAR(36)     NULL,
  `deleted_at`      TIMESTAMP(3) NULL,
  `deleted_by`      CHAR(36)     NULL,
  `version`         INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_event_document_school_event_type`   (`school_id`, `event_id`, `document_type`),
  INDEX `ix_event_document_school_file_asset`   (`school_id`, `file_asset_id`),
  INDEX `ix_event_document_deleted_at`          (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: event_fee_assignments
-- ============================================================================
CREATE TABLE `event_fee_assignments` (
  `id`                CHAR(36)      NOT NULL,
  `school_id`         CHAR(36)      NOT NULL,
  `event_id`          CHAR(36)      NOT NULL,
  `participant_id`    CHAR(36)      NOT NULL,
  `student_id`        CHAR(36)      NOT NULL,
  `fee_head_id`       CHAR(36)      NOT NULL,
  `fee_structure_id`  CHAR(36)      NULL,
  `amount`            DECIMAL(12,2) NOT NULL,
  `status`            ENUM('PENDING','INVOICED','VOID') NOT NULL DEFAULT 'PENDING',
  `fee_invoice_id`    CHAR(36)      NULL,
  `invoiced_at`       TIMESTAMP(3)  NULL,
  `voided_at`         TIMESTAMP(3)  NULL,
  `voided_by`         CHAR(36)      NULL,
  `void_reason`       VARCHAR(500)  NULL,
  `created_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`        CHAR(36)      NULL,
  `updated_by`        CHAR(36)      NULL,
  `deleted_at`        TIMESTAMP(3)  NULL,
  `deleted_by`        CHAR(36)      NULL,
  `version`           INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_event_fee_assignment_school_event_status`  (`school_id`, `event_id`, `status`),
  INDEX `ix_event_fee_assignment_school_participant`   (`school_id`, `participant_id`),
  INDEX `ix_event_fee_assignment_school_invoice`       (`school_id`, `fee_invoice_id`),
  INDEX `ix_event_fee_assignment_deleted_at`           (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 1: event_results
-- ============================================================================
CREATE TABLE `event_results` (
  `id`              CHAR(36)      NOT NULL,
  `school_id`       CHAR(36)      NOT NULL,
  `event_id`        CHAR(36)      NOT NULL,
  `participant_id`  CHAR(36)      NOT NULL,
  `rank`            INTEGER       NULL,
  `position`        ENUM('WINNER','RUNNER_UP','THIRD','PARTICIPANT') NOT NULL DEFAULT 'PARTICIPANT',
  `score`           DECIMAL(10,2) NULL,
  `remark`          VARCHAR(500)  NULL,
  `awarded_at`      TIMESTAMP(3)  NULL,
  `awarded_by`      CHAR(36)      NULL,
  `created_at`      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`      CHAR(36)      NULL,
  `updated_by`      CHAR(36)      NULL,
  `deleted_at`      TIMESTAMP(3)  NULL,
  `deleted_by`      CHAR(36)      NULL,
  `version`         INTEGER       NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_event_result_school_event_position` (`school_id`, `event_id`, `position`),
  INDEX `ix_event_result_school_participant`    (`school_id`, `participant_id`),
  INDEX `ix_event_result_deleted_at`            (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 2: composite (school_id, *_id) foreign keys
-- ============================================================================
ALTER TABLE `event_participants`
  ADD CONSTRAINT `fk_event_participant_event`
  FOREIGN KEY (`school_id`, `event_id`)
  REFERENCES `events` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_attendance`
  ADD CONSTRAINT `fk_event_attendance_event`
  FOREIGN KEY (`school_id`, `event_id`)
  REFERENCES `events` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_attendance`
  ADD CONSTRAINT `fk_event_attendance_participant`
  FOREIGN KEY (`school_id`, `participant_id`)
  REFERENCES `event_participants` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_documents`
  ADD CONSTRAINT `fk_event_document_event`
  FOREIGN KEY (`school_id`, `event_id`)
  REFERENCES `events` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_fee_assignments`
  ADD CONSTRAINT `fk_event_fee_assignment_event`
  FOREIGN KEY (`school_id`, `event_id`)
  REFERENCES `events` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_fee_assignments`
  ADD CONSTRAINT `fk_event_fee_assignment_participant`
  FOREIGN KEY (`school_id`, `participant_id`)
  REFERENCES `event_participants` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_results`
  ADD CONSTRAINT `fk_event_result_event`
  FOREIGN KEY (`school_id`, `event_id`)
  REFERENCES `events` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `event_results`
  ADD CONSTRAINT `fk_event_result_participant`
  FOREIGN KEY (`school_id`, `participant_id`)
  REFERENCES `event_participants` (`school_id`, `id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- ============================================================================
-- Section 3: STORED `deleted_at_key` projections + partial-unique indexes
-- for the 3 soft-deleted tables that need active-row uniqueness.
-- Format `'%Y%m%d%H%i%s.%f'` → '0' sentinel mirrors Sprint 5-10 migrations.
-- Prisma cannot emit GENERATED ALWAYS AS.
-- ============================================================================
ALTER TABLE `events`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_event_code_active`
  ON `events` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `event_participants`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_event_participant_user_active`
  ON `event_participants` (`school_id`, `event_id`, `user_id`, `deleted_at_key`);

ALTER TABLE `event_fee_assignments`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_event_fee_assignment_active`
  ON `event_fee_assignments` (`school_id`, `event_id`, `participant_id`, `deleted_at_key`);
