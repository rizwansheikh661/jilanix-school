-- Sprint 9.1 — Hybrid Fee Collection migration.
-- Hand-crafted as an additive follow-on to the Sprint 9 fees foundation
-- (20260620200000_fees_foundation). No shadow DB available locally, so
-- `prisma migrate diff` cannot be used; this file is authored by hand to
-- match the conventions of the Sprint 9 base (backticked identifiers,
-- 2-space indents on multi-statement ALTERs, composite (school_id, id) PKs,
-- STORED `deleted_at_key` + partial-unique pattern at the tail).
--
-- What this migration adds (six sections):
--   1. Extends the `fee_payments.method` ENUM with `UPI_MANUAL` and
--      `ONLINE_GATEWAY` while preserving the original `UPI` / `ONLINE`
--      values for backward compatibility with rows written by Sprint 9.
--   2. Adds 6 verification columns to `fee_payments` so manual UPI / bank
--      transfer payments can be reconciled with proof uploads and an
--      audit trail (`verification_status` defaults to `NOT_REQUIRED` so
--      legacy CASH / CHEQUE / ONLINE_GATEWAY rows pass through untouched).
--   3. Adds two query-path indexes on `fee_payments` covering the new
--      verification dashboard (school + status + paid_at) and the
--      school + payment-source lookup used by reconciliation reports.
--   4. Creates the `fee_payment_sources` table — a tenant-owned catalog
--      of school-registered payment instruments (QR codes, UPI handles,
--      bank accounts). Mirrors the `fee_heads` audit / soft-delete tail
--      exactly: composite (school_id, id) PK, standard audit columns,
--      soft-delete + version.
--   5. Adds the STORED `deleted_at_key` projection on `fee_payment_sources`
--      and the partial-unique active-row index on (school_id, code,
--      deleted_at_key). Prisma cannot emit STORED columns; pattern mirrors
--      Sprints 5–8 and the Sprint 9 base migration tail.
--   6. Wires the FK `fee_payments.payment_source_id → fee_payment_sources`
--      on the composite (school_id, payment_source_id) key, RESTRICT on
--      both delete and update (matching cross-aggregate FK behavior in
--      the Sprint 9 base migration).

-- Section 1: Extend fee_payments enum to add UPI_MANUAL + ONLINE_GATEWAY.
ALTER TABLE `fee_payments`
  MODIFY COLUMN `method` ENUM('CASH','CHEQUE','BANK_TRANSFER','UPI_MANUAL','ONLINE_GATEWAY','UPI','ONLINE') NOT NULL;

-- Section 2: Add 6 verification columns to fee_payments.
ALTER TABLE `fee_payments`
  ADD COLUMN `payment_source_id` CHAR(36) NULL,
  ADD COLUMN `payment_proof_url` VARCHAR(500) NULL,
  ADD COLUMN `verification_status` ENUM('NOT_REQUIRED','PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN `verified_by` CHAR(36) NULL,
  ADD COLUMN `verified_at` TIMESTAMP(3) NULL,
  ADD COLUMN `verification_notes` VARCHAR(500) NULL;

-- Section 3: Indexes on fee_payments for verification queries.
CREATE INDEX `ix_fee_payment_school_verif_paid` ON `fee_payments` (`school_id`, `verification_status`, `paid_at`);
CREATE INDEX `ix_fee_payment_school_source` ON `fee_payments` (`school_id`, `payment_source_id`);

-- Section 4: New table fee_payment_sources (mirror fee_heads audit tail).
CREATE TABLE `fee_payment_sources` (
  `id`           CHAR(36)     NOT NULL,
  `school_id`    CHAR(36)     NOT NULL,
  `code`         VARCHAR(40)  NOT NULL,
  `name`         VARCHAR(120) NOT NULL,
  `kind`         ENUM('SCHOOL_QR','SCHOOL_UPI','PRINCIPAL_UPI','MANAGEMENT_UPI','SCHOOL_BANK_ACCOUNT','OTHER') NOT NULL,
  `identifier`   VARCHAR(255) NOT NULL,
  `ifsc`         VARCHAR(20)  NULL,
  `holder_name`  VARCHAR(120) NULL,
  `is_active`    BOOLEAN      NOT NULL DEFAULT true,
  `description`  VARCHAR(500) NULL,
  `created_at`   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`   CHAR(36)     NULL,
  `updated_by`   CHAR(36)     NULL,
  `deleted_at`   TIMESTAMP(3) NULL,
  `deleted_by`   CHAR(36)     NULL,
  `version`      INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`school_id`, `id`),
  INDEX `ix_fee_payment_source_school_kind`   (`school_id`, `kind`),
  INDEX `ix_fee_payment_source_school_active` (`school_id`, `is_active`),
  INDEX `ix_fee_payment_source_deleted_at`    (`school_id`, `deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Section 5: STORED deleted_at_key + partial-unique on fee_payment_sources.
-- Format mirrors the Sprint 9 base migration: '%Y%m%d%H%i%s.%f' → '0' sentinel.
ALTER TABLE `fee_payment_sources`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

CREATE UNIQUE INDEX `uq_fee_payment_source_active`
  ON `fee_payment_sources` (`school_id`, `code`, `deleted_at_key`);

-- Section 6: FK from fee_payments.payment_source_id → fee_payment_sources.
ALTER TABLE `fee_payments`
  ADD CONSTRAINT `fk_fee_payment_source`
    FOREIGN KEY (`school_id`, `payment_source_id`)
    REFERENCES `fee_payment_sources` (`school_id`, `id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
