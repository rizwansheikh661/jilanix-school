# UI Testing Strategy — SchoolOS Frontend

> **Status:** Frozen testing strategy.
> **Authority:** Binds every frontend sprint. CI gates derive from this document.
> **Companion:** `FRONTEND_UI_SPECIFICATION.md` (standards under test), `API_UI_MAPPING.md` (surface under test), `FRONTEND_SPRINT_PLAN.md` (per-sprint test deliverables).

---

## 1. Test pyramid

```
                Playwright E2E         (≤ 30 scenarios)
              ──────────────────
            Integration + MSW          (per feature, ~100s)
          ──────────────────────
        Component tests                (per shared component)
      ─────────────────────────
    Unit tests                         (utilities, hooks, helpers)
  ────────────────────────────
```

- Many fast unit tests. Fewer integration tests. Even fewer e2e tests.
- E2e is reserved for critical user journeys, not regression of every feature.

---

## 2. Tools

| Layer | Tool | Why |
|---|---|---|
| Unit / hooks | Vitest | Fast Vite-based runner; native TS |
| Component / DOM | React Testing Library | User-centric queries; semantic |
| API mocks | MSW (Mock Service Worker) | Mirrors backend OpenAPI; same handlers used in dev |
| E2E | Playwright | Cross-browser (Chromium + WebKit + Firefox); auto-waits; trace viewer |
| Accessibility | `@axe-core/playwright`, `vitest-axe` | Automated rule scan |
| Visual regression (future) | Playwright screenshots + chromatic-like diff | Deferred to v1.x |
| Performance | Lighthouse CI | Per-portal dashboard target |

---

## 3. Unit testing

Scope:
- Utilities under `lib/`.
- Hooks under `hooks/`.
- Reducers / state machines.
- Status helpers, formatters, validators.

Standards:
- Each `.ts` in `lib/` has a paired `*.test.ts`.
- AAA pattern (Arrange / Act / Assert).
- One assertion concept per test; multiple `expect` calls OK if they describe one behavior.
- No mocking of internal modules unless boundary crossing (e.g., axios).

Coverage target: **≥ 80% statements on `lib/` and `hooks/`**.

---

## 4. Component testing

Scope:
- Foundational components (`components/foundation/*`).
- Form helpers (`<IfMatchForm>`, `<FieldArrayRow>`, `<FileDropzone>`).
- Table components (`<CursorPaginator>`, `<ColumnChooser>`).
- Domain components shared across ≥2 routes.

Standards:
- Use React Testing Library; query by role / label / text — not by class or test id unless unavoidable.
- Cover: default render, loading state, empty state, error state, interaction (click, type, keyboard nav).
- Snapshot tests are forbidden as a primary assertion; use them only for stable, intentionally screenshot-like fixtures (rare).
- Each component test file lives next to the component: `Button.tsx` → `Button.test.tsx`.

Coverage target: **≥ 70% statements on `components/foundation/` and `components/form/`**.

---

## 5. Integration testing (with MSW)

Scope:
- Route-level pages composed of multiple components against a mocked backend.
- Form submission → optimistic update → success / failure cycles.
- TanStack Query interactions (cache, invalidation, refetch).
- Auth refresh cycle.

Standards:
- MSW handlers mirror real backend envelopes (`{ data }`, `{ error: { code, message, traceId } }`).
- One handler file per backend module under `test/msw/handlers/{module}.ts`.
- Tests reset MSW state between cases.
- Tests assert on visible UI (toast appears, status badge changes) — not on internal state.

Coverage target: **≥ 60% statements overall on `app/` route components**.

---

## 6. API mock testing (MSW)

MSW is dual-purpose:
1. **Dev:** can be enabled to run the frontend without backend.
2. **Tests:** every integration test runs against MSW; e2e tests can opt into MSW for stability or hit a seeded backend for realism.

Handler standards:
- Match the backend OpenAPI exactly: paths, status codes, error envelopes, header reads (`If-Match`, `Idempotency-Key`).
- Maintain in-memory store per test to simulate optimistic concurrency (412 when `If-Match` mismatches).
- Maintain idempotency cache per test to assert deduplication.
- Configurable failure modes: `{ shouldFail: true, status: 500 }` flag toggled per scenario.

---

## 7. Playwright E2E

Scope: critical user journeys only (see §13). Not a regression suite for every feature.

Standards:
- One spec per portal under `e2e/portals/`.
- Tests use real backend in staging environment OR seeded MSW in CI; both modes supported.
- Page Object Model — page interactions encapsulated; tests read like prose.
- Authentication shared via `storageState` to avoid logging in per test.
- Each test starts at a deterministic seed (DB reset hook in staging, MSW reset in CI).
- Tests are independent — no shared mutable state across tests.

Browser matrix: **Chromium + WebKit**. Firefox optional (run nightly).

---

## 8. Responsive testing

Standards:
- All Playwright e2e specs run in two viewports: 1280×800 (desktop) + 375×812 (mobile).
- Tablet (768×1024) added for Teacher portal critical journeys.
- Per-portal responsive target per `FRONTEND_UI_SPECIFICATION.md` §19.2:
  - Student & Parent **primary** mobile.
  - Teacher **primary** tablet.
  - Platform & SchoolAdmin **primary** desktop.
- Component-level: snapshot tests at three viewport widths for foundational components are optional but recommended.

---

## 9. Accessibility testing

Standards:
- Every component test runs `axe-core` via `vitest-axe`; zero violations required.
- Every e2e test runs `@axe-core/playwright` post-navigation; zero violations required.
- Keyboard-only flow tested per critical journey (no mouse).
- Color contrast verified in both light and dark themes.
- `prefers-reduced-motion` honoured (test by setting the media query in Playwright).

Failures are blocking. Exemptions require an explicit `axe` rule disable with reason in code review.

---

## 10. Cross-browser testing

| Browser | Engine | Mode | Frequency |
|---|---|---|---|
| Chrome / Edge | Chromium | Full | Every PR |
| Safari (desktop) | WebKit | Full | Every PR |
| Safari (iOS) | WebKit mobile emulation | Critical journeys | Every PR |
| Firefox | Gecko | Smoke | Nightly |
| Chrome Android | Chromium mobile emulation | Critical journeys | Every PR |

IE / legacy Edge: out of scope.

---

## 11. Performance testing

Standards:
- Lighthouse CI runs on each portal's dashboard route in CI.
- Thresholds (production build):
  - Performance ≥ 90.
  - Accessibility ≥ 95.
  - Best Practices ≥ 95.
  - SEO ≥ 90.
- Bundle size budget per route group:
  - `(auth)`: ≤ 150 KB gzipped.
  - `(student)`, `(parent)`: ≤ 250 KB gzipped first load.
  - `(school)`, `(teacher)`, `(platform)`: ≤ 400 KB gzipped first load.
- Web Vitals targets: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 on dashboards.

Regressions block the PR.

---

## 12. Visual regression (future)

Deferred to v1.x. When activated:
- Playwright screenshot diff per design-system page.
- One screenshot per foundational component at default state.
- Baseline updated only via explicit reviewer approval.

---

## 13. Critical user journeys (must always pass)

Each journey runs on Chromium + WebKit, desktop + mobile (where portal-relevant).

### 13.1 Shared
- Login → land on dashboard → logout.
- Forgot password → click email link (intercepted) → reset → login.
- First-login mandatory change password.

### 13.2 Platform
- Operator logs in → provision new school → tenant appears in list.
- Operator opens tenant invoice → records manual payment → invoice flips to PAID.

### 13.3 SchoolAdmin
- Admin creates academic year → term → class → section → subject.
- Admin adds a student → invites parent → invitation sent (outbox row).
- Admin marks a class session's attendance.
- Admin creates a fee invoice → records payment → invoice flips to PAID.
- Admin composes a Communication Center campaign → sends → dispatched.

### 13.4 Teacher
- Teacher logs in → sees today's timetable.
- Teacher marks attendance for one class.
- Teacher assigns homework.

### 13.5 Student
- Student activates account via invite email link.
- Student logs in → views profile + class + section.
- Student toggles a notification preference.

### 13.6 Parent
- Parent activates account via invite email link.
- Parent logs in → switches between children → views fee balance.
- Parent pays a fee invoice (Razorpay or manual flow stub).

Total: ~20 journeys, well under the ≤30 cap.

---

## 14. Per-sprint testing standards

Every feature sprint MUST land:
- **Component tests** for every new shared component introduced.
- **Integration tests** (with MSW) for every new route page added.
- **Unit tests** for every new utility / hook / state helper.
- **Updated MSW handlers** for any new endpoint consumed.
- **E2E spec update** ONLY if the sprint introduces a new critical journey.
- **A11y check** passing for every new component / page.

A sprint is not closeable if any new code lacks tests at the required layer.

---

## 15. Portal-wise testing

Each portal has a dedicated e2e file plus per-page integration tests:

| Portal | E2E spec | Integration coverage |
|---|---|---|
| Shared (auth) | `e2e/portals/auth.spec.ts` | per-page |
| Platform | `e2e/portals/platform.spec.ts` | per-page |
| SchoolAdmin | `e2e/portals/school-admin.spec.ts` | per-page |
| Teacher | `e2e/portals/teacher.spec.ts` | per-page |
| Student | `e2e/portals/student.spec.ts` | per-page |
| Parent | `e2e/portals/parent.spec.ts` | per-page |

---

## 16. Authentication testing

- Valid login → JWT stored, refresh scheduled.
- Invalid credentials → error envelope rendered as toast; no tokens stored.
- Expired access token → silent refresh; original request replays.
- Expired refresh → redirect `/login`; toast on landing.
- Logout → tokens cleared; subsequent request fails 401.
- First-login `mustChangePassword=true` → route guard redirects to `/change-password`.
- Password reset token expiry → error envelope rendered cleanly.
- MFA: scaffold only in v1; flagged behind feature flag.

---

## 17. Permission testing

- For each gated route: `<PermissionGate>` hides children when permission absent.
- Sidebar items hidden when permission absent.
- API-level 403 from a missing permission shows toast + inline 403 panel.
- Permission-changed-mid-session (e.g., role downgrade) → next request fails 403 → UI gracefully re-renders.

Per-permission tests live in `test/rbac/{permission}.test.ts` and assert the UI surface gated by each.

---

## 18. Feature flag testing

- Each gated module: flag off → UI hidden; flag on → UI rendered.
- Flag toggled mid-session (refetch on focus): UI updates within one query refetch cycle.
- Backend 403 returned when flag is off but client thinks it's on → UI shows feature-disabled state, not generic 403.
- Per-tenant flag variance tested with two seeded tenants.

---

## 19. Optimistic Concurrency testing

For every PATCH-form page:

- Submit with stale `If-Match` → 412 → diff modal opens.
- User clicks Apply → form re-submits with fresh `version` → 200.
- User clicks Discard → form resets to current server state.
- Three 412s within 60s → "contact admin" hint surfaces.
- Multiple browser tabs editing same row: tab A saves, tab B re-fetches and sees new version; tab B's local edits trigger 412 next save.

These tests live in `test/integration/optimistic-concurrency.spec.ts` with one scenario per PATCH-enabled entity.

---

## 20. Idempotency testing

For every POST that carries `Idempotency-Key`:

- Form submitted twice (double-click) → backend hit once; UI shows one toast.
- Network flake mid-request → automatic retry uses same key; backend deduplicates.
- After 24h, key expires (matches backend); a fresh submission gets a new key.

---

## 21. Offline handling

- `navigator.onLine === false` → snackbar "You're offline" appears.
- Queued mutations: not implemented in v1; tests assert that on-submit-while-offline shows an actionable error rather than silently failing.
- TanStack Query's offline behavior verified: queries paused, mutations retry on reconnect.

---

## 22. Error handling

- 4xx with standardised envelope → `<ErrorEnvelopeToast>` shows code + message + trace id; copy-trace-id button.
- 5xx → toast + Sentry breadcrumb; trace id surfaces in support footer.
- Network error → "Connection lost" snackbar + retry.
- Unhandled exception in component → error boundary shows 500-style fallback; trace id preserved.
- Per-page error boundary in Next.js App Router via `error.tsx`.

---

## 23. Loading states

- Initial load: skeleton matching the page's shape (rows, cards).
- Refetch: subtle shimmer or spinner inline; never blank.
- Mutation in flight: button shows spinner, form `aria-busy="true"`.
- Lazy-loaded chunks: Suspense boundary shows skeleton, not blank.

Tests assert that the skeleton/spinner renders before data resolves (use MSW with delay) and unmounts after.

---

## 24. CI gates

CI fails (PR cannot merge) if any of:
- Unit / component / integration tests fail.
- Coverage below thresholds (§3, §4, §5).
- Lighthouse below thresholds (§11).
- Bundle size over budget (§11).
- A11y violations from axe (§9).
- Playwright critical journey fails on either Chromium or WebKit.
- TypeScript compilation errors.
- ESLint errors.
- Vendor-branding string scanner finds disallowed terms in built bundle.

---

## 25. Test data & seeding

- Staging env has a deterministic seed: 1 platform admin, 2 schools, 2 school admins, 3 teachers, 10 students, 8 parents, 1 academic year, 2 classes, 4 sections.
- Local dev uses MSW with the same seeded shapes.
- Tests do not depend on production data ever.

---

## 26. Testing checklist (per PR)

- [ ] Unit tests added/updated for new utilities & hooks.
- [ ] Component tests added/updated for new shared components.
- [ ] Integration tests added/updated for new routes.
- [ ] MSW handlers updated for any new endpoint.
- [ ] Optimistic-concurrency tested if PATCH-form added.
- [ ] Idempotency-Key tested if mutation POST added.
- [ ] A11y axe scan passes on new surfaces.
- [ ] Responsive verified at 375 / 768 / 1280.
- [ ] Loading + empty + error states implemented and tested.
- [ ] Critical journey impact assessed; e2e updated if needed.

---

## 27. Minimum coverage at v1 freeze (Sprint F16)

- Unit + component: 70% statements overall.
- `lib/` and `hooks/`: 80%.
- All critical journeys pass on Chromium + WebKit.
- Lighthouse green on every portal dashboard.
- Zero a11y violations on any surface.

If these are not met, v1 is not shippable.
