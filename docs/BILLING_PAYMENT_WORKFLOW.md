# Billing Payment Workflow

> Companion to `BILLING_FOUNDATION_ARCHITECTURE.md`.
> Scope: SaaS Billing only — the school paying the platform.
> Status: **delivered in Sprint 20.** Razorpay + manual (UPI / Bank Transfer / Cash / Cheque / Card) paths share a single Invoice / Payment FSM; only the verification step differs.
> Domain wall: School Fees (Parent → School) is unaffected by anything in here.

---

## 1. Payment Sources

The SaaS Billing module accepts five payment sources in v1. Razorpay is the only **gateway-integrated** path; the other four are operator-recorded paths used when the school pays out-of-band.

| Source | Integrated? | Initiated by | When to use |
|---|---|---|---|
| **Razorpay** | Yes — live API + webhook | School (or operator on behalf of school) | Default path. Use whenever the school is willing to pay online (UPI / card / netbanking through Razorpay Checkout). Self-serve, instant, signature-verified, fully reconciled. |
| **Manual UPI** | No — operator records after-the-fact | Operator | The school paid via a UPI app directly to one of the platform's configured UPI IDs (e.g. `schoolos@axisbank`). The operator reconciles the bank notification with the open invoice and records the payment. |
| **Bank Transfer** | No — operator records after-the-fact | Operator | NEFT / RTGS / IMPS into the platform's bank account. Common for ENTERPRISE plans where the school's finance team prefers a direct bank instruction over a checkout flow. |
| **Cash** | No — operator records after-the-fact | Operator | Rare in SaaS but supported because some smaller schools pay through a partner / field representative who collects cash and remits it. Always followed by an internal money trail (partner → platform bank). |
| **Cheque** | No — operator records after-the-fact | Operator | School issues a cheque payable to the platform's legal entity. The payment is provisional until cleared; the verification workflow captures the cheque-clearance step. |

### 1.1 Source-selection rules

- **Default is Razorpay.** The "Pay Now" button on a billing surface always routes through Razorpay. Manual sources are operator-only.
- **Operator-recorded sources never touch Razorpay.** No Razorpay order is created, no webhook is involved. The operator captures the payment metadata (reference, date, amount, proof) by hand.
- **One source per `Payment`.** A v1 invoice is settled by exactly one `Payment` row, and that row carries exactly one source. Split-tender across sources is **not** supported in v1 (and is explicitly different from School Fees' hybrid collection — see §12).
- **Operator override of Razorpay is allowed.** If a school paid via Razorpay but the gateway dropped the webhook, the operator can manually mark the invoice paid against the Razorpay payment id (recording it as a Razorpay source, not a manual one). This is a recovery path, not a routine flow.

### 1.2 What is NOT a payment source

- Wallets, credit balance, and `CreditNote` redemption are **not** payment sources. They reduce the amount owed on a subsequent invoice but do not appear as a `Payment` row. They appear as an `InvoiceLine` adjustment on the next invoice.

---

## 2. Payment Source Configuration

All non-Razorpay sources require platform-level configuration before the operator can record payments against them. Configuration is global to the platform — these are the platform's bank/UPI accounts, not the school's.

### 2.1 Configurable settings

| Setting | Type | Notes |
|---|---|---|
| **Company UPI IDs** | List of `{ vpa, displayName, bankName, enabled }` | Multiple UPI IDs may be active simultaneously (e.g. one per bank for redundancy). The operator picks which one to display when recording a Manual UPI payment. |
| **QR Codes** | List of `{ label, imageAsset, vpa, enabled }` | A static QR image (or dynamically generated from a VPA) that the operator can include in invoice PDFs or share with the school's finance team. |
| **Bank Accounts** | List of `{ accountName, accountNumber, ifsc, bankName, branch, accountType, enabled }` | Stored encrypted at rest. Account number is masked everywhere except the dedicated "view account details" surface (audit-logged read). |
| **Cash Acceptance** | Boolean (+ optional restriction: list of operator user ids permitted to record cash) | When disabled, the operator cannot select Cash as a source on the payment form. |
| **Cheque Acceptance** | Boolean (+ optional `requirePhotoProof: true`) | When disabled, Cheque is not selectable. When `requirePhotoProof` is on, the operator must upload a cheque image before submitting. |
| **Per-source enable/disable** | Boolean per source | Master kill-switch per source. A disabled source is hidden from the operator UI and its API endpoints reject with `PAYMENT_SOURCE_DISABLED`. |

### 2.2 Storage and security

- Configuration lives in platform-scoped tables (not tenant-scoped). It is **never** exposed to school users.
- Edits go through `platform-admin` permission with `billing.profile.manage` — actually a tighter permission, `billing.gateway.configure`, is appropriate here (a small split of the existing key).
- Every change is audit-logged (operator id, before, after) in `BillingAudit` with category `payment_source_config`.
- Bank account numbers are encrypted with the project's existing KMS pattern (same approach as student Aadhaar storage).

### 2.3 Tenant-visible vs operator-only

- The school's billing surface shows **active** UPI IDs / QR / bank accounts (read-only) so the school's accountant can pay out-of-band.
- Disabled sources are invisible to the school.
- The operator-only view shows all sources (enabled + disabled) with their full configuration.

---

## 3. Invoice → Payment → Receipt Lifecycle

The state of an invoice from issuance to closed-and-receipted. This is the **operational** view; the formal state machine sits on `Invoice.status` and the journal is `InvoiceHistory`.

```
   ┌──────────────┐
   │   INVOICE    │  status = OPEN
   │   ISSUED     │  (operator-issued or auto-issued at renewal lead time)
   └──────┬───────┘
          │
          │ school clicks "Pay Now"            OR  operator opens "Record Payment"
          ▼                                          ▼
   ┌──────────────────┐                       ┌──────────────────┐
   │ PAYMENT INITIATED│                       │ PAYMENT SUBMITTED│
   │ (Razorpay order  │                       │ (manual source — │
   │  created)        │                       │  reference + date│
   └──────┬───────────┘                       │  + amount + proof)│
          │                                   └──────┬───────────┘
          │ checkout completes                       │
          ▼                                          ▼
   ┌──────────────┐                            ┌──────────────┐
   │  WEBHOOK     │                            │  PENDING     │
   │  RECEIVED    │                            │  VERIFICATION│
   └──────┬───────┘                            └──────┬───────┘
          │                                           │ operator approves / rejects
          │                                           ▼
          │                                    ┌──────────────┐
          │                                    │  APPROVED    │ or REJECTED (back to OPEN)
          │                                    └──────┬───────┘
          │                                           │
          ▼                                           ▼
   ┌────────────────────────────────────────────────────────┐
   │                       PAID                              │
   │   (Invoice.status = PAID, Payment row written,          │
   │    Subscription renewed through SubscriptionService)    │
   └──────────────────────────┬──────────────────────────────┘
                              ▼
                       ┌──────────────┐
                       │   RECEIPT    │  receipt number issued,
                       │  GENERATED   │  receipt notification sent
                       └──────────────┘
```

### 3.1 State semantics

- **ISSUED (`Invoice.status = OPEN`).** Invoice is finalised — amount, lines, taxes, due date all frozen. Visible to the school. No payment activity yet.
- **PAYMENT_INITIATED.** Razorpay-only. A `PaymentAttempt` row exists with status `CREATED`; the school is on (or about to be on) the Razorpay checkout page. Invoice still `OPEN` until the webhook confirms capture.
- **PAYMENT_SUBMITTED.** Manual-only. Operator has captured the payment metadata. A `Payment` row is written immediately in status `PENDING_VERIFICATION`. Invoice transitions to `PAYMENT_PENDING` (the same status it occupies during a Razorpay flow).
- **WEBHOOK_RECEIVED.** Razorpay-only. The signed `payment.captured` event has been received and verified. Transition to `PAID` happens in the same transaction as the webhook handler's write.
- **PENDING_VERIFICATION.** Manual-only. The `Payment` row exists but the funds have not been confirmed by the operator. Invoice is `PAYMENT_PENDING`. The school sees "Payment received, pending verification."
- **APPROVED.** Manual-only. Operator has reconciled against the bank/UPI/cheque-clearance evidence. The transition to `PAID` happens here. Rejected payments revert the invoice to `OPEN` and leave the rejected `Payment` row in place (kept for audit, not deleted).
- **PAID.** Terminal-success for this invoice. `Invoice.status = PAID`, `Payment.status = CAPTURED` (Razorpay) or `APPROVED` (manual). Subscription renewal fires inside the same transaction via `SubscriptionService.renew()`.
- **RECEIPT_GENERATED.** Receipt number is allocated, receipt PDF is rendered (async via the existing Jobs / Reporting export pipeline), and the receipt notification fires through Notification Foundation.

### 3.2 Allowed regressions

- **PAID → REFUNDED.** Not a regression on the invoice itself — a `Refund` row + a `CreditNote` are written. The invoice stays `PAID`; the credit note carries the reduced effective amount.
- **REJECTED manual payment → OPEN.** Invoice reverts to `OPEN`. The school is notified that their submitted payment was not accepted, with the operator's reason. A fresh payment attempt is allowed.
- **PAID → VOIDED.** Only by operator action with `billing.invoice.void`, with reason captured. Typically used to cancel an erroneously-issued invoice that was then somehow paid (rare).

### 3.3 Concurrency and idempotency

- An invoice cannot have two payments in `CAPTURED` / `APPROVED` state simultaneously — enforced by a unique partial index on `(invoiceId)` filtered to terminal-success statuses.
- The Razorpay webhook is idempotent on `razorpayPaymentId`. Manual payment recording is idempotent on `(invoiceId, source, transactionReference)`.

---

## 4. Razorpay Flow

This section is a focused operational walk-through; the broader architecture sits in `BILLING_FOUNDATION_ARCHITECTURE.md §6`.

### 4.1 Order Creation

- Trigger: `POST /api/v1/billing/invoices/:id/checkout` (operator or school billing-admin).
- Preconditions: invoice exists, `status = OPEN`, amount > 0, Razorpay source is enabled.
- Side effects: a `PaymentAttempt` row is written in status `CREATED` **before** Razorpay is called.
- Razorpay call: `orders.create({ amount: invoice.grandTotal, currency: 'INR', receipt: invoice.number, notes: { schoolId, invoiceId, billingAccountId } })`.
- Response: the order id is persisted on the attempt; a checkout config payload (key id, order id, prefill, theme) is returned to the caller for the hosted checkout.

### 4.2 Checkout

- Razorpay Checkout is hosted by Razorpay. The platform never sees card numbers, UPI PINs, or netbanking credentials.
- The school completes the payment in their browser; on success, Razorpay returns to the school's billing surface with `razorpay_payment_id` and `razorpay_signature` in the redirect.
- The post-checkout return is **a UI nicety, not the source of truth.** The source of truth is the webhook.

### 4.3 Payment Success — Webhook

- Razorpay POSTs `payment.captured` (and earlier `payment.authorized`) events to `POST /api/v1/billing/webhooks/razorpay`.
- The endpoint is `@AllowWhenInactive`-annotated (suspended tenants must still be able to pay).
- Signature verification — see §4.6.
- Idempotency check on `razorpayPaymentId` — see §4.7.
- Inside a single Prisma transaction:
  - Write `Payment` row (source = Razorpay, status = CAPTURED).
  - Flip the originating `PaymentAttempt` to `CAPTURED`.
  - Flip `Invoice.status` → `PAID`, write `InvoiceHistory`.
  - Write `BillingAudit` row (action = `payment.captured`, source = `razorpay`).
  - Publish `BILLING_PAYMENT_RECEIVED` to outbox.
  - Call `SubscriptionService.renew(schoolId)` so `SubscriptionHistory` records the `RENEWED` action and the existing guard sees an `ACTIVE` subscription on the next request.
- After commit, the outbox dispatcher fans out the receipt notification and the renewal notification.

### 4.4 Payment Failure

- `payment.failed` webhook: the originating `PaymentAttempt` transitions to `FAILED` with the gateway-supplied error code, error description, and error source.
- No `Payment` row is written.
- The invoice stays `OPEN` — a failed attempt does not block a subsequent attempt.
- `BILLING_PAYMENT_FAILED` notification fires to billing contacts with the suggested next-step ("try again", "use a different card", "contact your bank").
- Repeated failures (configurable threshold, default 3 in 24h) raise a low-severity alert in the Operator Console — possible chargeback fraud or stolen-card probing.

### 4.5 Webhook (the route, the contract)

- One route handles all Razorpay events; the handler dispatches by `event` field.
- Supported events in v1: `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`.
- Unknown events are logged at info level and dropped (Razorpay adds new event types over time; we should not 500 because of a new event we have not coded for).
- All events are persisted to a raw `WebhookEvent` audit table before any business processing. This table is append-only and is the disaster-recovery source for replays.

### 4.6 Signature Verification

- HMAC-SHA256 over the raw request body using the webhook secret stored in environment configuration.
- Comparison is constant-time.
- Failure → 400 response, structured log entry (no PII; only request id, timestamp, length, first-byte fingerprint), counter incremented.
- The webhook secret is rotated on a fixed cadence; rotation is operator-initiated and persisted with versioning so a verifier can accept either the current or the prior secret during a rotation window.

### 4.7 Idempotency

- The handler treats `razorpayPaymentId` as the idempotency key for capture events and `razorpayRefundId` for refund events.
- Implementation: a unique index on `Payment.razorpayPaymentId` and on `Refund.razorpayRefundId`. A second arrival is detected as a unique-violation, mapped to a 200 OK with body `{ status: 'idempotent_replay' }`.
- The `WebhookEvent` raw table is also keyed by `(razorpayEventId)` so the very-low-level dedupe happens before business processing.

### 4.8 Invoice Paid

- Single-transaction write described in §4.3 above. The transition is final; `Invoice.status = PAID` is the gate that prevents double-payment.
- The receipt-number sequence is allocated **inside** the same transaction — see §7.

### 4.9 Subscription Renewed

- `SubscriptionService.renew(schoolId)` is the single entry point. Billing never writes to `Subscription` rows directly.
- `Subscription.expiryDate` and `Subscription.nextRenewalAt` advance by the billing-period length.
- `SubscriptionHistory` records a `RENEWED` row with `triggeredBy = 'billing'` and `invoiceId` cross-reference.
- The subscription's `status` moves from `EXPIRING` / `EXPIRED` (if it was there) back to `ACTIVE`. The existing `SubscriptionWriteGuardInterceptor` automatically lets writes through on the next request.

---

## 5. Manual Payment Flow

Manual flows are operator-recorded post-facto. The data captured per payment is uniform across sources; the workflow differs only in the verification evidence.

### 5.1 Common capture fields

| Field | Required | Notes |
|---|---|---|
| **Source** | Yes | One of `MANUAL_UPI`, `BANK_TRANSFER`, `CASH`, `CHEQUE`. |
| **Transaction Reference** | Conditional | UPI: UTR / reference number. Bank: UTR / transaction reference. Cash: internal voucher number. Cheque: cheque number. |
| **Payment Date** | Yes | Date the school actually paid (not the recording date). Used for receipt date and revenue period assignment. |
| **Amount** | Yes | Must equal the invoice's outstanding amount. Partial payments are not supported in v1. |
| **Remarks** | Optional | Free-text — operator notes (e.g. "paid by partner XYZ on behalf of school", "cheque from trust account"). |
| **Payment Proof** | Optional (or required, per `requirePhotoProof`) | File attachment(s) — screenshot of UPI confirmation, bank statement excerpt, cheque image, cash voucher scan. Stored through the existing File Storage module. |

### 5.2 Manual UPI

- Use when the school paid into a configured platform UPI ID.
- Reference field: the UTR / RRN visible in the school's UPI app receipt.
- Verification evidence: bank UPI notification or merchant dashboard entry matching the UTR + amount.

### 5.3 Bank Transfer

- Use for NEFT / RTGS / IMPS into a configured platform bank account.
- Reference field: the bank UTR.
- Verification evidence: the platform's bank statement line item matching UTR + amount + date.

### 5.4 Cash

- Use when cash was collected (typically by a partner / field rep) and remitted to the platform.
- Reference field: internal voucher number issued by the collector.
- Verification evidence: collector's remittance confirmation + platform bank statement showing the corresponding deposit.
- Restricted to operator users explicitly on the cash-accepting allow-list (per §2 configuration).

### 5.5 Cheque

- Use when the school issued a cheque to the platform's legal entity.
- Reference field: the cheque number; the bank and branch are captured as additional metadata.
- Two-step verification: the payment is `PENDING_VERIFICATION` while the cheque is in clearing; it transitions to `APPROVED` only after clearance is confirmed (typically 2–5 working days). A failed clearance (returned cheque) transitions to `REJECTED` with the failure reason captured (e.g. insufficient funds), and may incur a fee handled as a separate `Adjustment` on the next invoice.

### 5.6 Per-payment lifecycle

```
   Operator: POST /api/v1/billing/invoices/:id/payments
            (source, transactionReference, paymentDate, amount, remarks, proofAssetIds)
            │
            ▼
   Payment row written, status = PENDING_VERIFICATION
   Invoice flips to PAYMENT_PENDING
   BillingAudit: payment.submitted
   BILLING_PAYMENT_RECEIVED notification (with "pending verification" wording) sent
            │
            ▼
   Operator (different operator if separation-of-duties is enforced):
       POST /api/v1/billing/payments/:id/verify   (approve OR reject)
            │
            ├── APPROVE → Payment.status = APPROVED, Invoice.status = PAID,
            │             SubscriptionService.renew(), receipt generated, notifications fire
            │
            └── REJECT  → Payment.status = REJECTED, Invoice.status = OPEN,
                          reason captured, BillingAudit: payment.rejected,
                          BILLING_PAYMENT_REJECTED notification fires
```

### 5.7 Why a manual payment is never auto-approved

- The operator who **records** a manual payment can be the same operator who **verifies** it, but the system still asks for the explicit approval click. The two operations are distinct in the audit trail.
- For separation-of-duties — recommended for amounts above a configurable threshold — the verifier must be a different user from the recorder. This rule is enforced server-side, not just in the UI.

---

## 6. Verification Workflow

Manual payments require an explicit operator decision before they are recognised as paid.

### 6.1 Verification states

| State | Meaning |
|---|---|
| **PENDING_VERIFICATION** | Default state after `payment.submitted`. The operator has the payment in a review queue. |
| **APPROVED** | Operator confirmed against external evidence. Invoice transitions to PAID. |
| **REJECTED** | Operator could not confirm the payment. Invoice reverts to OPEN. The school is notified with the operator's reason. |
| **ON_HOLD** | Optional intermediate state for cheques in clearing or bank transfers awaiting reconciliation. Functionally equivalent to PENDING_VERIFICATION for the invoice's view, but separates "I haven't looked at this yet" from "I've looked at it but I'm waiting for the bank." |

### 6.2 Approval requirements

- Approver must hold `billing.payment.verify` permission (operator-only).
- Approver must record:
  - The verification evidence type (`BANK_STATEMENT`, `GATEWAY_DASHBOARD`, `CHEQUE_CLEARANCE`, `INTERNAL_VOUCHER`).
  - A free-text note describing the reconciliation done.
  - Optionally a file attachment (bank statement extract, cleared cheque image).
- For amounts above a configurable threshold (e.g. ₹50,000), the approver must be different from the submitter (segregation of duties). This is configurable per deployment.

### 6.3 Rejection requirements

- Rejector must hold the same `billing.payment.verify` permission.
- Rejector must record a reason code (`AMOUNT_MISMATCH`, `REFERENCE_NOT_FOUND`, `DUPLICATE_REPORTED`, `CHEQUE_RETURNED`, `OTHER`) and a free-text explanation.
- The rejected payment row is **kept** (never deleted). It is the audit trail when a school says "we sent it on the 3rd."

### 6.4 Audit requirements

Every verify / reject action writes a `BillingAudit` row with:
- `actorUserId`, `actorRole`, `verifierIp`, `verifiedAt`
- `paymentId`, `invoiceId`, `schoolId`
- `decision` (`APPROVED` | `REJECTED` | `ON_HOLD`)
- `evidenceType`, `evidenceNote`, `evidenceAssetIds`
- `beforeStatus`, `afterStatus`
- `rejectionReason` (when applicable)

The `BillingAudit` ledger for payment verification is queryable from the Operator Console (per §12 of `BILLING_FOUNDATION_ARCHITECTURE.md`) and is the source for finance team's monthly verification report.

---

## 7. Receipt Strategy

Two number sequences. Both are platform-scoped (not tenant-scoped, since these are platform-issued documents to a tenant), and both are issued through the existing `SequenceService`.

### 7.1 Invoice numbers

- **Format:** `INV-<FY>-<NNNNNN>` — e.g. `INV-2627-000012` for the 12th invoice of FY 2026–27.
- **Sequence key:** `billing.invoice.<fy>`.
- **Atomicity:** allocated inside the transaction that transitions `Invoice.status` from `DRAFT` to `OPEN`. The number is not allocated for drafts (drafts have a null `number` field) so cancelled drafts do not consume numbers.
- **Gaps:** there are no intentional gaps. A transaction that rolls back releases its allocated number via the sequence service's existing semantics; the next successful allocation reuses it.
- **Reset:** sequence resets to 1 at the start of each Indian financial year (April 1).

### 7.2 Receipt numbers

- **Format:** `RCP-<FY>-<NNNNNN>`.
- **Sequence key:** `billing.receipt.<fy>`.
- **Atomicity:** allocated inside the transaction that transitions `Invoice.status` to `PAID`. The receipt number is permanent and immutable after that.
- **One receipt per payment.** A refund does **not** consume a receipt number; refunds get a `CreditNote` number (`CN-<FY>-<NNNNNN>`) instead.
- **Reissue:** if a receipt PDF is regenerated (operator action), the receipt number is preserved. Only the PDF rendering changes; the number is the source of truth.

### 7.3 Why two sequences

- **Invoice numbers** are issued at billing-time and are visible to the school as soon as the invoice is `OPEN`. They are the document the school's accountant cross-references.
- **Receipt numbers** are issued at payment-time and are the legal evidence of payment receipt — required by the school for their own books and required by us for GST output-tax reporting.
- Mixing the two would make it impossible to answer "how many invoices have I issued this year that are still unpaid?" without a join. Keeping them separate keeps the question one query.

### 7.4 Cross-references

- Every receipt carries the originating invoice number.
- Every invoice, once paid, carries the receipt number.
- Credit notes carry both: the originating invoice number AND the receipt number being adjusted.

### 7.5 Numbering for non-Razorpay payments

- Receipt number allocation is independent of source. Manual UPI / Bank / Cash / Cheque payments receive a receipt number from the same sequence on `APPROVED`.
- The receipt body records the source (and reference where applicable) for transparency.

---

## 8. Billing Contact

A `Billing Contact` is a person at the school authorised to receive billing communications and to act on billing surfaces.

### 8.1 Responsibilities

- Receives all billing notifications: invoice issued, payment received, payment failed, renewal reminders, suspension warnings, suspension notice, reactivation.
- Has access to the school's billing surface (view invoices, download receipts, initiate Razorpay checkout).
- Can edit the school's `BillingProfile` (legal name, GSTIN, billing address) — subject to `billing.profile.manage` permission.
- Is the primary point of contact for the platform's finance / collections team when something is overdue.

### 8.2 Why Billing Contact differs from School Admin

- **Separation of duties.** A school admin (typically the principal) runs the day-to-day academic operation; the billing contact is typically the accountant, bursar, or trustee with financial signing authority. Conflating the roles forces principals to receive every dunning email and accountants to receive every academic alert.
- **Different inbox.** The principal's inbox is academic; the accountant's inbox is finance. Billing communications must land in the inbox that actually processes them.
- **Multiple contacts.** A school often has more than one billing contact — primary accountant + a backup + a generic AP mailbox (`ap@school.in`). Multiple contacts is supported natively for the billing surface; the academic admin role is typically one person.
- **Permission scope.** A billing contact does not need (and typically should not have) `school.admin.*` permissions. Limiting their footprint to billing-only is good least-privilege hygiene.
- **Continuity.** Billing-contact email is included on every legal document (invoice, receipt, credit note). If a principal leaves, billing continues uninterrupted because the AP mailbox is on every document.

### 8.3 Mechanics

- A `BillingContact` is a `User` (existing identity record) tagged with a billing role (`billing-admin` or `billing-viewer`) and an explicit `isPrimaryBillingContact` flag on the `BillingProfile`.
- A school may have multiple `BillingContact`s but exactly one primary. The primary is the addressee on legal documents; the secondaries are CC'd on notifications.
- When a tenant has zero billing contacts (typical for a fresh trial), the platform falls back to the school's first `school-admin` user and prompts the school to designate a proper billing contact.

### 8.4 Channel preferences

- Each billing contact has their own notification preferences (reusing `NotificationUserPreference` from Notification Foundation). They may, for example, want email but not SMS for invoice-issued, and email + SMS for suspension-imminent.
- `emergencyOverride = true` is the default for billing-suspended-imminent notifications — these go through regardless of quiet hours.

---

## 9. Reminder Workflow

Reminders are produced by a single scheduled job (`billing.reminder.scan`) that runs daily and is idempotent — re-running the job the same day does not double-send.

### 9.1 Default reminder schedule

| Trigger relative to due date | Audience | Channels | Notes |
|---|---|---|---|
| **T-7 days** | Billing contacts | Email + In-app | "Your renewal is coming up. Pay now to avoid any service interruption." |
| **T-3 days** | Billing contacts + school admins | Email + In-app | Slightly firmer tone; In-app banner appears on every login. |
| **T-1 day** | Billing contacts + school admins | Email + SMS + In-app | First SMS — only fired if the invoice is still unpaid the day before due. |
| **Due date (T+0)** | Billing contacts + school admins | Email + SMS + In-app | "Payment due today" — neutral language. |
| **T+1 (grace day 1)** | Billing contacts | Email + In-app | "Your subscription has expired but you have N days to pay before suspension." |
| **T+3 (grace day 3)** | Billing contacts + school admins | Email + SMS + In-app | Mid-grace nudge with the suspension date called out explicitly. |
| **T+(grace-1)** | Billing contacts + school admins | Email + SMS + In-app | "Tomorrow your subscription will be suspended." Last warning. |
| **T+grace** | Billing contacts + school admins | Email + SMS + In-app | Suspension notice. Tone: factual, action-required, recovery path included. |

### 9.2 Configurability

- The default schedule above is plan-attached, not hard-coded. Each `Plan` carries a `reminderSchedule` field — a list of `{ relativeDay, audience, channels }` entries.
- Different plans can have different curves — a free trial might get a shorter, gentler curve; an ENTERPRISE plan with a dedicated CSM might suppress the SMSes entirely because the CSM is calling personally.
- The operator can override the schedule per-school for VIP / goodwill cases.
- All notifications go through Notification Foundation. The reminder job emits the appropriate event; the dispatcher applies the school's per-user preferences and entitlement limits exactly as it does for academic notifications.

### 9.3 Idempotency

- The job marks an `InvoiceReminderSent` row each time it dispatches a reminder, keyed by `(invoiceId, reminderKey)`. The reminder key is derived from the schedule entry (e.g. `T-3_billing_admin_email`).
- A second pass of the same job that day does not re-emit the same reminder. The check is at the dispatcher layer, not the notification layer, so the reminder log is the audit source.
- If a reminder fails to dispatch (provider outage), the row is written as `FAILED` with the gateway error; the next scheduled run retries it once.

### 9.4 Auto-suppression

- All scheduled reminders for an invoice are suppressed the moment the invoice transitions to `PAID` or `VOIDED`. The job re-checks invoice state immediately before dispatch.
- If the school marks "I just paid via bank transfer" — a real button — reminders pause for 48 hours pending operator verification, then resume if the payment has not been recorded.

---

## 10. Failure & Retry

### 10.1 Razorpay payment failures

- Per-attempt failures (`payment.failed` webhook) are persistent on the `PaymentAttempt` row with the gateway error code, error description, and error source.
- The invoice stays `OPEN`. The school can retry immediately — there is no platform-imposed cool-down.
- After **3 failed attempts in a rolling 24-hour window** on the same invoice, a low-severity alert raises in the Operator Console. This is a soft signal — typical causes are bank-side limits or 3DS issues — not a fraud alarm.
- After **10 failed attempts in 7 days**, the invoice is flagged for operator review. Reasons could include card testing / fraud probing or a misconfigured Razorpay account.

### 10.2 Webhook delivery failures

- Razorpay retries failed webhook deliveries on a back-off schedule. The platform's handler is idempotent (§4.7) so retries are safe.
- If the platform consistently returns 5xx to webhooks, Razorpay eventually marks the webhook URL unhealthy and pages our on-call. Operations monitors a synthetic ping to the webhook endpoint to detect this proactively.
- A daily reconciliation job pulls Razorpay's payments-list API for the prior 48 hours and cross-checks against our `Payment` rows. Any captured Razorpay payment with no corresponding `Payment` row is flagged and auto-recovered (the recovery is the same code path as the webhook).

### 10.3 Manual payment rejection

- See §6.3. A rejected manual payment leaves the invoice `OPEN`. The school is notified with the operator's reason; they can resubmit with corrected details, switch to Razorpay, or contact support.
- Three consecutive rejections on the same invoice raise an alert in the Operator Console (likely a dispute brewing).

### 10.4 Subscription transition failures

- If the in-transaction call to `SubscriptionService.renew()` fails (rare — should only happen if the subscription row was deleted, which we do not allow), the whole webhook transaction rolls back and Razorpay's webhook delivery is retried. Idempotency makes the retry safe; we never end up with a paid invoice and an unrenewed subscription.

### 10.5 Refund failures

- Razorpay refund creation is synchronous; the success / failure response is immediate. A successful refund creation produces a `refund.processed` webhook later when settled.
- A failed refund creation is logged as `BillingAudit` with reason; the operator is shown the error and may retry with adjusted parameters.

### 10.6 Notification failures

- Reminder and receipt notifications go through Notification Foundation. Failures (provider down, recipient bounced) are visible on the existing Communication Center monitoring surface. They do not block the underlying billing transition.

### 10.7 Retry strategy summary

| Failure | Retry policy |
|---|---|
| Razorpay `payment.failed` | School-initiated, no cool-down. Alerts after 3/24h and 10/7d. |
| Webhook delivery 5xx | Razorpay back-off; reconciliation job recovers within 48h. |
| Manual payment rejection | School can resubmit immediately. Alert after 3 consecutive. |
| `SubscriptionService.renew()` exception | Full transaction rollback; webhook retry recovers. |
| Refund creation failure | Operator retry, no automation. |
| Notification dispatch failure | Notification Foundation owns retry; billing path unaffected. |

---

## 11. Audit & Security

### 11.1 Audit trail

- Every state-changing billing operation writes to `BillingAudit` (separate from the school-side `audit/finance-chain` ledger).
- Captured per audit event: `actorUserId`, `actorRole`, `actorIp`, `userAgent`, `requestId`, `occurredAt`, `action`, `category`, `resourceType` (`Invoice` | `Payment` | `Refund` | `CreditNote` | `BillingProfile` | `PaymentSourceConfig`), `resourceId`, `before`, `after`, `notes`.
- Append-only. No update or delete is permitted on `BillingAudit` rows.
- Queryable from the Operator Console — supports filtering by school, actor, action, period.
- Retention: indefinite (financial records). Backed up daily to long-term cold storage.

### 11.2 Idempotency

- **Razorpay webhook:** unique index on `Payment.razorpayPaymentId` and `Refund.razorpayRefundId`. Duplicate delivery is caught as a unique-violation, mapped to `200 OK { status: 'idempotent_replay' }`.
- **Manual payment recording:** unique index on `(invoiceId, source, transactionReference)`. An operator cannot accidentally record the same payment twice.
- **Order creation:** idempotent on `(invoiceId, idempotency-key-header)`. A network retry of the checkout-init endpoint returns the existing `PaymentAttempt` rather than creating a duplicate Razorpay order.
- **Refund issuance:** idempotent on `(paymentId, idempotency-key-header)`.
- The existing platform `idempotency` middleware (`core/idempotency`) is reused; billing endpoints do not introduce a parallel mechanism.

### 11.3 Webhook verification

- All Razorpay webhooks verified by HMAC-SHA256 with the webhook secret in environment configuration.
- Constant-time comparison.
- Failure path: 400 response, structured log, counter increment. Repeated failures (configurable threshold) raise an alert — likely a misconfiguration or a probe.
- Webhook secret rotation: dual-secret window during rotation so live rotations do not drop legitimate webhooks.
- Raw payload persisted to `WebhookEvent` (append-only) before any business processing.

### 11.4 Duplicate payment prevention

- Strongest guard: the unique partial index on `(invoiceId)` filtered to terminal-success payment statuses. An invoice can only have one `CAPTURED`/`APPROVED` payment.
- Second guard: the invoice state machine forbids a transition into `PAYMENT_PENDING` if the invoice is already `PAID`.
- Third guard: idempotency on `razorpayPaymentId` and on `(invoiceId, source, transactionReference)` for manual sources.
- Fourth guard: the daily reconciliation job cross-checks Razorpay's view of the world against ours and surfaces any divergence.

### 11.5 Sensitive data handling

- Bank account numbers and KMS-encrypted at rest; surfaced only on the operator-only "view full bank details" page and audit-logged on read.
- Cheque images and bank statement screenshots stored through the existing File Storage module under platform-scoped (not tenant-scoped) ACL with operator-only access.
- Razorpay credentials (key id, key secret, webhook secret) live in environment configuration, never in the database.
- PII in billing communications is rendered via Notification Foundation templates that go through the existing redaction layer.

### 11.6 Authorisation

- All billing routes are RBAC-guarded by the `billing.*` permission keys defined in `BILLING_FOUNDATION_ARCHITECTURE.md §11`.
- All billing write routes are `@AllowWhenInactive`-annotated — a suspended school must still be able to pay.
- Webhook route is unauthenticated by design (Razorpay does not present a JWT). Authorisation is by signature verification.

### 11.7 Rate limiting

- The webhook route has a per-IP rate limit consistent with Razorpay's own delivery cadence; well above legitimate traffic but bounded against floods.
- The school-facing "create checkout" endpoint is rate-limited per-school to prevent runaway Razorpay order creation on a misbehaving client.

---

## 12. Module Boundaries

Reconfirming the wall between School Fees and SaaS Billing — and making explicit which surfaces in this document apply only to SaaS Billing.

### 12.1 The wall

- **School Fees (`core/fees/*`)** — Parent → School. Tenant-scoped data. Each school has its own merchant relationship for collecting parent payments. Hybrid collection (multiple tenders per parent invoice) is a school-internal feature. Audit trail uses `audit/finance-chain` (hash-chained, designed for the school's own books).
- **SaaS Billing (`core/billing/*`, future)** — School → Platform. Platform-scoped data indexed by school. Single platform merchant relationship (Razorpay). One payment per platform invoice; no split tender. Audit trail uses a new `BillingAudit` ledger separate from `audit/finance-chain`.

### 12.2 What does NOT cross the wall

- **Payment sources.** The five sources in §1 are platform payment sources, configured on the platform's bank accounts and UPI IDs. They have nothing to do with the school's own fee-collection configuration. A school configuring its parent-fee gateway is a separate flow in `core/fees/gateways/*` (already implemented, Sprint 7–8).
- **Receipt numbers.** Platform receipts (`RCP-FY-NNNNNN`) are separate from school fee receipts (which use the school's own `fee-receipt` sequence per `core/sequences`). The two sequences are in different namespaces and never collide.
- **Notification events.** Billing emits `BILLING_*` events to billing contacts; school fee events fire `FEES_*` events to parents. Both reuse Notification Foundation but the event keys and templates are distinct.
- **Audit ledgers.** `BillingAudit` is platform-scoped and operator-disputable. `audit/finance-chain` is tenant-scoped and parent-disputable. They are not the same ledger and never share rows.
- **Refunds.** A SaaS-billing refund (platform → school) is unrelated to a school-fee refund (school → parent). The refund APIs, the gateway endpoints, and the audit categories are different.
- **Hybrid collection.** Hybrid collection is exclusively a School Fees feature (parent pays partly cash, partly online, partly via wallet credit, etc.). SaaS Billing has at-most-one payment per invoice in v1 and uses exactly one source per payment.

### 12.3 Code-level enforcement

- `core/billing/*` does not import from `core/fees/*`, and vice versa.
- The Prisma schema for billing entities will live in its own file (e.g. `prisma/schema/billing.prisma`) rather than being merged into `fees.prisma`.
- The platform's CI lint includes a directory-import rule that fails the build on a cross-import between the two trees.

### 12.4 Why this matters operationally

- A future change to school-fee logic must not affect platform billing, and vice versa. Coupling them creates regression risk in unrelated domains.
- An audit / forensic query for "how did this parent payment land?" must be answerable entirely from `core/fees/*` data. Cross-referencing platform billing for the answer would mean the wall has leaked.
- A future operator who turns off Razorpay at the platform level must not affect a school's own parent-collection gateway. The two are unrelated configurations.

The wall between these two domains is the single most important architectural invariant in the billing surface. Every section of this document is on the SaaS-Billing side of that wall.
