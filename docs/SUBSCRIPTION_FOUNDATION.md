# SUBSCRIPTION_FOUNDATION

_Upstream: PROVISIONING_AND_LIFECYCLE.md, MODULE_BOUNDARIES.md, MODULES.md. Downstream: BILLING_AND_SUBSCRIPTIONS.md (future Billing Foundation)._

Sprint 15 — SaaS Subscription & Plan Management Foundation. This document is the canonical reference for what the Subscription module owns, the data it manages, and how feature modules interact with it. Billing/invoicing/payments are explicitly **out of scope** of this foundation — see `BILLING_AND_SUBSCRIPTIONS.md` for that future scope.

> Status: Sprint 15 + Hotfixes 15.0.1 and 15.0.2 deployed (2026-06-25).

---

## 1. Purpose

A school's plan today is more than a row pointer. The Subscription Foundation gives every school:

1. An authoritative `Subscription` row with a status timeline (PENDING → TRIAL → ACTIVE → EXPIRING → EXPIRED/SUSPENDED/CANCELLED).
2. An append-only `SubscriptionHistory` journal of every state change (assigned/activated/upgraded/downgraded/renewed/cancelled/...).
3. A flexible per-plan feature catalog (`PlanFeature`) carrying both **LIMIT** (numeric caps) and **TOGGLE** (booleans) in one structure.
4. Per-school usage aggregates (`SchoolUsage`) backed by an append-only event ledger (`UsageEvent`).
5. Edge-triggered threshold notifications (80%/90%/100%) via `UsageThresholdState`.
6. A reusable `SubscriptionGuardService` that every feature module calls to gate operations.

Foundation = data model + guard service + lifecycle + threshold/limit events. **No invoices, no payments, no Razorpay, no GST, no proration.** Those live in a future "Billing Foundation" sprint.

---

## 2. Data model (6 models)

All models live in `backend/prisma/schema/subscriptions.prisma`. Scope and lifecycle flags are registered in `backend/src/infra/prisma/scope.ts`.

| Model | Scope | Lifecycle | Purpose |
|---|---|---|---|
| `PlanFeature` | PLATFORM_ONLY | soft-delete | Per-plan, per-feature-key configuration. Single table for LIMIT + TOGGLE. |
| `Subscription` | TENANT_OWNED | soft-delete, composite PK | Authoritative subscription per school. STORED `active_key` + UNIQUE guarantees one ACTIVE row per school. |
| `SubscriptionHistory` | TENANT_OWNED | APPEND_ONLY | Journal of every lifecycle action. |
| `SchoolUsage` | TENANT_OWNED | singleton per school | Mutable aggregate counters (students, staff, branches, sms/email/whatsapp, storage). |
| `UsageEvent` | TENANT_OWNED | APPEND_ONLY | Delta ledger that backs `SchoolUsage.recompute()`. |
| `UsageThresholdState` | TENANT_OWNED | singleton per (school, featureKey) | Edge-trigger memory for 80/90/100% notifications. |

### 2.1 Scope rationale

- `PlanFeature` is PLATFORM_ONLY because plans are global SaaS catalog entries owned by the platform.
- All other Subscription-module models are TENANT_OWNED because they describe one school's state and usage.
- Composite `(school_id, id)` PK on TENANT_OWNED rows preserves the existing partitioning convention.

### 2.2 Soft-delete and uniqueness

`PlanFeature` uses the STORED `deleted_at_key` projection (`COALESCE(deleted_at, '0')`) so the UNIQUE `(plan_id, feature_key, deleted_at_key)` enforces active-row-only uniqueness without dropping history. Same pattern Sprints 7–14 use.

### 2.3 STORED `active_key`

`Subscription.active_key Char(36) GENERATED ALWAYS AS (CASE WHEN status='ACTIVE' THEN school_id ELSE NULL END) STORED` + `UNIQUE uq_subscriptions_active_school (active_key)` is the structural enforcement of "at most one ACTIVE subscription per school." Application code soft-cancels the previous ACTIVE row before assigning a new plan.

---

## 3. Enums

| Enum | Values |
|---|---|
| `FeatureType` | `LIMIT`, `TOGGLE` |
| `FeatureMode` | `LIMITED`, `UNLIMITED`, `DISABLED`, `ENABLED` (LIMIT uses LIMITED/UNLIMITED/DISABLED; TOGGLE uses ENABLED/DISABLED) |
| `SubscriptionStatus` | `PENDING`, `TRIAL`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `CANCELLED` |
| `BillingCycle` | `MONTHLY`, `YEARLY`, `TRIAL`, `CUSTOM` |
| `SubscriptionAction` | `ASSIGNED`, `ACTIVATED`, `UPGRADED`, `DOWNGRADED`, `RENEWED`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `REACTIVATED`, `CANCELLED` |
| `UsageThreshold` | `THRESHOLD_80`, `THRESHOLD_90`, `LIMIT_REACHED` |

---

## 4. Subscription lifecycle (state machine)

Mirrors the school `LifecycleStatus` machine from Sprint 14. Source of truth: `subscription/subscription-transitions.ts`.

```
            → PENDING TRIAL ACTIVE EXPIRING EXPIRED SUSPENDED CANCELLED
PENDING                 ✓     ✓                                  ✓
TRIAL                         ✓             ✓                    ✓
ACTIVE                              ✓       ✓        ✓           ✓
EXPIRING                      ✓             ✓                    ✓
EXPIRED                       ✓                                  ✓
SUSPENDED                     ✓                                  ✓
CANCELLED   (terminal)
```

Notes:
- `PENDING` is the seed state when a plan is assigned but trial/active onboarding has not run yet.
- `EXPIRING` is a soft pre-expiry warning state set by the daily expiry scheduler ahead of the actual `expiry_date`.
- `EXPIRED` and `SUSPENDED` are reversible (can return to TRIAL/ACTIVE on intervention).
- `CANCELLED` is terminal. To resubscribe, a new Subscription row is created.

Every transition writes a `SubscriptionHistory` row with `action`, `fromStatus`, `toStatus`, `actorUserId`, `actorReason`, `metadataJson`.

---

## 5. PlanFeature architecture

See DECISIONS D-029 (PlanFeature architecture) and D-030 (Communication entitlements via PlanFeature) for the canonical rationale.

### 5.1 Single table for two feature kinds

A `PlanFeature` row carries:
- `featureKey` (VARCHAR(80)) — the canonical key, e.g. `student_count`, `parent_portal`.
- `featureType` (LIMIT | TOGGLE) — the discriminator.
- `mode` — LIMIT uses LIMITED/UNLIMITED/DISABLED; TOGGLE uses ENABLED/DISABLED.
- `limit` (BIGINT NULL) — populated only when `mode = LIMITED` for LIMIT-typed keys.

This avoids two parallel tables (`plan_limits` + `plan_toggles`) that would split a uniform "what does this plan include?" query into two reads.

### 5.2 Canonical feature keys (14)

LIMIT type (7): `student_count`, `staff_count`, `branch_count`, `email_monthly`, `sms_monthly`, `whatsapp_monthly`, `storage_bytes`.

TOGGLE type (7): `parent_portal`, `student_portal`, `payroll`, `accounting`, `advanced_reporting`, `multi_branch`, `event_management`.

Source of truth: `subscription/plan-feature/feature-keys.ts`. New keys are added there (with a typed const + `LIMIT_FEATURE_KEY_TO_USAGE_COLUMN` mapping for LIMIT keys that need a usage counter).

### 5.3 Seeded values (3 plans × 14 keys = 42 rows)

| LIMIT key | STARTER | GROWTH | ENTERPRISE |
|---|---|---|---|
| student_count | 500 | 2,500 | UNLIMITED |
| staff_count | 50 | 250 | UNLIMITED |
| branch_count | 1 | 3 | UNLIMITED |
| email_monthly | 5,000 | 50,000 | UNLIMITED |
| sms_monthly | DISABLED | 10,000 | UNLIMITED |
| whatsapp_monthly | DISABLED | 5,000 | UNLIMITED |
| storage_bytes | 10 GiB | 100 GiB | UNLIMITED |

| TOGGLE key | STARTER | GROWTH | ENTERPRISE |
|---|---|---|---|
| parent_portal | ENABLED | ENABLED | ENABLED |
| student_portal | DISABLED | ENABLED | ENABLED |
| payroll | DISABLED | DISABLED | ENABLED |
| accounting | DISABLED | DISABLED | ENABLED |
| advanced_reporting | DISABLED | ENABLED | ENABLED |
| multi_branch | DISABLED | ENABLED | ENABLED |
| event_management | ENABLED | ENABLED | ENABLED |

The application-side `PlanFeatureSeeder` upserts these on every boot. Idempotent — drift between seed values and the DB is corrected on resync.

### 5.4 Hotfix 15.0.2 — BIGINT for `limit`

Sprint 15 originally declared `plan_features.limit` as `INT`. INT caps at 2,147,483,647 (~2.1 GB), which silently clipped the STARTER and GROWTH `storage_bytes` seed values (10 GiB and 100 GiB) on first boot. Migration `20260629000000_subscription_plan_feature_limit_bigint` widens the column to `BIGINT NULL` and repairs clipped rows.

**Boundary convention.** The DB stores `BIGINT`. `PlanFeatureRepository` accepts and returns `number | null` to the rest of the codebase — `BigInt(number)` on write, `safeBigIntToNumber(bigint)` on read. The narrowing helper **throws RangeError** on values above `Number.MAX_SAFE_INTEGER` (≈ 9 PB). Practical headroom:
- Every non-storage LIMIT key (counts, monthly message quotas) fits comfortably under 2^31.
- `storage_bytes` is safe up to ~9 PB; any realistic upgrade path is covered.

If future storage tiers ever cross 9 PB, the narrowing helper fails loudly rather than silently truncating — callers either widen to bigint end-to-end or split into a different unit (GB/TB).

---

## 6. SchoolUsage and the UsageEvent ledger

### 6.1 SchoolUsage (singleton per school)

Mutable counters reflecting the *current* usage window:

```
studentCount, staffCount, branchCount               -- Int counters
smsUsedThisPeriod, whatsappUsedThisPeriod,
emailUsedThisPeriod                                 -- Int counters
storageBytesUsed                                    -- BigInt counter
usagePeriodStart, usagePeriodEnd                    -- Date window
lastRecomputedAt                                    -- Timestamp(3)
```

Not soft-deleted (deletion would orphan the running window). Not append-only (counters mutate on every consume).

### 6.2 UsageEvent (delta ledger)

Append-only journal of every consume/release:

```
schoolId, featureKey, delta (signed Int), actorUserId, sourceRef, occurredAt
```

`sourceRef` is a free-form pointer such as `student:<id>` so audit can trace back to the originating row.

### 6.3 Recompute reconciliation

`SchoolUsageService.recompute(schoolId)` is the drift-fix path: read every `UsageEvent` since `usagePeriodStart`, sum per-feature, write back to `SchoolUsage`, set `lastRecomputedAt`. Used when an outage or bug suspect causes the aggregate to drift from the ledger.

Recompute does NOT cross the period boundary. Window rollover is a future-sprint concern (see §13).

---

## 7. Threshold notifications

### 7.1 Edge-trigger semantics

`UsageThresholdState` stores `(schoolId, featureKey, lastNotifiedThreshold, lastNotifiedAt, currentPercent)`. The threshold helper `deriveBand(percent)` maps percent → band:
- 0–79 → `null` (no band)
- 80–89 → `THRESHOLD_80`
- 90–99 → `THRESHOLD_90`
- 100+ → `LIMIT_REACHED`

`tryAdvanceBand(schoolId, featureKey, newBand, newPercent)` is a compare-and-set: if `newBand` is strictly above `lastNotifiedThreshold`, persist and return `crossed=true`. Same band → no-op.

Outcome: each band fires `USAGE_THRESHOLD_REACHED` **at most once per band per window**. Repeated consumes within the same band do not re-fire.

### 7.2 Reset semantics

`UsageThresholdState` does **not** auto-reset on period rollover. Resetting `lastNotifiedThreshold = null` when `SchoolUsage.usagePeriodStart` advances is deferred to a future sprint (§13).

---

## 8. SubscriptionGuardService

`backend/src/core/subscription/guard/subscription-guard.service.ts` — the single entry point that all feature modules call.

### 8.1 Public API

| Method | Purpose | Throws |
|---|---|---|
| `checkPlanStatus(schoolId, tx?)` | Returns the active subscription. | `SubscriptionInactiveError` if no active row or status not in {TRIAL, ACTIVE, EXPIRING}. |
| `checkFeatureAvailability(schoolId, featureKey, tx?)` | Returns mode/limit metadata for a feature on the active plan. | `FeatureNotInPlanError`, `FeatureDisabledError`. |
| `checkLimitAvailability(schoolId, featureKey, tx?)` | Returns `{used, limit, remaining, percent, capped}` for a LIMIT feature without consuming. | as above. |
| `checkUsageRemaining(schoolId, featureKey, by, tx?)` | Returns `true` iff there is headroom for `by` units. | as above. |
| `assertAndConsume(schoolId, featureKey, by, sourceRef?)` | Atomic gate + counter bump in a single transaction. Throws on over-limit unless `ENFORCE_LIMITS` flag is off (then logs only). | `FeatureLimitExceededError`. |

### 8.2 `assertAndConsume` semantics

Wrapped in `prisma.transaction()`. On each call:
1. Load active Subscription (throws `SubscriptionInactiveError` if none usable).
2. Load `PlanFeature` for `featureKey` (throws `FeatureNotInPlanError`/`FeatureDisabledError`).
3. Read `SchoolUsage` snapshot, compute `projected = used + by`.
4. If `mode = LIMITED` and `enforce` flag on and `projected > limit`: publish `USAGE_LIMIT_EXCEEDED` outbox event and throw `FeatureLimitExceededError`.
5. Atomic bump on the matching `SchoolUsage` column (BigInt for `storage_bytes`, Int for everything else).
6. Append `UsageEvent` delta.
7. Recompute percent; if band advanced, publish `USAGE_THRESHOLD_REACHED` (gated by `NOTIFY_THRESHOLDS` flag).

### 8.3 Feature flags

- `subscription.enforce_limits` — when off, over-limit consume is logged but allowed (useful for migration windows).
- `subscription.notify_thresholds` — when off, threshold band advances are recorded but not published.

### 8.4 Future hook points (Sprint 16+)

Documented in the Sprint 15 plan, **now wired in Sprint 16** (see §13.5 and DECISIONS D-032):
- `StudentService.create` → `assertAndConsume(schoolId, 'student_count', 1, 'student:<id>')`
- `StaffService.create` → `assertAndConsume(schoolId, 'staff_count', 1, 'staff:<id>')`
- `BranchService.create` → `assertAndConsume(schoolId, 'branch_count', 1, 'branch:<id>')`
- `FileStorageService.upload` → `assertAndConsume(schoolId, 'storage_bytes', byteDelta, 'file:<id>')`

Sprint 16 also added the global `SubscriptionWriteGuardInterceptor` and the `@AllowWhenInactive()` opt-out decorator — see §13.5 §D.

---

## 9. Expiry behavior

A school's Subscription status drives what feature modules can do. The SubscriptionGuardService treats `{TRIAL, ACTIVE, EXPIRING}` as **usable**; anything else throws `SubscriptionInactiveError`.

| Status | Reads | Writes (feature modules) | Notes |
|---|---|---|---|
| PENDING | blocked | blocked | Plan assigned, not yet onboarded. |
| TRIAL | allowed | allowed (subject to limits) | Same feature gates as ACTIVE. |
| ACTIVE | allowed | allowed (subject to limits) | Steady state. |
| EXPIRING | allowed | allowed (subject to limits) | Soft warning state ahead of expiry. |
| EXPIRED | blocked | blocked | Subscription lapsed. School-admin login still permitted (see §9.1). |
| SUSPENDED | blocked | blocked | Platform-initiated freeze (compliance, dispute). |
| CANCELLED | blocked | blocked | Terminal. |

### 9.1 Expired vs Suspended — school behavior

Both states block feature-module operations via `SubscriptionGuardService`. They differ in **intent and reversibility**:

- **EXPIRED** is a passive lapse. The school can self-recover by reactivating (path is owned by the future Billing Foundation; in Sprint 15 it requires platform action). School-admin login remains permitted so the user can see *why* the app is read-only and what to do about it.
- **SUSPENDED** is an active intervention by the platform (legal, compliance, payment dispute). The school cannot self-recover; reactivation requires platform sign-off. School-admin login is still permitted to view the suspension notice.

In both states, the **school's underlying data is preserved**. No automatic archival happens at the Subscription layer — data retention is owned by the school `LifecycleStatus` (Sprint 14) and the future DPDP retention sprint.

### 9.2 Expiry scheduler

`SubscriptionExpiryJobHandler` is registered with a `JobDefinition` (daily 03:00). It walks Subscription rows whose `expiry_date < now` and `status in {TRIAL, ACTIVE, EXPIRING}`, transitions them to `EXPIRED`, and writes `SubscriptionHistory` + an `SUBSCRIPTION_EXPIRED` outbox event. The actual cron firing depends on the Sprint 14.1 JobScheduler infrastructure.

---

## 10. Notification event keys + outbox topics

Lifecycle (10): `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_EXPIRING`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_SUSPENDED`, `SUBSCRIPTION_REACTIVATED`, `SUBSCRIPTION_CANCELLED`, `PLAN_UPGRADED`, `PLAN_DOWNGRADED`, `PLAN_RENEWED`, plus assignment.

Usage (2): `USAGE_THRESHOLD_REACHED` (single generic event with payload `{featureKey, percent, used, limit, band}`), `USAGE_LIMIT_EXCEEDED`.

Outbox topics live under the `subscription.*` namespace and are routed by the outbox dispatcher. See `subscription.constants.ts` for the canonical list.

---

## 11. Permissions (24 keys)

Permission seeder upserts 24 keys at boot under the `subscription.*` namespace, grouped:

- `plan_feature.*` (5): read, create, update, delete, bulk_replace
- `subscription.*` super-admin (10): read, history.read, assign, activate, upgrade, downgrade, renew, suspend, reactivate, cancel
- `subscription.self_read` (1)
- `usage.*` super-admin (3): read, recompute, events.read
- `usage.self_read` (1)
- `feature_flag.*` (2): read, update
- `guard.*` (2): check_plan, check_feature

PLATFORM_ADMIN (from Sprint 14.1) auto-inherits `subscription.*` via wildcard.

---

## 12. Integration with existing modules

### 12.1 School provisioning hook

`school-provisioning.service.ts` calls `SubscriptionService.assignInitialSubscription(schoolId, planId, 'TRIAL')` inside the provisioning transaction. The entitlement bootstrap reads `PlanFeature(email_monthly | sms_monthly | whatsapp_monthly)` first, falling back to flat `Plan.*` columns when no PlanFeature row exists.

### 12.2 Communication entitlement

`SchoolCommunicationEntitlement.assertAndIncrement` is unchanged by Sprint 15 — it just sees richer (PlanFeature-sourced) limits at provisioning time. PlanFeature is the canonical going-forward source; flat `Plan.push_*` columns are dormant but kept for backcompat.

### 12.3 Schools denorm sync

On `assign / upgrade / downgrade / cancel`, `SubscriptionService` keeps `schools.plan_id`, `schools.plan_assigned_at`, `schools.plan_expires_at`, `schools.plan_status` in sync inside the same transaction. Re-syncs `SchoolCommunicationEntitlement` channel limits from new PlanFeature rows.

---

## 13. Deferred / known gaps

- **No billing or invoices.** Owned by the future Billing Foundation (see `BILLING_AND_SUBSCRIPTIONS.md`).
- **No payment gateway.** Razorpay/Stripe integration is Billing scope.
- **No real cron runner for expiry.** Job handler is registered + JobDefinition seeded; actual firing depends on Sprint 14.1 scheduler.
- **No threshold reset on period rollover.** `UsageThresholdState` retains the last band indefinitely. Resetting on `SchoolUsage.usagePeriodStart` advance is a future-sprint hook.
- **No proration math.** Plan changes apply immediately; partial-period accounting is Billing-scope.
- **No customer-facing self-serve upgrade UI.** Super-admin assigns plans for Sprint 15.
- **Plan.pushEnabled vs Entitlement.whatsappEnabled asymmetry** unresolved — PlanFeature is canonical, flat `Plan.push_*` columns are dormant. Future rename sprint.
- **Subscription vs School.lifecycleStatus dual state** intentionally not collapsed (subscription = plan-state, lifecycle = school-state).

---

## 13.5 Sprint 16 — Enforcement wiring

Canonical decision record: DECISIONS D-032 (Subscription Enforcement + WriteGuard). Sprint 15 shipped the guard service but wired it to nothing. Sprint 16 closes the gap by wiring the guard into the four metered domains, tracking usage on create AND delete, and adding a global write-guard interceptor that blocks tenant mutations when subscription status is not usable. No new schema, no billing.

### §A. Enforcement points

| Domain      | Service entry                                  | Feature key      | Consume                   | Release                                    |
|-------------|------------------------------------------------|------------------|---------------------------|--------------------------------------------|
| Student     | `StudentService.create` / `softDelete`         | `student_count`  | inside outer `tx`         | inside `softDelete` tx                     |
| Staff       | `StaffService.create` / `softDelete`           | `staff_count`    | inside self-tx            | inside self-tx                             |
| Branch      | `BranchService.create` / `delete`              | `branch_count`   | inside self-tx            | inside self-tx                             |
| FileStorage | `FileAssetService.upload` / `softDelete`       | `storage_bytes`  | gate tx (own)             | best-effort, post-tx (compensating)        |

When `RequestContext.schoolId` is `undefined` (platform-side ops, batch jobs without a tenant), the guard call is skipped — only tenant-scoped writes are metered.

### §B. Status behavior matrix

| Status     | Login | Read | Reports/Export | Create/Update/Delete | SMS/WhatsApp | Premium features |
|------------|:-----:|:----:|:--------------:|:--------------------:|:------------:|:----------------:|
| TRIAL      | ✓     | ✓    | ✓              | ✓ (subject to limits)| ✓ (per plan) | ✓ (per plan)     |
| ACTIVE     | ✓     | ✓    | ✓              | ✓ (subject to limits)| ✓ (per plan) | ✓ (per plan)     |
| EXPIRING   | ✓     | ✓    | ✓              | ✓ (subject to limits)| ✓ (per plan) | ✓ (per plan)     |
| EXPIRED    | ✓     | ✓    | ✓              | ✗ (write-guard 409)  | ✗            | ✗                |
| SUSPENDED  | ✓     | ✗*   | ✗              | ✗ (write-guard 409)  | ✗            | ✗                |
| CANCELLED  | ✓     | ✗*   | ✗              | ✗ (write-guard 409)  | ✗            | ✗                |

*Sprint 16 enforces the write block for SUSPENDED/CANCELLED identically to EXPIRED. Stricter read-gating for SUSPENDED/CANCELLED (matching the spec's "block all operational access") requires a separate read-guard decision — deferred.

`SubscriptionInactiveError` carries `ERROR_CODES.STATE_INVALID` which maps to HTTP 409 via the global filter. The behaviour is "the subscription state forbids this write" — clients should surface a renewal/upgrade prompt.

### §C. Usage tracking lifecycle

- **Consume** on create: `assertAndConsume(schoolId, featureKey, by, sourceRef, tx)` joins the create tx via the outer-`tx` overload. A limit error rolls back the row insert atomically. Over-limit attempts never persist.
- **Release** on soft-delete: `releaseUsage(schoolId, featureKey, by, sourceRef, tx)` joins the soft-delete tx, decrements the counter via `incrementColumn(-by)`, and appends a negative-delta `UsageEvent`.
- **Recompute**: `SchoolUsageService.recompute()` sums signed `UsageEvent.delta` — negative rows are first-class.
- **No band reset on release**: deliberately unchanged. A school dropping from 95% → 70% will not re-trigger an 80% notification when it later climbs back through 80%. Consistent with §13 "no threshold reset" semantics.
- **FileStorage atomicity**: `storage.put` is NOT transactional with the DB. The upload sequence is `assertAndConsume → storage.put → assetRepo.create`. If `storage.put` throws, the consume is compensated by a `releaseUsage` call. If `assetRepo.create` throws, both the consume AND the put are compensated (best-effort `storage.delete`). Orphan S3 objects from rare double-failure paths are out of scope for Sprint 16.

### §D. Global write-guard interceptor

`SubscriptionWriteGuardInterceptor` is registered as `APP_INTERCEPTOR` in `core.module.ts` and runs before every HTTP handler:

1. Read methods (`GET` / `HEAD` / `OPTIONS`) → bypass.
2. Platform context (no `schoolId` in `RequestContext`) → bypass (super-admin lifecycle ops must not self-block).
3. Handler/class carries `@AllowWhenInactive()` → bypass.
4. Otherwise → call `guard.assertMutationAllowed(schoolId)` which throws `SubscriptionInactiveError` when status ∉ `{TRIAL, ACTIVE, EXPIRING}`.

Controllers opted out via `@AllowWhenInactive()`:

| Controller                                | Reason                                                                 |
|-------------------------------------------|------------------------------------------------------------------------|
| `AuthController`                          | A locked-out admin must still log in to manage the subscription.       |
| `PasswordResetController`                 | Same: credential recovery must remain reachable.                       |
| `SubscriptionController` (super-admin)    | Defensive — invoked by platform users; ensures reactivate/cancel work. |
| `SchoolLifecycleController` (super-admin) | Defensive — same rationale.                                             |

### §E. Notification mappings (no code change — Sprint 15 already registers)

| User-named event            | Existing key               | Source                                    |
|----------------------------|----------------------------|-------------------------------------------|
| Subscription Limit Reached | `USAGE_LIMIT_EXCEEDED`     | subscription-notification.bootstrap.ts    |
| Subscription Expiring Soon | `SUBSCRIPTION_EXPIRING`    | subscription-notification.bootstrap.ts    |
| Subscription Expired       | `SUBSCRIPTION_EXPIRED`     | subscription-notification.bootstrap.ts    |

### §F. New guard API additions (Sprint 16)

- `assertMutationAllowed(schoolId, tx?)` — status-only check, throws `SubscriptionInactiveError` for non-usable statuses. Used by the interceptor and any delete path that must block on inactive status without consuming a limit.
- `releaseUsage(schoolId, featureKey, by, sourceRef?, tx?)` — decrements the counter and appends a negative-delta `UsageEvent`. Blocks on inactive status. Clamps `by` to current counter value to avoid driving negative on race.
- `assertAndConsume(..., tx?)` — outer-tx overload. When `tx` is passed, the guard joins the caller's transaction instead of opening its own, so a downstream rollback unwinds the consume atomically.

---

## 14. Critical files

- `backend/prisma/schema/subscriptions.prisma` — schema.
- `backend/prisma/schema/migrations/20260628000000_subscription_foundation/` — initial migration.
- `backend/prisma/schema/migrations/20260629000000_subscription_plan_feature_limit_bigint/` — Hotfix 15.0.2.
- `backend/src/core/subscription/` — module root.
- `backend/src/core/subscription/plan-feature/feature-keys.ts` — canonical key catalog.
- `backend/src/core/subscription/guard/subscription-guard.service.ts` — guard entry point.
- `backend/src/core/subscription/subscription/subscription-transitions.ts` — state machine.
- `backend/src/core/subscription/subscription.constants.ts` — permissions, topics, event keys, flags.
