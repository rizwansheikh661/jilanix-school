# SUPER_ADMIN_ARCHITECTURE

_Upstream: PRODUCT_REQUIREMENTS.md, MODULES.md. Downstream: ROLES_AND_PERMISSIONS.md, BACKEND_ARCHITECTURE.md, REST_API_DESIGN.md._

The platform-operator side of SchoolOS. **This is a real product**, not a SQL prompt. The Super Admin Console is how we (the SaaS company) onboard, bill, observe, and support every tenant.

> **Foundation vs Future status.** The super-admin APIs for Provisioning (Sprint 14) and Subscription Foundation (Sprint 15) are shipped. The richer **Operator Console** UX described in §2 — CSM dashboard, MRR/ARR reporting, fleet observability, dunning queue, impersonation UI — is a **Future** layer. The current state is "Operator Console (Partial)" per `MODULE_BOUNDARIES.md §5`. Sections below describe the target product; treat unimplemented surfaces as forward-looking.

---

## 1. Who is the Super Admin

- The **platform operator** — our company. Multiple internal users hold Super Admin or platform-staff roles, with scoped permissions.
- Super Admin is **global**, not bound to any tenant. JWTs for these users carry a `scope: "global"` claim and pass through tenant guards differently from school-side users.
- Super Admin **cannot be a school-side user simultaneously**. Personal accounts for testing schools are separate.

### 1.1 Internal sub-roles

| Role                     | Capabilities (high-level)                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| `super_admin`            | Full platform access; can create other internal admins                 |
| `platform_billing`       | Plans, invoices, refunds, GST, dunning                                 |
| `platform_support`       | Read tenants, impersonate (audited), resolve tickets, toggle flags     |
| `platform_engineer`      | Read infra metrics, run safe ops jobs, no billing access               |
| `platform_sales`         | CRM-side: leads, demos, trial extensions, pricing quotes               |
| `platform_readonly`      | Reports and dashboards only                                            |

These roles are **separate from the tenant RBAC system** — see ROLES_AND_PERMISSIONS.md §1 for the boundary.

---

## 2. Surfaces

### 2.1 Operator Console (`admin.schoolos.in`)

A separate Next.js app (latest stable when frontend development begins) — or a route group inside the same app, gated by host header. Never accessible from a tenant subdomain.

**Tabs / sections:**

1. **Dashboard** — fleet KPIs: active tenants, MRR, ARR, trial pipeline, churn, NPS, infra cost, support load.
2. **Tenants** — list, search, filter; click into a tenant detail page.
3. **Billing** — invoices, payments, refunds, dunning queue, GST exports.
4. **Plans & Flags** — plan registry, feature flag registry, toggle per tenant.
5. **Notifications** — provider health, credit pools per tenant, message volume, error rates.
6. **Support** — ticket queue, impersonation log, action history.
7. **Audit** — global audit log filtered by actor, tenant, action.
8. **Reports** — platform-level analytics (cohort retention, feature adoption, etc.).
9. **System** — feature flag definitions, role definitions, scheduled job health, queue depth, deployment status.

### 2.2 Internal APIs (`api.schoolos.in/admin/*`)

Backed by a dedicated NestJS module (`AdminModule`) with its own guards. No tenant ID is required on the URL; it accepts a `?tenant=<id>` filter and a tenant ID header for impersonation.

---

## 3. Capabilities

### 3.1 Tenant lifecycle
- Create tenant (manual or via marketing-site signup).
- Edit tenant profile (legal name, GSTIN, billing contact, owner, address).
- Suspend tenant (read-only mode, login disabled for non-Super-Admin users).
- Reactivate tenant.
- Archive tenant (soft delete after retention window; data exported and removed).
- Force-renew or extend trial.
- Migrate tenant slug/subdomain.

### 3.2 Subscription & billing
- View tenant's current plan, billing cycle, next invoice date, MRR, lifetime value.
- Change plan (immediate, prorated).
- Apply a coupon, discount, or one-off credit.
- Trigger an invoice manually.
- Mark a manual (offline) payment.
- Issue a refund (creates audit entry).
- Void or reissue an invoice (Indian GST rules require credit notes, not deletion).
- Configure auto-debit (Razorpay subscription mandate).
- Resend invoice email/WhatsApp/SMS to billing contact.

### 3.3 Feature flag management
- See all flags for a tenant: plan default → tenant override.
- Toggle a flag (with an optional expiry timestamp and a mandatory reason → audit log).
- Bulk-enable a flag for all tenants on a plan (e.g., shipping a new module).
- View which tenants have which flags.

### 3.4 User management (cross-tenant)
- Search any user by email/phone across all tenants.
- Reset a user's password (audited).
- Unlock a user account (audited).
- Force-MFA for a tenant.
- View login history of a user.

### 3.5 Impersonation
- "View as school admin" — Super Admin enters the tenant context with a read-only or write-allowed flag.
- **Mandatory:** every impersonation session is logged with reason, duration, and actions taken. The impersonated tenant is shown a banner ("Platform staff viewing").
- Impersonation tokens are short-lived (≤30 min) and never refreshable.
- Engineering and billing staff cannot impersonate without a recorded reason and a corresponding support ticket ID.

### 3.6 Notifications operations
- Per-tenant credit pool: top up, debit (with audit), refund.
- Provider failover toggle.
- Resend a failed notification batch.
- Pause notifications for a tenant (in incident mode).

### 3.7 Audit & forensics
- Search audit log by tenant/actor/resource/action/date.
- Export audit log per tenant (PDF/CSV) — for compliance requests.
- Detect anomalies (cross-tenant query attempts, mass exports, off-hour bulk deletes).

### 3.8 Support tooling
- Ticket inbox (linked to email / WhatsApp / in-app form).
- Per-ticket attach: tenant, user, screenshot, log snippet, audit entries.
- Internal notes; SLA tracking.
- Knowledge base of canned responses for common issues.

### 3.9 Platform configuration
- Plan registry (CRUD plans, prices, included flags).
- Coupon registry.
- Notification template defaults (per channel).
- Email/SMS/WhatsApp provider keys (encrypted).
- Razorpay keys.
- Domain / subdomain whitelist for tenants.
- Feature-flag definitions and lifecycle (introduce, deprecate).

### 3.10 Operations
- Run a safe operations job: regenerate a tenant's invoice, retry failed dispatches, recompute aggregates.
- See queue depths, dead-letter queue, retry counts.
- See per-tenant resource usage: storage, DB rows, notification credits — for cost attribution and quota enforcement.

---

## 4. Architectural separation

- **Separate frontend app** for operator console. Reuses the design system and component library, but runs on a different host and has its own auth flow.
- **Separate NestJS module** (`AdminModule`) — sibling to tenant modules, with stricter guards.
- **Separate JWT scope** — `global` vs. `tenant`. Tenant guards reject `global` tokens by default and require an explicit "admin path" attribute.
- **Same database** as tenants for v1 (cross-cutting reads are essential for fleet dashboards). Long-term, an async read-replica or BI warehouse handles platform analytics — neither exists today (Reporting Foundation is async/ledger on the primary; see DECISIONS D-031).
- **Audit log is shared** — but every audit row carries `actor_scope` so we can filter platform-actions vs. tenant-actions.

---

## 5. Security posture

- **MFA mandatory** for every Super Admin / platform-staff user. No exceptions.
- **IP allowlist** for the operator console (corp VPN or office IPs) — soft v1, hard v2.
- **Hardware key (WebAuthn)** support for `super_admin` role.
- **Action confirmation** for destructive operations (suspend tenant, void invoice, mass-toggle flag): typed confirmation + reason + 4-eyes approval for highest-risk actions.
- **Rate limits** on cross-tenant queries to prevent accidental data dumps.
- **Read-only by default** for `platform_engineer` and `platform_readonly`.
- **Impersonation banner** visible to tenant users during the session.
- **Quarterly access review** — roster of who has Super Admin access.

### 5.1 4-eyes (dual-control) action list

These actions require a second platform staffer to approve in-app before they execute:

| Action                                                  | Initiator          | Approver           |
| ------------------------------------------------------- | ------------------ | ------------------ |
| Tenant suspension or archival                           | platform_support   | super_admin        |
| Tenant data export (bulk PII)                           | platform_support   | super_admin        |
| Refund > ₹10,000                                        | platform_billing   | super_admin        |
| Void of paid invoice                                    | platform_billing   | super_admin        |
| Bulk plan-wide flag toggle                              | platform_support   | super_admin        |
| Granting `super_admin` role to a user                   | super_admin        | super_admin (other)|
| Tenant restore from backup                              | platform_engineer  | super_admin        |
| Disabling cross-tenant probe detection                  | platform_engineer  | super_admin        |
| Production database direct write (any)                  | platform_engineer  | super_admin        |

The approval is captured in `approvals` (see ROLES_AND_PERMISSIONS §6) with full context.

### 5.2 Break-glass / emergency access

For genuine incidents where normal approval flows are too slow:

- A `super_admin` can declare a **break-glass session** with a written reason and an explicit duration (≤ 60 min).
- The session unlocks any approval bypass; every action taken during it is heavily logged.
- The break-glass session automatically pages all other `super_admin` users.
- Post-incident: written review within 48 h, recorded under `docs/incidents/<date>.md`.
- Quarterly review of break-glass usage as part of access review.

### 5.3 Access revocation

- Offboarding a platform staffer revokes their JWTs (JTI deny-list), removes MFA enrolment, and rotates any provider keys they may have viewed.
- Departure of a `super_admin` triggers an immediate audit-log review for the 30 days prior.

---

## 6. Observability for Super Admin

The console doubles as the operations dashboard. Build it with these in mind:

- **Per-tenant health card:** error rate, p95 latency, queue lag, last successful login, last fee payment.
- **Fleet view:** heatmap of tenants by health, churn risk, fee collection trend.
- **Ops view:** failing background jobs, expired sessions backlog, undelivered notifications.
- **Cost view:** per-tenant DB rows, storage GB, notification credits used → margin per tenant.

These views are first-class, not afterthoughts. They drive the support team's daily workflow and our churn intervention strategy.

---

## 7. Roadmap notes

- **v1 (months 0–3):** tenant CRUD, plan change, flag toggle, impersonation, basic billing, basic dashboards.
- **v2 (months 3–6):** dunning automation, support ticket inbox, anomaly detection, scheduled reports.
- **v3 (months 6–12):** self-serve onboarding, automated GST e-invoicing, churn-prediction signals, partner/reseller portal.

This document is updated whenever a new platform-operator capability ships.
