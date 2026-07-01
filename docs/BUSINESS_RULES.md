# BUSINESS_RULES

_Upstream: PROJECT_VISION.md, PRODUCT_REQUIREMENTS.md. Downstream: MODULES.md, DATABASE_DESIGN.md, REST_API_DESIGN.md._

Non-negotiable domain rules for the Indian K-12 school context. Code that violates these is wrong by definition. Any future module must read this document before designing logic that touches the rules below.

---

## 1. Tenancy

- **One tenant = one school.** A tenant has one or more **branches** (campuses). All branches share the same tenant ID; branch is a column, not a tenant.
- **A user belongs to exactly one tenant.** Cross-tenant users are forbidden except the global Super Admin role.
- **A tenant has exactly one active subscription** at a time. Plan changes are immediate; pricing is prorated.
- **A tenant's data is never visible to another tenant**, regardless of role. There is no "shared library."

## 2. Academic year

- The academic year in India typically runs **April → March**. Configurable per school (some run June → April).
- A school has **at most one "current" academic year** at any time. Multiple years can exist (past, current, future-planned).
- Every class, section, timetable, fee structure, exam, attendance record, mark, and admission **belongs to exactly one academic year**.
- Closing an academic year is a deliberate operation (not automatic on March 31). It triggers: bulk promotion, TC issuance for leavers, archival of last year's timetable, freezing of last year's marks.

## 3. Promotion, retention, transfer

- A student in class N at year Y is promoted to class N+1 at year Y+1, **only if** they have a "promoted" academic outcome.
- Retained students stay in class N for year Y+1 (with a flag `is_repeating = true` and a reason).
- A **Transfer Certificate (TC)** is mandatory for any student leaving the school. Once a TC is issued:
  - The student's status becomes `transferred_out`.
  - Their parent loses write access to the child's record (read-only history).
  - They cannot be re-admitted under the same admission number.
- **Re-admission** requires a fresh admission number; history is linked but the new record is canonical.

## 4. Admissions

- An admission number is **unique within a tenant** and is **never reused** within that tenant.
- Admission number format is configurable per tenant (e.g., `2026/0042` or `CBSE-26-0042`). Must be deterministic and printable on certificates.
- A student record requires: name, DOB, gender, parent contact (at least one phone), admission date, class+section+year.
- Aadhaar number is **optional**. If captured, it is encrypted at rest and masked in UI (`XXXX-XXXX-1234`).

## 5. Attendance

- Attendance states: `present`, `absent`, `late`, `half_day`, `leave`, `holiday`. Tenant-configurable but the union must include these.
- Attendance is recorded **per student per day per session**. Sessions can be `whole_day` (default) or `morning`/`afternoon` for split-shift schools.
- Attendance once recorded can be edited within a configurable window (default 7 days). Edits are audited with old value → new value → editor → reason.
- Holidays auto-mark attendance as `holiday` for all students (not "absent").
- Attendance % is computed against **working days**, not calendar days.

## 6. Fees

- A **Fee Structure** is defined per (academic year × class × optional section). It contains components (admission, tuition, transport, exam, lab, etc.) with frequency (one-time, monthly, quarterly, annual).
- An **Invoice** is generated per (student × billing period × structure). Invoices are immutable once issued; corrections are made via Credit Notes.
- A **Receipt** is created on payment. One invoice can have multiple receipts (partial payments).
- **Payments are atomic and idempotent.** A Razorpay webhook may fire twice; we must not double-credit.
- **Fines / Late fees:** rule-driven. Configurable per school (flat or per-day). Computed at invoice display time, not stored, until applied via a "freeze fines" action.
- **Discounts and Scholarships:** approval-gated. Above a tenant-configured threshold, principal approval is required. All applications are audited.
- **GST:** if the school is registered, invoices include GSTIN and tax line items. Otherwise, fees are exempt education services (no GST).
- **Refunds** require principal approval and create a refund record linked to the receipt; original receipt is not deleted.

## 7. Examinations and report cards

- An **Exam** is scoped to (academic year × term × class). Subjects + max marks + passing marks are defined per exam.
- **Marks** are entered per (student × exam × subject). Edit window default 14 days post-entry; subsequent edits require principal approval.
- **Grade systems** are tenant-configurable: percentage, CGPA (CBSE 10-point), letter grades. The same exam can be displayed under multiple systems for the same tenant if needed.
- **Report cards** are generated from final marks of a year/term. They are PDFs with the school's letterhead. Once issued and shared with parents, edits create a new versioned report card; the prior version is archived (not deleted).
- **Ranks** are computed within a class+section by default. Tenant can configure to compute across the class only (no section break) or disable rank entirely.

## 8. Communication

- A school can send notifications via SMS, WhatsApp, Email, Push.
- **Parental consent** is required for marketing-style communication. Operational communication (fee due, attendance absent) is permitted under "legitimate interest."
- **DND / opt-out**: a parent can opt out of any non-critical channel; critical notifications (fee due, exam, emergency) are sent regardless on the cheapest available channel.
- **Quiet hours**: 21:00–07:00 IST by default; configurable. Critical alerts override.
- **Bulk messages** must show the operator the recipient count and estimated credit cost before sending.

## 9. Data retention and privacy (DPDP Act 2023)

- **Student data is data of a minor.** Verifiable parental consent is required to process. Onboarding captures this consent.
- **Right to access**: a parent can export all data of their child within 30 days of request.
- **Right to erasure**: applies after the student leaves the school + retention window (typically 7 years for academic records, statutory requirement).
- **Financial records** retained 7 years (Indian Income Tax Act baseline).
- **Audit logs** retained 3 years minimum.
- **Backups** retained 35 days rolling; older backups purged.
- **Staff PII** (PAN, Aadhaar, salary) accessible only to roles with explicit `staff.pii.read` permission.

## 10. Roles and approvals

- **Principal-only actions** (cannot be delegated by default): TC issuance, mark edits beyond window, fee waivers above threshold, staff termination, broadcasts to all parents.
- **Accountant-only actions**: fee structure creation, invoice voiding, refund processing.
- **Teacher actions**: own-class attendance, own-subject marks (within window), own-class messages.
- **Class teacher actions**: same as teacher + own-class report card finalization, own-class parent broadcasts.
- **Parent actions**: read child's records, pay fees, apply for leave, message class teacher.
- **Student actions**: read-mostly. Can submit homework, access library catalogue.

## 11. Numbering and identifiers

- **Admission number** — unique per tenant, never reused.
- **Employee number** — unique per tenant.
- **Invoice number** — sequential per tenant per financial year. Format: `INV/<FY>/<sequence>`. **Gap-free** (Indian audit requirement).
- **Receipt number** — sequential per tenant per FY. Gap-free.
- **TC number** — sequential per tenant. Gap-free.

Gap-free numbering implies invoice generation must use a tenant-scoped sequence with a transactional `last_used` counter, **not** auto-increment columns.

## 12. Branches (multi-campus)

- A school can have multiple branches under the same tenant.
- Students, staff, classes are scoped to a branch.
- Some entities (academic year template, fee structure template, communication templates) can be shared across branches.
- Reports can be filtered by branch or rolled up at school level.

## 13. Concurrency and conflicts

- Marks entry: optimistic locking on `(student, exam, subject)` with a version. Two teachers cannot accidentally overwrite each other.
- Attendance entry: idempotent upsert on `(student, date, session)`.
- Fee payment: idempotent on `(invoice_id, gateway_payment_id)`.
- Bulk operations (promotion, fee invoice generation) run as background jobs with progress + cancellation.

## 14. Calendar rules

- Year boundary: configurable per school (default Apr 1 – Mar 31).
- Term boundaries: tenant-configurable (typical: 3 terms or 2 semesters).
- Weekend: Saturday + Sunday by default; some schools have working Saturdays — configurable as "alternate Saturdays" or "first/third Saturday."
- Holidays roll up: national, state, school-specific.

## 15. What is *not* a business rule (don't bake into code)

- Specific UI labels (vary by board).
- Specific report card formats (template-driven).
- Specific certificate wordings (template-driven).
- Specific fee component names (admin-defined).
- Specific grading scales (admin-defined).
- Specific subject lists (admin-defined).

If it can vary across CBSE/ICSE/State boards, it is **configuration**, not code.
