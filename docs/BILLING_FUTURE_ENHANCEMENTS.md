# Billing Future Enhancements

**Status: Future Roadmap (Not Implemented)**

This document reserves future architecture decisions for the SaaS Billing
domain. It is **design-only**. Nothing here is implemented, scheduled, or
committed to Sprint 20. Its purpose is to ensure that Sprint 20 ships a
minimal, clean Billing Foundation without painting future expansion into
a corner.

No Prisma models, no migrations, no APIs, no controllers, no services,
no DTOs, no repositories, no code, no tests are described or planned in
this document.

This document complements:
- `BILLING_FOUNDATION_ARCHITECTURE.md` (the Sprint 20 target architecture)
- `BILLING_PAYMENT_WORKFLOW.md` (the Sprint 20 payment workflow)

---

## 1. Future Billing Features

Reserved discount and credit mechanics. None of these are part of Sprint 20.
No database tables are designed here — only the business intent is recorded
so future schema work has a consistent vocabulary.

| Feature | Business Purpose |
|---|---|
| **Coupon Codes** | Operator-issued codes applied at checkout to grant a fixed or percentage discount on an invoice. Used for sales campaigns and partner promotions. |
| **Promo Codes** | Time-bound or quota-bound public codes (e.g. "EDU2027") for marketing campaigns. Distinct from coupons in being broadly distributed rather than school-specific. |
| **Referral Discounts** | A school referring another school earns a credit when the referee completes payment. Drives organic growth. |
| **Seasonal Discounts** | Calendar-bound automatic price reductions (e.g. academic-year-start promos, festive offers). Applied without a code. |
| **Early Renewal Discounts** | A reduction granted when a school renews before the current term expires. Improves cash flow and reduces churn risk. |
| **Scholarship / NGO Discounts** | Permanent or long-running discounts for non-profit / charitable institutions. Operator-approved, audit-tracked. |
| **One-time Credits** | Operator-issued credit balance (e.g. as goodwill after an incident). Applied automatically against the next invoice. |
| **Billing Credits** | A general credit balance accumulated from refunds, overpayments, or adjustments. Carried forward until consumed. |
| **Loyalty Rewards** | Future programme that grants benefits based on tenure or volume (multi-year customers, large student bases). |

All of the above must compose with subscription pricing without rewriting
`SubscriptionService`. The Sprint 20 architecture leaves room for a future
discount layer that mutates `Invoice` line items before finalisation.

---

## 2. Add-on Marketplace

Reserved architecture for purchasable add-ons that extend the base
subscription. The Sprint 20 design must not assume "plan == final price";
the invoice composition step must remain open to additional line items
of type "add-on".

Add-ons may be purchased in three billing modes:

- **One-time purchase** — single charge, perpetual benefit (e.g. a one-off
  custom report build).
- **Monthly recurring** — billed each cycle alongside the base subscription
  (e.g. SMS pack auto-refill).
- **Annual recurring** — billed yearly (e.g. premium support).

Examples of add-ons reserved for the future marketplace:

| Add-on | Typical Mode | Intent |
|---|---|---|
| Extra Students | Monthly / Annual | Raise the student headcount cap above the plan's quota. |
| Extra Staff | Monthly / Annual | Raise the staff headcount cap. |
| Extra Branches | Monthly / Annual | Permit additional school branches beyond the plan's allowance. |
| Extra Storage | Monthly / Annual | Increase file / document storage allocation. |
| SMS Packs | One-time / Monthly | Top up SMS quota beyond plan inclusion. |
| WhatsApp Packs | One-time / Monthly | Top up WhatsApp message quota. |
| Email Packs | One-time / Monthly | Top up transactional email quota. |
| Custom Reports | One-time | Build-to-order analytics. |
| API Access | Monthly / Annual | Enable external API integration tier. |
| AI Features | Monthly / Annual | Enable AI-assisted modules. |
| Premium Support | Monthly / Annual | Higher SLA support channel. |

No implementation, marketplace UI, or storefront is in scope. Sprint 20
only needs to ensure invoices and the entitlement engine can later carry
add-on rows without redesign.

---

## 3. Trial Management

Reserved subscription trial actions. Today the Sprint 20 design carries
a single trial window — these enhancements extend operator control over
it without altering the FSM.

| Action | Purpose |
|---|---|
| **Trial Extension** | Grant additional trial days when a school requests more evaluation time. |
| **Trial Pause** | Temporarily stop the trial countdown without losing remaining days. |
| **Trial Resume** | Resume a paused trial; remaining days continue. |
| **Trial Reset** | Operator-only: restart the trial from day zero. Sensitive — rare exception case (e.g. corrupted onboarding). |

**Approval workflow (future):**

1. School requests via Billing Contact → ticket / email.
2. Operator opens the school in the Operator Console.
3. Operator selects the trial action and supplies a written reason.
4. For Extension or Reset, a senior operator role must approve before
   the action is applied.
5. Action is recorded in `BillingAudit` with `requestedBy`, `approvedBy`,
   reason text, before/after trial window.
6. Notification dispatched to the Billing Contact confirming the change.

The FSM must remain deterministic: pause/resume are explicit transitions,
not silent timer adjustments.

---

## 4. Billing Dashboard KPIs

Reserved analytics surface. No reporting is implemented; this section
records the metric vocabulary so Sprint 20 column choices do not block
future computation.

| KPI | Definition (informal) |
|---|---|
| **MRR** | Monthly Recurring Revenue — normalised subscription revenue per month across active schools. |
| **ARR** | Annual Recurring Revenue — MRR × 12, with annual plans amortised to monthly. |
| **Churn** | Rate of schools cancelling / lapsing in a period, by count and by revenue. |
| **Trial Conversion** | Percentage of trials that convert to paid subscriptions. |
| **Revenue** | Total invoiced and total collected per period. |
| **Outstanding** | Sum of unpaid invoice balances, optionally bucketed by age. |
| **Collections** | Payments received in a period (cash inflow). |
| **Refund Rate** | Refunded amount / collected amount in a period. |
| **Growth Rate** | Period-over-period change in MRR or ARR. |
| **ARPU** | Average Revenue Per School — total revenue / active school count. |
| **LTV** | Lifetime Value — projected total revenue per school over its expected tenure. |

These are computed from existing invoice, payment, refund, and
subscription records. No precomputed aggregate tables are designed here.

---

## 5. Revenue Forecasting

Reserved forecasting surface, separate from KPIs above. Forecasting is
predictive, not historical.

| Forecast | Horizon |
|---|---|
| **Monthly Forecast** | Next 1–3 months of expected revenue. |
| **Quarterly Forecast** | Next 1–4 quarters. |
| **Annual Forecast** | Next 1–2 fiscal years. |

Forecasting must be transparent and statistical first (renewals due,
trials projected to convert, churn risk). **No AI implementation** is
in scope. The architecture must not assume a model is required; a
straightforward deterministic projection from the existing subscription
calendar is the baseline.

---

## 6. Collections Management

Reserved collection workflows for unpaid invoices.

| Concept | Purpose |
|---|---|
| **Aging Buckets** | Group unpaid invoices by overdue age (e.g. 0–30, 31–60, 61–90, 90+ days) for prioritisation. |
| **Collections Queue** | Operator work queue ordered by amount, age, and risk. |
| **Follow-up History** | Append-only log of every contact attempt — call, email, in-app message — with outcome. |
| **Promise to Pay** | A recorded commitment from the school to pay by a specific date, surfaced back to the operator on that date. |
| **Write-off** | Operator action (with approval) to mark an invoice as uncollectable. Audited. |
| **Recovery Tracking** | When a previously written-off invoice is later paid, record the recovery against the original write-off. |

Architecture only. No collections module is built in Sprint 20.

---

## 7. Multi Currency (Future)

**Current product: India only. INR only.**

**Multi-currency is NOT IMPLEMENTED.** Sprint 20 stores amounts as INR
minor units (paise) and assumes a single currency throughout.

The Sprint 20 architecture should leave money columns named and typed
in a way that does not preclude a future currency column being added
(e.g. avoid hard-coding "INR" into column names where avoidable). No
currency conversion, exchange-rate table, or multi-currency invoice
totals are designed.

Future currencies reserved for consideration:

- USD
- AED
- EUR
- GBP

Until then, every monetary value in the Billing domain is INR.

---

## 8. Multi Payment Gateway (Future)

**Sprint 20 implements Razorpay only.**

This is a deliberate constraint, not an oversight. Razorpay covers the
required India payment surface (UPI, cards, netbanking, wallets) and a
single gateway integration keeps Sprint 20 small and reviewable.

Future gateway compatibility is reserved for:

- Cashfree
- PhonePe
- Paytm
- Stripe (only relevant if international expansion happens)
- PayPal (only relevant if international expansion happens)

The Sprint 20 architecture should isolate Razorpay-specific concerns
(order creation, checkout payload, signature verification, webhook
payload shape, refund call) behind a clean internal seam so that a
second gateway can be added later without touching invoice, payment,
or subscription logic. No abstraction is required to *exist* in
Sprint 20 — only the seam should be respected.

Manual payment sources (UPI / Cash / Cheque / Bank Transfer) are
operator-recorded and gateway-independent; they remain available
regardless of which gateways are integrated.

---

## 9. Tax Enhancements

Reserved tax features beyond the baseline GST handling that Sprint 20
will carry.

| Enhancement | Purpose |
|---|---|
| **GST Revisions** | Accommodate future GST rate or rule changes without schema change. |
| **Reverse Charge** | Cases where the recipient pays GST instead of the supplier. Rare for SaaS-to-school but reserved. |
| **TDS** | Tax Deducted at Source, where the school deducts TDS on the invoice and remits to the tax authority. Requires invoice-level TDS line and certificate tracking. |
| **E-Invoice (IRN)** | Government-mandated electronic invoicing via IRP — generates an IRN and signed QR. Applies above turnover thresholds. |
| **E-Way Bill** | Movement-of-goods document — not relevant to a pure SaaS product, reserved only in case bundled hardware is ever sold. |
| **International Tax** | VAT / GST for non-Indian jurisdictions, dependent on multi-currency. |

Architecture only. Sprint 20 ships standard GST on the invoice and
leaves room for these without redesign.

---

## 10. Subscription Enhancements

Reserved future subscription capabilities. The Sprint 20 FSM remains
the source of truth; these enhancements extend it.

| Enhancement | Purpose |
|---|---|
| **Auto Renewal** | Automatically renew an expiring subscription using a saved payment method. |
| **Razorpay Mandates** | Recurring payment authorisation (UPI AutoPay / e-Mandate) that backs auto renewal. |
| **Proration** | Bill or credit a partial period when plans change mid-cycle. |
| **Mid-cycle Upgrade Billing** | Charge the difference immediately when a school upgrades before the cycle ends. |
| **Mid-cycle Downgrade Credit** | Issue a credit (not refund) for the unused portion when downgrading. Applied to next invoice. |
| **Pause Subscription** | Temporarily halt service and billing (e.g. summer break) without cancelling. |
| **Resume Subscription** | Reactivate a paused subscription, adjusting the period. |
| **Plan Freeze** | Operator action that locks a school on its current plan, preventing automatic plan changes (used during disputes or migrations). |

No implementation. Sprint 20 keeps manual renewal, immediate upgrade,
deferred downgrade, and operator-driven plan change.

---

## 11. Billing Support

Reserved support surface for billing-specific tickets. Distinct from
general product support — these all touch money and require an audit
trail.

| Surface | Purpose |
|---|---|
| **Billing Tickets** | Generic tickets raised against an invoice, payment, or subscription. |
| **Invoice Disputes** | School disputes a charge on an invoice (e.g. add-on they did not request). |
| **Payment Disputes** | Mismatch between bank record and platform record; requires reconciliation. |
| **Refund Requests** | Formal school-initiated refund ask, distinct from operator-initiated refund. |
| **Credit Requests** | School asks for a credit balance (e.g. for service downtime). |

No support module is implemented. The Sprint 20 architecture should
ensure invoices, payments, and refunds carry stable identifiers so a
future ticket can reference them.

---

## 12. Billing Settings

Reserved platform-level configuration. Every setting listed here is
expected to be editable by a **Platform Admin** (operator role), not
by school administrators.

| Setting | Scope |
|---|---|
| Invoice Prefix | Per financial year prefix for invoice numbers. |
| Receipt Prefix | Per financial year prefix for receipt numbers. |
| Credit Note Prefix | Per financial year prefix for credit note numbers. |
| Reminder Schedule | Days before / after due date when reminders fire. |
| Grace Days | Number of days after due date before suspension. |
| Late Fee Rules | Whether a late fee applies, how it is computed, and caps. |
| Company GST | Platform's own GSTIN, used on every invoice header. |
| Company Address | Legal address printed on invoices and receipts. |
| Support Email | Email printed on invoices and dunning messages. |
| Support Phone | Phone printed on invoices. |
| Terms & Conditions | T&C block appended to invoices. |
| Footer | Custom footer text on invoices / receipts. |
| Payment Sources | Master on/off for each manual source (UPI, Bank, Cash, Cheque). |
| UPI IDs | List of company UPI IDs displayed for manual UPI payments. |
| Bank Accounts | List of company bank accounts displayed for bank transfers. |
| Razorpay Keys | Live and test API keys, webhook secret. Stored encrypted. |
| Notification Templates | Editable templates for invoice issued, payment received, reminder, suspension. |

All of these are settings — not entities the school manages. A school
admin never edits them. Sprint 20 will hard-code a small subset; the
rest is reserved.

---

## 13. Billing Contacts

Reserved contact structure on the school side of the billing
relationship. The Billing Contact is distinct from the School Admin
who runs the product day-to-day.

| Role | Purpose |
|---|---|
| **Primary Billing Contact** | Receives all billing notifications by default. Sole authoritative contact for invoice and payment matters. |
| **Secondary Billing Contact** | Receives copies; takes over if the primary is unreachable. |
| **Accounts Team** | Group of recipients (often shared inbox) for invoice and receipt PDFs. |
| **Finance Head** | Escalation contact for unpaid balances and disputes. |
| **Trust Member** | Governance escalation — informed only when a school is at risk of suspension. |

**Notification Routing** uses the Notification Foundation to dispatch
to one or more of these roles per event class. **Escalation Order** is
a configurable cascade: a reminder may start at Primary, escalate to
Finance Head after N days, and finally inform Trust Member before
suspension.

No implementation in Sprint 20. Sprint 20 keeps a single billing email
address per school.

---

## 14. Financial Year Management

Reserved architecture for fiscal-year aware document numbering.

| Concept | Purpose |
|---|---|
| **Financial Year** | The accounting year (India default: April 1 – March 31). Drives sequence resets and reporting periods. |
| **Invoice Sequence** | Sequence resets at year start; numbers carry the FY token (e.g. `INV-2627-000123`). |
| **Receipt Sequence** | Independent sequence with the same FY semantics. |
| **Credit Note Sequence** | Independent sequence with the same FY semantics. |
| **Year Closing** | Operator-driven cut-off: lock the previous FY, finalise reports, archive. |
| **Year Opening** | Bootstrap the new FY: initialise sequences, carry forward outstanding balances. |

Sprint 20 implements the *numbering scheme* (per
`BILLING_PAYMENT_WORKFLOW.md` §7) but **does not** implement automated
year close / open. Operator handles the FY rollover manually for v1.

---

## 15. Operator Console Enhancements

Reserved console widgets and dashboards. Sprint 20 ships a minimal
operator console; these are the future expansions.

| Widget | Purpose |
|---|---|
| **Revenue Overview** | Top-of-fold MRR / ARR / collections summary. |
| **Pending Collections** | Aging-bucket view of outstanding invoices. |
| **Failed Payments** | Live list of Razorpay failures and rejected manual payments, with one-click retry / contact actions. |
| **Subscription Health** | Schools in EXPIRING / SUSPENDED state, ordered by urgency. |
| **Upcoming Renewals** | Schools due to renew in the next N days. |
| **Plan Distribution** | Breakdown of active schools by plan. |
| **Refund Queue** | Refund requests awaiting approval. |
| **Trial Queue** | Active trials with days remaining, conversion likelihood. |
| **Payment Gateway Health** | Razorpay success rate, webhook lag, last incident. |

No implementation. Recorded so Sprint 20 console layout reserves room.

---

## 16. Billing API Roadmap

Future read APIs for the operator and (potentially) integration use.
These are **listed only** — not designed, not specified, not endpoint-shaped.

- Export Invoices
- Export GST
- Revenue Dashboard
- Billing Dashboard
- Forecast
- Credit Notes
- Refunds
- Collections

No request schemas, no response schemas, no route paths are reserved
here. Future sprints will design each independently.

---

## 17. Explicitly Out of Scope

The following are explicitly **NOT** part of Sprint 20 and must not
appear in Sprint 20 code, schema, or tests:

- Coupons
- Promo Codes
- Marketplace
- AI Forecasting
- Multi Currency
- Multi Gateway
- Auto Renewal
- Proration
- International Billing
- Advanced GST (TDS, IRN, Reverse Charge, E-Way Bill)
- Billing Tickets
- Collections Module
- Operator Analytics

Sprint 20 ships the Billing Foundation only: subscription billing,
invoices, payments (Razorpay + manual operator-verified), receipts,
basic GST, basic reminders, and a minimal operator console.

---

## 18. Architecture Principles

These principles are **reconfirmed** and apply to Sprint 20 and every
future enhancement listed above.

- **School Fees remain permanently separate from SaaS Billing.** Two
  domains, two module trees, two ledgers, two payment surfaces. No
  shared invoice table, no shared payment table, no shared service.
- **Razorpay is the only payment gateway in Sprint 20.** All other
  gateways are deferred to a future sprint and must enter through a
  clean seam, not by retrofitting the Razorpay integration.
- **Manual UPI / Cash / Cheque / Bank Transfer remain supported through
  operator verification.** Manual sources are gateway-independent and
  always available regardless of which gateways are integrated.
- **Subscription remains the source of truth** for what a school is
  entitled to. Invoices, payments, and entitlements derive from
  subscription state, never the other way around.
- **Billing never bypasses `SubscriptionService`.** State transitions
  (TRIAL → ACTIVE → SUSPENDED → EXPIRED → CANCELLED) flow exclusively
  through the subscription FSM. Billing reacts to and triggers those
  transitions; it does not mutate subscription state directly.
- **The existing Notification Foundation is reused** for every billing
  notification (invoice issued, payment received, reminder, suspension,
  refund). No parallel notification pipeline.
- **The existing Reporting Foundation is reused** for every billing
  report. No parallel reporting pipeline.
- **The existing Audit Foundation is reused.** Every billing mutation
  (invoice generation, payment capture, refund, manual verification,
  operator override) is recorded via `AuditService`.
- **The existing Job Scheduler is reused** for reminder dispatch,
  retry, reconciliation, and any future recurring billing job.
- **The existing Outbox is reused** for every cross-module event
  emitted by the Billing domain.

These principles are non-negotiable for any future enhancement listed
in this document. A future feature that violates them must instead
propose an extension to the relevant foundation, not a workaround.

---

*End of document. No implementation follows.*
