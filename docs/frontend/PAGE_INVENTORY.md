# Page Inventory — Source Theme HTML Pages

> **Status:** Analysis only.
> **Purpose:** Enumerate every HTML page in the purchased Bootstrap admin theme, map each to a SchoolOS ERP module + portal, and assign a disposition: **Reuse / Modify / Merge / Discard / Future**.
> **Companion:** `THEME_ANALYSIS.md`, `COMPONENT_INVENTORY.md`, `PORTAL_SCREEN_PLANNING.md`.

---

## 1. Disposition key

| Verdict | Meaning |
|---|---|
| **Reuse** | Page archetype carries over; rebuild in React with backend wiring, keep visual layout. |
| **Modify** | Page layout is a good start but must be reshaped for SchoolOS data model / RBAC / multi-tenant context. |
| **Merge** | Two or more theme pages collapse into a single SchoolOS page. |
| **Discard** | Page does not fit the SchoolOS scope and is dropped. |
| **Future** | Out of v1 scope; revisit when the backing module is built (per `BACKEND_FREEZE_v1.md` §4 deferred list). |

Portal column values: **Platform** (super-admin / operator), **SchoolAdmin**, **Teacher**, **Student**, **Parent**, **Shared** (sign-in / errors / status used by all).

---

## 2. Dashboards

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 1 | `index.html` (Admin dashboard) | Cross-cutting | SchoolAdmin | Reuse |
| 2 | `student-dashboard.html` | Student self-service | Student | Modify — show only the calling student's data; remove fake metrics |
| 3 | `teacher-dashboard.html` | Teacher self-service | Teacher | Modify — driven by Attendance / Timetable / Assignments |
| 4 | `parent-dashboard.html` | Parent self-service | Parent | Modify — list of linked children, fee balance, recent notifications |

Add a fifth dashboard not in the theme:
- **Platform Operator dashboard** — new; lists tenant schools, subscription state, billing health. See `PORTAL_SCREEN_PLANNING.md` §3.

---

## 3. Students

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 5 | `students.html` (grid) | Student | SchoolAdmin / Teacher | Reuse — cursor pagination, search, filter |
| 6 | `students-list.html` (table) | Student | SchoolAdmin / Teacher | Merge with grid (toggle view) |
| 7 | `student-details.html` | Student | SchoolAdmin / Teacher / Parent (own child) | Modify — tabs: Profile, Academic, Attendance, Fees, Notes |
| 8 | `add-student.html` | Student | SchoolAdmin | Modify — wire to admission/student APIs, optimistic concurrency |
| 9 | `edit-student.html` | Student | SchoolAdmin | Merge with add (single form) |
| 10 | `student-promotion.html` | Academic | SchoolAdmin | Modify — bulk promote between classes/sections |

---

## 4. Teachers

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 11 | `teachers.html` (grid) | Staff | SchoolAdmin | Reuse |
| 12 | `teachers-list.html` (table) | Staff | SchoolAdmin | Merge with grid |
| 13 | `teacher-details.html` | Staff | SchoolAdmin / self | Modify — Profile, Classes Taught, Schedule, Leave |
| 14 | `add-teacher.html` | Staff | SchoolAdmin | Modify |

---

## 5. Staff (non-teaching)

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 15 | `staff.html` | Staff | SchoolAdmin | Reuse |
| 16 | `staff-details.html` | Staff | SchoolAdmin | Modify |
| 17 | `add-staff.html` | Staff | SchoolAdmin | Modify |

---

## 6. Departments

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 18 | `departments.html` | Staff / Org | SchoolAdmin | Reuse |
| 19 | `add-department.html` | Staff / Org | SchoolAdmin | Reuse |

---

## 7. Parents

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 20 | `parents.html` | Parent | SchoolAdmin | Reuse |
| 21 | `add-parent.html` | Parent | SchoolAdmin | Modify — invitation/activation flow per Sprint 17 |

---

## 8. Classes & academics

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 22 | `classes.html` | Academic | SchoolAdmin | Reuse |
| 23 | `add-class.html` | Academic | SchoolAdmin | Reuse |
| 24 | `schedule.html` (class schedule) | Timetable | SchoolAdmin / Teacher | Modify |
| 25 | `subject.html` | Academic | SchoolAdmin | Reuse |
| 26 | `add-subject.html` | Academic | SchoolAdmin | Reuse |
| 27 | `time-table.html` | Timetable | All (read) | Modify — calendar view, RBAC for edit |
| 28 | `homework.html` | Academic Content | Teacher / Student / Parent | Modify |
| 29 | `add-homework.html` | Academic Content | Teacher | Modify |

---

## 9. Attendance

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 30 | `student-attendance.html` | Attendance | Teacher / SchoolAdmin | Modify — mark per-session, biometric not in v1 |
| 31 | `teacher-attendance.html` | Attendance (staff) | SchoolAdmin | Future — staff attendance not in v1 backend |

---

## 10. Examinations

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 32 | `exam.html` (exam list / schedule) | Examination | All (RBAC) | Modify |

---

## 11. Fees (School Fees, charged to parents)

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 33 | `fees-collections.html` | Fees | SchoolAdmin | Modify — distinct from SaaS Billing |
| 34 | `fees-group.html` | Fees | SchoolAdmin | Reuse |
| 35 | `fees-type.html` | Fees | SchoolAdmin | Reuse |
| 36 | `fees-master.html` | Fees | SchoolAdmin | Reuse |

> **Critical separation:** these are School Fees (school → parent). SaaS Billing (platform → school) is a separate set of screens; see `PORTAL_SCREEN_PLANNING.md` §3. The two never share a page.

---

## 12. Library

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 37 | `library.html` | Library | — | Future (deferred per `BACKEND_FREEZE_v1.md` §4) |
| 38 | `students-library.html` | Library | — | Future |

---

## 13. Hostel

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 39 | `hostel.html` | Hostel | — | Future |
| 40 | `hostel-room.html` | Hostel | — | Future |

---

## 14. Transport

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 41 | `transport.html` | Transport | — | Future |

---

## 15. Sports

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 42 | `sports.html` | Events & Activities | SchoolAdmin / Student | Modify — repurpose as Events list (sports is one event type) |

---

## 16. Payroll / Leave

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 43 | `payroll-overtime.html` | Payroll | — | Future |
| 44 | `holidays.html` | Calendar | SchoolAdmin | Modify — academic calendar holidays |
| 45 | `leaves.html` | Staff (leave) | — | Future — leave workflow not in v1 |

---

## 17. Reports

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 46 | `student-report.html` | Reporting | SchoolAdmin | Modify — uses Reporting Foundation export jobs |
| 47 | `finance-report.html` | Reporting (Fees) | SchoolAdmin | Modify |
| 48 | `leave-report.html` | Reporting | — | Future |
| 49 | `attendance-report.html` | Reporting | SchoolAdmin / Teacher | Modify |
| 50 | `class-report.html` | Reporting | SchoolAdmin | Modify |
| 51 | `user-report.html` | Reporting | Platform | Modify |

---

## 18. Authentication & status

| # | Theme page | ERP module | Portal | Disposition |
|---|---|---|---|---|
| 52 | `login.html` | Auth | Shared | Reuse |
| 53 | `register.html` | Auth | Shared | Discard for v1 — self-serve school signup is deferred (`BACKEND_FREEZE_v1.md` §4). Keep file as reference for v2. |
| 54 | `forgot-password.html` | Auth | Shared | Reuse |
| 55 | `change-password.html` | Auth | Shared | Reuse — first-login flow |
| 56 | `error-404.html` | Status | Shared | Reuse |
| 57 | `error-500.html` | Status | Shared | Reuse |
| 58 | `blank-page.html` / `coming-soon.html` / `under-maintenance.html` / `lock-screen.html` | Status | Shared | Reuse subset; drop `lock-screen` (no app-level lock in v1) |

---

## 19. SchoolOS-specific pages (NOT in theme, must be built fresh)

These have no theme analogue. They emerge from the backend module surface.

| Page | Module | Portal |
|---|---|---|
| Tenant Schools list / detail | Super Admin | Platform |
| School Provisioning wizard | Super Admin | Platform |
| Subscription plans / current plan | Subscription | SchoolAdmin |
| SaaS Billing — invoices list | Billing | SchoolAdmin |
| SaaS Billing — invoice detail | Billing | SchoolAdmin |
| SaaS Billing — payment methods (Razorpay config) | Billing | SchoolAdmin |
| SaaS Billing — manual payment recording | Billing | Platform (operator) |
| Communication Center — broadcast composer | Communication | SchoolAdmin |
| Communication Center — campaigns list | Communication | SchoolAdmin |
| Notification preferences (per-user) | Notifications | All |
| Audit log viewer | Audit | SchoolAdmin / Platform |
| Feature flag console (read-only) | Flags | Platform |
| Outbox monitor | Jobs / Outbox | Platform |
| Job queue monitor | Jobs | Platform |
| RBAC role / permission matrix | RBAC | SchoolAdmin |
| Academic Year / Term setup wizard | Academic | SchoolAdmin |
| Bulk import (students / staff / fees) | Reporting / Import | SchoolAdmin |
| Export / report download centre | Reporting | All (RBAC) |
| Idempotency-key tester (admin diag) | Diagnostics | Platform |

---

## 20. Summary by disposition

| Disposition | Count (of 58 theme pages) |
|---|---|
| Reuse | 18 |
| Modify | 23 |
| Merge | 4 |
| Discard | 1 (register.html for v1) |
| Future | 12 |

Plus **19+ new pages** specific to SchoolOS.

---

## 21. What this inventory does not do

- Does not begin React implementation.
- Does not pick exact route paths (those live in `PORTAL_SCREEN_PLANNING.md`).
- Does not assign sprint timing (see `FRONTEND_SPRINT_PLAN.md`).
