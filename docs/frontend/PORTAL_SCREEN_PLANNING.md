# Portal Screen Planning — SchoolOS Frontend

> **Status:** Planning only. No code.
> **Purpose:** For each portal, list the screens (with route paths), classify each as **Existing in theme / Needs modification / Completely new**, and call out the backend modules they consume.
> **Companion:** `PAGE_INVENTORY.md` (theme pages), `UI_ARCHITECTURE.md` (stack), `BACKEND_FREEZE_v1.md` (frozen v1 module surface).

---

## 1. Portal map

| Portal | Audience | Route group | Layout |
|---|---|---|---|
| Platform | Super admins, operators (Anthropic-side or platform-side) | `(platform)` | Dark sidebar default; tenant switcher in header |
| SchoolAdmin | School principals, office staff | `(school)` | Standard sidebar; school logo in header |
| Teacher | Class teachers, subject teachers | `(teacher)` | Compact sidebar; "My classes" hub |
| Student | Enrolled students (self-service) | `(student)` | Minimal nav; mobile-first |
| Parent | Linked guardians | `(parent)` | Minimal nav; child switcher; mobile-first |
| Shared (auth & status) | Anyone unauthenticated or on error | `(auth)` | Split-screen brand panel + form |

Status legend:
- **E** = Exists as theme page archetype; reuse the visual.
- **M** = Theme page exists but must be modified.
- **N** = Completely new (no theme analogue).

---

## 2. Shared (auth & status)

| Screen | Route | Status | Backend |
|---|---|---|---|
| Login | `/login` | E | `POST /auth/login` |
| Forgot password | `/forgot-password` | E | `POST /auth/password-reset/request` |
| Reset password (token) | `/reset-password?token=...` | E | `POST /auth/password-reset/confirm` |
| Change password (first login) | `/change-password` | E | `POST /auth/change-password` |
| MFA challenge | `/login/verify` | N | (future) |
| 404 Not Found | `/_not-found` | E | — |
| 500 Server Error | error boundary | E | — |
| Maintenance | `/maintenance` | E | — |
| Forbidden | `/forbidden` | N | — |

---

## 3. Platform portal (super-admin / operator)

### 3.1 Dashboard
| Screen | Route | Status | Backend |
|---|---|---|---|
| Operator dashboard | `/platform/dashboard` | N | Aggregates from `super-admin/*`, `subscription/*`, `billing/*` |

### 3.2 Tenants & provisioning
| Screen | Route | Status | Backend |
|---|---|---|---|
| Tenants list | `/platform/schools` | N | `GET /super-admin/schools` |
| Tenant detail | `/platform/schools/[id]` | N | `GET /super-admin/schools/:id` |
| Provisioning wizard | `/platform/schools/new` | N | `POST /super-admin/provisioning` |
| Suspend / archive school | (action on detail) | N | `POST /super-admin/schools/:id/suspend|archive` |
| Cross-tenant search | `/platform/search` | N (future) | (deferred per freeze §4) |

### 3.3 Subscriptions
| Screen | Route | Status | Backend |
|---|---|---|---|
| Plans catalog | `/platform/plans` | N | `GET /subscription/plans` |
| Subscription detail (per tenant) | `/platform/schools/[id]/subscription` | N | `GET /subscription/:schoolId` |
| Subscription history | (tab) | N | `GET /subscription/:schoolId/history` |

### 3.4 SaaS Billing (charges schools)
| Screen | Route | Status | Backend |
|---|---|---|---|
| Billing accounts list | `/platform/billing/accounts` | N | `GET /billing/accounts` |
| Billing account detail | `/platform/billing/accounts/[id]` | N | `GET /billing/accounts/:id` |
| Invoices list | `/platform/billing/invoices` | N | `GET /billing/invoices` |
| Invoice detail | `/platform/billing/invoices/[id]` | N | `GET /billing/invoices/:id` |
| Record manual payment | (modal on invoice) | N | `POST /billing/payments/manual` |
| Refund | (modal on payment) | N | `POST /billing/refunds` |
| Credit note | `/platform/billing/credit-notes/[id]` | N | `GET /billing/credit-notes/:id` |
| Adjustments | `/platform/billing/adjustments` | N | `GET /billing/adjustments` |
| Razorpay configuration | `/platform/billing/payment-sources` | N | `GET /billing/payment-sources` |
| Billing audit | `/platform/billing/audit` | N | `GET /billing/audits` |

### 3.5 Communication (platform-wide)
| Screen | Route | Status | Backend |
|---|---|---|---|
| Notification event catalog | `/platform/notifications/events` | N | `GET /notifications/events` |
| Campaigns (cross-tenant) | `/platform/communication/campaigns` | N | (Communication Center) |

### 3.6 Operations
| Screen | Route | Status | Backend |
|---|---|---|---|
| Feature flag console (read-only) | `/platform/flags` | N | `GET /feature-flags` |
| Outbox monitor | `/platform/outbox` | N | `GET /outbox/events` |
| Job queue monitor | `/platform/jobs` | N | `GET /jobs/status` |
| Audit log (global) | `/platform/audit` | N | `GET /audit/entries` |

---

## 4. SchoolAdmin portal

### 4.1 Dashboard
| Screen | Route | Status | Backend |
|---|---|---|---|
| Dashboard | `/dashboard` | M (theme `index.html`) | Aggregates students, fees, attendance, communications |

### 4.2 Organization & academics
| Screen | Route | Status | Backend |
|---|---|---|---|
| Branches | `/branches` | N | `GET /branches` |
| Academic years | `/academic/years` | N | `GET /academic/years` |
| Terms | `/academic/terms` | N | `GET /academic/terms` |
| Classes | `/academic/classes` | E | `GET /academic/classes` |
| Sections | `/academic/sections` | M | `GET /academic/sections` |
| Subjects | `/academic/subjects` | E | `GET /academic/subjects` |
| Departments | `/departments` | E | `GET /staff/departments` |

### 4.3 People — students
| Screen | Route | Status | Backend |
|---|---|---|---|
| Students list / grid | `/students` | E | `GET /students` |
| Add student | `/students/new` | M | `POST /students` |
| Student detail | `/students/[id]` | M | `GET /students/:id` |
| Student promotion | `/students/promotion` | M | `POST /students/promotion` |
| Invite student to portal | (action on detail) | N | `POST /students/:id/users` (Sprint 18) |

### 4.4 People — parents
| Screen | Route | Status | Backend |
|---|---|---|---|
| Parents list | `/parents` | E | `GET /parents` |
| Add parent | `/parents/new` | M | `POST /parents` |
| Parent detail | `/parents/[id]` | M | `GET /parents/:id` |
| Invite parent | (action) | N | `POST /parents/:id/users` (Sprint 17) |

### 4.5 People — staff & teachers
| Screen | Route | Status | Backend |
|---|---|---|---|
| Teachers list | `/teachers` | E | `GET /staff?role=teacher` |
| Teacher detail | `/teachers/[id]` | M | `GET /staff/:id` |
| Add teacher | `/teachers/new` | M | `POST /staff` |
| Staff list | `/staff` | E | `GET /staff` |
| Staff detail | `/staff/[id]` | M | — |

### 4.6 Admissions
| Screen | Route | Status | Backend |
|---|---|---|---|
| Admission applications list | `/admissions` | N | `GET /admissions` |
| Application detail | `/admissions/[id]` | N | `GET /admissions/:id` |
| New application | `/admissions/new` | N | `POST /admissions` |
| Convert to student | (action) | N | `POST /admissions/:id/convert` |

### 4.7 Attendance
| Screen | Route | Status | Backend |
|---|---|---|---|
| Mark student attendance | `/attendance/mark` | M | `POST /attendance/sessions/:id/mark` |
| Attendance overview | `/attendance` | M | `GET /attendance/summary` |

### 4.8 Timetable
| Screen | Route | Status | Backend |
|---|---|---|---|
| Timetable editor | `/timetable` | M | `GET/PATCH /timetable` |
| Class schedule view | `/timetable/class/[id]` | M | — |

### 4.9 Academic content
| Screen | Route | Status | Backend |
|---|---|---|---|
| Homework list | `/homework` | E | `GET /academic-content/homework` |
| Add homework | `/homework/new` | E | `POST /academic-content/homework` |
| Assignments | `/assignments` | M | `GET /academic-content/assignments` |
| Syllabus | `/syllabus` | M | `GET /academic-content/syllabus` |

### 4.10 Examinations
| Screen | Route | Status | Backend |
|---|---|---|---|
| Exam schedule | `/exams` | M | `GET /examinations` |
| Exam detail / grade entry | `/exams/[id]` | M | `POST /examinations/:id/results` |
| Report cards | `/exams/report-cards` | M | `GET /examinations/report-cards` |

### 4.11 School Fees (charges parents)
| Screen | Route | Status | Backend |
|---|---|---|---|
| Fee groups | `/fees/groups` | E | `GET /fees/groups` |
| Fee types | `/fees/types` | E | `GET /fees/types` |
| Fee master | `/fees/master` | E | `GET /fees/master` |
| Fee collection | `/fees/collections` | M | `POST /fees/payments` |
| Fee invoices | `/fees/invoices` | M | `GET /fees/invoices` |
| Hybrid (online + manual) recording | (modal) | M | `POST /fees/payments` |

> Separate from SaaS Billing (§3.4). The two never share a page.

### 4.12 Events & activities
| Screen | Route | Status | Backend |
|---|---|---|---|
| Events list | `/events` | M (theme `sports.html`) | `GET /events` |
| Event detail | `/events/[id]` | M | — |
| Holidays / calendar | `/calendar` | M | `GET /events/calendar` |

### 4.13 Communication Center
| Screen | Route | Status | Backend |
|---|---|---|---|
| Broadcast composer | `/communication/compose` | N | `POST /communication/campaigns` |
| Campaigns list | `/communication/campaigns` | N | `GET /communication/campaigns` |
| Campaign detail | `/communication/campaigns/[id]` | N | — |
| Templates | `/communication/templates` | N | `GET /communication/templates` |

### 4.14 SaaS subscription & billing (tenant view)
| Screen | Route | Status | Backend |
|---|---|---|---|
| My subscription | `/settings/subscription` | N | `GET /subscription/me` |
| My invoices | `/settings/billing/invoices` | N | `GET /billing/invoices?self=true` |
| Invoice detail (pay) | `/settings/billing/invoices/[id]` | N | `POST /billing/invoices/:id/pay` |
| Payment methods | `/settings/billing/payment-methods` | N | — |

### 4.15 Reporting
| Screen | Route | Status | Backend |
|---|---|---|---|
| Reports hub | `/reports` | M | `GET /reporting/definitions` |
| Student report | `/reports/students` | M | `GET /reporting/students` |
| Finance report | `/reports/finance` | M | `GET /reporting/fees` |
| Attendance report | `/reports/attendance` | M | `GET /reporting/attendance` |
| Class report | `/reports/classes` | M | — |
| Import jobs | `/reports/imports` | N | `GET /reporting/imports` |
| Export jobs | `/reports/exports` | N | `GET /reporting/exports` |
| Bulk operations | `/reports/bulk` | N | `POST /reporting/bulk` |

### 4.16 Settings
| Screen | Route | Status | Backend |
|---|---|---|---|
| School profile | `/settings/school` | N | `PATCH /schools/:id` |
| Branding (logo, primary color) | `/settings/branding` | N | (future) |
| Roles & permissions | `/settings/rbac` | N | `GET /rbac/roles` |
| Users (school staff with portal access) | `/settings/users` | N | `GET /users` |
| Notification preferences (mine) | `/settings/notifications` | N | `GET/PATCH /me/preferences` |
| Sequences | `/settings/sequences` | N (admin diag) | `GET /sequences` |
| Audit log (school-scoped) | `/settings/audit` | N | `GET /audit/entries?school=...` |
| Feature flags (visible only) | `/settings/features` | N (read-only) | `GET /feature-flags?self=true` |

---

## 5. Teacher portal

| Screen | Route | Status | Backend |
|---|---|---|---|
| Teacher dashboard | `/dashboard` | M (theme `teacher-dashboard.html`) | Aggregates classes / today's timetable / pending tasks |
| My classes | `/me/classes` | N | `GET /me/classes` |
| Class detail (students, attendance, homework) | `/me/classes/[id]` | N | — |
| Mark attendance | `/me/classes/[id]/attendance` | M | `POST /attendance/sessions/:id/mark` |
| My timetable | `/me/timetable` | N | `GET /me/timetable` |
| Assign homework | `/me/homework/new` | M | `POST /academic-content/homework` |
| My homework list | `/me/homework` | N | — |
| Enter exam results | `/me/exams/[id]/results` | M | — |
| My profile | `/me/profile` | N | `GET /me/profile` |
| My preferences | `/me/preferences` | N | `GET/PATCH /me/preferences` |

---

## 6. Student portal

> Frozen v1 surface (per `BACKEND_FREEZE_v1.md` + Sprint 18 plan): profile + placement + preferences. No `/me/homework`, `/me/attendance`, `/me/timetable`, `/me/exams`, `/me/fees` until later sprints.

| Screen | Route | Status | Backend |
|---|---|---|---|
| Student dashboard | `/dashboard` | M (theme `student-dashboard.html`) | Aggregates self profile + announcements |
| My profile | `/me/profile` | N | `GET /students/me/profile` |
| My academic year | `/me/academic-year` | N | `GET /students/me/academic-year` |
| My class | `/me/class` | N | `GET /students/me/class` |
| My section | `/me/section` | N | `GET /students/me/section` |
| Notification preferences | `/me/preferences` | N | `GET/PATCH /students/me/preferences` |
| Activate account (from invite email) | `/reset-password?token=...` | E (shared) | `POST /auth/password-reset/confirm` |

Future (deferred): `/me/homework`, `/me/attendance`, `/me/timetable`, `/me/exams`, `/me/fees`.

---

## 7. Parent portal

| Screen | Route | Status | Backend |
|---|---|---|---|
| Parent dashboard | `/dashboard` | M (theme `parent-dashboard.html`) | Children list + fee balances + recent notifications |
| My children | `/me/children` | N | `GET /me/children` |
| Child detail (profile + placement) | `/me/children/[studentId]` | N | `GET /parents/me/children/:id` |
| Child fee invoices | `/me/children/[studentId]/fees` | N | `GET /fees/invoices?student=...` |
| Pay fee invoice | (modal) | N | `POST /fees/payments` |
| Child attendance summary | `/me/children/[studentId]/attendance` | N | (future, gate behind flag) |
| Child homework | `/me/children/[studentId]/homework` | N | (future) |
| My profile | `/me/profile` | N | `GET /parents/me/profile` |
| My preferences | `/me/preferences` | N | `GET/PATCH /parents/me/preferences` |
| Activate account | `/reset-password?token=...` | E (shared) | — |

---

## 8. Cross-portal shared widgets

These appear in multiple portal layouts and live in `components/foundation/`:

- `<AppHeader>` — brand, search (where applicable), notification bell, user menu, dark/light toggle.
- `<AppSidebar>` — RBAC-filtered nav; collapsible groups; mini-sidebar mode.
- `<TenantSwitcher>` — Platform portal only.
- `<ChildSwitcher>` — Parent portal only.
- `<NotificationDrawer>` — opens from header bell.
- `<HelpMenu>` — links to docs / support.

---

## 9. Screen-count summary

| Portal | E | M | N | Total v1 |
|---|---|---|---|---|
| Shared (auth/status) | 7 | 0 | 2 | 9 |
| Platform | 0 | 0 | 22 | 22 |
| SchoolAdmin | 14 | 28 | 28 | 70 |
| Teacher | 0 | 3 | 7 | 10 |
| Student | 0 | 1 | 6 | 7 |
| Parent | 0 | 1 | 9 | 10 |
| **Total** | **21** | **33** | **74** | **128** |

`E` = direct theme reuse; `M` = theme page modified; `N` = built from scratch. Roughly 60% of screens are SchoolOS-specific and have no theme analogue.

---

## 10. Stop

This planning document feeds into `FRONTEND_IMPLEMENTATION_PLAN.md` (master roadmap) and `FRONTEND_SPRINT_PLAN.md` (sprint breakdown). No implementation begins here.
