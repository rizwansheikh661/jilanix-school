# Billing DI Fix Report

**Date:** 2026-06-28
**Scope:** One-line backend DI repair so `npm run start:dev` boots cleanly. No
behavioural changes to Billing, Subscription, or any other module.

## 1. Root Cause

`BillingSubscriptionIntegrationService` (constructor at
`backend/src/core/billing/subscription-integration/billing-subscription-integration.service.ts:55`)
injects `SubscriptionService` as its first dependency:

```ts
constructor(
  private readonly subscriptionService: SubscriptionService,
  private readonly invoiceService: InvoiceService,
  private readonly accountService: BillingAccountService,
  private readonly settingsService: BillingSettingsService,
) {}
```

`SubscriptionService` is provided by `SubscriptionModule` (`subscription.module.ts:51, 80, 96`)
and IS exported (`subscription.module.ts:93-102`). However:

- `SubscriptionModule` is **not** `@Global`.
- `BillingModule` (`billing.module.ts:66-72`) did **not** import
  `SubscriptionModule`.

Result at boot:

```
UnknownDependenciesException: Nest can't resolve dependencies of the
BillingSubscriptionIntegrationService (?, InvoiceService,
BillingAccountService, BillingSettingsService). Please make sure that the
argument SubscriptionService at index [0] is available in the BillingModule
module.
```

## 2. Diagnostic Checklist

| # | Question | Finding |
|---|----------|---------|
| 1 | Is `SubscriptionModule` imported into `BillingModule`? | **No** — that was the gap. |
| 2 | Is `SubscriptionService` exported from `SubscriptionModule`? | Yes (`subscription.module.ts:96`). |
| 3 | Is there a circular dependency? | **No.** `subscription/**` only references the `BillingCycleValue` *type* from `subscription.types.ts:20` — no import from `core/billing/**` exists. Verified by grep across `core/subscription`. |
| 4 | Is `forwardRef()` required? | No — confirmed by (3). A plain import is sufficient. |
| 5 | Is a provider registered incorrectly? | No — `BillingSubscriptionIntegrationService` itself is correctly listed in `BillingModule.providers` and `BillingModule.exports`. |
| 6 | Is an import/export missing? | **Yes** — `SubscriptionModule` missing from `BillingModule.imports`. |

## 3. Files Modified

| Path | Change |
|------|--------|
| `backend/src/core/billing/billing.module.ts` | Added `import { SubscriptionModule } from '../subscription/subscription.module';` and appended `SubscriptionModule` to the `imports` array. No providers, controllers, exports, or other modules altered. |

Diff summary (logically):

```ts
// imports section
imports: [
  FeatureFlagModule,
  OutboxModule,
  NotificationsModule,
  SequencesModule,
  SubscriptionModule,   // ← added
],
```

## 4. Why the DI Failed

NestJS resolves provider dependencies by walking the importing module's
`imports` graph. `BillingSubscriptionIntegrationService` is declared in
`BillingModule`, so when Nest constructs it, the container only considers
providers visible to `BillingModule` — its own `providers` plus any
provider re-exported by a module in its `imports` (transitively, but only
through `exports`, not `providers`).

`SubscriptionService` is exported by `SubscriptionModule`, but
`SubscriptionModule` was not in `BillingModule.imports` and is not
`@Global`. Therefore the token `SubscriptionService` was not in the
visible set, and Nest threw `UnknownDependenciesException` at boot.

## 5. Resolution

Added `SubscriptionModule` to `BillingModule.imports`. No `forwardRef` is
needed because the dependency graph is one-directional:

- `BillingModule` → uses `SubscriptionService` (already true at runtime).
- `SubscriptionModule` → does **not** import anything from
  `core/billing/**` (verified by grep — only type references to
  `BillingCycleValue`, which lives inside `core/subscription` itself).

This is the minimum-surface fix the original W1.1 report (§9) recommended
as a follow-up.

## 6. Verification

### TypeScript

```
> npx tsc --noEmit
test/sprint14/helpers.ts(122,20): error TS2554: Expected 6 arguments, but got 4.
test/sprint4_5/branch.e2e-spec.ts(65,15): error TS2554: Expected 3 arguments, but got 2.
```

Two errors, both **pre-existing** test-fixture drift unrelated to this
fix (already documented in `docs/AUTH_W1_1_IMPLEMENTATION_REPORT.md` §8).
No new errors introduced by this change. Production `src/**` compiles
with zero errors.

### Build

```
> npm run build

> schoolos-api@0.1.0 prebuild
> rimraf dist

> schoolos-api@0.1.0 build
> nest build
```

Exit code 0. `nest build` completed with zero errors.

### Boot (`npm run start:dev`)

```
[12:55:07] Starting compilation in watch mode...
[12:55:48] Found 0 errors. Watching for file changes.
...
INFO  Nest application successfully started   {"context":"NestApplication"}
[bootstrap] schoolos-api@0.1.0 listening on http://127.0.0.1:3000
```

Application boots cleanly. The previous `UnknownDependenciesException` is
gone. No new DI errors appeared during boot.

## 7. Stop Point

Backend startup is restored. Per instructions, **Authentication Wave
W1.2 is not resumed in this report**.
