# PROVISIONING_AND_LIFECYCLE

_Upstream: SCHOOL_ONBOARDING_FLOW.md, MODULES.md, MODULE_BOUNDARIES.md. Downstream: SUBSCRIPTION_FOUNDATION.md, SUPER_ADMIN_ARCHITECTURE.md._

Sprint 14 — Super-Admin School Provisioning, school `LifecycleStatus` state machine, trial workflow, PLATFORM_ADMIN role, and the daily trial-expiry scheduler. Updated with Hotfix 14.1.

> Status: Sprint 14 + Hotfix 14.1 deployed (2026-06-25). Subscription assignment is owned by Sprint 15 (`SUBSCRIPTION_FOUNDATION.md`).

---

## 1. Purpose

Provisioning is the act of bringing a new school tenant into existence with everything it needs to function on day one:
1. A `School` row with a canonical slug, region, and lifecycle state.
2. A first `User` with the PLATFORM_ADMIN-issued school-admin role and forced password change on first login.
3. Default `SchoolSettings`, `SchoolCommunicationEntitlement`, and audit baseline.
4. An initial `Subscription` row (assigned by Sprint 15's `SubscriptionService.assignInitialSubscription`).
5. A 30-day trial window if the plan declares `trialDays > 0`, otherwise immediate activation.

Lifecycle is the runtime state machine that governs what a provisioned school can do — TRIAL, ACTIVE, EXPIRING, SUSPENDED, ARCHIVED. Subscription-level state (Sprint 15) is **adjacent but distinct** — see §10.

---

## 2. School lifecycle states

Source of truth: `backend/src/core/provisioning/lifecycle/lifecycle-transitions.ts`. The canonical state-machine definition lives in DECISIONS D-027 (School Lifecycle FSM).

| State | Meaning |
|---|---|
| `PROVISIONING` | Row created, async bootstrap in progress (entitlements, default roles, S3 prefix). Not yet usable. |
| `TRIAL` | Bootstrap complete, school admin can log in, trial window running. |
| `ACTIVE` | Paid plan (or admin override). Steady state. |
| `EXPIRING` | Soft warning state set by trial-expiry scheduler ahead of `trial_ends_at`. |
| `SUSPENDED` | Platform-initiated freeze. Read-only for school admin. |
| `ARCHIVED` | Data preserved but inaccessible to school. Terminal except via platform restore. |

### 2.1 Transition map

```
            → PROV  TRIAL  ACTIVE  EXPIRING  SUSPENDED  ARCHIVED
PROVISIONING          ✓      ✓                              ✓
TRIAL                        ✓        ✓        ✓            ✓
ACTIVE                                ✓        ✓            ✓
EXPIRING                     ✓        —        ✓            ✓
SUSPENDED                    ✓        —        —            ✓
ARCHIVED    (terminal except platform restore)
```

Every transition writes to `school_lifecycle_history` with `actor_user_id`, `from_status`, `to_status`, `reason`, `occurred_at`. Helpers: `isLifecycleTransitionAllowed`, `assertLifecycleTransition`.

---

## 3. Provisioning orchestration

Entry point: `POST /api/v1/super-admin/schools` (controller `SchoolProvisioningController`).

### 3.1 Flow

1. **Validate** the request DTO (school name, slug, region, plan code, initial admin email + phone).
2. **Open transaction** (`prisma.transaction`).
3. **Create `School`** in `PROVISIONING` status with the resolved `region_id`, `plan_id`, `slug`.
4. **Create default `SchoolSettings`** (locale, timezone, fiscal year defaults).
5. **Bootstrap `SchoolCommunicationEntitlement`** from the assigned plan's PlanFeature rows (Sprint 15) with flat-`Plan.*` columns as fallback. Channel-level enable + monthly limits land here.
6. **Seed default roles** for the tenant scope (`school_admin`, plus the future role catalog as it lands).
7. **Provision the school admin** as the first `User`:
   - email + phone provided by Super Admin
   - one-time password generated and emailed
   - `mustChangePassword = true` (forces a change on first login)
   - assigned the seeded `school_admin` role
8. **Call `SubscriptionService.assignInitialSubscription(schoolId, planId, billingCycle='TRIAL')`** (Sprint 15) to create the initial Subscription row.
9. **Promote `School.lifecycle_status`** from `PROVISIONING` → `TRIAL` (if `plan.trialDays > 0`) or `ACTIVE` (otherwise).
10. **Publish outbox events**: `school.provisioned`, `school.lifecycle.transitioned`, `subscription.assigned`, `school_admin.invited`.
11. **Commit.** The school admin receives the welcome email with login credentials.

### 3.2 Idempotency

The endpoint accepts an idempotency key. Replay returns the previously-created `School.id` and audit reason rather than creating a duplicate.

### 3.3 Failure handling

The provisioning transaction is all-or-nothing. If any step fails (slug collision, plan not found, outbox enqueue fails), the transaction rolls back and the caller sees the original error — no orphaned partial school.

---

## 4. Trial workflow

### 4.1 Trial window

When a school is provisioned on a plan with `trialDays > 0`:
- `School.lifecycle_status = TRIAL`.
- `Subscription.status = TRIAL` (Sprint 15), `trialEndsAt = now + trialDays`.
- All Standard-plan modules are usable subject to PlanFeature limits.

### 4.2 Trial-expiry scheduler

Job: `school-trial-expiry.job-handler.ts` (registered by Hotfix 14.1). Cron: **daily at 02:00** (registered as a `JobDefinition` upsert). Behavior on each run:

1. Find schools where `lifecycle_status = TRIAL` and `trial_ends_at <= now`.
2. For each match, transition `TRIAL → EXPIRING` (then `EXPIRING → ARCHIVED` after the grace window — grace window value is owned by the future Billing sprint).
3. Write `school_lifecycle_history` rows and publish `school.lifecycle.transitioned` outbox events.

Sprint 15 added a sibling `SubscriptionExpiryJobHandler` (daily 03:00) for Subscription-level expiry. The two run independently — school lifecycle and subscription status are distinct (§10).

---

## 5. School admin creation

The first School-Admin user is created **inside the provisioning transaction**, not via a separate invite/accept flow. Rationale:

- Sprint 14's super-admin console operates on schools the platform team has signed onboarded; the initial admin email is known upfront.
- One-time password + `mustChangePassword = true` enforces credential rotation on first login.
- The welcome email contains the temporary credentials. The admin lands on a forced password-change screen, then proceeds normally.

A self-serve onboarding flow (where a prospective school signs up themselves and receives a magic link) is a **future sprint** — not part of Sprint 14.

---

## 6. PLATFORM_ADMIN role

Sprint 14.1 introduced the `PLATFORM_ADMIN` built-in role:
- **Scope**: PLATFORM (not tenant-scoped).
- **Permissions**: wildcard `*.*` across platform and tenant-scoped operations.
- **Purpose**: identifies users who operate the SaaS — provision schools, suspend tenants, manage plans, run reports across tenants.
- **Auto-inheritance**: every new module's permissions are picked up automatically via the wildcard. Sprint 15's 24 `subscription.*` keys, for instance, did not require a PLATFORM_ADMIN seeder edit.

PLATFORM_ADMIN users are seeded by the platform-admin bootstrap, not by tenant onboarding. They are not visible to or assignable by school admins.

---

## 7. SchoolCommunicationEntitlement bootstrap

The entitlement row controls per-channel monthly send limits (email, SMS, WhatsApp). At provisioning:

1. Read `PlanFeature(planId, 'email_monthly' | 'sms_monthly' | 'whatsapp_monthly')` rows.
2. If a row exists and `mode = LIMITED`, persist `<channel>_monthly_limit = limit`.
3. If `mode = UNLIMITED`, persist `null` (no cap).
4. If `mode = DISABLED`, persist `0` and set `<channel>_enabled = false`.
5. Fallback: if no PlanFeature row exists yet (e.g. legacy plan), read flat `Plan.*` columns.

The fallback ensures the entitlement bootstrap remains backward-compatible while the codebase migrates fully to PlanFeature as the canonical source.

---

## 8. Hotfix 14.1 updates

Hotfix 14.1 hardened Sprint 14 with three changes:

1. **PLATFORM_ADMIN role** seeded (see §6).
2. **`mustChangePassword`** enforced for newly-provisioned school admins.
3. **Trial-expiry scheduler** registered (daily 02:00, behavior described in §4.2).

All three were additive; no schema or migration churn beyond the platform-admin seeder.

---

## 9. Hotfix 15.0.1 — DI bug in stub modules

Not a Sprint 14 change, but worth recording because it surfaced via provisioning boot:

The Reporting/Bulk-Operation stub classes inherited from a base class that took a registry via constructor injection. NestJS DI requires the subclass to declare an explicit constructor for `design:paramtypes` to be emitted. Without it, the base-class constructor ran with `registry = undefined` and `onApplicationBootstrap` crashed.

Fix: explicit `constructor(registry: X) { super(registry); }` on every stub subclass (4 parsers, 4 committers, 6 executors). Validators were unaffected (no DI dependency).

---

## 10. Provisioning vs Subscription Management — the boundary

Sprint 14 (provisioning) and Sprint 15 (subscription) own adjacent state but **must not be conflated**. The split:

| Concern | Owner | Source field |
|---|---|---|
| "Is this school onboarded?" | Provisioning | `schools.lifecycle_status` |
| "Is this school admin-suspended?" | Provisioning | `schools.lifecycle_status = SUSPENDED` |
| "Has trial expired?" | Provisioning (school-level) + Subscription (plan-level) | `schools.trial_ends_at`, `subscriptions.trial_ends_at` |
| "What plan does this school have?" | Subscription | `subscriptions.plan_id` (active row) |
| "What features can this school use?" | Subscription | `plan_features` + `SubscriptionGuardService` |
| "Has this school exceeded its student limit?" | Subscription | `school_usage` + threshold state |
| "Did the plan change?" | Subscription | `subscription_history` |

The **denorm** on `schools` (`plan_id`, `plan_assigned_at`, `plan_expires_at`, `plan_status`) is maintained by `SubscriptionService` on every assign/upgrade/downgrade/cancel inside the same transaction. Read-side, feature modules should still route through `SubscriptionGuardService` rather than reading `schools.plan_*` directly — the denorm is a convenience, not the source of truth.

**Rule of thumb.** If you are asking "can this user even use the app?", check `schools.lifecycle_status`. If you are asking "can this user use *this feature*?", call `SubscriptionGuardService`.

---

## 11. Permissions

Permissions added by Sprint 14:
- `provisioning.school.create`
- `provisioning.school.read`
- `provisioning.school.update`
- `provisioning.school.suspend`
- `provisioning.school.archive`
- `provisioning.school.restore`
- `provisioning.school_admin.invite`
- `provisioning.school_admin.reset_password`
- `provisioning.lifecycle_history.read`

PLATFORM_ADMIN inherits all via wildcard. Future School-Admin role tooling (resetting other admins' passwords, etc.) is a Sprint 16+ concern.

---

## 12. Critical files

- `backend/prisma/schema/platform.prisma` — `School`, `SchoolSettings`, `school_lifecycle_history`.
- `backend/src/core/provisioning/school-provisioning.service.ts` — orchestrator.
- `backend/src/core/provisioning/lifecycle/lifecycle-transitions.ts` — state machine.
- `backend/src/core/provisioning/provisioning.constants.ts` — permissions, topics, events.
- `backend/src/core/provisioning/jobs/school-trial-expiry.job-handler.ts` — trial expiry (Hotfix 14.1).
- `backend/src/core/auth/seeders/platform-admin-role.seeder.ts` — PLATFORM_ADMIN role (Hotfix 14.1).
