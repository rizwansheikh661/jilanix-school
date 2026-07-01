/**
 * FeesModule — composition root for Sprint 9 Fees & Payments Foundation.
 *
 * Sub-domains (added incrementally as each sub-module lands):
 *   - fee-head            — line-item catalog CRUD.
 *   - fee-structure       — DRAFT/PUBLISHED/ARCHIVED + lines + clone.
 *   - fee-discount        — discount catalog + student assignment + approve.
 *   - fee-fine-policy     — FLAT_ONCE / FLAT_PER_DAY / PERCENT_PER_DAY policies.
 *   - fee-invoice         — sync generate, recompute, apply-fines, void.
 *   - fee-payment         — offline payment + allocations + receipt + outbox.
 *                           Online checkout via PaymentGatewayRegistry (stubs).
 *   - fee-receipt         — read + cancel (single-actor + reason).
 *   - fee-refund          — append-only refund + cap + allocation reversal.
 *   - fee-ledger          — read-only computed timeline.
 *
 * Imports:
 *   - FeatureFlagModule — `module.fees` gate consumed in every mutation.
 *   - OutboxModule      — transactional outbox publishes `fees.*` events.
 * AuditModule, RbacModule, PrismaModule are @Global so not imported explicitly.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { OutboxModule } from '../outbox';
import { SequencesModule } from '../sequences';
import { FeeDiscountController } from './fee-discount/fee-discount.controller';
import { FeeDiscountRepository } from './fee-discount/fee-discount.repository';
import { FeeDiscountService } from './fee-discount/fee-discount.service';
import { StudentFeeDiscountController } from './fee-discount/student-fee-discount.controller';
import { StudentFeeDiscountRepository } from './fee-discount/student-fee-discount.repository';
import { StudentFeeDiscountService } from './fee-discount/student-fee-discount.service';
import { FeeHeadController } from './fee-head/fee-head.controller';
import { FeeHeadRepository } from './fee-head/fee-head.repository';
import { FeeHeadService } from './fee-head/fee-head.service';
import { FeeInvoiceController } from './fee-invoice/fee-invoice.controller';
import { FeeInvoiceRepository } from './fee-invoice/fee-invoice.repository';
import { FeeInvoiceService } from './fee-invoice/fee-invoice.service';
import { FeeLateFinePolicyController } from './fee-fine-policy/fee-fine-policy.controller';
import { FeeLateFinePolicyRepository } from './fee-fine-policy/fee-fine-policy.repository';
import { FeeLateFinePolicyService } from './fee-fine-policy/fee-fine-policy.service';
import { FeeLedgerController } from './fee-ledger/fee-ledger.controller';
import { FeeLedgerService } from './fee-ledger/fee-ledger.service';
import {
  FeePaymentCheckoutController,
  FeePaymentController,
  FeePaymentWebhookController,
} from './fee-payment/fee-payment.controller';
import { FeePaymentRepository } from './fee-payment/fee-payment.repository';
import { FeePaymentService } from './fee-payment/fee-payment.service';
import { FeePaymentSourceController } from './fee-payment-source/fee-payment-source.controller';
import { FeePaymentSourceRepository } from './fee-payment-source/fee-payment-source.repository';
import { FeePaymentSourceService } from './fee-payment-source/fee-payment-source.service';
import { FeeReceiptController } from './fee-receipt/fee-receipt.controller';
import { FeeReceiptRepository } from './fee-receipt/fee-receipt.repository';
import { FeeReceiptService } from './fee-receipt/fee-receipt.service';
import {
  FeeRefundController,
  FeeRefundCreateController,
} from './fee-refund/fee-refund.controller';
import { FeeRefundRepository } from './fee-refund/fee-refund.repository';
import { FeeRefundService } from './fee-refund/fee-refund.service';
import { FeeStructureController } from './fee-structure/fee-structure.controller';
import { FeeStructureRepository } from './fee-structure/fee-structure.repository';
import { FeeStructureService } from './fee-structure/fee-structure.service';
import { PhonePeAdapter } from './fee-payment/gateways/adapters/phonepe.adapter';
import { PaytmAdapter } from './fee-payment/gateways/adapters/paytm.adapter';
import { RazorpayAdapter } from './fee-payment/gateways/adapters/razorpay.adapter';
import { StripeAdapter } from './fee-payment/gateways/adapters/stripe.adapter';
import { CashfreeAdapter } from './fee-payment/gateways/adapters/cashfree.adapter';
import { PaymentGatewayRegistry } from './fee-payment/gateways/payment-gateway.registry';
import { FeesFeatureFlagsBootstrap } from './fees-feature-flags.bootstrap';
import { FeesPermissionsSeeder } from './fees-permissions.seeder';

@Module({
  imports: [FeatureFlagModule, OutboxModule, SequencesModule],
  controllers: [
    FeeDiscountController,
    FeeHeadController,
    FeeInvoiceController,
    FeeLateFinePolicyController,
    FeeLedgerController,
    FeePaymentCheckoutController,
    FeePaymentController,
    FeePaymentWebhookController,
    FeePaymentSourceController,
    FeeReceiptController,
    FeeRefundController,
    FeeRefundCreateController,
    FeeStructureController,
    StudentFeeDiscountController,
  ],
  providers: [
    FeesPermissionsSeeder,
    FeesFeatureFlagsBootstrap,
    PaymentGatewayRegistry,
    RazorpayAdapter,
    PhonePeAdapter,
    PaytmAdapter,
    StripeAdapter,
    CashfreeAdapter,
    FeeDiscountRepository,
    FeeDiscountService,
    FeeHeadRepository,
    FeeHeadService,
    FeeInvoiceRepository,
    FeeInvoiceService,
    FeeLateFinePolicyRepository,
    FeeLateFinePolicyService,
    FeeLedgerService,
    FeePaymentRepository,
    FeePaymentService,
    FeePaymentSourceRepository,
    FeePaymentSourceService,
    FeeReceiptRepository,
    FeeReceiptService,
    FeeRefundRepository,
    FeeRefundService,
    FeeStructureRepository,
    FeeStructureService,
    StudentFeeDiscountRepository,
    StudentFeeDiscountService,
  ],
  exports: [
    PaymentGatewayRegistry,
    FeeDiscountService,
    FeeHeadService,
    FeeInvoiceService,
    FeeLateFinePolicyService,
    FeeLedgerService,
    FeePaymentService,
    FeePaymentSourceService,
    FeeReceiptService,
    FeeRefundService,
    FeeStructureService,
    StudentFeeDiscountService,
  ],
})
export class FeesModule {}
