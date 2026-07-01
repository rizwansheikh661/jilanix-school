-- Sprint 9 — Fees & Payments Foundation migration.
-- Hand-crafted from fees.prisma (no shadow DB available, so `prisma migrate
-- diff` cannot be used). Mirrors the Sprint 8 examination migration pattern:
--   * 12 TENANT_OWNED tables with composite (school_id, id) PKs.
--   * Standard audit columns (created_at / updated_at / created_by /
--     updated_by / version) plus soft-delete columns (deleted_at /
--     deleted_by) on 10 of the 12 models.
--   * FeePaymentAllocation and FeeRefund are APPEND_ONLY ledgers — no
--     version, no deleted_at, no deleted_by columns.
--   * 10 STORED `deleted_at_key` columns appended at the bottom (Prisma
--     cannot emit STORED columns). 8 partial-unique active-row indexes
--     ride on top of them (fee_heads, fee_structures, fee_discounts,
--     fee_late_fine_policies, fee_invoices ×2, fee_payments,
--     fee_receipts). fee_structure_lines / fee_invoice_lines /
--     student_fee_discounts get the STORED column for join/filter
--     convenience even though they have no active-row unique (per fees.prisma
--     hand-edit checklist).
--   * Money columns use DECIMAL(12,2) (INR, 2 decimals).
--   * FK ON DELETE / ON UPDATE behavior mirrors the @relation decorators in
--     fees.prisma (Cascade for parent→child within fees scope; Restrict for
--     cross-aggregate references like academic_year / branch / class /
--     section / student / fee_head). Pattern mirrors Sprints 5–8.

-- ---------------------------------------------------------------------------
-- CreateTable: fee_discounts
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_discounts` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `applies_to_fee_head_id` CHAR(36) NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('FLAT', 'PERCENT') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `max_amount` DECIMAL(12, 2) NULL,
    `description` VARCHAR(500) NULL,
    `requires_approval_above` DECIMAL(12, 2) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_discount_school_type`(`school_id`, `type`),
    INDEX `ix_fee_discount_school_head`(`school_id`, `applies_to_fee_head_id`),
    INDEX `ix_fee_discount_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_heads
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_heads` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `category` ENUM('TUITION', 'ADMISSION', 'TRANSPORT', 'HOSTEL', 'LIBRARY', 'EXAMINATION', 'EVENT', 'LATE_FINE', 'CUSTOM') NOT NULL,
    `hsn_sac` VARCHAR(20) NULL,
    `is_refundable` BOOLEAN NOT NULL DEFAULT true,
    `is_taxable` BOOLEAN NOT NULL DEFAULT false,
    `default_amount` DECIMAL(12, 2) NULL,
    `gl_account` VARCHAR(40) NULL,
    `description` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_head_school_category`(`school_id`, `category`),
    INDEX `ix_fee_head_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_invoice_lines
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_invoice_lines` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `fee_invoice_id` CHAR(36) NOT NULL,
    `fee_head_id` CHAR(36) NOT NULL,
    `source_fine_policy_id` CHAR(36) NULL,
    `source_discount_id` CHAR(36) NULL,
    `description` VARCHAR(255) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_amount` DECIMAL(12, 2) NOT NULL,
    `discount_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `tax_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `line_total` DECIMAL(12, 2) NOT NULL,
    `is_late_fine` BOOLEAN NOT NULL DEFAULT false,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_invoice_line_school_invoice`(`school_id`, `fee_invoice_id`),
    INDEX `ix_fee_invoice_line_school_head`(`school_id`, `fee_head_id`),
    INDEX `ix_fee_invoice_line_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_invoices
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_invoices` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `fee_structure_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `invoice_no` VARCHAR(40) NOT NULL,
    `period_from` DATE NOT NULL,
    `period_to` DATE NOT NULL,
    `issue_date` DATE NOT NULL,
    `due_date` DATE NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `discount_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `tax_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `paid_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `refund_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `balance_total` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `status` ENUM('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID', 'REFUNDED') NOT NULL DEFAULT 'DRAFT',
    `notes` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_invoice_school_student_year`(`school_id`, `student_id`, `academic_year_id`),
    INDEX `ix_fee_invoice_school_status_due`(`school_id`, `status`, `due_date`),
    INDEX `ix_fee_invoice_school_period`(`school_id`, `period_from`),
    INDEX `ix_fee_invoice_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_late_fine_policies
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_late_fine_policies` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('FLAT_ONCE', 'FLAT_PER_DAY', 'PERCENT_PER_DAY') NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `grace_period_days` INTEGER NOT NULL DEFAULT 0,
    `cap_amount` DECIMAL(12, 2) NULL,
    `description` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_fine_policy_school_type`(`school_id`, `type`),
    INDEX `ix_fee_fine_policy_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_payment_allocations (APPEND_ONLY)
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_payment_allocations` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `fee_payment_id` CHAR(36) NOT NULL,
    `fee_invoice_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `allocated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `allocated_by` CHAR(36) NULL,
    `reversed_at` TIMESTAMP(3) NULL,
    `reversed_by` CHAR(36) NULL,
    `reversal_reason` VARCHAR(500) NULL,

    INDEX `ix_fee_payment_alloc_school_payment`(`school_id`, `fee_payment_id`),
    INDEX `ix_fee_payment_alloc_school_invoice`(`school_id`, `fee_invoice_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_payments
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_payments` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `payment_no` VARCHAR(40) NULL,
    `method` ENUM('CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'ONLINE') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED') NOT NULL DEFAULT 'CAPTURED',
    `reference_no` VARCHAR(120) NULL,
    `paid_at` TIMESTAMP(3) NOT NULL,
    `gateway_code` VARCHAR(40) NULL,
    `gateway_payment_id` VARCHAR(120) NULL,
    `notes` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_payment_school_student_paid`(`school_id`, `student_id`, `paid_at`),
    INDEX `ix_fee_payment_school_method_paid`(`school_id`, `method`, `paid_at`),
    INDEX `ix_fee_payment_school_status`(`school_id`, `status`),
    INDEX `ix_fee_payment_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_receipts
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_receipts` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `fee_payment_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `receipt_no` VARCHAR(40) NOT NULL,
    `issued_at` TIMESTAMP(3) NOT NULL,
    `issued_by` CHAR(36) NULL,
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('ISSUED', 'CANCELLED') NOT NULL DEFAULT 'ISSUED',
    `cancelled_at` TIMESTAMP(3) NULL,
    `cancelled_by` CHAR(36) NULL,
    `cancellation_reason` VARCHAR(500) NULL,
    `notes` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_receipt_school_student_issued`(`school_id`, `student_id`, `issued_at`),
    INDEX `ix_fee_receipt_school_status`(`school_id`, `status`),
    INDEX `ix_fee_receipt_deleted_at`(`school_id`, `deleted_at`),
    UNIQUE INDEX `uq_fee_receipt_payment`(`school_id`, `fee_payment_id`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_refunds (APPEND_ONLY)
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_refunds` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `fee_payment_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `refunded_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `refunded_by` CHAR(36) NULL,
    `method` ENUM('CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'ONLINE') NOT NULL,
    `reference_no` VARCHAR(120) NULL,

    INDEX `ix_fee_refund_school_payment_refunded`(`school_id`, `fee_payment_id`, `refunded_at` DESC),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_structure_lines
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_structure_lines` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `fee_structure_id` CHAR(36) NOT NULL,
    `fee_head_id` CHAR(36) NOT NULL,
    `late_fine_policy_id` CHAR(36) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `frequency` ENUM('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'TERM') NOT NULL,
    `due_day` INTEGER NULL,
    `ordering` INTEGER NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_structure_line_school_structure`(`school_id`, `fee_structure_id`),
    INDEX `ix_fee_structure_line_school_head`(`school_id`, `fee_head_id`),
    INDEX `ix_fee_structure_line_deleted_at`(`school_id`, `deleted_at`),
    UNIQUE INDEX `uq_fee_structure_line_ordering`(`school_id`, `fee_structure_id`, `fee_head_id`, `ordering`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: fee_structures
-- ---------------------------------------------------------------------------
CREATE TABLE `fee_structures` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `branch_id` CHAR(36) NULL,
    `name` VARCHAR(160) NOT NULL,
    `applies_to` ENUM('SCHOOL', 'CLASS', 'SECTION', 'STUDENT') NOT NULL,
    `class_id` CHAR(36) NULL,
    `section_id` CHAR(36) NULL,
    `student_id` CHAR(36) NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `published_at` TIMESTAMP(3) NULL,
    `archived_at` TIMESTAMP(3) NULL,
    `description` VARCHAR(500) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_fee_structure_school_year_status`(`school_id`, `academic_year_id`, `status`),
    INDEX `ix_fee_structure_school_class`(`school_id`, `class_id`),
    INDEX `ix_fee_structure_school_section`(`school_id`, `section_id`),
    INDEX `ix_fee_structure_school_student`(`school_id`, `student_id`),
    INDEX `ix_fee_structure_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CreateTable: student_fee_discounts
-- ---------------------------------------------------------------------------
CREATE TABLE `student_fee_discounts` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `fee_discount_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `valid_from` DATE NOT NULL,
    `valid_to` DATE NULL,
    `reason` VARCHAR(500) NULL,
    `approved_at` TIMESTAMP(3) NULL,
    `approved_by` CHAR(36) NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3) NOT NULL,
    `created_by` CHAR(36) NULL,
    `updated_by` CHAR(36) NULL,
    `deleted_at` TIMESTAMP(3) NULL,
    `deleted_by` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,

    INDEX `ix_student_fee_discount_school_student_year`(`school_id`, `student_id`, `academic_year_id`),
    INDEX `ix_student_fee_discount_school_discount`(`school_id`, `fee_discount_id`),
    INDEX `ix_student_fee_discount_deleted_at`(`school_id`, `deleted_at`),
    PRIMARY KEY (`school_id`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Foreign keys (fees scope only)
-- ---------------------------------------------------------------------------
ALTER TABLE `fee_discounts` ADD CONSTRAINT `fk_fee_discount_head` FOREIGN KEY (`school_id`, `applies_to_fee_head_id`) REFERENCES `fee_heads`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structure_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structure_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structure_class` FOREIGN KEY (`school_id`, `class_id`) REFERENCES `classes`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structure_section` FOREIGN KEY (`school_id`, `section_id`) REFERENCES `sections`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structure_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_structure_lines` ADD CONSTRAINT `fk_fee_structure_line_structure` FOREIGN KEY (`school_id`, `fee_structure_id`) REFERENCES `fee_structures`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `fee_structure_lines` ADD CONSTRAINT `fk_fee_structure_line_head` FOREIGN KEY (`school_id`, `fee_head_id`) REFERENCES `fee_heads`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_structure_lines` ADD CONSTRAINT `fk_fee_structure_line_fine_policy` FOREIGN KEY (`school_id`, `late_fine_policy_id`) REFERENCES `fee_late_fine_policies`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `fk_student_fee_discount_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `fk_student_fee_discount_discount` FOREIGN KEY (`school_id`, `fee_discount_id`) REFERENCES `fee_discounts`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `student_fee_discounts` ADD CONSTRAINT `fk_student_fee_discount_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_invoices` ADD CONSTRAINT `fk_fee_invoice_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_invoices` ADD CONSTRAINT `fk_fee_invoice_structure` FOREIGN KEY (`school_id`, `fee_structure_id`) REFERENCES `fee_structures`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_invoices` ADD CONSTRAINT `fk_fee_invoice_year` FOREIGN KEY (`school_id`, `academic_year_id`) REFERENCES `academic_years`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `fee_invoices` ADD CONSTRAINT `fk_fee_invoice_branch` FOREIGN KEY (`school_id`, `branch_id`) REFERENCES `branches`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_invoice_lines` ADD CONSTRAINT `fk_fee_invoice_line_invoice` FOREIGN KEY (`school_id`, `fee_invoice_id`) REFERENCES `fee_invoices`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `fee_invoice_lines` ADD CONSTRAINT `fk_fee_invoice_line_head` FOREIGN KEY (`school_id`, `fee_head_id`) REFERENCES `fee_heads`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_payments` ADD CONSTRAINT `fk_fee_payment_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_payment_allocations` ADD CONSTRAINT `fk_fee_payment_alloc_payment` FOREIGN KEY (`school_id`, `fee_payment_id`) REFERENCES `fee_payments`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `fee_payment_allocations` ADD CONSTRAINT `fk_fee_payment_alloc_invoice` FOREIGN KEY (`school_id`, `fee_invoice_id`) REFERENCES `fee_invoices`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_receipts` ADD CONSTRAINT `fk_fee_receipt_payment` FOREIGN KEY (`school_id`, `fee_payment_id`) REFERENCES `fee_payments`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `fee_receipts` ADD CONSTRAINT `fk_fee_receipt_student` FOREIGN KEY (`school_id`, `student_id`) REFERENCES `students`(`school_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `fee_refunds` ADD CONSTRAINT `fk_fee_refund_payment` FOREIGN KEY (`school_id`, `fee_payment_id`) REFERENCES `fee_payments`(`school_id`, `id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- STORED `deleted_at_key` + partial-unique indexes (NULL-collapse pattern).
-- Prisma cannot emit STORED columns; hand-added per fees.prisma docblock.
-- Pattern mirrors Sprints 5–8 (CHAR(20) DATE_FORMAT projection).
-- ---------------------------------------------------------------------------

ALTER TABLE `fee_heads`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_head_active`
  ON `fee_heads` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `fee_structures`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_structure_active`
  ON `fee_structures` (`school_id`, `academic_year_id`, `name`, `deleted_at_key`);

ALTER TABLE `fee_structure_lines`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

ALTER TABLE `fee_discounts`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_discount_active`
  ON `fee_discounts` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `student_fee_discounts`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

ALTER TABLE `fee_late_fine_policies`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_fine_policy_active`
  ON `fee_late_fine_policies` (`school_id`, `code`, `deleted_at_key`);

ALTER TABLE `fee_invoices`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_invoice_no_active`
  ON `fee_invoices` (`school_id`, `invoice_no`, `deleted_at_key`);
CREATE UNIQUE INDEX `uq_fee_invoice_student_period_active`
  ON `fee_invoices` (`school_id`, `student_id`, `fee_structure_id`, `period_from`, `deleted_at_key`);

ALTER TABLE `fee_invoice_lines`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;

ALTER TABLE `fee_payments`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_payment_gateway_ref`
  ON `fee_payments` (`school_id`, `gateway_code`, `gateway_payment_id`, `deleted_at_key`);

ALTER TABLE `fee_receipts`
  ADD COLUMN `deleted_at_key` CHAR(20) GENERATED ALWAYS AS
    (COALESCE(DATE_FORMAT(`deleted_at`, '%Y%m%d%H%i%s.%f'), '0')) STORED;
CREATE UNIQUE INDEX `uq_fee_receipt_no_active`
  ON `fee_receipts` (`school_id`, `receipt_no`, `deleted_at_key`);
