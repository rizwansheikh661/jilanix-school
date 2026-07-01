# Billing Foundation Architecture

> Architecture for the SaaS Billing Foundation that charges schools for using the SchoolOS platform.
> Status: **delivered in Sprint 20** for the core foundation (schema, services, controllers, Razorpay gateway, subscription integration, tests). Items marked "deferred" in §14.2 and Sprints 22–23 in §15 remain future work.
> Scope: backend; India-only; Razorpay-only.
> Companion to `IMPLEMENTATION_STATUS.md` (Sprint 20 baseline), `BILLING_PAYMENT_WORKFLOW.md`, and `SUBSCRIPTION_FOUNDATION.md`.

---

## 1. Two Domains, Permanently Separate

The platform contains two payment-bearing domains. They look superficially similar — both have "invoices", "payments", "receipts", "refunds", and "audit" — and the temptation to share tables or services is real. This section exists to make that mistake impossible to make accidentally.

### 1.1 School Fees — Parent → School

- **Actor paying:** the parent (or guardian) of an enrolled student.
- **Actor receiving:** the school (the tenant).
- **What is being paid for:** tuition, transport, examination fees, event fees, late fines, hostel charges, library dues — i.e. the school's own services to its own pupils.
- **Where it lives in the codebase:** `backend/src/core/fees/*` (Sprints 7–8).
- **Money flow:** parent's bank → school's bank account, via the school's own merchant relationship (which may itself be a payment gateway, but is configured per-school by the school).
- **Tax surface:** Indian school-fee receipts; specific concessions on tuition fees per the Income Tax Act and state-level rules; GST treatment is typically exempt for core education.
- **Audit:** `audit/finance-chain/*` — hash-chained finance audit, append-only, designed for forensic reconstruction at a school's own books.
- **Lifecycle ownership:** the school decides when to issue an invoice, when to settle it, when to refund. The platform does not interfere.

### 1.2 SaaS Billing — School → Platform

- **Actor paying:** the school (the tenant) — typically the principal, accountant, or trust-level finance officer.
- **Actor receiving:** the platform operator (us).
- **What is being paid for:** the right to use SchoolOS — plan subscription, per-channel communication overage, optional add-on modules, professional services if any.
- **Where it lives in the codebase:** `backend/src/core/billing/*` (delivered in Sprint 20).
- **Money flow:** school's bank → platform's Razorpay merchant account.
- **Tax surface:** Indian SaaS B2B — GST on platform fees, eventually e-invoicing (IRN) when our turnover crosses thresholds; CGST/SGST/IGST split per state.
- **Audit:** a new `billing_audit_events` ledger (separate from `audit/finance-chain`). Different threat model — focused on operator-disputable events (refund, plan change, write-off).
- **Lifecycle ownership:** the platform decides when to invoice, when to dun, when to suspend. The school can act (renew, change plan) but cannot create or void platform invoices.

### 1.3 Why these two domains MUST NEVER share tables or business logic

- **Different counterparties.** A "Payment" row that could either be parent→school or school→platform is a row that can be miscategorised; one mis-write moves money on the wrong side of the wall.
- **Different reporting obligations.** School fees roll up into a school's books, GST nil/exempt, RTE concession reporting; SaaS billing rolls up into platform revenue, MRR/ARR, GST B2B, IRN, GSTR-1. The two will never live on the same chart of accounts.
- **Different multi-tenancy semantics.** School fees are tenant-scoped (`schoolId` is the school, the row belongs to that school's data). SaaS billing is platform-scoped but indexed by school — the row belongs to *us*, not to the school. A tenant export must NOT carry SaaS-billing rows out.
- **Different lifecycle drivers.** School-fee invoices are issued by a teacher/accountant clicking a button. SaaS invoices are issued by a scheduler on subscription renewal. Coupling these is how you ship a regression that issues 12,000 tuition invoices because a subscription renewal cron ran.
- **Different threat model.** School-fee disputes are settled by the school's principal; SaaS billing disputes go to platform support. Mixing the dispute queues mixes the escalation paths.
- **Different gateways.** A school may use Cashfree, Paytm, an offline cheque book, or even cash; the platform uses Razorpay only. Coupling them forces every school's parent-paying flow to know about the platform's merchant configuration.

The boundary is enforced architecturally: separate Prisma schema file, separate module, separate permission namespace, separate audit ledger, separate Razorpay merchant configuration, separate webhook routes, separate notification event keys.

---

## 2. Current Implementation (delivered at end of Sprint 20)

Billing Foundation did **not** start from zero. The following already existed and Billing integrates with — not replaces — them.

### 2.1 Subscription Foundation (`core/subscription/`, Sprint 15)

- **`Plan`** — platform-defined plan (FREE / STARTER / PRO / ENTERPRISE shape). Owned by operator.
- **`PlanFeature`** — per-plan feature config: `FeatureType` (LIMIT | TOGGLE), `FeatureMode` (LIMITED | UNLIMITED | DISABLED | ENABLED), optional `BigInt limit`. This is the source of truth for what a plan *allows*.
- **`Subscription`** — one row per (school, lifecycle). Status enum: `PENDING | TRIAL | ACTIVE | EXPIRING | EXPIRED | SUSPENDED | CANCELLED`. Carries `trialEndsAt`, `expiryDate`, `nextRenewalAt`, `autoRenew`. A STORED `active_key` + UNIQUE index enforces one ACTIVE subscription per school.
- **`SubscriptionHistory`** — append-only journal of every transition (ASSIGNED, ACTIVATED, UPGRADED, DOWNGRADED, RENEWED, EXPIRING, EXPIRED, SUSPENDED, REACTIVATED, CANCELLED).
- **`SchoolUsage`** — singleton per school: counters for students, staff, branches, sms/whatsapp/email period usage, storage bytes, period bounds.
- **`UsageEvent`** — append-only signed-delta ledger backing `SchoolUsage` recompute.
- **`UsageThresholdState`** — singleton per (school, featureKey), edge-trigger memory for 80% / 90% / 100% bands.

### 2.2 Subscription Enforcement (`core/subscription/guard/`, Sprint 16)

- `SubscriptionWriteGuardInterceptor` — blocks mutating HTTP methods on tenants whose subscription is not in {`TRIAL`, `ACTIVE`, `EXPIRING`}.
- `@AllowWhenInactive()` decorator — opts a route out (used by login, password reset, and — going forward — every Billing route, because the school must be able to renew while suspended).
- `SubscriptionGuardService` — exposes `assertMutationAllowed`, `checkFeatureAvailability`, `checkLimitAvailability`, `assertAndConsume`, `releaseUsage`.

### 2.3 Provisioning (`core/provisioning/orchestrator/`, Sprint 14)

- `SchoolProvisioningService` — stands up a new school: creates the `School` row, seeds the lifecycle to `TRIAL`, creates the initial `Subscription`, mints the first school-admin user, bootstraps `SchoolCommunicationEntitlement`.
- Already produces the data that Billing needs to invoice against.

### 2.4 Trial Flow (`core/provisioning/trial/`, Sprint 14.1)

- `trial-expiry.job-handler.ts` — scheduled daily at 02:00 local. Two passes:
  - **Upcoming pass** — schools approaching `trialEndsAt` get a `TRIAL_EXPIRY_WARNING` outbox + audit.
  - **Expired pass** — schools past `trialEndsAt` are pushed through `SchoolLifecycleService.expireTrial`, emitting `SCHOOL_TRIAL_EXPIRED`.

### 2.5 Expiry Flow (`core/subscription/jobs/`, Sprint 15)

- `subscription-expiry.job-handler.ts` — runs warning + expiry passes against `Subscription.expiryDate`. Emits `SUBSCRIPTION_EXPIRING` and `SUBSCRIPTION_EXPIRED` outbox events. Today these are pure subscription transitions with no invoice attached — Billing Foundation will attach an invoice to the "you must renew" path.

### 2.6 Communication Entitlement (`core/notifications/communication-entitlement/`, Sprint 10/15)

- `SchoolCommunicationEntitlement` — singleton per school, holds per-channel monthly quotas (SMS, WhatsApp, Email) sourced from the plan.
- `assertAndIncrement` — called by the notification dispatcher per send; throws on `CommunicationChannelDisabledError` / `CommunicationQuotaExceededError`.
- Billing Foundation will treat **overage** as the only source of metered platform charges in v1 (everything else is a flat plan fee).

### 2.7 How Billing will integrate

- **Read-only consumers:** `Plan`, `PlanFeature`, `Subscription`, `SchoolUsage` — Billing reads these to decide what to invoice for.
- **Read + react:** `subscription-expiry` outbox events become the trigger for renewal invoices.
- **Write-back:** Billing writes back to Subscription via the existing `SubscriptionService` transition methods (`renew`, `suspend`, `reactivate`, `cancel`) — Billing never mutates `Subscription` rows directly.
- **Communication Entitlement:** at the end of every billing period, Billing snapshots overage from `SchoolCommunicationEntitlement` counters into an invoice line, then resets the period via the existing reset path.

---

## 3. Billing Lifecycle

The lifecycle below is the **billing-state** of a single school. It is parallel to — not the same as — the existing `Subscription.status`. Billing publishes status transitions back into Subscription so that `SubscriptionWriteGuardInterceptor` continues to be the single point of truth for "is this tenant allowed to write."

```
                       ┌──────────────┐
                       │    TRIAL     │
                       └──────┬───────┘
                              │ trial converted (plan selected, first payment OR free plan accepted)
                              ▼
                       ┌──────────────┐
            ┌─────────►│    ACTIVE    │◄─────────┐
            │          └──────┬───────┘          │
            │                 │ renewal due       │
            │                 ▼                   │
            │          ┌──────────────┐           │
            │          │   INVOICE    │           │
            │          │  GENERATED   │           │
            │          └──────┬───────┘           │
            │                 │                   │
            │                 ▼                   │
            │          ┌──────────────┐           │
            │          │   PAYMENT    │           │
            │          │   PENDING    │           │
            │          └──┬─────────┬─┘           │
            │  webhook ok │         │ webhook fail / no-pay
            │             ▼         ▼             │
            │      ┌──────────────┐ ┌──────────────┐
            │      │   PAYMENT    │ │   EXPIRED    │
            │      │   SUCCESS    │ └──────┬───────┘
            │      └──────┬───────┘        │
            │             │                ▼ (configurable N days, default 7)
            │             ▼          ┌──────────────┐
            └──────  RENEWED         │GRACE PERIOD  │
                                     └──────┬───────┘
                                            │ grace ends with no payment
                                            ▼
                                     ┌──────────────┐
                                     │  SUSPENDED   │◄─── operator suspend (manual)
                                     └──────┬───────┘
                                            │ late payment lands
                                            ▼
                                     ┌──────────────┐
                                     │ REACTIVATED  │ ───► back to ACTIVE
                                     └──────────────┘

       Any state above can transition to CANCELLED (terminal) on operator/tenant request.
```

### 3.1 Transition Semantics

- **TRIAL → ACTIVE.** Happens when the school accepts a paid plan and either (a) pays the first invoice, or (b) is moved to a 100% discounted plan by the operator. Reuses `SchoolLifecycleService.activate`. Emits `BILLING_SUBSCRIPTION_ACTIVATED`.
- **ACTIVE → INVOICE_GENERATED.** Scheduled job runs `nextRenewalAt - billing_lead_days` ahead of the renewal date. Creates an `Invoice` in `DRAFT` then transitions it to `OPEN`. Emits `BILLING_INVOICE_GENERATED`.
- **INVOICE_GENERATED → PAYMENT_PENDING.** When the school clicks "Pay Now" we create a Razorpay Order and the invoice becomes `PAYMENT_PENDING`. There can be multiple `PaymentAttempt` rows against a single invoice.
- **PAYMENT_PENDING → PAYMENT_SUCCESS.** The Razorpay webhook (after signature verification) marks the invoice `PAID`. Side effects: `BILLING_PAYMENT_RECEIVED` outbox + `Subscription.renew()` + receipt notification to the school's billing contacts.
- **PAYMENT_SUCCESS → RENEWED.** A virtual transition for clarity — `Subscription.expiryDate` and `Subscription.nextRenewalAt` advance by the billing-period length. `SubscriptionHistory` records a `RENEWED` row.
- **PAYMENT_PENDING → EXPIRED.** If the subscription's `expiryDate` lapses without any successful payment, the existing `subscription-expiry.job-handler` flips the subscription to `EXPIRED`. Billing observes this through the outbox and starts the grace clock.
- **EXPIRED → GRACE PERIOD.** Soft state. Tenant continues to read but cannot write — `SubscriptionWriteGuardInterceptor` enforces this without any Billing-side change. Reminder schedule fires.
- **GRACE PERIOD → SUSPENDED.** At end of grace window, billing calls `SubscriptionService.suspend()`. Tenant now blocks reads of non-essential surfaces too (a later, more aggressive guard — out of scope for Billing Foundation v1, mentioned here for completeness).
- **SUSPENDED → REACTIVATED.** Late payment lands (operator can also reactivate manually with a write-off). Billing transitions through `Subscription.reactivate()` → `ACTIVE`.
- **Any → CANCELLED.** Terminal. Either school-initiated ("we're not renewing") or operator-initiated (non-payment after grace, fraud, etc.). Outstanding invoice stays on the books as `VOIDED` or `WRITE_OFF` per operator action. `SubscriptionHistory` records the reason.

### 3.2 What Billing Foundation does NOT change about Subscription

- It does not add new `Subscription.status` values.
- It does not move the `SubscriptionWriteGuardInterceptor` block list.
- It does not write to `SubscriptionHistory` directly — every entry goes through `SubscriptionService` so the journal stays the single audit source for subscription transitions.

---

## 4. Invoice Architecture

Each entity below is described in terms of **responsibility**, not schema. The Prisma models live in `backend/prisma/schema/billing.prisma` (Sprint 20 — 15 models); see `MODEL_INVENTORY.md` §13 and `DATABASE_DESIGN.md` §7.5 for column-level specs.

### 4.1 `BillingAccount`

- One row per school (1:1). This is the "customer record" inside Billing.
- Owns the relationship: which Razorpay customer id maps to which school, what the current `BillingProfile` is, what currency is in use (INR, hard-coded for v1), what timezone invoices are dated in (school timezone).
- Lives in the platform's data namespace (not the tenant's), even though it indexes the tenant.

### 4.2 `BillingProfile`

- The legal-entity details of the paying school: legal name (may differ from `School.name`), GSTIN (if registered), PAN, contact emails (a list — typically principal + accountant + a generic ap@school.in), contact phone.
- Versioned. Changing GSTIN issues a new `BillingProfile` row; the old one is preserved because historical invoices were issued against it.
- Editable by the school's billing-admin user (a future RBAC role) and by the operator.

### 4.3 `BillingAddress`

- The legal address of the school as it appears on the invoice. State-of-supply is derived from this address (drives CGST/SGST vs IGST split).
- Linked to a `BillingProfile`. Versioned alongside.

### 4.4 `TaxDetails`

- The tax-treatment block on a single invoice (snapshotted from `BillingProfile` at issuance time).
- Holds: GSTIN of supplier (platform), GSTIN of recipient (school, if any), place-of-supply, HSN/SAC code for SaaS, tax rate, CGST/SGST/IGST split, reverse-charge flag.
- v1 keeps GST minimal — invoice lines carry tax, but full IRN / e-invoice integration is deferred.

### 4.5 `Invoice`

- The customer-facing bill: invoice number (sequenced per financial year), issue date, due date, billing period, subtotal, tax total, discount total, grand total, status (`DRAFT | OPEN | PAYMENT_PENDING | PAID | OVERDUE | VOIDED | WRITE_OFF`).
- Linked to a single `BillingAccount` and a single `Subscription`.
- Immutable once issued (`OPEN` and beyond) — corrections happen via `CreditNote` or `Adjustment`.

### 4.6 `InvoiceLine`

- One line per chargeable item. v1 line types: `PLAN_SUBSCRIPTION`, `COMMUNICATION_OVERAGE_SMS`, `COMMUNICATION_OVERAGE_WHATSAPP`, `COMMUNICATION_OVERAGE_EMAIL`, `MANUAL_ADJUSTMENT`.
- Carries quantity, unit price, tax rate, and a free-form description.
- Source-of-truth back-reference: e.g. an overage line points to the `SchoolUsage` snapshot it was computed from, so disputes can be reconstructed.

### 4.7 `Payment`

- A successful inbound money movement against an `Invoice`.
- Carries: Razorpay payment id, method (`UPI | CARD | NETBANKING | …`), amount, currency, captured-at, settlement-at, the `BillingAccount` it credits.
- An invoice may have at most one `Payment` in v1 (we do not support partial-payments on platform invoices). Refunds reduce the captured amount via `Refund`.

### 4.8 `PaymentAttempt`

- Every Razorpay Order created against an invoice produces a `PaymentAttempt` row.
- States: `CREATED | AUTHORISED | CAPTURED | FAILED | EXPIRED`.
- Failed attempts are kept (not deleted) — they are the audit trail when a school says "I tried to pay three times yesterday and it didn't go through."
- Each attempt has a 1:0..1 link to a `Payment` (only the capturing attempt produces a `Payment`).

### 4.9 `Refund`

- A reversal — partial or full — of a `Payment`.
- Carries: Razorpay refund id, amount, reason (operator-supplied), refunded-at, settlement-at.
- Refunds are operator-only in v1; the school cannot self-serve a refund.
- A refund creates a corresponding `CreditNote` so the GST treatment is correct.

### 4.10 `CreditNote`

- The fiscal counter-document to an invoice. Used for:
  - Refunds (refund = `CreditNote` + `Refund` row together).
  - Operator goodwill ("we owe you a month for the outage on the 14th").
  - Plan-change credit (downgrade mid-period leaves a residual — issued as credit, not cash).
- Numbered separately from invoices (its own sequence).
- Applied against future invoices or refunded out.

### 4.11 `Adjustment`

- A non-fiscal write to an `Invoice` that is not a credit note. Used for in-period corrections **before** the invoice is finalized (DRAFT only).
- Examples: operator adds a manual discount line; system corrects an overage line after a usage-recompute.
- Once an invoice is `OPEN`, only credit notes can change the effective amount owed.

### 4.12 `InvoiceHistory`

- Append-only journal of every state change on an invoice (`DRAFT → OPEN`, `OPEN → PAYMENT_PENDING`, etc.) with the actor (system / operator / school user) and reason.
- Mirrors the role `SubscriptionHistory` plays for subscriptions.

### 4.13 `BillingAudit`

- Operator-disputable events: refund issued, write-off recorded, plan changed at operator's behest, GSTIN edited, billing address changed, Razorpay customer remapped.
- Separate from the existing `audit/finance-chain` ledger (which is for the school's own books).
- Categorised so legal and finance can pull "every refund in Q2" without scraping logs.

---

## 5. Payment Gateway — Razorpay Only

### 5.1 Why Razorpay is sufficient for v1

- **India-only product strategy.** Customers (schools), bank accounts, and tax obligations are all Indian. There is no roadmap line item — and no near-term commercial driver — for cross-border SaaS billing.
- **Coverage.** Razorpay supports every domestic payment method our buyer persona uses: UPI (dominant for B2B small-ticket), netbanking, credit/debit cards, NEFT/RTGS bank-transfer reconciliation, e-mandates for future auto-renewal, and Razorpay Invoices for offline-pay scenarios.
- **Operational fit.** A single merchant relationship reduces reconciliation overhead. We get one settlement file, one dashboard, one support contact, one webhook signing secret.
- **Compliance fit.** Razorpay handles PCI scope, 3DS where required, e-mandate registration with NPCI, RBI tokenisation. Owning a second gateway means owning a second compliance surface for negligible incremental coverage.
- **GST + IRN path.** Razorpay's invoicing product and the upcoming e-invoicing flows are first-class on the India stack, which is exactly where we will need integrations as turnover scales.
- **Speed to v1.** Single-gateway integration is materially smaller than a polymorphic gateway abstraction — and a single-gateway architecture refactored later into multi-gateway is a known, low-risk change. The opposite — multi-gateway shipped first, then collapsed — is the expensive one.

### 5.2 What is explicitly out of scope

- **Stripe / PayPal** — international gateways. Not used because we are India-only.
- **Cashfree / PhonePe / Paytm** — domestic competitors of Razorpay. Not used because adding a second domestic gateway buys no coverage we don't already have through Razorpay.
- **Direct bank integrations (HDFC / ICICI / SBI portals).** Not used because Razorpay aggregates these.
- **International cards via Razorpay International.** Razorpay can do this, but v1 is INR-only on the platform invoice side. Foreign-card payment for a domestic invoice is not a v1 use case.

Future gateway expansion remains possible — the integration boundary (a single `BillingGatewayPort`) is designed so that a second adapter could be added — but until a real customer demands it, we ship one adapter.

---

## 6. Razorpay Flow

The full business flow, from the school's renew-click to the consumed-renewal state.

```
   School (Billing Admin)
            │
            │  (1) clicks "Renew Plan" in the billing surface
            ▼
   Billing API: createOrderForInvoice(invoiceId)
            │
            │  (2) loads OPEN invoice; refuses if not OPEN or already PAID
            │  (3) writes a PaymentAttempt row (status=CREATED)
            ▼
   Razorpay: orders.create({ amount, currency=INR, receipt=invoice.number, notes={…} })
            │
            │  (4) returns order_id
            ▼
   Billing API: persists razorpayOrderId on PaymentAttempt; returns checkout payload to school
            │
            ▼
   Razorpay Checkout (school's browser)
            │
            │  (5) school completes payment via UPI/card/netbanking
            ▼
   Razorpay → POST /api/v1/billing/webhooks/razorpay  (signed)
            │
            │  (6) signature verification using webhook secret
            │  (7) idempotency check on razorpayPaymentId
            │  (8) event = payment.captured
            ▼
   Billing handler (inside transaction)
            │
            │  (9) writes Payment row, flips PaymentAttempt → CAPTURED
            │ (10) flips Invoice → PAID, writes InvoiceHistory
            │ (11) writes BillingAudit row
            │ (12) publishes BILLING_PAYMENT_RECEIVED outbox
            │ (13) calls SubscriptionService.renew(schoolId)
            │      → Subscription.status: EXPIRING/EXPIRED → ACTIVE
            │      → expiryDate, nextRenewalAt advance
            │      → SubscriptionHistory: RENEWED
            ▼
   Outbox dispatcher
            │
            │ (14) Notification Foundation sends:
            │      - BILLING_PAYMENT_RECEIVED → school billing contacts
            │      - BILLING_SUBSCRIPTION_RENEWED → school admins
            ▼
   School: continues to use the platform.
```

### 6.1 Step-by-step notes

- **(1) Renew click.** Only billing-admin users can initiate this. The button is server-rendered (or API-driven by the future Operator Console) — never trust the client to assert "this is the right amount."
- **(2) Invoice loaded by id.** The amount is read off the `Invoice`, not the request body. Razorpay receipt is the canonical invoice number so the gateway's reconciliation file lines up with ours.
- **(3) PaymentAttempt row.** Persisted **before** calling Razorpay so a network failure leaves a forensic trail.
- **(4) Order id.** Stored on the attempt. If the school abandons the checkout, the attempt times out via a scheduled job.
- **(5) Checkout.** Hosted by Razorpay; we ship checkout config (key id, order id, prefill) — never the secret.
- **(6) Signature verification.** Using HMAC-SHA256 with the webhook secret. Unverified payloads are dropped with a 400 and logged for ops review.
- **(7) Idempotency.** Razorpay retries webhooks; the handler treats `razorpayPaymentId` as the idempotency key. Re-delivery is a no-op past the first commit.
- **(8) Event filter.** Only `payment.captured` triggers the success path in v1. `payment.failed` writes the failure into the attempt and triggers a "your payment didn't go through" notification. `payment.authorized` (3DS in-flight) is logged but not acted on.
- **(9–11) Transactional write.** All four writes (`Payment`, `PaymentAttempt`, `Invoice`, `InvoiceHistory`, `BillingAudit`) happen in one transaction so we never have a paid Razorpay payment with an unpaid invoice.
- **(12) Outbox.** Cross-module event. Reuses the existing `OutboxPublisherService`.
- **(13) Subscription renewal.** Done through `SubscriptionService.renew`, never by direct write. This keeps `SubscriptionHistory` correct and lets `SubscriptionWriteGuardInterceptor` continue to be the single rule about who can write.
- **(14) Notifications.** Reused events — see §9.

---

## 7. Grace Period

A configurable post-expiry window during which the tenant is told to pay but is not yet suspended.

### 7.1 Reference timeline (defaults)

| Day | Event | Tenant state | Channel |
|---|---|---|---|
| -7 | Renewal reminder #1 | ACTIVE | Email + In-app |
| -3 | Renewal reminder #2 | ACTIVE / EXPIRING | Email + SMS |
| 0 | Subscription expires; invoice still unpaid | EXPIRED (write blocked; read works) | Email + SMS + In-app |
| +1 | Grace reminder #1 — "you have 6 days to pay" | EXPIRED (grace) | Email |
| +3 | Grace reminder #2 — "you have 4 days" | EXPIRED (grace) | Email + SMS |
| +6 | Grace reminder #3 — "tomorrow we suspend" | EXPIRED (grace) | Email + SMS + In-app |
| +7 | Grace ends. Subscription suspended | SUSPENDED (write fully blocked) | Email + SMS + In-app |

### 7.2 Configurability

Three knobs, all stored on the `Plan` (so different plans can have different recovery curves):
- **`gracePeriodDays`** — default 7, can be 0–30.
- **`reminderSchedule`** — list of relative-day offsets and channels; defaults above.
- **`suspendOnGraceEnd`** — boolean; if false, the subscription stays `EXPIRED` indefinitely (used for goodwill / VIP customers, operator-controlled).

### 7.3 Mechanism

- Reminders are produced by a single scheduled job (`billing.reminder.scan`) that runs daily — it scans all open invoices, computes which reminder is due, and emits a notification via Notification Foundation. Idempotent: re-running the job the same day does not double-send.
- Grace expiry is produced by `billing.grace.expiry-scan` (also daily) — when `now > invoice.dueDate + plan.gracePeriodDays`, it calls `SubscriptionService.suspend(schoolId, { reason: 'BILLING_GRACE_EXPIRED' })` and emits `BILLING_SUBSCRIPTION_SUSPENDED`.
- Suspension never deletes data and is fully reversible — late payment triggers `SubscriptionService.reactivate(schoolId)`.

---

## 8. Renewal

### 8.1 Manual Renewal (v1)

- Default mode for v1. The school's billing-admin clicks "Renew" → Razorpay flow → on success, subscription advances.
- Auto-issued invoice arrives `billing_lead_days` ahead of the renewal date (default 7), giving the school a week to pay before grace mechanics kick in.

### 8.2 Automatic Renewal (future, out of v1 scope)

- Built on Razorpay e-mandates (NPCI UPI Autopay or card-on-file tokens).
- Requires `Subscription.autoRenew = true` (already present in the schema) plus a stored `BillingMandate` row that we deliberately do NOT design here — it has its own onboarding flow (initial small-amount auth, NPCI mandate registration, recurring-debit notification).
- Marked "future" in §15.

### 8.3 Upgrade — Immediate

- School moves from a smaller plan to a larger plan mid-cycle.
- v1 behaviour: **immediate upgrade, immediate full charge.** The new plan's full period fee is invoiced and due immediately; the old plan's unused remainder is issued as a `CreditNote` (applied to the new invoice).
- Why: keeps v1 simple. Proration math is real arithmetic, and getting it wrong is a customer-trust event.

### 8.4 Downgrade — Deferred

- School moves to a smaller plan.
- v1 behaviour: **downgrade takes effect at next renewal.** Current paid period continues at the higher plan; the renewal invoice is issued at the lower plan's price.
- Why: prevents abuse (pay for a month at PRO, downgrade to STARTER on day 2, demand 28/30ths back) and keeps the in-period entitlement story stable.

### 8.5 Plan Change

- Catch-all for any move that is neither a strict upgrade nor strict downgrade (e.g. ENTERPRISE → ENTERPRISE_CUSTOM, a cross-grade between two equally-priced plans with different feature mixes).
- v1 behaviour: operator-only, immediate, no proration. Goodwill credit is issued via `CreditNote` if the operator considers the change customer-favourable.

### 8.6 Proration

- **Not in v1.** Mentioned here so the design is honest about what's missing. The architecture leaves room for it (`InvoiceLine` quantities are decimal, and `CreditNote` already exists as a vehicle for "the customer is owed X for time-not-used"), but no in-period proration math is in scope.
- Deferred to a later sprint, after auto-renewal lands (proration is most useful when changes are frequent, which only happens at scale).

---

## 9. Communication

Billing emits notifications. It does **not** add new providers; it adds new event keys to the existing Notification Foundation catalog and lets the existing dispatcher fan out.

### 9.1 New notification events (to be appended to `notification-events.catalog.ts`)

| Event Key | Category | Default Channels | Audience |
|---|---|---|---|
| `BILLING_INVOICE_GENERATED` | `SYSTEM` (until a `BILLING` category is added) | Email + In-app | Billing-admin contacts |
| `BILLING_PAYMENT_RECEIVED` | `SYSTEM` | Email + In-app | Billing-admin contacts |
| `BILLING_PAYMENT_FAILED` | `SYSTEM` | Email + SMS + In-app | Billing-admin contacts |
| `BILLING_RENEWAL_REMINDER` | `SYSTEM` | Email + In-app (SMS at T-3) | Billing-admin + school-admin |
| `BILLING_SUBSCRIPTION_EXPIRING` | `SYSTEM` | Email + SMS + In-app | Billing-admin + school-admin |
| `BILLING_SUBSCRIPTION_SUSPENDED` | `SYSTEM` | Email + SMS + In-app | All school-admin contacts |
| `BILLING_SUBSCRIPTION_REACTIVATED` | `SYSTEM` | Email + In-app | All school-admin contacts |
| `BILLING_REFUND_ISSUED` | `SYSTEM` | Email + In-app | Billing-admin contacts |
| `BILLING_CREDIT_NOTE_ISSUED` | `SYSTEM` | Email + In-app | Billing-admin contacts |

### 9.2 Reused events

- `SUBSCRIPTION_EXPIRY_WARNING` already exists. Billing will subscribe to it as a signal to fire `BILLING_RENEWAL_REMINDER`, rather than duplicating the warning logic.
- `SUBSCRIPTION_EXPIRING` and `SUBSCRIPTION_EXPIRED` (emitted today by `subscription-expiry.job-handler`) become the upstream triggers Billing reacts to.

### 9.3 Templates

- All billing templates are seeded under a `BILLING_*` prefix and stored exactly the same way as today's school-level templates. Per-tenant override is allowed (so a school can customise the "you owe us" tone) — but a default operator-owned template always exists.

### 9.4 Channel choice

- Email is the default for everything (billing is fundamentally a paperwork channel).
- SMS is reserved for time-critical, action-required messages (T-3 reminder, suspension imminent, suspension done, payment failed) — not for receipts.
- In-app is always on (renders the "Pay now" banner in the eventual UI).
- WhatsApp / Push are deliberately not used for billing in v1 — billing communication needs to land in a place a school's accountant actually checks.

### 9.5 Category note

A dedicated `BILLING` notification category is recommended but is a separate, additive schema change. Until then, billing events fall under `SYSTEM` exactly as `SUBSCRIPTION_EXPIRY_WARNING` does today.

---

## 10. Reporting

Billing Foundation produces data; the existing **Reporting Foundation** (`core/reporting/`) is where the operator-facing read views eventually live. Billing does not own a reporting layer.

Expected report kinds (registered with the existing `reportKindCatalog` in a later sprint):

| Report | Definition |
|---|---|
| **Revenue (period)** | Sum of `Payment.amount` minus `Refund.amount`, grouped by month / quarter / FY. |
| **MRR (Monthly Recurring Revenue)** | Sum of normalised monthly plan price across all `ACTIVE` subscriptions on the report date. |
| **ARR (Annual Recurring Revenue)** | MRR × 12. |
| **Renewals** | Count of `Subscription` rows whose `SubscriptionHistory` shows a `RENEWED` action in the period. |
| **Failed Payments** | Count + amount of `PaymentAttempt` rows in state `FAILED` in the period, grouped by failure reason. |
| **Active Plans** | Distribution of `ACTIVE` subscriptions by plan code on the report date. |
| **Expiring Plans** | Subscriptions whose `expiryDate` lands in the next N days; bucketed by 7 / 15 / 30 days out. |
| **Trial Conversion** | Of trials that ended in the period, what % converted to paid? |
| **Suspended / At-risk** | Subscriptions in `EXPIRED` or `SUSPENDED` state with their grace-clock position. |
| **Refunds Issued** | List of `Refund` rows with the issuing operator and reason. |

Per `Reporting Foundation`, scheduled / exported variants of these reports are available without billing-side work.

---

## 11. Permissions (future RBAC surface)

Permissions to be seeded in Billing Foundation's permission seeder. None of these exist today.

| Key | Description |
|---|---|
| `billing.read` | View one's own school's billing surface (invoices, payments, current plan). |
| `billing.manage` | Wildcard for the platform-side billing surface (operator-only). |
| `billing.invoice.read` | List/read invoices. |
| `billing.invoice.create` | Create / regenerate an invoice (operator-only in v1). |
| `billing.invoice.void` | Void an invoice (operator-only). |
| `billing.payment.read` | List/read payments + attempts. |
| `billing.payment.refund` | Issue a refund (operator-only). |
| `billing.subscription.manage` | Operator-side renew / upgrade / downgrade / suspend / reactivate / cancel. |
| `billing.credit-note.read` | List/read credit notes. |
| `billing.credit-note.create` | Issue a credit note (operator-only). |
| `billing.profile.manage` | Edit a school's `BillingProfile` / `BillingAddress` / tax fields. |
| `billing.audit.read` | Read the billing audit ledger. |

Role wiring (planned, not implemented):
- `platform-admin` wildcard covers every `billing.*`.
- A new role `billing-admin` (tenant-side) gets `billing.read`, `billing.invoice.read`, `billing.payment.read`, `billing.profile.manage`.
- `school-admin` (tenant-side) inherits `billing.read` and `billing.invoice.read` only — they can see what is owed but cannot manage the legal-entity record.

---

## 12. Operator Console

The Operator Console is the platform-admin-facing surface for Billing. Its UI is a separate (later) project; this section is API + functional scope only.

### 12.1 Functional areas

- **Billing Dashboard.** Headline numbers — MRR / ARR / outstanding receivables / failed payments / churn-this-month / trials-ending-this-week. Single API consolidates the headline rollup; per-area drills are separate endpoints.
- **Invoices.** Search by school / status / period; view invoice; void invoice (with reason); regenerate invoice (operator-issued).
- **Payments.** Search by school / status / period; view payment + attempts; cross-link to Razorpay payment id; export reconciliation files for the finance team.
- **Subscriptions.** View current subscription per school; trigger renewal / upgrade / downgrade / suspend / reactivate / cancel; view `SubscriptionHistory`.
- **Renewals.** Upcoming-renewals view, sortable by ARR-at-risk; force-renew / send-reminder actions.
- **Revenue.** Period revenue with drill-down to invoice; FY view, quarterly view.
- **Failed Payments.** Queue of attempts in `FAILED` state, sortable by amount + age; contact-the-customer action.
- **Refunds.** List + issue refund; refund issuance writes to `BillingAudit` and goes through Razorpay refund API.
- **Customer Billing Profile.** View / edit `BillingProfile`, `BillingAddress`, `TaxDetails`. Versioned; every edit is audit-logged.

### 12.2 Read vs write split

- Every read endpoint requires `billing.read` (and is tenant-scoped to "all schools" for `platform-admin`).
- Every write endpoint requires the specific `.create` / `.refund` / `.manage` / `.void` permission and is operator-only in v1.
- All write endpoints are `@AllowWhenInactive`-annotated where the school is the actor and `SUSPENDED` — because a suspended school must still be able to pay (otherwise they cannot recover).

---

## 13. Module Boundaries

A canonical line per pair of adjacent domains. Each line is enforced by code review and by the directory structure (`core/X/` and `core/Y/` are separate trees with no cross-imports outside the documented seam).

| Pair | Boundary |
|---|---|
| **School Fees** ↔ **SaaS Billing** | School fees live in `core/fees/*` and write to the school's tenant-scoped tables. SaaS billing lives in `core/billing/*` and writes to platform-scoped tables. Neither imports the other. The two never share invoice numbers, sequences, audit ledgers, or notification templates. |
| **Hybrid Fee Collection** ↔ **SaaS Billing** | Hybrid Fee Collection (`fees/fee-payment-source/*`) is a school-internal feature — multiple tenders against one parent-paying invoice. SaaS billing has at-most-one payment per invoice in v1. The concepts are not portable across the boundary. |
| **Subscription Foundation** ↔ **Billing Foundation** | Subscription Foundation owns the **state machine** (`Subscription.status`, `SubscriptionHistory`, `SchoolUsage`). Billing Foundation owns the **money** (`Invoice`, `Payment`, `Refund`, `CreditNote`). Billing reads subscription state and calls subscription's transition methods; it never writes to `Subscription` rows directly. |
| **Subscription Enforcement** ↔ **Billing Foundation** | Subscription Enforcement (`SubscriptionWriteGuardInterceptor`) is the single point of "is this tenant allowed to write." Billing does not add a parallel guard — it transitions `Subscription.status` such that the existing guard does the right thing. Billing routes themselves use `@AllowWhenInactive` so the school can pay even while blocked. |
| **Communication Center** ↔ **Billing Foundation** | Communication Center is the operator surface for **ERP-generated** communications (broadcasts, dashboards, search, timeline). Billing communications go through Notification Foundation directly — they are not "broadcasts" in the Communication Center sense and do not show up on the school's Communication Center dashboard. They DO show up on a Billing Communications view inside the Operator Console. |
| **Reporting Foundation** ↔ **Billing Foundation** | Billing produces transactional data. Reporting reads it and registers Billing reports in the existing `report-kind-catalog`. Billing does not own its own report engine. |
| **Super Admin** ↔ **Billing Foundation** | The Operator Console is the Super Admin's UI; Billing supplies the APIs and the permission keys. Super Admin does not embed billing logic — every API call goes through the Billing module. |
| **Provisioning** ↔ **Billing Foundation** | Provisioning creates the `School` + initial `Subscription` (in TRIAL). Billing creates the `BillingAccount` either eagerly on provisioning or lazily on first invoice. Provisioning never writes to billing tables; Billing never writes to lifecycle tables. |

---

## 14. Future Scope — what's in v1 and what isn't

### 14.1 Included in Billing Foundation v1

- `BillingAccount`, `BillingProfile`, `BillingAddress`, `TaxDetails` schemas and CRUD.
- `Invoice`, `InvoiceLine`, `InvoiceHistory` with the full state machine (DRAFT → OPEN → PAYMENT_PENDING → PAID / OVERDUE / VOIDED / WRITE_OFF).
- `PaymentAttempt`, `Payment`, `Refund`, `CreditNote`, `Adjustment`.
- `BillingAudit` ledger.
- Razorpay adapter — single port (`BillingGatewayPort`), single implementation. Order create + webhook intake + refund issuance.
- Renewal flow — manual only; auto-issued invoice 7 days before `nextRenewalAt`.
- Grace period mechanics — configurable per plan, default 7 days post-expiry, scheduled reminder + suspension jobs.
- Upgrade (immediate, full charge) and downgrade (deferred to next renewal).
- Operator-only refund issuance and credit-note creation.
- New billing notification events appended to `notification-events.catalog.ts`.
- New `billing.*` permission keys with operator and tenant roles wired in.
- Billing Foundation feature flag (`module.billing`) gating the entire surface.

### 14.2 Deferred to future sprints

- **GST e-invoicing / IRN.** Full IRN registration with NIC, QR code on invoice, GSTR-1 export. v1 carries tax fields but does not file e-invoices.
- **Multi-currency.** v1 is INR-only on platform invoices. USD / SGD / AED billing for international school chains is future.
- **Coupons / promo codes.** No `Coupon` entity in v1. Operator can issue discount via `Adjustment` (pre-finalisation) or `CreditNote` (post-finalisation).
- **Partner billing / affiliate billing.** Revenue-share with implementation partners or referrers is out of scope.
- **Marketplace billing.** Third-party add-ons sold through SchoolOS with revenue split is out of scope.
- **International payments.** Razorpay International, foreign card acceptance, FX settlement, FEMA reporting — all out of scope.
- **Automatic renewal via e-mandates.** Subscription.autoRenew exists; the e-mandate onboarding + recurring-debit path is future.
- **Proration on plan change.** Mid-period upgrade today is "pay the full new period + credit the old remainder"; mid-period downgrade today is "wait until next renewal." True proration is future.
- **Dunning automation beyond reminders.** v1 sends reminders and suspends at grace-end. Automated retry of failed payments (smart retry on the 3rd / 7th / 14th), gateway-side dunning workflows, ledger-side write-off campaigns are future.
- **Self-serve plan change in tenant UI.** v1 plan changes are operator-initiated. Self-serve upgrade is a small follow-up; self-serve downgrade is held back longer because of the abuse vector.
- **Bank statement reconciliation.** Razorpay's settlement reports go to the finance team; automated three-way reconciliation against the platform's bank statements is future.

---

## 15. Sprint Outcomes

### Sprint 20 — Billing Foundation (delivered)

Sprint 20 collapsed what this document originally planned as Sprints 20–21 into a single foundation release. Delivered:

- **Schema (15 models in `billing.prisma`):** `BillingAccount`, `BillingProfile`, `BillingAddress`, `TaxDetails`, `BillingSettings`, `PaymentSourceConfiguration`, `Invoice`, `InvoiceLine`, `InvoiceHistory`, `Payment`, `PaymentAttempt`, `Refund`, `CreditNote`, `Adjustment`, `BillingAudit`. One hand-crafted additive migration. 11 enums.
- **`BillingModule`:** services (`BillingAccountService`, `BillingSettingsService`, `PaymentSourceService`, `InvoiceService`, `PaymentService`, `RefundService`, `CreditNoteService`), repositories, errors, constants, `BillingPermissionsSeeder`, `BillingFeatureFlagsBootstrap` (3 flags: `module.billing`, `module.billing_razorpay`, `module.billing_admin` — all default OFF), `BillingNotificationEventsBootstrap` (9 `BILLING_*` keys).
- **Invoice FSM + `InvoiceHistory` writes** on every transition. FY-scoped invoice numbering via `SequenceService` (`BILLING_INVOICE`).
- **Razorpay gateway:** Node native `https` + `crypto` (no SDK). Order creation, webhook signature verification (timing-safe HMAC-SHA256), payment verification, refund issuance.
- **Manual payment paths** (UPI / Bank Transfer / Cash / Cheque / Card) sharing the same FSM as Razorpay — only the verification step differs.
- **`BillingSubscriptionIntegrationService`** — the only seam to Subscription. Calls `SubscriptionService` methods only; never touches `SubscriptionRepository`. Generates renewal invoices, marks subscriptions ACTIVE after first payment, reserves a non-payment pause hook.
- **`PaymentSourceConfiguration`** with envelope-encrypted Razorpay key id / secret / webhook secret via `CryptoService.sealString`.
- **9 billing permission keys** wired to operator (wildcard) and tenant (read-only on own account) roles.
- **Controllers:** `/api/v1/platform/billing/*` (admin), `/api/v1/me/billing/*` (school self-read), `/api/v1/billing/razorpay/*` (authenticated order/verify), `/api/v1/billing/webhooks/razorpay` (public, raw-body HMAC).
- **Tests:** 8 unit specs + 2 controller-level e2e specs under `backend/test/sprint20/`.

### Deferred (not in Sprint 20)

- **Dunning state machine + automated reminder pipeline.** Settings (grace period, reminder offsets) exist; the scheduler + escalation are future.
- **Auto-charge on saved mandates / e-NACH.** `autoChargeEnabled` flag exists; recurring debit path is future.
- **Operator Console UI** (was Sprint 22). API surface is ready; UI is a separate frontend project.
- **Billing Reports** (was Sprint 23). The reports bootstrap is a deferred-registration stub — `ReportRegistry` is not yet built in `reporting/`.
- **GST e-invoice / IRN / GSTR-1 export, TDS certificate workflow.**
- **Multi-currency, partner-billing splits, marketplace billing.**
- **True proration on plan change.**
- Coupon / promo-code engine.
- Multi-currency for international tenants.
