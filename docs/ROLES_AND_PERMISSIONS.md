# ROLES_AND_PERMISSIONS

_Upstream: BUSINESS_RULES.md, MULTI_TENANT_ARCHITECTURE.md, MODULES.md. Downstream: BACKEND_ARCHITECTURE.md, REST_API_DESIGN.md, SUPER_ADMIN_ARCHITECTURE.md._

The complete RBAC model for SchoolOS. Two parallel systems:

1. **Platform RBAC** — internal staff in the operator console.
2. **Tenant RBAC** — users inside a school.

These never mix. A platform user does not appear in a tenant's user list; a tenant user has no global powers.

---

## 1. The two-tier boundary

```
                ┌──────────────────────────────────┐
                │  PLATFORM SCOPE (scope=global)   │
                │  - super_admin                   │
                │  - platform_billing              │
                │  - platform_support              │
                │  - platform_engineer             │
                │  - platform_sales                │
                │  - platform_readonly             │
                └────────────────┬─────────────────┘
                                 │ impersonate (audited)
                                 ▼
                ┌──────────────────────────────────┐
                │   TENANT SCOPE (scope=tenant)    │
                │   ┌───────────────────────────┐  │
                │   │ school_admin              │  │
                │   │ principal / vice_principal│  │
                │   │ class_teacher / teacher   │  │
                │   │ accountant / clerk        │  │
                │   │ librarian                 │  │
                │   │ transport_incharge        │  │
                │   │ hostel_warden             │  │
                │   │ parent / student          │  │
                │   │ driver / security         │  │
                │   └───────────────────────────┘  │
                └──────────────────────────────────┘
```

JWT scope decides which guard tree your request enters. They are mutually exclusive.

---

## 2. Permission model

A permission is a string `<resource>.<action>` (e.g., `students.read`, `fees.invoice.void`).

Resources roughly mirror modules:
`students`, `parents`, `staff`, `classes`, `attendance`, `marks`, `exams`, `report_cards`, `fees`, `invoices`, `receipts`, `transport`, `hostel`, `library`, `inventory`, `visitor`, `medical`, `notices`, `complaints`, `discipline`, `events`, `certificates`, `reports`, `notifications`, `feature_flags`, `audit`, `users`, `roles`, `school_settings`, `subscriptions`.

Actions are domain-specific but standardized where possible: `read`, `list`, `create`, `update`, `delete`, plus resource-specific verbs (`fees.invoice.void`, `marks.entry.unlock`, `users.impersonate`).

A role is an ordered set of permissions. Permissions are additive.

---

## 3. Role registry (canonical list)

### 3.1 Platform roles

| Role                    | Permission summary                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `super_admin`           | All `admin.*` and `platform.*` permissions; can grant/revoke other internal roles  |
| `platform_billing`      | `subscriptions.*`, `invoices.*` (platform-side), `coupons.*`, read-only on tenants |
| `platform_support`      | Read tenants, `users.impersonate`, `feature_flags.toggle`, `tickets.*`             |
| `platform_engineer`     | Read tenants, queues, jobs, audit; safe ops jobs; no billing                       |
| `platform_sales`        | Read tenants (sales-relevant fields), CRM, trial extension                          |
| `platform_readonly`     | Read everything platform-side; no writes                                            |

### 3.2 Tenant roles (default set per school)

| Role                  | Scope                | Core permissions                                                                                          |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `school_admin`        | Full tenant          | All tenant permissions except those reserved for principal (e.g. mark unlock requires principal approval) |
| `principal`           | Full tenant          | Principal-only actions (TC, mark-unlock, fee-waiver-above-threshold, broadcast-all)                       |
| `vice_principal`      | Branch/wing-scoped   | Same as principal but scoped to a branch/wing                                                              |
| `class_teacher`       | Own class            | Teacher perms + own-class report card finalize, own-class parent broadcast                                |
| `teacher`             | Own subjects/classes | `attendance.create` (own classes), `marks.create/update` (own subjects, in window), `notices.create` (own class), `messages.send` (own students) |
| `accountant`          | Tenant-wide finance  | `fees.*`, `invoices.*`, `receipts.*`, `discounts.create` (within threshold), `refunds.create` (with approval) |
| `clerk`               | Office               | `students.create/update`, `documents.*`, `certificates.issue` (most types), `visitor.*`                    |
| `librarian`           | Library              | `library.*`                                                                                                |
| `transport_incharge`  | Transport            | `transport.*`, `vehicle_attendance.*`                                                                      |
| `hostel_warden`       | Hostel               | `hostel.*`, `hostel_attendance.*`, `visitor.create`                                                        |
| `parent`              | Own children only    | Read child's records, `fees.pay`, `messages.send` to class teacher, `leave.apply`, `notices.acknowledge`   |
| `student`             | Own data only        | Read timetable, marks, notices; submit homework; library catalogue                                          |
| `driver`              | Assigned vehicle     | `vehicle_attendance.create`, read assigned route                                                            |
| `security`            | Visitor              | `visitor.*`                                                                                                |

### 3.3 Custom roles
- A school can create a custom role by extending an existing base role and adding/removing specific permissions.
- Custom roles are tenant-scoped. The platform never sees them as built-ins.
- The school cannot create a role that exceeds `school_admin` (no privilege escalation).

---

## 4. Permission examples per module

(Illustrative subset — full registry lives in code as a TypeScript enum + database `permissions` table.)

### Students
- `students.list`, `students.read`, `students.create`, `students.update`, `students.delete`
- `students.documents.upload`, `students.documents.delete`
- `students.transfer_out` (principal/admin only)
- `students.bulk_import` (admin/clerk)

### Attendance
- `attendance.read`, `attendance.create`, `attendance.update`
- `attendance.update_outside_window` (principal only)

### Marks / Exams
- `marks.read.own_subjects`, `marks.read.all`
- `marks.create`, `marks.update.in_window`
- `marks.update_outside_window` (principal only)
- `report_cards.finalize` (class teacher / principal)

### Fees
- `fees.structure.create/update`, `fees.invoice.generate`, `fees.invoice.read`, `fees.invoice.void` (accountant + reason)
- `receipts.create.online`, `receipts.create.offline`
- `discounts.create`, `discounts.create_above_threshold` (principal)
- `refunds.create`, `scholarships.approve` (principal)

### Notifications
- `notifications.send.class`, `notifications.send.section`, `notifications.send.all` (principal)
- `notification_templates.manage` (admin)

### Feature flags / billing (platform-side only)
- `feature_flags.toggle`, `subscriptions.change_plan`, `invoices.refund`, `users.impersonate`

---

## 5. Permission checks in code

- NestJS guard reads `(role, tenantId)` from JWT.
- Decorator on controller method: `@RequirePermission('fees.invoice.void')`.
- Guard checks: does the role have this permission **for this tenant**?
- Some permissions have **scope predicates**: e.g., `attendance.create` for `teacher` only passes if the target class is in the teacher's allocated classes. The predicate is part of the permission resolver, not hardcoded in the controller.

```ts
// Pseudocode — actual code lives in src/auth/permissions.ts
@RequirePermission('marks.create', { scope: 'own_subjects' })
async enterMarks(...) { ... }
```

---

## 6. Approval workflows

Some actions require **multi-actor approval**:

| Action                                        | Initiator     | Approver         |
| --------------------------------------------- | ------------- | ---------------- |
| Mark edit outside window                      | Teacher       | Principal        |
| Fee waiver above threshold                    | Accountant    | Principal        |
| Refund                                        | Accountant    | Principal        |
| Custom role creation                          | School admin  | Principal        |
| TC issuance                                   | Clerk/admin   | Principal        |
| Bulk delete (>50 records)                     | Any           | Principal        |
| Tenant suspension                             | Platform      | Super Admin      |
| Subscription downgrade with data implications | School admin  | Platform support |
| **Account-ownership transfer** (school_admin → new user) | School admin / verified owner | Super Admin (with cool-off & ID verification) |

The approval system itself is a module: an `Approval` entity with `requested_by`, `approver_role`, `payload`, `status`, `decided_by`, `decided_at`, `reason`.

---

## 7. Default seeding per new tenant

When a tenant is created:

1. The base roles in §3.2 are seeded with default permission mappings.
2. The school admin user gets `school_admin`.
3. Permissions are stored in a join table (`role_permissions`) so a school can later customize.
4. Permissions registry is upserted from code on every deploy (idempotent).

---

## 8. UI implications

- Every navigation link and action button is permission-checked. Hidden if not allowed.
- Hidden ≠ unauthorized: server still rechecks. UI is a hint, never a gate.
- Permission tooltip on disabled buttons explains "You need the X permission to do this. Ask your admin."

---

## 9. Auditing

Every permission grant/revoke is audit-logged with actor, target, role, before/after, and reason.

Every **denied** permission attempt on sensitive actions is also logged (helps detect privilege probing).

---

## 10. Anti-patterns

- ❌ Embedding role names in business logic (`if user.role === 'principal'`). Use permission checks.
- ❌ Adding permissions to a request just to "make it work." If a role legitimately needs a permission, change the role mapping; don't bypass the check.
- ❌ Letting "school_admin" act as "principal" without explicit role grant. They are distinct roles for a reason.
- ❌ Cross-tenant role definitions. Custom roles never leak across tenants.
