# BILLING_AND_SUBSCRIPTIONS

_Upstream: MODULES.md, SUBSCRIPTION_FOUNDATION.md, MODULE_BOUNDARIES.md. Downstream: future Billing Foundation implementation._

Plans, pricing strategy, trial mechanics, billing cycle, payment provider integration, dunning, GST, refunds, and renewals.

---

## 0. Status — 2026-06-25

This document describes the **complete** Subscription + Billing target. Today, only the **Subscription Foundation** ships; **Billing Foundation has not been built**.

### ✅ Shipped (Sprint 15 — Subscription Foundation)

Owned by `backend/src/core/subscription/`. Canonical reference: `SUBSCRIPTION_FOUNDATION.md`.

- `Plan`, `PlanFeature` (LIMIT + TOGGLE, BIGINT-backed numeric cap), `Subscription`, `SubscriptionHistory`, `SchoolUsage`, `UsageEvent`, `UsageThresholdState`.
- Subscription lifecycle state machine (PENDING → TRIAL → ACTIVE → EXPIRING → EXPIRED/SUSPENDED/CANCELLED).
- `SubscriptionGuardService` — `checkPlanStatus`, `checkFeatureAvailability`, `checkLimitAvailability`, `checkUsageRemaining`, `assertAndConsume`.
- Per-school usage counters + recompute reconciliation against the UsageEvent ledger.
- Edge-triggered threshold notifications (80% / 90% / LIMIT_REACHED), one fire per band per window.
- Super-admin APIs: assign / activate / upgrade / downgrade / renew / suspend / reactivate / cancel.
- Tenant read APIs: `/api/v1/school/subscription`, `/api/v1/school/usage`.
- Daily subscription-expiry scheduler (registered, fires when JobScheduler is wired in production).
- 14 canonical feature keys × 3 seeded plans (STARTER / GROWTH / ENTERPRISE).
- 24 permission keys under `subscription.*`; 4 feature flags; ~11 outbox topics + ~11 notification event keys.

### ❌ NOT shipped — owned by a future "Billing Foundation" sprint

The entire rest of this document describes Billing. **None of the following is implemented today:**

- Invoices (`platform_invoices`, `platform_invoice_lines`, `platform_invoice_taxes`).
- Credit notes, refunds, dunning state machine.
- Payment provider integration (Razorpay, Stripe, mandates, NACH, UPI Autopay).
- GST tax calculation, e-invoicing IRN, GSTR-1 exports, TDS.
- Trial-to-paid auto-conversion (today, plan changes are super-admin-driven; there is no payment leg).
- Customer-facing self-serve plan change UI.
- Add-on credit packs (SMS / WhatsApp / storage purchases).
- Coupon redemption, referral tracking, partner discounts.
- Multi-currency, proration math.
- Tenant `/api/v1/billing/*` API.

Until the Billing Foundation sprint lands, **all subscription state changes are platform-driven**. Schools cannot self-serve a plan change, cannot pay for an upgrade, and never see an invoice from us. The Subscription Foundation is intentionally complete without any of this.

### Boundary with Sprint 15

`SUBSCRIPTION_FOUNDATION.md` is the authoritative reference for what is currently live. This document remains the authoritative reference for what Billing **will** ship. Where they overlap (plan matrix, lifecycle states, add-ons), Sprint 15 is the implementation snapshot; this doc is the future blueprint.

---

## 1. Pricing principles

1. **Per-student-per-month**, billed annually or quarterly. Students are the value meter; staff are not metered.
2. **Plans gate features, not data.** Downgrade keeps data; flagged-off modules are read-only or hidden.
3. **Indian-rupee-only** for v1. GST included or excluded depending on whether the school is GST-registered.
4. **Transparent pricing** on the marketing site — no "contact sales" except for chains > 5 branches.
5. **Free trial first**, payment information not required at signup.

---

## 2. Plan matrix (illustrative; final numbers set in operator console)

| Plan         | Audience                          | Price (INR/student/month, annual)  | Modules                                                                                                       |
| ------------ | --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Trial**    | Any new school                    | Free for 60–90 days                | All modules of Standard plan                                                                                  |
| **Starter**  | <300 students, single branch      | ₹X (lowest tier)                   | Auth, Students, Parents, Staff, Academic, Attendance, Notice Board, Communication (limited credits), Reports |
| **Standard** | 300–1500 students, single branch  | ₹Y                                 | Starter + Fees, Exams, Timetable, Library, Transport, Visitor, Certificates                                   |
| **Pro**      | 300–1500, multi-branch or chain   | ₹Z                                 | Standard + Hostel, Inventory, Medical, Events, Discipline, Custom Reports, Multi-branch                       |
| **Enterprise** | >1500 students, chains          | Quote                              | Pro + AI features (when ready), API access, dedicated support, custom SLA                                     |

Plans are stored in a `plans` table with `id`, `name`, `default_flags[]`, `price_per_student_inr`, `min_students_billed`, `included_credits`, `support_tier`, `is_public`.

---

## 3. Free trial

- **Length:** 60 days default; 90 days for schools onboarded via a sales motion. Configurable per tenant.
- **Capabilities:** all Standard-plan features. Pro features are *previewable* but locked.
- **No credit card** captured at signup.
- **Limits during trial:** 500 SMS / 500 WhatsApp / 5GB storage. Beyond → upgrade nudge.
- **Trial countdown** visible in app (last 14 days banner; last 3 days modal).
- **Conversion funnel:**
  - Day 0: signup, onboarding wizard.
  - Day 7: activation check (≥10 students, ≥1 fee structure, ≥1 attendance day).
  - Day 30: in-app + WhatsApp from sales.
  - Day 45: principal-targeted demo offer.
  - Day 56: "trial ends in 4 days" reminder.
  - Day 60: trial ends → tenant moves to **Frozen** state.
- **Frozen state:** read-only login for school admin only; no notifications sent; no fee online collections; data preserved for 30 days. Then archived.
- **Reactivation:** subscribe to any paid plan during the freeze window; everything resumes instantly.

---

## 4. Subscription lifecycle

States of a tenant subscription:

```
trial ──────► active ──────► past_due ──────► suspended ──────► frozen ──────► archived
   │            │                                                       ▲
   │            └─────► cancelled ─────────────────────────────────────┘
   └─────► frozen (trial expired without conversion)
```

- **trial:** within trial period, no payment.
- **active:** paid, current.
- **past_due:** invoice unpaid past due-date but within grace (default 7 days). Soft warnings.
- **suspended:** unpaid past grace. Login allowed for school admin only; communications and online fee paid disabled.
- **frozen:** grace exceeded by 30 days. Read-only school admin only; data preserved.
- **archived:** > 30 days frozen. Data exported, then anonymized/removed per retention policy.
- **cancelled:** explicit churn. Same data flow as frozen → archived.

State transitions are jobs that run daily, idempotent, audit-logged. Suspension and archival require an additional Super Admin confirmation step (not silent automation in v1) — we want a human eyeball during early life.

---

## 5. Billing cycles

- **Annual** (default for paid plans): pay 12 months upfront, ~10–15% discount vs. quarterly.
- **Quarterly:** pay 3 months upfront.
- **Monthly:** Enterprise only (with payment guarantee), not offered to small schools — too much dunning overhead.
- **Anniversary-based:** the cycle starts from the conversion date, not the calendar.
- **Mid-cycle student additions:** prorated; charged at the end of the next cycle as a top-up line.
- **Mid-cycle plan upgrade:** prorated, charged immediately. Downgrade applies at next cycle (no refund of unused portion).

### 5.1 Student-count metering

- **Snapshot date:** the **last calendar day of the previous cycle** is the canonical count for the cycle being billed (e.g., for Apr–Jun cycle, snapshot is taken on Mar 31).
- **Counted students:** only `status = active` (not `transferred_out`, not soft-deleted). Re-admissions count once.
- **True-up at cycle end:** if mid-cycle additions exceeded the snapshot by > 5%, a top-up line is added to the next cycle's invoice. Removals never refund — students leave mid-year too often for this to be sustainable.
- **Snapshot is persisted** in `subscription_student_snapshots(subscription_id, snapshot_date, count, recorded_at)` — auditable and reproducible.
- **Disputes:** the school admin can view the snapshot list and which students were counted; corrections require a Super Admin override with audit reason.

### 5.2 Revenue recognition

- Annual upfront payments are **deferred revenue** at receipt; recognized monthly over the subscription period (Indian Accounting Standards / Ind AS 115).
- The accounting export (CSV) from the operator console shows: `invoice_amount`, `received`, `deferred_balance`, `recognized_this_month` per tenant.
- Refunds reverse deferred revenue first, recognized revenue second.

---

## 6. Payment providers

### 6.1 Razorpay (primary, India)

- **Razorpay Subscriptions** for auto-debit (UPI Autopay, NACH, card mandates).
- **Razorpay Orders + Payment Links** for one-off invoices and offline-to-online conversion.
- **Webhooks:** `payment.captured`, `payment.failed`, `subscription.charged`, `subscription.cancelled`, `refund.processed`.
- **Idempotency:** all webhooks de-duped on `event_id`. Replays handled.
- **Mandate flow:** mandates created at subscription start; renewals charge automatically; failures trigger dunning.

### 6.2 Stripe (fallback / future)

- For multi-currency or international expansion.
- Not part of v1.

### 6.3 Offline payments

- Schools can pay by NEFT/RTGS/cheque.
- Operator marks payment manually in the console with reference number → receipt + invoice paid.

---

## 7. GST and invoicing

We (the SaaS company) are the supplier; the school is the recipient. Our GSTIN is fixed; place-of-supply varies by school.

### 7.1 Tax classification
- **HSN/SAC code:** SAC `998313` ("Information technology consulting and support services") or `997331` ("Licensing services for the right to use computer software") — final code confirmed with our CA before first paid invoice. Stored as a plan-level attribute so it can be amended cleanly.
- **GST rate:** 18% (9% CGST + 9% SGST intra-state; 18% IGST inter-state).
- **Education as a service** is exempt at the school's level (school → student), but our service (SaaS → school) is **not** education; it's IT services. We tax accordingly.

### 7.2 Place of supply
- Determined by the school's billing-address state (B2B rule — recipient location).
- **Intra-state** (school's state == our state): CGST + SGST.
- **Inter-state**: IGST.
- Stored explicitly on each invoice; mismatches between billing address and GSTIN state are flagged.

### 7.3 Schools with vs. without GSTIN
- **GST-registered school:** invoice carries the school's GSTIN, our GSTIN, place of supply, intra/inter classification, line-item tax split. School can claim input credit.
- **Non-registered school:** plain commercial invoice with school's PAN. Tax still applied as forward charge; school cannot claim input credit.

### 7.4 Invoice numbering
- Sequential per FY (Apr–Mar), gap-free (Indian regulation). Format: `SCH/INV/<FY>/<seq>` — e.g., `SCH/INV/2627/000142`.
- Implemented via `tenant_sequences` (DATABASE_STRATEGY §7) — for platform invoices, the "tenant" is us; sequence name `platform_invoice`.
- Voiding an invoice never deletes the row and never reuses the number — a credit note offsets it.

### 7.5 E-invoicing (IRN)
- Mandatory under GST when aggregate turnover crosses ₹5 cr (current threshold; revisit annually).
- Each invoice gets an IRN (Invoice Reference Number) and signed QR from the IRP (Invoice Registration Portal).
- v1: finance team submits manually; we store the IRN + ack date on the invoice.
- Phase 7: automated IRP API integration (D-025).

### 7.6 GSTR-1 and reporting
- Monthly outbound supplies summary (GSTR-1) must reconcile with our invoices.
- We export a GSTR-1-ready CSV from the operator console (B2B, B2CL, B2CS sections). The finance team uploads to the GST portal.

### 7.7 Reverse charge mechanism
- N/A for our normal SaaS supply. Flagged here as a non-issue so future Claude doesn't add false logic.

### 7.8 TDS (Tax Deducted at Source)
- Some larger schools deduct TDS at 2% under Section 194J on professional/technical services.
- We accept TDS certificates and reflect the deduction on the receipt (invoice paid in full = invoice net of TDS + TDS certificate).
- Architecture: invoice carries `amount_due_inr_paise`; payment can be partial cash + TDS line; receipt reflects both.

### 7.9 Credit notes
- Issued for invoice corrections — never delete an invoice.
- Carries reference to original invoice, reason, GST reversal calculation.
- Must be reported in GSTR-1 in the period of issue.

---

## 8. Dunning (failed payments)

For active → past_due → suspended:

| Event                              | Action                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| T-7 days before charge             | Email + WhatsApp: "Renewal coming up"                                                 |
| Charge attempt (T)                 | Razorpay charges; webhook updates status                                              |
| Charge fails                       | Retry per Razorpay schedule (T+1, T+3, T+5)                                            |
| All retries fail (T+5)             | Status → `past_due`; in-app banner; SMS+WhatsApp+Email to billing contact             |
| T+12 (grace 7d post-due)           | Status → `suspended`; communications + online pay disabled                            |
| T+42 (30 days suspended)           | Status → `frozen`; data preserved                                                      |
| T+72                               | Status → `archived`; data exported then removed                                       |

A dunning queue is visible in the operator console. Support can manually move a tenant out of suspended.

---

## 9. Coupons, discounts, partnerships

- Coupons: percentage or flat-INR off, single-use or multi-use, expiry, applicable plans.
- **Edu-partner** discounts: chains, NGOs, board associations.
- **Referral**: school A refers school B → A gets 1 month free if B converts. Tracked in operator console.
- All discounts are audited with reason; cannot exceed plan-defined caps without Super Admin sign-off.

---

## 10. Add-ons

| Add-on               | Pricing            | Notes                                                |
| -------------------- | ------------------ | ---------------------------------------------------- |
| SMS credits          | per 1000 SMS       | Routed via MSG91; school chooses transactional/promotional |
| WhatsApp credits     | per 1000 messages  | Routed via Gupshup or Meta Cloud                     |
| Storage upgrade      | per 10 GB / month  | Adds quota to the tenant's S3 prefix                 |
| Premium support      | flat INR/month     | Faster SLA, dedicated CSM                            |
| AI features (future) | per feature        | Per-tenant flag; per-student-per-month surcharge     |

Add-on consumption is metered; low-balance alerts auto-trigger at 20% remaining.

---

## 11. Invoices and receipts (platform → school)

- The school as a customer of SchoolOS receives platform invoices.
- Sent via email + WhatsApp + in-app to the billing contact.
- PDF includes our logo, GSTIN, line items per plan + add-ons.
- Stored in operator console and visible to school admin under "Billing" page.
- This is **separate from** the school's own fee invoices to its students. Different number sequences, different schemas, same patterns.

---

## 12. Refunds

- Refunds are exception, not norm.
- Within 7 days of charge: full refund possible (operator decision).
- After 7 days: prorated for the unused months in the cycle, minus a small admin fee. Configurable.
- Refund creates a credit note + Razorpay refund. Audit log + reason mandatory.
- Operator can also issue a "credit" instead of cash refund — applied to next invoice.

---

## 13. Cancellation

- School admin can cancel any time from the Billing page.
- Cancellation effective at the end of the current paid period.
- 30-day data preservation post-cancellation, then archived.
- Cancellation flow asks for reason (churn analytics).

---

## 14. Data we always store

- `subscription`: tenant_id, plan_id, status, current_period_start/end, billing_cycle, created_at, cancelled_at.
- `invoice`: id, tenant_id, period, amount, gst_breakup, status, due_date, paid_at, gateway_id.
- `payment`: id, invoice_id, amount, method, gateway_payment_id, status, captured_at.
- `credit_note`: id, original_invoice_id, amount, reason.
- `refund`: id, payment_id, amount, gateway_refund_id, reason.
- `coupon`, `coupon_redemption`.
- `addon_subscription`, `credit_pool`, `credit_transaction`.

All idempotent on gateway IDs.

---

## 15. What v1 ships vs. v2

**v1 (months 0–4):**
- Plan registry, manual subscription assignment by Super Admin.
- Razorpay one-time payment links (manual cycle).
- GST-compliant PDF invoices.
- Trial → active → frozen automation.
- Manual offline payment recording.
- Basic dunning emails.

**v2 (months 4–8):**
- Razorpay Subscriptions (auto-debit).
- Self-serve plan upgrade/downgrade.
- Coupons, referrals, add-ons UI.
- Automated dunning ladder (email + WhatsApp).
- GST e-invoicing API integration.

**v3 (months 8–12):**
- Mid-cycle proration UX.
- Customer-self-serve refund/credit.
- Forecasting, churn predictions, expansion playbooks.
