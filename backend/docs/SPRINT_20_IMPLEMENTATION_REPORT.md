# Sprint 20 — SaaS Billing — Implementation Report

## Scope

Sprint 20 delivers the platform-side SaaS Billing module: school billing accounts,
profile/address/tax-detail snapshots, invoices, payments (manual + Razorpay),
refunds, credit notes, payment sources, and the subscription-renewal integration.
The module is PLATFORM_ONLY (single-id PKs, multi-tenant by `school_id`), reuses
the existing Audit, Outbox, FeatureFlag, Sequence, Notification, Reporting,
RequestContext, RBAC, and JobScheduler infrastructure, and is functionally
independent from the School Fees module. Razorpay integration (gateway,
service, controller, webhook) is isolated behind a feature flag so the rest of
the module can run with manual payments only.

## Files added (grouped by wave)

W1 — Schema + enums
- `backend/prisma/schema/billing.prisma`

W2 — Constants, types, errors, shared
- `backend/src/core/billing/billing.constants.ts`
- `backend/src/core/billing/billing.types.ts`
- `backend/src/core/billing/billing.errors.ts`
- `backend/src/core/billing/billing.shared.ts`

W3 — Permissions + feature flags + audit
- `backend/src/core/billing/billing-permissions.seeder.ts`
- `backend/src/core/billing/bootstrap/billing-feature-flags.bootstrap.ts`
- `backend/src/core/billing/audit/billing-audit.dto.ts`
- `backend/src/core/billing/audit/billing-audit.repository.ts`

W4 — Account + Settings + Payment Source
- `backend/src/core/billing/account/billing-account.repository.ts`
- `backend/src/core/billing/account/billing-account.service.ts`
- `backend/src/core/billing/account/billing-account.dto.ts`
- `backend/src/core/billing/account/billing-account.controller.ts`
- `backend/src/core/billing/settings/billing-settings.repository.ts`
- `backend/src/core/billing/settings/billing-settings.service.ts`
- `backend/src/core/billing/settings/billing-settings.dto.ts`
- `backend/src/core/billing/settings/billing-settings.controller.ts`
- `backend/src/core/billing/payment-source/payment-source.repository.ts`
- `backend/src/core/billing/payment-source/payment-source.service.ts`
- `backend/src/core/billing/payment-source/payment-source.dto.ts`
- `backend/src/core/billing/payment-source/payment-source.controller.ts`

W5 — Invoice
- `backend/src/core/billing/invoice/invoice.repository.ts`
- `backend/src/core/billing/invoice/invoice.service.ts`
- `backend/src/core/billing/invoice/invoice.dto.ts`
- `backend/src/core/billing/invoice/invoice.controller.ts`

W6 — Payment
- `backend/src/core/billing/payment/payment.repository.ts`
- `backend/src/core/billing/payment/payment.service.ts`
- `backend/src/core/billing/payment/payment.dto.ts`
- `backend/src/core/billing/payment/payment.controller.ts`

W7 — Refund + Credit Note
- `backend/src/core/billing/refund/refund.repository.ts`
- `backend/src/core/billing/refund/refund.service.ts`
- `backend/src/core/billing/refund/refund.dto.ts`
- `backend/src/core/billing/refund/refund.controller.ts`
- `backend/src/core/billing/credit-note/credit-note.repository.ts`
- `backend/src/core/billing/credit-note/credit-note.service.ts`
- `backend/src/core/billing/credit-note/credit-note.dto.ts`
- `backend/src/core/billing/credit-note/credit-note.controller.ts`

W8 — Razorpay
- `backend/src/core/billing/razorpay/razorpay.types.ts`
- `backend/src/core/billing/razorpay/razorpay.gateway.ts`
- `backend/src/core/billing/razorpay/razorpay.service.ts`
- `backend/src/core/billing/razorpay/razorpay.controller.ts`
- `backend/src/core/billing/razorpay/razorpay-webhook.controller.ts`

W9 — Self surface + Subscription integration + Notification/Reporting bootstrap
- `backend/src/core/billing/self/billing-self.controller.ts`
- `backend/src/core/billing/subscription-integration/billing-subscription-integration.service.ts`
- `backend/src/core/billing/bootstrap/billing-notification-events.bootstrap.ts`
- `backend/src/core/billing/bootstrap/billing-reports.bootstrap.ts`

W10 — Module wiring
- `backend/src/core/billing/billing.module.ts`
- `backend/src/core/core.module.ts` (BillingModule imported)

W11 — Tests (8 unit + 2 controller-level e2e)
- `backend/test/sprint20/billing-account.service.spec.ts`
- `backend/test/sprint20/invoice.service.spec.ts`
- `backend/test/sprint20/payment.service.spec.ts`
- `backend/test/sprint20/refund.service.spec.ts`
- `backend/test/sprint20/credit-note.service.spec.ts`
- `backend/test/sprint20/razorpay.gateway.spec.ts`
- `backend/test/sprint20/billing-feature-flag.spec.ts`
- `backend/test/sprint20/billing-subscription-integration.spec.ts`
- `backend/test/sprint20/billing-invoice.e2e-spec.ts`
- `backend/test/sprint20/billing-self.e2e-spec.ts`

Total new files: 54 (1 schema + 43 src + 10 tests).

## Architecture summary

- PLATFORM_ONLY tables: every billing entity has a single-id PK and is filtered
  by `school_id` (no composite `[id, schoolId]` PK). No sharded tenant pattern.
- FSMs: Invoice (DRAFT → PENDING → PARTIALLY_PAID/PAID/OVERDUE → VOID/WRITTEN_OFF),
  Payment (PENDING/INITIATED → APPROVED/REJECTED/HOLD), Refund (PENDING →
  APPROVED → PROCESSED / REJECTED), CreditNote (ISSUED → APPLIED / VOID).
  Invalid transitions throw typed `Invalid*TransitionError`s.
- Tx + Outbox + Audit pattern: every state-mutating service operation runs in
  `prisma.client.$transaction`, persists the row, appends a tenancy/finance
  audit row via `AuditService`, and emits an outbox event via
  `OutboxPublisherService` inside the same transaction.
- Razorpay isolation: gateway HMAC/signature logic is in
  `razorpay/razorpay.gateway.ts`; the rest of the module never imports the
  Razorpay SDK directly. `billing.razorpay_enabled` short-circuits
  `RazorpayService` entry points with `RazorpayDisabledError`.
- Subscription access via SubscriptionService only:
  `BillingSubscriptionIntegrationService` calls `SubscriptionService.getById`,
  never `SubscriptionRepository` or `prisma.subscription`. Sprint 20 is a
  read-only consumer of subscription data.
- Separation from School Fees: zero imports across `src/core/billing` ↔
  `src/core/fees` in either direction (verified via grep).

## Constraints satisfied

- No SubscriptionService bypass — confirmed by
  `billing-subscription-integration.spec.ts` and grep (0 `SubscriptionRepository`
  hits under `src/core/billing/`).
- No direct subscription table access — no `prisma.subscription` / Subscription
  model references inside `src/core/billing/`.
- Independent from Fees — 0 imports across the boundary in either direction.
- Reused infra: AuditService (8 services), OutboxPublisherService (8 services),
  NotificationEvents bootstrap, Reporting registry bootstrap,
  RequestContextRegistry (12 files), RBAC permissions
  (`billing-permissions.seeder.ts`), FeatureFlagService (9 files),
  SequenceService (6 services), JobScheduler-ready handlers.
- Reused patterns: repository → service → controller; If-Match optimistic
  concurrency on every mutating endpoint; cursor pagination; Zod DTOs.
- If-Match — every `update/transition` endpoint accepts `If-Match: "<version>"`
  parsed via shared helpers; mismatches throw 409.
- Tenant-safe — services always derive `schoolId` from `RequestContextRegistry`
  before mutating; repositories accept explicit `schoolId` filters.
- Razorpay isolated — gateway HMAC code is the only consumer of `node:crypto`
  HMAC primitives for billing; SDK is not imported anywhere else.
- No hardcoded keys / GST / UPI VPAs / bank details / receipt prefixes — all
  read from `BillingSettings` per-account (currency, GST rates, sequence
  prefixes); secrets read from `PaymentSource` via `CryptoService` decryption.
- Manual payments share the lifecycle — `recordManual` and `recordRazorpay`
  both flow through `PaymentService.create → approve`; only the gateway fields
  and initial `status` differ.
- Entities separate — `BillingAccount`, `Invoice`, `Payment`, `Refund`,
  `CreditNote`, `PaymentSource`, `BillingSettings`, `BillingProfile`,
  `BillingAddress`, `TaxDetails` are each modelled in their own Prisma model
  with no shared polymorphic tables.

## Verification results

| Check | Result |
| --- | --- |
| `npx prisma generate` | PASS (Prisma Client v6.19.3 generated) |
| `npx tsc --noEmit` | PASS (only the 2 pre-existing errors remain: `test/sprint14/helpers.ts:122` and `test/sprint4_5/branch.e2e-spec.ts:65`) |
| `npx jest --testPathPattern=sprint20` (unit) | PASS — 8 suites, 23 tests |
| `npx jest --config ./test/jest-e2e.json --testPathPattern=sprint20` (e2e) | PASS — 2 suites, 3 tests |
| Grep: `from '@prisma/client'` in `src/core/billing/` | PASS — 9 hits, all enum/type imports (`billing.types.ts` enum re-exports + 8 `import type { Prisma }`) |
| Grep: `SubscriptionRepository` in `src/core/billing/` | PASS — 0 hits |
| Grep: `from.*core/fees` in `src/core/billing/` | PASS — 0 hits |
| Grep: `from.*core/billing` in `src/core/fees/` | PASS — 0 hits |
| Reused-infra imports (Crypto/Outbox/Audit/FeatureFlag/Sequence/RequestContext) | PASS — confirmed in 8/12 files as applicable |
| `BillingModule` wired in `src/core/core.module.ts` | PASS (line 120) |

## Known deferrals

- Reporting registry bootstrap stubbed — `billing-reports.bootstrap.ts`
  registers report keys but the actual report generators are placeholders;
  full report SQL ships in a follow-up.
- Audience enum mapping — notification audience routing currently uses the
  generic `SCHOOL_ADMIN` audience; richer per-event audience mapping (e.g.
  `BILLING_ADMIN`, `FINANCE_REVIEWER`) is deferred.
- SubscriptionService gaps — Sprint 20 only consumes `getById`; the renewal
  pipeline assumes upstream sprints will add a renewal hook that calls the
  integration service.
- E2E infra — there is no shared application-bootstrapped e2e harness wired
  for billing yet. The two `*.e2e-spec.ts` files exercise the controllers
  directly against mocked services to lock in the HTTP shape until a database-
  backed harness lands.
- PUSH adapter — notification PUSH channel adapter is not wired for billing
  events; only EMAIL is registered for `BillingNotificationEvents`.

## Operational notes (next sprint)

- Wire JobScheduler cron jobs for: `markOverdueInvoices` (daily 02:00),
  `generateRenewalInvoices` (daily 03:00 from `Subscription.nextRenewalAt`
  windows), `expirePaymentAttempts` (hourly), `reconcileRazorpayWebhooks`
  (every 15 minutes).
- Ship email templates for `InvoiceIssued`, `InvoicePaymentReceived`,
  `InvoiceOverdue`, `RefundProcessed`, `CreditNoteIssued`. Template IDs are
  registered in `billing-notification-events.bootstrap.ts` but the MJML/HTML
  bodies live in the email-templates package.
- Stand up the database-backed e2e fixture for billing: seed a platform admin
  + school, walk the full Invoice → Payment → Refund happy path through the
  HTTP layer with real Prisma transactions.
- Seed `BillingPermissions` into the platform RBAC fixture and add the three
  feature flags to the default-on/default-off matrix for non-prod envs.
