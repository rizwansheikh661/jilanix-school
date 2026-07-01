---
status: AUDIT (read-only)
issued: 2026-06-29
type: contract-conformance audit
scope: frontend ↔ backend authentication contract
working-tree: c:\rizwan\schoolos-saas
mode: review only — no code modified
---

# Authentication Contract Audit — FE ↔ BE

This audit verifies whether the frontend and backend currently use the same authentication contract. All findings are grounded in file:line citations from the working tree on 2026-06-29.

---

## 0. Headline

**The frontend and backend are NOT on the same contract.**

- **Backend (current):** supports three wire shapes — body-`schoolId`, body-`tenantSlug`, host/header-derived (`tenant-resolver.service.ts:65-111`; `auth.service.ts:526-551`).
- **Frontend (running code):** posts only the legacy body-`schoolId` (UUID) shape (`LoginForm.tsx:53-66`). No `tenantSlug`. No `X-Tenant-Slug` header. Still requires `NEXT_PUBLIC_DEFAULT_SCHOOL_ID`.

They are **wire-compatible by accident** — backend `LoginDto.schoolId` is `@IsOptional()` (`auth.dto.ts:87`) and the FE supplies a non-empty UUID, so the first branch of `AuthService.resolveSchoolId` matches (`auth.service.ts:527-528`) and the request succeeds. None of the newer backend tenant-resolution code paths are exercised by today's FE.

---

## 1. Answers to the 10 audit questions

| # | Question | Answer | Primary evidence |
|---|---|---|---|
| 1 | LoginForm sends `schoolId`? | **YES** | `LoginForm.tsx:53-66` |
| 2 | LoginForm sends `tenantSlug`? | **NO** | grep `tenantSlug` in `frontend/src` → 0 matches |
| 3 | LoginForm sends `X-Tenant-Slug` header? | **NO** | grep `X-Tenant-Slug` / `x-tenant-slug` → 0 matches |
| 4 | Axios injects `X-Tenant-Slug` automatically? | **NO** | `client.ts:80-108` only sets `X-Request-Id`, `Authorization`, `If-Match`, `Idempotency-Key` |
| 5 | Backend resolves tenant from `Host`? | **YES** | `tenant-resolver.service.ts:65-111`; middleware `tenant-resolver.middleware.ts:27-41` |
| 6 | `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` still required at runtime? | **YES** | `app.ts:24-26`; gate in `LoginForm.tsx:53-59`; mirror in `ForgotPasswordForm.tsx:46-52` |
| 7 | Dead legacy auth code present? | **YES** | See §3 below — 8 sites |
| 8 | Which contract is FE actually running? | **Legacy body-`schoolId` UUID** | `LoginForm.tsx:61-66` + `clients/auth.ts:23-29, 44-55` |
| 9 | Which documents are outdated? | **5 of 8** | See §4 below |
| 10 | Minimum migration | **5 file edits, FE-only** | See §6 below |

---

## 2. Active contract — what actually goes on the wire

**Login request (today, observed in source):**
```
POST /api/v1/auth/login
Content-Type: application/json
X-Request-Id: <uuid>
Idempotency-Key: <uuid>
(NO X-Tenant-Slug)

{ "schoolId": "<NEXT_PUBLIC_DEFAULT_SCHOOL_ID>",
  "email":    "<user@…>",
  "password": "<…>",
  "rememberMe": false }
```

**Source citations:**
- Body assembled at `frontend/src/components/auth/LoginForm.tsx:61-66`.
- `schoolId` value sourced from `frontend/src/lib/config/app.ts:24-26` (env var).
- Posted via `frontend/src/lib/api/clients/auth.ts:44-55` (`apiClient.post('/auth/login', payload)`).
- Headers attached by `frontend/src/lib/api/client.ts:80-108`.

**Backend acceptance path:**
- `auth.controller.ts:49-62` — controller receives DTO + `req.resolvedTenant`.
- `auth.dto.ts:79-89` — `schoolId` `@IsOptional()` `@IsUUID()`; accepted because present.
- `auth.service.ts:527-528` — `resolveSchoolId` branch (a) matches because `input.schoolId.length > 0`; branches (b) `tenantSlug` and (c) `resolvedTenant` are never reached.

**Net effect:** the FE is on the **F1.3-era contract**, not the F2.1 / W1.3+ contract that the freeze certificate (`AUTHENTICATION_FREEZE_V1.md`) and final architecture doc (`FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md`) describe.

---

## 3. Dead / obsolete code inventory

Every site below is reachable in the current source tree and contradicts the frozen architecture (`FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md` §12).

| # | Location | Obsolete content | Why obsolete |
|---|---|---|---|
| D-1 | `frontend/src/components/auth/LoginForm.tsx:21-26` | Comment: "backend `/auth/login` still requires `schoolId` (UUID)". | Backend made `schoolId` optional at W1.3 (`auth.dto.ts:87`). |
| D-2 | `frontend/src/components/auth/LoginForm.tsx:53-59` | Runtime gate `if (schoolId === null) { setTopError(…); return; }`. | Validation enforces a config that is no longer the canonical tenant resolution. |
| D-3 | `frontend/src/components/auth/LoginForm.tsx:61-66` | `login({ schoolId, email, password, rememberMe })`. | Per final architecture §12.5: body shape is `{ email, password, rememberMe? }`. |
| D-4 | `frontend/src/components/auth/ForgotPasswordForm.tsx:46-52` | Same gate + `requestPasswordReset({ schoolId, email })`. | Same reason as D-2/D-3 — tenant should come from header. |
| D-5 | `frontend/src/lib/api/clients/auth.ts:12-15` | Header docstring: "schoolId (UUID) in the body — injects from `NEXT_PUBLIC_DEFAULT_SCHOOL_ID`". | False since W1.3. |
| D-6 | `frontend/src/lib/api/clients/auth.ts:23-29` | `LoginPayload.schoolId: string` (required). | Final architecture §10.R5: deprecate and remove. |
| D-7 | `frontend/src/lib/api/clients/auth.ts:85-88` | `PasswordResetRequestPayload.schoolId: string` (required). | Same — tenant from header. |
| D-8 | `frontend/src/lib/config/app.ts:8-26` | `AUTH_CONFIG.defaultSchoolId` export + 18-line stale docstring claiming "No subdomain/host/email tenant resolution exists yet". | Backend has shipped host/header resolution (`tenant-resolver.service.ts:65-111`). |
| D-9 | `frontend/.env.example:20-28` | `NEXT_PUBLIC_DEFAULT_SCHOOL_ID=` block. | Final architecture §5.1: remove. |
| D-10 | `frontend/src/components/auth/LoginForm.test.tsx` (esp. L29, L68-121) | Test asserts the obsolete body shape. | Will need to flip to the new contract. |
| D-11 | `frontend/src/components/auth/ForgotPasswordForm.test.tsx` (L19, L50-65) | Same. | Same. |

**Additional observations:**
- `frontend/.env.local` does **not** exist in the working tree (`Bash ls` returns no such file). The dev is currently relying on no env value, or running with a missing/empty `defaultSchoolId` — login would fail the gate at `LoginForm.tsx:53-59`.
- No Next.js `middleware.ts` exists at `frontend/middleware.ts` or `frontend/src/middleware.ts`. The "Multi-Tenant Foundation" FE middleware promised by `docs/frontend/FRONTEND_IMPLEMENTATION_PLAN.md` was never delivered.
- The `.next/` build artefacts still embed the obsolete env var (cached build, not source — clears on next `npm run build`).

---

## 4. Document ↔ Code mismatch matrix

Documentation is graded against current source code. Source code is the source of truth for "what is running today"; the docs describe either history or intent.

| # | Document | Claim (cited) | Actual code | Impact | Recommended fix |
|---|---|---|---|---|---|
| M-1 | `docs/AUTHENTICATION_FREEZE_V1.md` §10 (L172) | "FE concerns are addressed by Frontend Sprint F1.3, which is itself frozen." Score implies FE is converged. | `LoginForm.tsx:53-66` still on F1.3 UUID-body contract; W1.3 backend contract not adopted. | Misleading — readers infer FE is on the new contract when it isn't. | Add an addendum: "FE remains on F1.3 contract until R1–R5 lands." |
| M-2 | `docs/FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md` §5.1, §10, §12 | Declares `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` obsolete and the wire body `{email,password,rememberMe?}` (frozen). | Code emits `{schoolId,email,password,rememberMe}`; env var still required. | Doc is forward-looking; the gap is implementation, not doc accuracy. | No doc change — execute R1–R5. |
| M-3 | `docs/AUTH_FRONTEND_TENANT_ARCHITECTURE_REVIEW.md` §12 D1–D6 (L243-252) | Diagnoses the divergence as still open. | Matches code reality. | Doc is correct. | None. |
| M-4 | `docs/frontend/SPRINT_F1_3_AUTH_ALIGNMENT_REPORT.md` §3 (L72-86) | "Backend has no subdomain/host/email pre-login tenant lookup." | Backend has shipped exactly that — `tenant-resolver.service.ts:65-111`. | Stale relative to backend reality; if used to justify the FE contract today, it's misleading. | Mark as superseded by `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md`. |
| M-5 | `docs/frontend/SPRINT_F2_1_IMPLEMENTATION_REPORT.md` §7 item 4 (L179) | "`NEXT_PUBLIC_DEFAULT_SCHOOL_ID` still has to be set at build time — there is no `/v1/auth/tenants` endpoint yet." | Backend has shipped host/header tenant resolution; no `/auth/tenants` endpoint needed for V1. | Description accurate for FE state, but inconsistent with backend reality. | Mark §7 item 4 superseded by `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md`. |
| M-6 | `docs/frontend/API_UI_MAPPING.md` (line 16) | Lists `POST /auth/change-password` and `GET /auth/me/permissions` as backend endpoints. | Neither exists on `auth.controller.ts:42-107`; freeze cert §5/§6 confirms only 8 endpoints; `password/change` returns 404 per `AUTHENTICATION_FREEZE_V1.md:97`. | If a future FE feature is planned against these, it will 404. | Replace with the 8 frozen endpoints from freeze cert §5. |
| M-7 | `docs/frontend/FRONTEND_IMPLEMENTATION_PLAN.md` (line 46) | Lists "Multi-Tenant Foundation (tenant resolution middleware)" as a Sprint F1 deliverable. | No `frontend/middleware.ts` exists; no axios `X-Tenant-Slug` injection. Never shipped. | Plan diverges from working code; new engineers will hunt for code that isn't there. | Mark this deliverable as "deferred to R1–R5 pre-sprint per `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md`." |
| M-8 | `docs/AUTH_FINAL_RUNTIME_VERIFICATION.md` §5/§6 | Records backend runtime as supporting tenantSlug path (200 OK). | Backend matches. FE does not exercise this path. | No doc inaccuracy. Highlights the FE gap. | None. |
| M-9 | `docs/AUTH_RUNTIME_PATCH_REPORT.md` | Documents the W1 patches that made `schoolId` optional and added host/header resolution. | Code matches. | No doc inaccuracy. | None. |

---

## 5. Backend ↔ Frontend contract comparison

| Layer | Backend supports | Frontend uses | Status |
|---|---|---|---|
| **Body field — `schoolId`** | Optional UUID (`auth.dto.ts:79-89`) | Required, always sent (`LoginForm.tsx:61-66`) | **DIVERGED** — FE on legacy; BE on multi-shape |
| **Body field — `tenantSlug`** | Optional, resolves via `lookupSchoolIdBySlug` (`auth.service.ts:530-532`) | Not used (grep: 0 matches) | **UNUSED** |
| **Body field — `identifier` / `identifierType`** | Supported (per `AUTHENTICATION_FREEZE_V1.md:88`) | Not used | **UNUSED** |
| **Body field — `email`** | Optional (`auth.dto.ts:97-102`) | Always sent | **OK** (legacy path) |
| **Body field — `password`** | Required | Always sent | **OK** |
| **Body field — `rememberMe`** | Optional bool | Always sent | **OK** (F2.1 added) |
| **Header — `X-Tenant-Slug`** | Honored on non-`*.schoolos.in` hosts (`tenant-resolver.service.ts:93-108`) | Not sent (grep: 0 matches) | **UNUSED** |
| **Host-derived tenant** | Honored on `admin.schoolos.in` + `*.schoolos.in` + `app.schoolos.in` (`tenant-resolver.service.ts:69-91`) | Not relied on (FE always supplies body `schoolId`) | **UNUSED** |
| **Response — `AuthMeDto.permissions / featureFlags / roles / mustChangePassword`** | Returned (`auth.dto.ts` AuthMeDto) | Consumed (`AuthProvider.tsx:38, 61, 79-81, 114, 144-150`) | **OK** (F2.1 wired) |
| **`/auth/logout-all`** | Supported but throws 500 for platform admin | Wired (`clients/auth.ts`) | **OK** (graceful finally-clear) |
| **`/auth/first-login/change-password`** | Supported | Wired (`FirstLoginChangePasswordForm.tsx`) | **OK** |
| **`/auth/password-reset/*`** | Supported | Wired (`Forgot/ResetPasswordForm.tsx`) | **PARTIAL** — Forgot still sends `schoolId` (D-4/D-7) |

---

## 6. Minimum migration (5 FE files, 0 BE files)

Per `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md` §10 R1–R5. No backend changes — the backend already supports the target contract.

| Step | File | Change |
|---|---|---|
| **R1** | `frontend/.env.example` (L20-28) | Replace the `NEXT_PUBLIC_DEFAULT_SCHOOL_ID` block with `NEXT_PUBLIC_TENANT_SLUG=` + updated docstring. |
| **R1** | `frontend/src/lib/config/app.ts` (L8-26) | Replace `AUTH_CONFIG.defaultSchoolId: string \| null` with `AUTH_CONFIG.tenantSlug: string \| null`. Delete stale docstring. |
| **R2** | `frontend/src/lib/api/client.ts` (request interceptor, L80-108) | Add conditional `config.headers.set('X-Tenant-Slug', AUTH_CONFIG.tenantSlug)` — only when `tenantSlug` non-null AND runtime host is not `*.schoolos.in`. |
| **R3** | `frontend/src/components/auth/LoginForm.tsx` (L21-66) | Delete obsolete docstring; delete the `defaultSchoolId === null` gate; change `login({...})` call to `login({ email, password, rememberMe })`. |
| **R3** | `frontend/src/components/auth/ForgotPasswordForm.tsx` (L46-54) | Same — drop `schoolId` from the `requestPasswordReset` body. |
| **R4** | `frontend/src/lib/api/clients/auth.ts` (L23-29, L85-88) | `LoginPayload.schoolId` → optional (deprecated); `PasswordResetRequestPayload.schoolId` → optional (deprecated). |
| **R5** | `frontend/src/lib/api/clients/auth.ts` (L23-29, L85-88, L12-15) | Remove the deprecated `schoolId` fields entirely; remove stale docstring. |
| Tests | `frontend/src/components/auth/LoginForm.test.tsx`, `ForgotPasswordForm.test.tsx` | Update fixtures to assert new body shape (no `schoolId`) and the `X-Tenant-Slug` header injection. |

`AuthProvider.tsx` requires **no change** — it forwards the payload opaquely (`AuthProvider.tsx:109-122`).

No backend file touched. The freeze certificate (`AUTHENTICATION_FREEZE_V1.md`) is preserved.

---

## 7. Risks of leaving the divergence in place

| Risk | Likelihood | Impact |
|---|---|---|
| Production rollout exposes the UUID in the FE bundle (Cloudflare-cached JS asset). | Certain on first prod build | Violates `AUTHENTICATION_PATCH_PLAN.md:220` ("School UUID is never exposed to the frontend"). |
| Multi-tenant prod hosting (`canary.schoolos.in`, `demo.schoolos.in`) requires per-tenant FE rebuild for the UUID. | Certain | Forces per-tenant artefacts; defeats the "one bundle, many subdomains" promise of the final architecture. |
| Mobile / app-shell origin (`app.schoolos.in`) cannot reuse the same FE auth code. | High once mobile starts | Requires a second login flow code path. |
| Sprint F2.2 dashboards begin hitting business endpoints; backend will reject any unauthenticated tenant context if/when the resolver moves to host-only. | Medium | Re-work mid-sprint. |
| New engineers reading `FRONTEND_IMPLEMENTATION_PLAN.md` look for FE middleware that doesn't exist. | Certain | Onboarding friction. |

---

## 8. Recommendation

1. **Treat the current FE state as known divergence**, not as bugs. The F2.1 sprint shipped the F1.3 alignment intentionally; the convergence work is R1–R5 from the final architecture doc, which has not been authorized yet.
2. **Execute R1–R5 as a single short pre-sprint** before Sprint F2.2 begins. Estimated effort: ~1 day. Five source edits + two test fixture updates.
3. **Add an addendum to `AUTHENTICATION_FREEZE_V1.md` §10** noting that the FE remains on the legacy contract until R1–R5 lands — so the freeze score is not read as "FE done."
4. **Update `API_UI_MAPPING.md` line 16** to remove the two non-existent endpoints (`POST /auth/change-password`, `GET /auth/me/permissions`) and replace with the 8 frozen endpoints from `AUTHENTICATION_FREEZE_V1.md` §5.
5. **Mark `SPRINT_F1_3_AUTH_ALIGNMENT_REPORT.md` and `SPRINT_F2_1_IMPLEMENTATION_REPORT.md` §7 item 4** as superseded by `FRONTEND_AUTHENTICATION_FINAL_ARCHITECTURE.md`.

No code modifications proposed in this audit. R1–R5 implementation requires explicit user authorization.

---

## 9. Stop

Audit complete. Read-only. No source code modified.
