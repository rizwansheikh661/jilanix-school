-- Sprint 20 — SaaS Billing Foundation migration.
-- Hand-crafted (Sprint 7+ precedent): `prisma migrate dev` is unusable because
-- the shadow DB rebuild loses STORED virtual columns. This file follows the
-- conventions of `20260628000000_subscription_foundation`:
--   - backticked identifiers
--   - 2-space indents on multi-statement ALTERs
--   - all 15 billing tables are PLATFORM_ONLY (single `id` PK, no composite
--     (school_id, id); see docs/BILLING_FOUNDATION_ARCHITECTURE.md §1.2 —
--     "the row belongs to *us*, not to the school")
--   - soft-delete tables use STORED `deleted_at_key` + index on deleted_at
--     (we don't need partial-unique on most billing tables because most
--     uniqueness is on natural keys like invoice_number which carry their
--     own per-fiscal-year scope via the SequenceService)
--   - utf8mb4_unicode_ci on every table
--
-- SCOPE: This is **SaaS Billing only** (School → Platform). It is permanently
-- separate from School Fees (Parent → School, see fees.prisma and the
-- `20260620000000_fees_*` migration family). The two domains must never
-- share tables, sequences, audit chains or services.
--
-- Sections:
--   1.  billing_accounts
--   2.  billing_profiles
--   3.  billing_addresses
--   4.  billing_tax_details
--   5.  billing_settings
--   6.  billing_payment_sources
--   7.  billing_invoices
--   8.  billing_invoice_lines
--   9.  billing_payments
--   10. billing_payment_attempts
--   11. billing_refunds
--   12. billing_credit_notes
--   13. billing_adjustments
--   14. billing_invoice_history
--   15. billing_audits

-- ============================================================================
-- Section 1: billing_accounts — root, one per school
-- ============================================================================
CREATE TABLE `billing_accounts` (
  `id`              CHAR(36)        NOT NULL,
  `school_id`       CHAR(36)        NOT NULL,
  `account_number`  VARCHAR(40)     NOT NULL,
  `currency`        CHAR(3)         NOT NULL DEFAULT 'INR',
  `balance_due`     DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `credit_balance`  DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `total_invoiced`  DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `total_paid`      DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `total_refunded`  DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `is_active`       BOOLEAN         NOT NULL DEFAULT TRUE,
  `last_invoice_at` TIMESTAMP(3)    NULL,
  `last_payment_at` TIMESTAMP(3)    NULL,
  `created_at`      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`      CHAR(36)        NULL,
  `updated_by`      CHAR(36)        NULL,
  `deleted_at`      TIMESTAMP(3)    NULL,
  `deleted_by`      CHAR(36)        NULL,
  `version`         INTEGER         NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_billing_accounts_school`  (`school_id`),
  UNIQUE INDEX `uq_billing_accounts_number`  (`account_number`),
  INDEX `ix_billing_accounts_school_active` (`school_id`, `is_active`),
  INDEX `ix_billing_accounts_deleted_at`    (`deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 2: billing_profiles — legal billing identity (1:1 account)
-- ============================================================================
CREATE TABLE `billing_profiles` (
  `id`            CHAR(36)     NOT NULL,
  `account_id`    CHAR(36)     NOT NULL,
  `legal_name`    VARCHAR(255) NOT NULL,
  `display_name`  VARCHAR(255) NULL,
  `contact_name`  VARCHAR(255) NULL,
  `contact_email` VARCHAR(255) NOT NULL,
  `contact_phone` VARCHAR(40)  NULL,
  `cc_emails`     VARCHAR(1000) NULL,
  `website`       VARCHAR(255) NULL,
  `notes`         VARCHAR(1000) NULL,
  `created_at`    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`    CHAR(36)     NULL,
  `updated_by`    CHAR(36)     NULL,
  `deleted_at`    TIMESTAMP(3) NULL,
  `deleted_by`    CHAR(36)     NULL,
  `version`       INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_billing_profiles_account` (`account_id`),
  CONSTRAINT `fk_billing_profiles_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 3: billing_addresses — postal/legal address (1:1 account)
-- ============================================================================
CREATE TABLE `billing_addresses` (
  `id`            CHAR(36)     NOT NULL,
  `account_id`    CHAR(36)     NOT NULL,
  `address_line1` VARCHAR(255) NOT NULL,
  `address_line2` VARCHAR(255) NULL,
  `city`          VARCHAR(100) NOT NULL,
  `state_code`    VARCHAR(10)  NOT NULL,
  `state_name`    VARCHAR(100) NOT NULL,
  `pincode`       VARCHAR(10)  NOT NULL,
  `country_code`  CHAR(2)      NOT NULL DEFAULT 'IN',
  `created_at`    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`    CHAR(36)     NULL,
  `updated_by`    CHAR(36)     NULL,
  `deleted_at`    TIMESTAMP(3) NULL,
  `deleted_by`    CHAR(36)     NULL,
  `version`       INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_billing_addresses_account` (`account_id`),
  CONSTRAINT `fk_billing_addresses_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 4: billing_tax_details — GSTIN/PAN (1:1 account)
-- ============================================================================
CREATE TABLE `billing_tax_details` (
  `id`              CHAR(36)     NOT NULL,
  `account_id`      CHAR(36)     NOT NULL,
  `gstin`           VARCHAR(15)  NULL,
  `pan`             VARCHAR(10)  NULL,
  `place_of_supply` VARCHAR(10)  NULL,
  `tax_exempt`      BOOLEAN      NOT NULL DEFAULT FALSE,
  `exempt_reason`   VARCHAR(500) NULL,
  `created_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`      CHAR(36)     NULL,
  `updated_by`      CHAR(36)     NULL,
  `deleted_at`      TIMESTAMP(3) NULL,
  `deleted_by`      CHAR(36)     NULL,
  `version`         INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_tax_details_account` (`account_id`),
  CONSTRAINT `fk_tax_details_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 5: billing_settings — per-school configuration (1:1 account)
-- ============================================================================
CREATE TABLE `billing_settings` (
  `id`                         CHAR(36)     NOT NULL,
  `account_id`                 CHAR(36)     NOT NULL,
  `school_id`                  CHAR(36)     NOT NULL,
  `grace_period_days`          INTEGER      NOT NULL DEFAULT 7,
  `billing_lead_days`          INTEGER      NOT NULL DEFAULT 7,
  `auto_charge_enabled`        BOOLEAN      NOT NULL DEFAULT FALSE,
  `default_payment_source_id`  CHAR(36)     NULL,
  `invoice_prefix`             VARCHAR(10)  NULL,
  `reminders_enabled`          BOOLEAN      NOT NULL DEFAULT TRUE,
  `reminder_offsets_json`      JSON         NULL,
  `created_at`                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`                 CHAR(36)     NULL,
  `updated_by`                 CHAR(36)     NULL,
  `deleted_at`                 TIMESTAMP(3) NULL,
  `deleted_by`                 CHAR(36)     NULL,
  `version`                    INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_billing_settings_account` (`account_id`),
  UNIQUE INDEX `uq_billing_settings_school`  (`school_id`),
  CONSTRAINT `fk_billing_settings_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 6: billing_payment_sources — platform-configured payment sources
-- Encrypted columns hold envelope-encrypted secrets (CryptoModule).
-- ============================================================================
CREATE TABLE `billing_payment_sources` (
  `id`                            CHAR(36)     NOT NULL,
  `source_type`                   ENUM('RAZORPAY','UPI','BANK','MANUAL') NOT NULL,
  `name`                          VARCHAR(120) NOT NULL,
  `description`                   VARCHAR(500) NULL,
  `is_active`                     BOOLEAN      NOT NULL DEFAULT TRUE,
  `is_default`                    BOOLEAN      NOT NULL DEFAULT FALSE,
  `priority`                      INTEGER      NOT NULL DEFAULT 0,
  `razorpay_key_id`               VARCHAR(80)  NULL,
  `razorpay_key_secret_enc`       VARCHAR(500) NULL,
  `razorpay_webhook_secret_enc`   VARCHAR(500) NULL,
  `upi_handle`                    VARCHAR(120) NULL,
  `bank_name`                     VARCHAR(120) NULL,
  `bank_account_number`           VARCHAR(40)  NULL,
  `bank_ifsc`                     VARCHAR(20)  NULL,
  `bank_branch`                   VARCHAR(120) NULL,
  `bank_account_holder`           VARCHAR(120) NULL,
  `instructions`                  VARCHAR(1000) NULL,
  `created_at`                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`                    CHAR(36)     NULL,
  `updated_by`                    CHAR(36)     NULL,
  `deleted_at`                    TIMESTAMP(3) NULL,
  `deleted_by`                    CHAR(36)     NULL,
  `version`                       INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `ix_payment_sources_type_active`    (`source_type`, `is_active`, `priority`),
  INDEX `ix_payment_sources_active_default` (`is_active`, `is_default`),
  INDEX `ix_payment_sources_deleted_at`     (`deleted_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 7: billing_invoices — invoice header
-- ============================================================================
CREATE TABLE `billing_invoices` (
  `id`                CHAR(36)        NOT NULL,
  `account_id`        CHAR(36)        NOT NULL,
  `school_id`         CHAR(36)        NOT NULL,
  `invoice_number`    VARCHAR(60)     NOT NULL,
  `status`            ENUM('DRAFT','PENDING','PARTIALLY_PAID','PAID','OVERDUE','VOID','REFUNDED','WRITTEN_OFF') NOT NULL DEFAULT 'DRAFT',
  `fiscal_year`       VARCHAR(7)      NOT NULL,
  `subscription_id`   CHAR(36)        NULL,
  `billing_cycle`     VARCHAR(20)     NULL,
  `period_start`      TIMESTAMP(3)    NULL,
  `period_end`        TIMESTAMP(3)    NULL,
  `issued_at`         TIMESTAMP(3)    NULL,
  `due_date`          TIMESTAMP(3)    NULL,
  `paid_at`           TIMESTAMP(3)    NULL,
  `voided_at`         TIMESTAMP(3)    NULL,
  `void_reason`       VARCHAR(500)    NULL,
  `currency`          CHAR(3)         NOT NULL DEFAULT 'INR',
  `subtotal`          DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `discount_total`    DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `tax_total`         DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `total_amount`      DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `amount_paid`       DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `amount_refunded`   DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `amount_due`        DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `profile_snapshot`  JSON            NULL,
  `address_snapshot`  JSON            NULL,
  `tax_snapshot`      JSON            NULL,
  `notes`             VARCHAR(1000)   NULL,
  `created_at`        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`        CHAR(36)        NULL,
  `updated_by`        CHAR(36)        NULL,
  `deleted_at`        TIMESTAMP(3)    NULL,
  `deleted_by`        CHAR(36)        NULL,
  `version`           INTEGER         NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_invoices_number`             (`invoice_number`),
  INDEX `ix_invoices_school_status_due`         (`school_id`, `status`, `due_date`),
  INDEX `ix_invoices_account_status`            (`account_id`, `status`),
  INDEX `ix_invoices_status_due`                (`status`, `due_date`),
  INDEX `ix_invoices_fiscal_year`               (`fiscal_year`),
  INDEX `ix_invoices_subscription`              (`subscription_id`),
  INDEX `ix_invoices_deleted_at`                (`deleted_at`),
  CONSTRAINT `fk_invoices_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 8: billing_invoice_lines
-- ============================================================================
CREATE TABLE `billing_invoice_lines` (
  `id`           CHAR(36)        NOT NULL,
  `invoice_id`   CHAR(36)        NOT NULL,
  `line_type`    ENUM('SUBSCRIPTION','ADJUSTMENT','TAX','DISCOUNT') NOT NULL,
  `description`  VARCHAR(500)    NOT NULL,
  `quantity`     DECIMAL(10, 2)  NOT NULL DEFAULT 1,
  `unit_price`   DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `amount`       DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `tax_code`     VARCHAR(20)     NULL,
  `tax_rate`     DECIMAL(5, 2)   NULL,
  `tax_amount`   DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `metadata`     JSON            NULL,
  `sort_order`   INTEGER         NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ix_invoice_lines_invoice` (`invoice_id`, `sort_order`),
  CONSTRAINT `fk_invoice_lines_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 9: billing_payments
-- ============================================================================
CREATE TABLE `billing_payments` (
  `id`                  CHAR(36)        NOT NULL,
  `account_id`          CHAR(36)        NOT NULL,
  `invoice_id`          CHAR(36)        NULL,
  `school_id`           CHAR(36)        NOT NULL,
  `receipt_number`      VARCHAR(60)     NOT NULL,
  `method`              ENUM('RAZORPAY','UPI','BANK_TRANSFER','CASH','CHEQUE','CARD') NOT NULL,
  `status`              ENUM('PENDING','APPROVED','REJECTED','ON_HOLD','FAILED','REFUNDED','PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING',
  `currency`            CHAR(3)         NOT NULL DEFAULT 'INR',
  `amount`              DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `amount_refunded`     DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `fee_amount`          DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `net_amount`          DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `fiscal_year`         VARCHAR(7)      NOT NULL,
  `gateway_order_id`    VARCHAR(60)     NULL,
  `gateway_payment_id`  VARCHAR(60)     NULL,
  `gateway_signature`   VARCHAR(255)    NULL,
  `external_reference`  VARCHAR(255)    NULL,
  `proof_url`           VARCHAR(500)    NULL,
  `payer_notes`         VARCHAR(1000)   NULL,
  `received_at`         TIMESTAMP(3)    NULL,
  `approved_at`         TIMESTAMP(3)    NULL,
  `approved_by`         CHAR(36)        NULL,
  `rejected_at`         TIMESTAMP(3)    NULL,
  `rejected_by`         CHAR(36)        NULL,
  `rejection_reason`    VARCHAR(500)    NULL,
  `hold_reason`         VARCHAR(500)    NULL,
  `payment_source_id`   CHAR(36)        NULL,
  `created_at`          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`          CHAR(36)        NULL,
  `updated_by`          CHAR(36)        NULL,
  `deleted_at`          TIMESTAMP(3)    NULL,
  `deleted_by`          CHAR(36)        NULL,
  `version`             INTEGER         NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_payments_receipt`           (`receipt_number`),
  INDEX `ix_payments_school_status_created`   (`school_id`, `status`, `created_at`),
  INDEX `ix_payments_account_status`           (`account_id`, `status`),
  INDEX `ix_payments_invoice_status`           (`invoice_id`, `status`),
  INDEX `ix_payments_gateway_order`            (`gateway_order_id`),
  INDEX `ix_payments_gateway_payment`          (`gateway_payment_id`),
  INDEX `ix_payments_deleted_at`               (`deleted_at`),
  CONSTRAINT `fk_payments_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_payments_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`)
    ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 10: billing_payment_attempts (APPEND_ONLY)
-- ============================================================================
CREATE TABLE `billing_payment_attempts` (
  `id`                  CHAR(36)        NOT NULL,
  `payment_id`          CHAR(36)        NOT NULL,
  `status`              ENUM('INITIATED','SUCCESS','FAILED','EXPIRED') NOT NULL,
  `amount`              DECIMAL(14, 2)  NOT NULL,
  `gateway_order_id`    VARCHAR(60)     NULL,
  `gateway_payment_id`  VARCHAR(60)     NULL,
  `error_code`          VARCHAR(80)     NULL,
  `error_message`       VARCHAR(1000)   NULL,
  `raw_response`        JSON            NULL,
  `attempted_at`        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ix_payment_attempts_payment` (`payment_id`, `attempted_at`),
  CONSTRAINT `fk_payment_attempts_payment`
    FOREIGN KEY (`payment_id`) REFERENCES `billing_payments` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 11: billing_refunds
-- ============================================================================
CREATE TABLE `billing_refunds` (
  `id`                  CHAR(36)        NOT NULL,
  `account_id`          CHAR(36)        NOT NULL,
  `invoice_id`          CHAR(36)        NULL,
  `payment_id`          CHAR(36)        NOT NULL,
  `school_id`           CHAR(36)        NOT NULL,
  `refund_number`       VARCHAR(60)     NOT NULL,
  `status`              ENUM('PENDING','APPROVED','PROCESSED','REJECTED','FAILED') NOT NULL DEFAULT 'PENDING',
  `currency`            CHAR(3)         NOT NULL DEFAULT 'INR',
  `amount`              DECIMAL(14, 2)  NOT NULL,
  `reason`              VARCHAR(500)    NOT NULL,
  `approved_at`         TIMESTAMP(3)    NULL,
  `approved_by`         CHAR(36)        NULL,
  `rejected_at`         TIMESTAMP(3)    NULL,
  `rejected_by`         CHAR(36)        NULL,
  `rejection_reason`    VARCHAR(500)    NULL,
  `processed_at`        TIMESTAMP(3)    NULL,
  `processed_by`        CHAR(36)        NULL,
  `gateway_refund_id`   VARCHAR(60)     NULL,
  `external_reference`  VARCHAR(255)    NULL,
  `created_at`          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`          CHAR(36)        NULL,
  `updated_by`          CHAR(36)        NULL,
  `deleted_at`          TIMESTAMP(3)    NULL,
  `deleted_by`          CHAR(36)        NULL,
  `version`             INTEGER         NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_refunds_number` (`refund_number`),
  INDEX `ix_refunds_school_status_created` (`school_id`, `status`, `created_at`),
  INDEX `ix_refunds_payment`               (`payment_id`),
  INDEX `ix_refunds_invoice`               (`invoice_id`),
  INDEX `ix_refunds_deleted_at`            (`deleted_at`),
  CONSTRAINT `fk_refunds_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_refunds_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_refunds_payment`
    FOREIGN KEY (`payment_id`) REFERENCES `billing_payments` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 12: billing_credit_notes
-- ============================================================================
CREATE TABLE `billing_credit_notes` (
  `id`                       CHAR(36)        NOT NULL,
  `account_id`               CHAR(36)        NOT NULL,
  `invoice_id`               CHAR(36)        NULL,
  `school_id`                CHAR(36)        NOT NULL,
  `credit_note_number`       VARCHAR(60)     NOT NULL,
  `status`                   ENUM('ISSUED','APPLIED','VOID') NOT NULL DEFAULT 'ISSUED',
  `currency`                 CHAR(3)         NOT NULL DEFAULT 'INR',
  `amount`                   DECIMAL(14, 2)  NOT NULL,
  `amount_applied`           DECIMAL(14, 2)  NOT NULL DEFAULT 0,
  `reason`                   VARCHAR(500)    NOT NULL,
  `fiscal_year`              VARCHAR(7)      NOT NULL,
  `applied_at`               TIMESTAMP(3)    NULL,
  `applied_to_invoice_id`    CHAR(36)        NULL,
  `voided_at`                TIMESTAMP(3)    NULL,
  `void_reason`              VARCHAR(500)    NULL,
  `created_at`               TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`               CHAR(36)        NULL,
  `updated_by`               CHAR(36)        NULL,
  `deleted_at`               TIMESTAMP(3)    NULL,
  `deleted_by`               CHAR(36)        NULL,
  `version`                  INTEGER         NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_credit_notes_number`              (`credit_note_number`),
  INDEX `ix_credit_notes_school_status_created`     (`school_id`, `status`, `created_at`),
  INDEX `ix_credit_notes_invoice`                    (`invoice_id`),
  INDEX `ix_credit_notes_deleted_at`                 (`deleted_at`),
  CONSTRAINT `fk_credit_notes_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_credit_notes_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`)
    ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 13: billing_adjustments
-- ============================================================================
CREATE TABLE `billing_adjustments` (
  `id`           CHAR(36)        NOT NULL,
  `account_id`   CHAR(36)        NOT NULL,
  `invoice_id`   CHAR(36)        NULL,
  `school_id`    CHAR(36)        NOT NULL,
  `kind`         ENUM('CREDIT','DEBIT') NOT NULL,
  `currency`     CHAR(3)         NOT NULL DEFAULT 'INR',
  `amount`       DECIMAL(14, 2)  NOT NULL,
  `reason`       VARCHAR(500)    NOT NULL,
  `created_at`   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by`   CHAR(36)        NULL,
  `updated_by`   CHAR(36)        NULL,
  `deleted_at`   TIMESTAMP(3)    NULL,
  `deleted_by`   CHAR(36)        NULL,
  `version`      INTEGER         NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `ix_adjustments_school_created`  (`school_id`, `created_at`),
  INDEX `ix_adjustments_account_kind`    (`account_id`, `kind`),
  INDEX `ix_adjustments_invoice`         (`invoice_id`),
  INDEX `ix_adjustments_deleted_at`      (`deleted_at`),
  CONSTRAINT `fk_adjustments_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 14: billing_invoice_history (APPEND_ONLY)
-- ============================================================================
CREATE TABLE `billing_invoice_history` (
  `id`             CHAR(36)        NOT NULL,
  `invoice_id`     CHAR(36)        NOT NULL,
  `school_id`      CHAR(36)        NOT NULL,
  `action`         ENUM('CREATED','ISSUED','SENT','PAYMENT_RECEIVED','PARTIAL_PAYMENT','PAID','VOIDED','REFUNDED','PARTIALLY_REFUNDED','WRITTEN_OFF','MARKED_OVERDUE','ADJUSTMENT_APPLIED','CREDIT_NOTE_APPLIED') NOT NULL,
  `from_status`    VARCHAR(20)     NULL,
  `to_status`      VARCHAR(20)     NULL,
  `amount`         DECIMAL(14, 2)  NULL,
  `notes`          VARCHAR(1000)   NULL,
  `actor_user_id`  CHAR(36)        NULL,
  `metadata`       JSON            NULL,
  `occurred_at`    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ix_invoice_history_invoice`        (`invoice_id`, `occurred_at`),
  INDEX `ix_invoice_history_school_action`  (`school_id`, `action`, `occurred_at`),
  CONSTRAINT `fk_invoice_history_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `billing_invoices` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- Section 15: billing_audits (APPEND_ONLY)
-- ============================================================================
CREATE TABLE `billing_audits` (
  `id`             CHAR(36)        NOT NULL,
  `account_id`     CHAR(36)        NULL,
  `school_id`      CHAR(36)        NOT NULL,
  `action`         ENUM('ACCOUNT_CREATED','PROFILE_UPDATED','ADDRESS_UPDATED','TAX_DETAILS_UPDATED','INVOICE_CREATED','INVOICE_ISSUED','INVOICE_VOIDED','INVOICE_WRITTEN_OFF','PAYMENT_RECORDED','PAYMENT_APPROVED','PAYMENT_REJECTED','PAYMENT_HELD','PAYMENT_FAILED','REFUND_CREATED','REFUND_APPROVED','REFUND_PROCESSED','REFUND_REJECTED','CREDIT_NOTE_ISSUED','CREDIT_NOTE_APPLIED','CREDIT_NOTE_VOIDED','ADJUSTMENT_APPLIED','SETTINGS_UPDATED','PAYMENT_SOURCE_CONFIGURED','PAYMENT_SOURCE_DISABLED') NOT NULL,
  `resource_type`  VARCHAR(40)     NULL,
  `resource_id`    CHAR(36)        NULL,
  `actor_user_id`  CHAR(36)        NULL,
  `summary`        VARCHAR(500)    NULL,
  `metadata`       JSON            NULL,
  `occurred_at`    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ix_billing_audits_school_action`  (`school_id`, `action`, `occurred_at`),
  INDEX `ix_billing_audits_account`        (`account_id`, `occurred_at`),
  INDEX `ix_billing_audits_resource`       (`resource_type`, `resource_id`),
  CONSTRAINT `fk_billing_audits_account`
    FOREIGN KEY (`account_id`) REFERENCES `billing_accounts` (`id`)
    ON DELETE SET NULL ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
