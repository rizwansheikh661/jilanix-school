# DECISIONS

Architecture Decision Records (ADRs). Each entry captures the call we made, the alternatives we rejected, and the consequences. New decisions are appended; old decisions are not edited (they are superseded by new ones).

Format: `D-NNN — Title — Status — Date`. Statuses: `Accepted`, `Superseded`, `Open`, `Risk-Accepted`.

---

## D-001 — Multi-tenancy via shared DB + `school_id` — Accepted — 2026-06-16

**Context.** We need to serve 1000+ schools without per-tenant operational overhead.

**Decision.** Shared MySQL, shared schema, `school_id` column on every domain row. Tenancy enforced by Prisma middleware + service-layer guard + tests + production canary (defense in depth).

**Alternatives rejected.**
- DB-per-tenant: connection-pool explosion, migration nightmare.
- Schema-per-tenant: MySQL has no real schemas; equivalent to DB-per-tenant.
- Postgres + RLS: would let the DB enforce isolation, but we're on MySQL per stack constraint.

**Consequences.**
- Isolation is application-enforced — must be airtight at every layer.
- One migration runs once for everyone — faster but riskier.
- BI / cross-tenant queries are not free; isolated in AdminModule.

**Trigger to revisit.** Cross-tenant leak incident, or > 1000 tenants forcing sharding (then we'll layer sharding on the existing model rather than re-architect).

---

## D-002 — Sub-domain per tenant, with path-based fallback — Accepted — 2026-06-16

**Context.** How do users reach their tenant?

**Decision.** Primary: `<slug>.schoolos.in`. Fallback: `app.schoolos.in/<slug>`. JWT is still the source of truth for tenant; URL is for branding and clarity.

**Alternatives.** Path-only (`app.schoolos.in/<slug>`) — works but hurts brand and SSO ergonomics. Sub-domain-only — DNS provisioning friction.

**Consequences.**
- Wildcard TLS cert (Let's Encrypt with DNS challenge or ACM).
- Sub-domain provisioning step in tenant creation.
- We will accept both during migrations.

---

## D-003 — Razorpay as primary billing provider — Accepted — 2026-06-16

**Context.** Indian-rupee billing for school customers; UPI, NACH, card support.

**Decision.** Razorpay Subscriptions for recurring; Razorpay Orders / Payment Links for ad-hoc. Stripe is a future fallback for non-INR only.

**Alternatives.** Stripe-India (limited UPI/NACH coverage in v1 timeline), Cashfree (smaller ecosystem), PayU (older API). Razorpay best fits SaaS subscription needs for INR.

**Consequences.**
- Single-vendor risk: mitigated by a `PaymentProvider` interface and idempotent webhook handlers.
- Razorpay outage = collection outage; offline payment recording must always work.

---

## D-004 — Notification provider abstraction with per-tenant fallback — Accepted — 2026-06-16

**Context.** SMS, WhatsApp, Email all have multiple providers and India-specific compliance (DLT, sender IDs, template approvals).

**Decision.** Define `NotificationProvider` per channel; concrete adapters: MSG91 (SMS primary), Gupshup or Meta Cloud (WhatsApp), SES + SendGrid (Email), FCM/APNs (Push). Tenant-level provider selection with a fallback chain.

**Consequences.**
- We must maintain provider-specific compliance pipelines (DLT template approval for SMS, WABA template approval for WhatsApp).
- Migration cost is bounded — switching MSG91 → Karix is an adapter swap.

---

## D-005 — UUID v7 primary keys — Accepted — 2026-06-16

**Context.** Auto-incrementing IDs leak tenant size and complicate sharding; random UUID v4 fragments indexes.

**Decision.** UUID v7 (time-sortable, ~128 bits) stored as `CHAR(36)` initially. May migrate to `BINARY(16)` if size becomes a measurable cost.

**Consequences.**
- Index size larger than int IDs.
- IDs are opaque, safe to expose externally, stable across shards.

**Exception.** Gap-free sequences (invoices, receipts, TCs) use a separate `seq` column on top of the UUID PK, generated via the `tenant_sequences` table — see DATABASE_STRATEGY §7.

---

## D-006 — INR stored as integer paise — Accepted — 2026-06-16

**Context.** Floating-point money is a bug waiting to happen.

**Decision.** All money stored as `BIGINT` paise (INR × 100). DTOs document this; UI converts to formatted strings.

**Consequences.** No floating-point drift. Migrations to multi-currency (later) keep the integer-minor-units pattern.

---

## D-007 — Region: ap-south-1 (Mumbai) — Accepted — 2026-06-16

**Context.** DPDP Act + latency to Indian users.

**Decision.** All primary data in ap-south-1. DR copies in ap-south-2 or ap-southeast-1 (decision deferred until cost analysis at scale).

**Consequences.** No US/EU latency for v1. Compliance simpler. International expansion is a non-trivial future step.

---

## D-008 — Mobile: responsive web first, native app in Phase 8 — Accepted — 2026-06-16

**Context.** Native apps multiply maintenance cost. We don't yet know which 5 screens parents actually use.

**Decision.** v1 ships responsive web (mobile-first). React Native parent app in Phase 8, after we've watched real parents for 3+ months.

**Consequences.** Architecture must not block native: REST APIs, JWT auth that works on native, file uploads via signed URLs, push tokens stored per device.

---

## D-009 — Soft delete via `deleted_at` — Accepted — 2026-06-16

**Decision.** Default Prisma middleware filters `deleted_at IS NULL`. Hard delete only via export-and-purge job for DPDP "right to erasure" and archival.

**Consequences.** Audit log preserves history. Unique indexes that should ignore soft-deleted rows must include `deleted_at` in the constraint or use partial uniqueness — manage per table.

---

## D-010 — Prisma middleware as primary tenancy enforcer — Accepted — 2026-06-16

**Context.** We need automatic injection of `school_id` filters/values.

**Decision.** Prisma client middleware. Models opt in via a registry; allow-list for platform-level models. Bypass requires typed `runWithoutTenantScope(reason, fn)`.

**Risk-accepted.** A buggy middleware change could turn off enforcement. Mitigation: cross-tenant integration tests run on every PR; production canary.

---

## D-011 — Audit log shared table, partitioned by month — Accepted — 2026-06-16

**Decision.** Single `audit_log` table with `school_id` (nullable for platform actions). Physical partitions monthly.

**Alternatives.** Per-tenant audit table (operationally heavy). External log store like CloudWatch (queryability poor for support).

**Consequences.** Grows fast; partitioning + retention policy required from day one. Append-only — no UPDATE permission to the application.

---

## D-012 — Gap-free invoice/receipt numbering via tenant_sequences table — Accepted — 2026-06-16

**Context.** Indian audit law expects gap-free numbering.

**Decision.** A `tenant_sequences(school_id, sequence_name, fiscal_year, last_value)` table. Atomic UPDATE in the same transaction as the insert.

**Consequences.** Single hot row per (tenant, FY, sequence). Acceptable throughput at expected scale (no school issues invoices at high TPS).

---

## D-013 — Cursor pagination by default — Accepted — 2026-06-16

**Decision.** Cursor-based for large datasets; offset only for small/static.

**Consequences.** Stable iteration even as rows are inserted; O(1) deep paging.

---

## D-014 — Optimistic locking via `version` column on contested entities — Accepted — 2026-06-16

**Decision.** `marks`, `attendance`, `fee_structures`, `timetable` carry `version`. 409 on conflict.

**Consequences.** Clients (UI) must handle 409 gracefully (re-fetch, merge).

---

## D-015 — Super Admin scope kept strictly out of tenant routes — Accepted — 2026-06-16

**Decision.** JWT `scope: "global"` is rejected by tenant guards. Admin operates via `/v1/admin/*` only. Impersonation issues a tenant-scoped, short-lived token with `impersonator_user_id` claim.

**Consequences.** No accidental cross-tenant queries from forgotten Super Admin sessions. Impersonation always audit-logged.

---

## D-016 — Feature flags: plan-default → tenant-override → role-override (rare) — Accepted — 2026-06-16

**Decision.** Three-layer resolution. Resolver service is the single source of truth. Operator console toggles override layer.

**Consequences.** No "is feature on?" logic scattered in code. New module → register flag → done. Cleanup discipline required (see flag lifecycle in MODULES F6).

---

## D-017 — Plan changes effective immediately; downgrades apply next cycle — Accepted — 2026-06-16

**Decision.** Upgrades prorated and effective now. Downgrades scheduled for end-of-cycle. No refund of unused upgrade portion below feature parity.

**Consequences.** Avoids gaming the system; predictable revenue recognition.

---

## D-018 — DPDP compliance baked into product, not bolted on — Accepted — 2026-06-16

**Decision.** Parental consent captured during admission; "right to access" via per-tenant export; "right to erasure" via the standard purge pipeline; data residency in India.

**Risk-open.** DPDP regulations are still being interpreted; we maintain a monitoring rotation and a quarterly compliance review.

---

## D-019 — One tenant = one subscription = one plan (v1) — Accepted — 2026-06-16

**Decision.** Multi-branch tenants get one plan covering all branches. Per-branch plans deferred to v2+.

**Consequences.** Chains may resist; we accept the trade-off for v1 simplicity.

---

## D-020 — Tenant cache invalidation on state/plan change — Accepted — 2026-06-16

**Decision.** Any change to tenant status (`active` → `suspended` etc.) or plan (flag set) publishes a `tenant.invalidated` event; cache layer flushes the tenant's keys; in-process caches expire on next request.

**Consequences.** Slight latency spike right after a state change; correctness over speed.

---

## D-021 — Audit log tamper-evidence — Open — 2026-06-16

**Context.** Financial actions deserve cryptographic non-repudiation.

**Options.**
- A: Append a hash-chain (`hash = SHA256(prev_hash || row)`); store the latest hash daily into a WORM-policy S3 bucket.
- B: Stream audit rows to an immutable log store (e.g., CloudWatch Logs with retention lock).
- C: Status quo — append-only application semantics, no cryptographic chain.

**Working position.** Option A for the financial subset (invoices, receipts, refunds, mark edits, fee waivers) by Phase 4 launch; Option C for the rest. Decision finalized when Phase 4 specs are written.

---

## D-022 — Mobile token storage on native apps — Open — 2026-06-16

**Working position.** Refresh token in OS Keychain (iOS) / EncryptedSharedPreferences (Android). Access token in memory only. Biometric unlock for app entry on the parent app.

**Pending.** WebAuthn / passkeys evaluation when native app is scoped (Phase 8).

---

## D-023 — Search engine choice — Open — 2026-06-16

**Options.** MySQL FULLTEXT (cheap, limited), Postgres FTS (would mean swapping DB), OpenSearch (powerful, ops cost), Typesense (newer, lighter).

**Working position.** MySQL FULLTEXT for Phase 1–3 tenant-scoped search. Re-evaluate at Phase 6 when search shows up as a UX bottleneck.

---

## D-024 — Tenant restore primitive — Open — 2026-06-16

**Context.** Today we have only DB-wide PITR. Real-world ask: "Restore this one tenant to yesterday at 14:00."

**Options.**
- A: Restore the entire DB to a side instance, then export the tenant's rows and re-insert.
- B: Per-tenant logical exports nightly; restore replays exports + audit log forward.
- C: Adopt a per-tenant CDC pipeline (Debezium → per-tenant snapshots).

**Working position.** Option A as the manual procedure for Phase 1–4. Option B by Phase 7. Option C only if needed at scale.

---

## D-025 — GST e-invoicing automation — Open — 2026-06-16

**Context.** Indian GST e-invoicing required when aggregate turnover crosses ₹5 cr.

**Working position.** Phase 4 ships GST-compliant PDF invoices; Phase 7 integrates with the IRN portal API. Until then, finance team submits manually; the system stores IRN once received.

---

## D-026 — Sharding plan trigger — Risk-Accepted — 2026-06-16

**Decision.** No sharding before 1000 active tenants or a measurable saturation signal. Shard-readiness (no cross-tenant joins, tenant→shard router stub) is maintained from day one.

**Consequences.** A sudden surge of large tenants (10k+ students each) may force earlier sharding; acceptable risk given current scale.

---

## D-027 — School lifecycle modelled as an explicit FSM in `SchoolLifecycleService` — Accepted — 2026-06-21

**Context.** Sprint 14 needed deterministic provisioning + lifecycle transitions (`DRAFT → PROVISIONING → ACTIVE → SUSPENDED → ARCHIVED → DELETED`) with auditability and resumability. Ad-hoc status mutations spread across services would have re-created the same status-drift bugs we've seen elsewhere.

**Decision.** Lifecycle is centralised in `SchoolLifecycleService` with a typed transition table and an idempotent `applyTransition(school, event, actor)` entry point. Every transition writes a `SchoolLifecycleEvent` audit row in the same Prisma transaction as the status mutation, emits an outbox event, and is gated by an explicit `from → to` allow-list. Invalid transitions throw `InvalidLifecycleTransitionError` (→ `STATE_INVALID` / 409).

**Alternatives rejected.**
- Free-form `school.status = '…'` mutations at call sites — loses audit, loses gating.
- A workflow engine (Temporal, Camunda) — over-engineered for a 6-state FSM in v1.

**Consequences.**
- Every status change is a recorded event; the lifecycle journal is queryable.
- Adding a new state (e.g. `TRIAL_GRACE`) is a single edit to the transition table + tests.
- Provisioning failures are recoverable: re-running the saga picks up where the previous attempt stopped without double-emitting outbox events.

**Trigger to revisit.** When a non-linear workflow appears (e.g. parallel sub-states such as billing-state × ops-state); at that point promote to a workflow engine.

---

## D-028 — Subscription lifecycle modelled as a parallel FSM, separate from school lifecycle — Accepted — 2026-06-22

**Context.** Sprint 15 introduced the Subscription Foundation. Subscription status (`PENDING / TRIAL / ACTIVE / EXPIRING / EXPIRED / SUSPENDED / CANCELLED`) has its own transition graph driven by super-admin actions (assign / activate / upgrade / downgrade / renew / suspend / reactivate / cancel) and time (trial-end, period-end). Conflating it with `School.lifecycleStatus` would couple operational decisions ("the school is being archived") with commercial decisions ("the subscription expired").

**Decision.** A second FSM lives in `SubscriptionService` (`backend/src/core/subscription/subscription/subscription.service.ts`). Transitions are gated by an explicit allow-list; each transition writes a `SubscriptionHistory` row in the same transaction and emits a typed outbox event (`SUBSCRIPTION_ASSIGNED / ACTIVATED / UPGRADED / DOWNGRADED / RENEWED / SUSPENDED / REACTIVATED / CANCELLED`). The status used for enforcement is `Subscription.status`, **not** `School.lifecycleStatus`. The two FSMs are kept loosely in sync but stay independent.

**Alternatives rejected.**
- Single combined lifecycle on `School` — would have to encode every (school × subscription) state pair; combinatoric blow-up.
- Status field with no FSM — same drift risk as D-027.

**Consequences.**
- Two FSMs, two histories — a school can be `ACTIVE` while its subscription is `EXPIRED` (read-only mode) or vice versa.
- Documented seam in `SUBSCRIPTION_FOUNDATION.md §13.5 §B` and `D-027`. Future work may unify the two when product semantics demand it.
- Write enforcement (D-032) keys off the subscription FSM, not the school FSM.

**Trigger to revisit.** When product needs an end-to-end "school state" that summarises both dimensions for ops dashboards — then add a derived projection rather than collapsing the underlying FSMs.

---

## D-029 — PlanFeature as the unified entitlement primitive (LIMITED / UNLIMITED / BOOLEAN modes) — Accepted — 2026-06-22

**Context.** Sprint 15 needed a single mechanism for both metered limits (`student_count`, `staff_count`, `branch_count`, `storage_bytes`) and boolean feature gates (SMS, WhatsApp, premium modules). Two parallel tables (one for limits, one for flags) would have required two evaluators, two caches, and two enforcement pipelines.

**Decision.** A single `PlanFeature` row per `(plan_id, feature_key)` with a `mode` discriminator: `LIMITED` (carries a `limit` value), `UNLIMITED`, or `BOOLEAN`. `SubscriptionGuardService` evaluates the row, optionally checks usage against `SchoolUsage`, and is the only place enforcement happens. Tenant-level overrides ride on top via the existing feature-flag layer (D-016) — `PlanFeature` is plan-default; flags are per-tenant override.

**Alternatives rejected.**
- Split tables (`plan_limits` + `plan_flags`) — duplicate code paths.
- JSON blob on `Plan` — opaque to queries; bad for usage reporting.

**Consequences.**
- New entitlements ship as a single row insert; no schema migration per feature.
- Bulk-replace endpoint (`POST /super-admin/plans/:planId/features/bulk`) covers plan re-tiering.
- `BOOLEAN` mode + `limit IS NULL` is rejected at the repo boundary so impossible rows can't be persisted.

**Trigger to revisit.** When a non-numeric, non-boolean entitlement appears (e.g. time-windowed quotas, multi-dimensional limits) — at that point introduce a `mode = COMPLEX` with a typed payload column rather than another table.

---

## D-030 — Communication entitlements gated through PlanFeature, not channel-specific tables — Accepted — 2026-06-23

**Context.** SMS, WhatsApp, and Email channels each have provider-specific compliance pipelines (D-004), but the **entitlement** ("can this tenant send SMS at all? how many credits?") is a plan-level decision. We were tempted to add `tenant_sms_quota`, `tenant_whatsapp_quota`, etc. — each with its own consumption table.

**Decision.** Communication entitlements use the same `PlanFeature` rows + `SubscriptionGuardService` evaluator as everything else. The keys are flat (`sms_enabled`, `whatsapp_enabled`, `email_enabled` for BOOLEAN; future credit caps as LIMITED). Per-send accounting is delegated to the notification module's outbox/job pipeline; the guard only answers "is this allowed at all". No channel-specific entitlement table.

**Alternatives rejected.**
- Per-channel quota tables — duplicates `SchoolUsage` semantics for no gain in v1.
- Hard-coding channel rules in the notification service — defeats plan-driven product packaging.

**Consequences.**
- Sales can repackage SMS/WhatsApp inclusion by editing plan features only.
- Credit-pack purchases (Sprint-17+) will land as `LIMITED` PlanFeature rows with `SchoolUsage` consumption, reusing the existing assertAndConsume pipeline.
- The notification provider layer remains channel-aware (D-004); only the entitlement decision moves out.

**Trigger to revisit.** When SMS/WhatsApp pricing needs per-message-class entitlements (transactional vs promotional with different caps) — extend with a sub-key namespace rather than a new table.

---

## D-031 — Reporting Foundation: ledger-based, async-first, no live read replicas — Accepted — 2026-06-23

**Context.** Sprint 15 shipped the Reporting Foundation: `ReportRun`, `ReportTemplate`, `ReportSchedule`, plus the import/bulk-ops siblings (`ImportJob`, `ImportJobIssue`, `BulkOperation`) and the lightweight `Dashboard` / `DashboardWidget` pair. We needed a place to host long-running report execution without dragging the OLTP cluster down or building a full warehouse.

**Decision.** Reports run **async** against the live MySQL via parameterized templates registered in `ReportTemplate`. Each execution writes a `ReportRun` row (status, params hash, output URL, row count) that survives the job process. Scheduled runs are owned by `ReportSchedule` and dispatched through the standard `Job` queue. No read replica, no OLAP store, no materialized views in v1 — long reports queue, the user gets a `202` and polls the run row.

**Alternatives rejected.**
- Synchronous reports — saturates request workers and breaks the 5s SLA.
- Dedicated OLAP / warehouse (Snowflake, Redshift, ClickHouse) — premature; no scale signal yet.
- Read-replica + sync reports — buys little when reports are still tenant-scoped and small.

**Consequences.**
- Report latency is observable as a queue depth, not a request-time spike.
- The ledger (`ReportRun` history) gives ops a paper trail for "why did this report show different numbers yesterday?".
- Heavy multi-tenant aggregations (BI dashboards) are out of scope until we have demand — at which point a warehouse pipeline is bolted on, not replaced.

**Trigger to revisit.** When (a) any single report regularly exceeds 60s wall-clock, or (b) cross-tenant BI lands on the roadmap — promote to a warehouse-backed pipeline.

---

## D-032 — Subscription enforcement: per-domain `assertAndConsume` + global write-guard interceptor — Accepted — 2026-06-25

**Context.** Sprint 15 shipped the guard service but wired it to nothing. By the end of Sprint 15, a tenant could still create unlimited students, upload past storage caps, and write through an EXPIRED subscription. Sprint 16 was scoped to close that gap **without** new schema, billing, or a payment gateway.

**Decision.** Two-layer enforcement:

1. **Per-domain consume on the create path.** `StudentService.create`, `StaffService.create`, `BranchService.create`, and `FileAssetService.upload` each call `SubscriptionGuardService.assertAndConsume(schoolId, featureKey, by, sourceRef, tx)` **inside the same Prisma transaction** as the row insert. Over-limit attempts roll the insert back atomically. Soft-deletes call the new `releaseUsage(...)` to decrement the counter. `assertAndConsume` was extended with an outer-`tx` parameter so the guard joins the caller's transaction instead of opening its own.
2. **Global write-guard interceptor.** `SubscriptionWriteGuardInterceptor` (registered as `APP_INTERCEPTOR` in `core.module.ts`) blocks all tenant POST/PUT/PATCH/DELETE when `Subscription.status ∉ {TRIAL, ACTIVE, EXPIRING}`. Bypasses: read methods, platform context (no `schoolId`), or a controller carrying `@AllowWhenInactive()` (auth, password-reset, super-admin subscription, school-lifecycle).

FileStorage gets a compensating-release branch because `storage.put` is not transactional with the DB — see SUBSCRIPTION_FOUNDATION §13.5.

**Alternatives rejected.**
- Single global guard with no per-domain consume — couldn't enforce limits, only status.
- Per-domain guards with no global interceptor — every new write endpoint would have to remember to call the guard; defaults would drift.
- Pre-tx guard call (consume → insert) — over-limit attempts would still consume; race-prone.

**Consequences.**
- Inactive-status writes return `STATE_INVALID` (409), not 403. The existing error-code map (D-014 era) wasn't changed to avoid breaking API contracts; documented in `SUBSCRIPTION_FOUNDATION.md §13.5 §B` and `REST_API_DESIGN §13.8`.
- `SUSPENDED` / `CANCELLED` get the write block today; the spec's "block all operational access" (including reads) is **deferred** as a known seam, also in §13.5 §B.
- New write endpoints inherit enforcement for free; opting out is one decorator.
- Threshold notification bands (80% / 90% / LIMIT_REACHED) are **not** reset on release — a school dropping from 95% → 70% won't re-trigger the 80% notification when climbing back. Consistent with Sprint 15.

**Trigger to revisit.** When read-gating for SUSPENDED/CANCELLED becomes a customer demand, or when a metered feature appears that needs a different consume cadence (e.g. per-API-call quotas).

---

## D-033 — Hotfix 15.0.1: reporting stub modules must complete DI graph even when unimplemented — Accepted — 2026-06-24

**Context.** Sprint 15 left committers / parsers / executors as stub providers in the Reporting Foundation. On boot, Nest's DI graph failed to resolve because the stubs were referenced from the module's `exports` array but never declared as `providers`. The result: an unrelated module pulled a reporting symbol and the app refused to start.

**Decision.** Stubs that are exported must be wired into the DI graph as concrete (no-op) providers, not as type-only re-exports. The hotfix added missing `providers` entries to `ReportingModule` so the DI graph is satisfied even while the implementations are placeholders. Architectural rule: **if a module exports a token, it provides the token** — even if the implementation is a stub.

**Alternatives rejected.**
- Remove the exports — would require touching every consumer module to keep the symbol resolvable; high blast radius for a hotfix.
- Tree-shake the unreferenced stubs at module-construction time — too clever; hides real wiring bugs.

**Consequences.**
- Future reporting work upgrades the stubs to real implementations without touching DI.
- Boot-time DI-graph resolution is now part of the smoke test surface.

---

## D-034 — Hotfix 15.0.2: `PlanFeature.limit` widened INT → signed BIGINT — Accepted — 2026-06-24

**Context.** `PlanFeature.limit` was originally `Int` (signed 32-bit). The `storage_bytes` feature needs caps in the GB range — `5_000_000_000` already overflows `INT(11)` (max `2_147_483_647`). The hotfix unblocks any storage-cap plan above ~2 GB.

**Decision.** Migrate `plan_features.limit` to **signed BIGINT** via migration `20260629000000_subscription_plan_feature_limit_bigint`. The Prisma model becomes `BigInt?`. The repository boundary safely narrows BigInt → number for limits known to fit in `Number.MAX_SAFE_INTEGER`, so the rest of the codebase (DTOs, guard, UI) stays on `number`. Storage-bytes consumption keeps using `bigint` end-to-end to avoid precision loss on large counters.

**Alternatives rejected.**
- Store storage caps in a separate `storage_bytes` column on `Plan` — fragments the entitlement model (D-029 wanted one row per `(plan, feature_key)`).
- Store as decimal — overkill; the value is an integer count of bytes.
- Cap storage at 2 GB — product won't ship; STARTER alone targets 5 GB.

**Consequences.**
- Plan limits up to ~9.2 × 10¹⁸ are representable; `storage_bytes` headroom is no longer the bottleneck.
- Boundary narrowing happens once at the repo layer; callers continue to type their limits as `number`. A guard rejects out-of-safe-integer reads with a typed error so we fail loudly rather than truncate.
- `Subscription.limitOverride` (if added later for per-tenant overrides) should also be BIGINT for consistency.

**Trigger to revisit.** When any other counter-typed PlanFeature key needs > 2 GB / > 2 billion units — the column is already wide enough; no further migration needed.

---

## Open risks not yet decisions

- **R-001.** PII encryption KMS choice and per-tenant data-key rotation cadence not yet decided.
- **R-002.** Multi-region DR cost / RPO trade-off un-modelled.
- **R-003.** No formal SLA published to customers; default to "best effort 99.9%" in v1 contracts.
- **R-004.** No legal review of our DPA template; required before paid signups.
- **R-005.** No defined process for "transfer of school account ownership" if the principal/owner changes — added to SCHOOL_ONBOARDING_FLOW and ROLES_AND_PERMISSIONS, but legal/identity verification flow still TBD.
- **R-006.** Whether bring-your-own-domain (`portal.greenwood.edu.in`) is a v1 or v2 feature is unresolved.
- **R-007.** No pricing experiment plan; first paid customers will set anchoring expectations.

Each open risk becomes a decision (D-NNN) when it is resolved.
