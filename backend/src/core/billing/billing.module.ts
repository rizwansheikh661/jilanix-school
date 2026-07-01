/**
 * BillingModule — composition root for Sprint 20 SaaS Billing Foundation.
 *
 * Wires the eight functional submodules (account, settings, payment-source,
 * invoice, payment, refund, credit-note, razorpay) plus the cross-cutting
 * audit + subscription-integration helpers behind a single platform-admin
 * surface (`/v1/platform/billing/*`) and a tenant-facing self surface
 * (`/v1/me/billing/*`).
 *
 * Imports:
 *   - FeatureFlagModule — `module.billing`, `billing.razorpay_enabled`,
 *                         `billing.manual_payments_enabled`.
 *   - OutboxModule      — every money-bearing mutation publishes a billing
 *                         outbox event inside its tx.
 *   - NotificationsModule — the 9-key notification event catalog bootstrap.
 *   - SequencesModule   — `BA-<n>`, `INV-<fy>-<n>`, `RCP-<fy>-<n>`,
 *                         `CN-<fy>-<n>`, `REF-<fy>-<n>` allocators.
 *
 * AuditModule, PrismaModule, RbacModule, RequestContextModule are @Global, so
 * not imported here. The reporting registry stub is wired but currently a
 * no-op (`BillingReportsBootstrap`) — see that file's TODO for context.
 *
 * Wired into CoreModule AFTER SubscriptionModule and BEFORE
 * CommunicationCenterModule so the billing surface can read subscription
 * data on the bootstrap side.
 */
import { Module } from '@nestjs/common';

import { FeatureFlagModule } from '../feature-flag';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxModule } from '../outbox';
import { SequencesModule } from '../sequences/sequences.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { BillingAccountController } from './account/billing-account.controller';
import { BillingAccountRepository } from './account/billing-account.repository';
import { BillingAccountService } from './account/billing-account.service';
import { BillingAuditRepository } from './audit/billing-audit.repository';
import { BillingPermissionsSeeder } from './billing-permissions.seeder';
import { BillingFeatureFlagsBootstrap } from './bootstrap/billing-feature-flags.bootstrap';
import { BillingNotificationEventsBootstrap } from './bootstrap/billing-notification-events.bootstrap';
import { BillingReportsBootstrap } from './bootstrap/billing-reports.bootstrap';
import { CreditNoteController } from './credit-note/credit-note.controller';
import { CreditNoteRepository } from './credit-note/credit-note.repository';
import { CreditNoteService } from './credit-note/credit-note.service';
import { InvoiceController } from './invoice/invoice.controller';
import { InvoiceRepository } from './invoice/invoice.repository';
import { InvoiceService } from './invoice/invoice.service';
import { PaymentSourceController } from './payment-source/payment-source.controller';
import { PaymentSourceRepository } from './payment-source/payment-source.repository';
import { PaymentSourceService } from './payment-source/payment-source.service';
import { PaymentController } from './payment/payment.controller';
import { PaymentRepository } from './payment/payment.repository';
import { PaymentService } from './payment/payment.service';
import { RazorpayController } from './razorpay/razorpay.controller';
import { RazorpayGateway } from './razorpay/razorpay.gateway';
import { RazorpayService } from './razorpay/razorpay.service';
import { RazorpayWebhookController } from './razorpay/razorpay-webhook.controller';
import { RefundController } from './refund/refund.controller';
import { RefundRepository } from './refund/refund.repository';
import { RefundService } from './refund/refund.service';
import { BillingSelfController } from './self/billing-self.controller';
import { BillingSettingsController } from './settings/billing-settings.controller';
import { BillingSettingsRepository } from './settings/billing-settings.repository';
import { BillingSettingsService } from './settings/billing-settings.service';
import { BillingSubscriptionIntegrationService } from './subscription-integration/billing-subscription-integration.service';

@Module({
  imports: [
    FeatureFlagModule,
    OutboxModule,
    NotificationsModule,
    SequencesModule,
    SubscriptionModule,
  ],
  controllers: [
    // Platform admin
    BillingAccountController,
    BillingSettingsController,
    PaymentSourceController,
    InvoiceController,
    PaymentController,
    RefundController,
    CreditNoteController,
    RazorpayController,
    RazorpayWebhookController,
    // Tenant self
    BillingSelfController,
  ],
  providers: [
    // Bootstraps + seeders
    BillingPermissionsSeeder,
    BillingFeatureFlagsBootstrap,
    BillingNotificationEventsBootstrap,
    BillingReportsBootstrap,
    // Account
    BillingAccountRepository,
    BillingAccountService,
    // Settings
    BillingSettingsRepository,
    BillingSettingsService,
    // Payment sources
    PaymentSourceRepository,
    PaymentSourceService,
    // Invoices
    InvoiceRepository,
    InvoiceService,
    // Payments
    PaymentRepository,
    PaymentService,
    // Refunds
    RefundRepository,
    RefundService,
    // Credit notes + adjustments
    CreditNoteRepository,
    CreditNoteService,
    // Razorpay
    RazorpayGateway,
    RazorpayService,
    // Cross-cutting
    BillingAuditRepository,
    BillingSubscriptionIntegrationService,
  ],
  exports: [
    BillingAccountService,
    BillingSettingsService,
    InvoiceService,
    PaymentService,
    RefundService,
    CreditNoteService,
    PaymentSourceService,
    RazorpayService,
    BillingSubscriptionIntegrationService,
  ],
})
export class BillingModule {}
