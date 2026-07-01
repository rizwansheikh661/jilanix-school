# SCHOOL_ONBOARDING_FLOW

_Upstream: PRODUCT_REQUIREMENTS.md. Downstream: PROVISIONING_AND_LIFECYCLE.md, SUBSCRIPTION_FOUNDATION.md, SUPER_ADMIN_ARCHITECTURE.md._

End-to-end journey from "we don't know this school" to "this school is live and using SchoolOS daily."

> **Foundation vs Future status.** The **sales-assisted** path (§2.2) is the shipped Foundation flow today — operator creates the tenant via the Provisioning APIs, school admin completes the wizard. The **self-serve** signup path (§2.1) is a **Future** sprint (`MODULE_BOUNDARIES.md §5` lists "Self-serve signup wizard" as the Future sibling of Provisioning Foundation). The wizard described in §3 is shipped on the school side; marketing-site signup intake is not yet wired.

---

## 1. Funnel stages

```
LEAD ──► SIGNUP ──► PROVISIONED ──► CONFIGURED ──► IMPORTED ──► ACTIVATED ──► CONVERTED ──► EXPANDED
```

| Stage           | Definition                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| **Lead**        | Marketing/sales has the school in CRM but no account yet                    |
| **Signup**      | Tenant record created, school admin invited                                 |
| **Provisioned** | School admin logged in, school profile complete                             |
| **Configured** | Academic year, classes, sections, subjects, fee structure created           |
| **Imported**   | Students, parents, staff imported (≥10 students)                            |
| **Activated**  | At least 1 fee invoice issued OR ≥1 day of attendance recorded for ≥1 class |
| **Converted**  | Trial → paid subscription                                                   |
| **Expanded**   | Multi-branch, paid add-ons, or upgraded plan                                |

**Activation** is the key metric — it's the strongest predictor of conversion. The product is designed to push every trial school to activation within 14 days.

---

## 2. Two onboarding pathways

### 2.1 Self-serve (marketing site signup)

1. School visits `schoolos.in/signup`.
2. Fills: school name, principal/owner name, email, phone, board, student count band, city.
3. Phone OTP verification.
4. Tenant provisioned: subdomain auto-generated (e.g., `greenwood.schoolos.in`).
5. Email + WhatsApp with credentials (or magic link).
6. Lands in onboarding wizard (see §3).
7. Sales notified in CRM (high-intent lead, free trial running).

### 2.2 Sales-assisted (call/demo first)

1. Sales rep adds school to CRM, schedules demo.
2. After demo, rep creates tenant from operator console with extended trial (90 days).
3. Custom-configured (preferred plan flagged for conversion, dedicated CSM).
4. Sales rep assists initial import via shared CSV.
5. Same wizard for school admin, but with hand-holding via WhatsApp.

Both paths land in the same product state: a tenant in `trial`, a school admin with `school_admin` role, and the onboarding wizard ready.

---

## 3. The onboarding wizard

A dedicated, full-screen guided flow that runs the first time the school admin logs in. It can be paused and resumed; progress is saved at each step.

### Step 1 — School profile
- Legal name, display name, board (CBSE/ICSE/State), GSTIN (optional), PAN, address.
- Logo + letterhead upload.
- Time zone (default Asia/Kolkata), academic year start month (default April).
- Working days (Mon–Sat / Mon–Fri / alternating Saturdays).

### Step 2 — Branches
- For most schools: skip (single-branch).
- Otherwise: name + address per branch.

### Step 3 — Academic year
- Pick or create the current academic year (e.g., "2026–27").
- Pick term structure (3 terms / 2 semesters / custom).

### Step 4 — Classes & sections
- Either pick a template (CBSE 1–10, CBSE 1–12, ICSE 1–10) or define manually.
- Per class: sections (A/B/C…), subjects.
- Subject template (Math, Science, English, …) preloaded; admin tweaks.

### Step 5 — Staff
- Invite School Admin's deputies (principal, accountant, clerks).
- Each invitee gets a magic-link email + SMS.
- Bulk invite via CSV available.

### Step 6 — Students & parents
- Import via CSV with a downloadable template.
- Validation report shows row-level errors (missing DOB, invalid phone).
- Successful rows create student + parent + parent-child link records.
- Parents are auto-invited via SMS+WhatsApp with their phone-OTP login link.
- Can be deferred — wizard completes without it; banner reminds.

### Step 7 — Fee structure
- Define components per class: admission fee, tuition (monthly/quarterly/annual), transport, lab, etc.
- Discounts/scholarships configurable per student later.
- One template is default; admin can clone per class.

### Step 8 — Notifications
- Pick channels active for this school (SMS, WhatsApp, Email, Push).
- Add/buy initial credit pack (free credits during trial).
- Default templates pre-filled for common events: attendance absent, fee due, exam schedule, holiday.

### Step 9 — Go live
- Summary of what's configured.
- Big "Launch SchoolOS" button.
- Confirmation triggers: welcome email/WhatsApp to all parents, principal-only training video, sales/CSM notified.

The wizard tracks completion %; the operator console sees this funnel in real time.

---

## 4. Tenant provisioning (technical)

When a tenant is created (either pathway):

1. Insert `schools` row (UUID, slug, status=`trial`, plan=Trial).
2. Seed: default roles, default permissions, default notification templates, default certificate templates.
3. Create initial S3 prefix and bucket policy.
4. Create `users` row for the school admin with `school_admin` role.
5. Issue invite token (email magic link + SMS OTP).
6. Push tenant to fleet metric/cache caches.
7. Audit log: tenant created.

Provisioning is idempotent and runs as a background job for sales-created tenants; for self-serve it runs synchronously (≤2s) so the user lands logged in.

---

## 5. Imports — the critical UX

Most schools come from Excel. The CSV import is the single biggest onboarding risk.

- **Templates** for: students, parents, staff, fee structures.
- **Smart matching**: column header normalization, fuzzy match (`First Name` → `first_name`).
- **Per-row validation**: required fields, format (DOB, phone), duplicate admission numbers, parent-child linking.
- **Dry run preview**: shows what will be created/skipped/updated, with an editable inline table.
- **Background processing** for files > 100 rows.
- **Rollback**: if a wrong file was imported, the operator can roll back the import as a single audit-tied transaction (within 24h).

---

## 6. Communication during onboarding

| Trigger                              | Channel              | To              |
| ------------------------------------ | -------------------- | --------------- |
| Signup                               | Email + WhatsApp + SMS | School admin    |
| Wizard step completed                | In-app toast         | School admin    |
| Wizard incomplete after 24h          | WhatsApp + Email     | School admin    |
| Activation reached                   | WhatsApp + Email     | School admin + sales |
| Inactive 7 days                      | WhatsApp from CSM    | School admin    |
| Trial ending in 14 / 7 / 3 / 1 days  | Email + WhatsApp + in-app | School admin + principal |
| Trial expired                        | Email + WhatsApp + in-app | School admin + principal + sales |

---

## 7. Health checks (run by operator console)

Daily for every trial tenant:

- Has the school logged in in the last 3 days? (Inactivity flag.)
- Has wizard advanced this week? (Progress flag.)
- Have any students been imported? (Activation precursor.)
- Has attendance been marked? (Activation indicator.)
- Has any fee invoice been generated? (Activation indicator.)
- Has any communication been sent? (Adoption indicator.)

These flags drive the **CSM dashboard** in the operator console, sorted by churn risk.

---

## 8. Conversion to paid

When the school admin clicks "Subscribe" or sales arranges payment:

1. Plan selection (UI shows recommended plan based on student count).
2. Billing details capture (legal name, GSTIN if any, billing email, address).
3. Payment method:
   - Razorpay subscription mandate (UPI Autopay, NACH, card).
   - Or one-time payment link for the first cycle.
4. Tenant status flips `trial → active`.
5. Plan flags applied (some modules may unlock).
6. Welcome-to-paid email/WhatsApp.
7. Sales/CSM notified; CRM updated.

---

## 9. Failed onboarding

If a school never reaches Activated:

- Day 30: drip campaign with curated demos.
- Day 45: human CSM call.
- Day 60: trial ends.
- Day 60–90: tenant frozen, data preserved.
- Day 90: archived. Data exported and removed (DPDP).
- Lead status in CRM: lost.

Recovery: a frozen/archived tenant can be reactivated within retention windows by sales contact + Super Admin action.

---

## 10. Multi-branch onboarding (chains)

Chains add complexity:

- One tenant, multiple branches, possibly different plans per branch (not in v1; v1 has one plan per tenant).
- Bulk-create branches with shared academic year template.
- Per-branch user roles (vice-principal scoped to branch).
- Consolidated billing or per-branch billing (v2).

For v1 we recommend chains use one tenant per school until multi-branch billing matures, even though our schema supports multi-branch from day one.

---

## 11. Re-onboarding

A school that returns after archival:

- Cannot reuse the old tenant (data already removed).
- New tenant, new slug.
- If the school has historical record exports, they can be re-imported via the standard CSV path.
- Sales has a "win-back" playbook in the CRM.

## 11.1 Account-ownership transfer

The school admin role may change hands (the original principal leaves, a new trustee takes over). This flow must be safe and auditable:

1. **Request initiation** — current school admin OR a verified school owner (records on file) raises a transfer request from the Billing page (or via support).
2. **Identity verification** — for the new owner:
   - Government-ID document upload (Aadhaar / PAN).
   - Verification call by platform_support if value-at-stake (paid plan, large student base).
   - For trial schools: lower bar — email + phone OTP both confirmed.
3. **Cool-off period** — 48 h delay (configurable per risk tier) during which the existing school admin is notified on all channels; they can cancel the transfer.
4. **Execution** — Super Admin executes (4-eyes; see SUPER_ADMIN_ARCHITECTURE §5.1):
   - New user record created (or existing user promoted) with `school_admin` role.
   - Old school admin demoted to a configurable role (default: read-only `principal` or removed).
   - All sessions of the old admin revoked.
   - Billing contact updated.
   - Audit entry with both parties, reason, supporting documents.
5. **Post-transfer notification** — to both parties, plus a Super Admin record in the operator console for 90 days.

If the original admin is unreachable (e.g., passed away or absconded), the procedure escalates to a legal-review path before Super Admin acts; documentation requirements are higher (proof of school ownership, board resolution).

The same flow handles **branch-level ownership** in multi-branch tenants for `vice_principal` scope.

---

## 12. Success criteria for the onboarding flow itself

- Time from signup → first attendance mark < 7 days for 70% of self-serve trials.
- CSV import success rate ≥ 90% on first try.
- Wizard abandonment after Step 4 < 20%.
- Trial → paid conversion ≥ 30% of activated trials.

These metrics are visible in the operator console and reviewed weekly.
