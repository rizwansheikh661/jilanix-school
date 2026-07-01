# API ↔ UI Mapping

> **Status:** Frozen mapping. Reference for every frontend sprint.
> **Purpose:** For each backend module in `BACKEND_FREEZE_v1.md` §3, enumerate the backend endpoints, the frontend pages they power, the portal(s) they live in, the shared components/forms/tables/dialogs involved, the permissions and the feature flag (if any) that gate them.
> **Companion:** `PORTAL_SCREEN_PLANNING.md` (route paths), `FRONTEND_UI_SPECIFICATION.md` (component standards).

Conventions:
- Endpoint paths shown without the `/api/v1` prefix (URI versioning is frozen — every path implicitly carries it).
- Portal codes: **PL** Platform, **SA** SchoolAdmin, **TC** Teacher, **ST** Student, **PR** Parent, **SH** Shared.
- Component / form / table / dialog names are the conventions from `COMPONENT_INVENTORY.md` and `FRONTEND_UI_SPECIFICATION.md`.

---

## 1. Authentication & Identity

| Backend endpoints | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`, `POST /auth/change-password`, `GET /auth/me`, `GET /auth/me/permissions` |
|---|---|
| Frontend pages | `/login`, `/forgot-password`, `/reset-password`, `/change-password` |
| Portal | SH |
| Components | `<AppHeader>` user menu, `<RBACProvider>` |
| Forms | LoginForm, ForgotPasswordForm, ResetPasswordForm, ChangePasswordForm |
| Tables | — |
| Dialogs | SessionExpiredDialog |
| Permissions | None (public for auth flow); `GET /auth/me*` requires authenticated session |
| Feature flags | — |

---

## 2. RBAC

| Backend endpoints | `GET /rbac/roles`, `POST /rbac/roles`, `PATCH /rbac/roles/:id`, `DELETE /rbac/roles/:id`, `GET /rbac/permissions`, `POST /rbac/role-assignments` |
|---|---|
| Frontend pages | `/settings/rbac` (SA), `/platform/rbac` (PL) |
| Portal | SA, PL |
| Components | `<PermissionMatrix>`, `<RoleCard>` |
| Forms | RoleForm |
| Tables | RolesTable, PermissionsTable |
| Dialogs | ConfirmDeleteRoleDialog, AssignRoleDialog |
| Permissions | `rbac.read`, `rbac.write` |
| Feature flags | — (always on) |

---

## 3. Multi-Tenant Foundation (RequestContext)

| Backend endpoints | Implicit; `RequestContextRegistry` resolves tenant per request via subdomain header + JWT. No public endpoint. |
|---|---|
| Frontend pages | — (middleware only) |
| Portal | All |
| Components | `<TenantSwitcher>` (PL only) |
| Forms | — |
| Tables | — |
| Dialogs | — |
| Permissions | Tenant scope enforced server-side; UI passes through |
| Feature flags | — |

---

## 4. Organization & Branch

| Backend endpoints | `GET /organizations`, `PATCH /organizations/:id`, `GET /branches`, `POST /branches`, `PATCH /branches/:id`, `DELETE /branches/:id` |
|---|---|
| Frontend pages | `/settings/organization`, `/branches`, `/branches/[id]` |
| Portal | SA |
| Components | `<BranchCard>` |
| Forms | OrganizationForm, BranchForm (`<IfMatchForm>`) |
| Tables | BranchesTable (CursorPaginator) |
| Dialogs | ConfirmArchiveBranchDialog |
| Permissions | `organization.read`, `organization.write`, `branch.read`, `branch.write` |
| Feature flags | — |

---

## 5. School Management

| Backend endpoints | `GET /schools/:id`, `PATCH /schools/:id`, `GET /schools/:id/settings`, `PATCH /schools/:id/settings` |
|---|---|
| Frontend pages | `/settings/school`, `/settings/branding` (placeholder), `/platform/schools/[id]` |
| Portal | SA, PL |
| Components | `<SchoolProfileCard>` |
| Forms | SchoolProfileForm (`<IfMatchForm>`), SchoolSettingsForm |
| Tables | — |
| Dialogs | — |
| Permissions | `school.read`, `school.write` |
| Feature flags | — |

---

## 6. Academic (year / term / class / section / subject)

| Backend endpoints | `GET/POST/PATCH/DELETE /academic/years`, `.../terms`, `.../classes`, `.../sections`, `.../subjects` |
|---|---|
| Frontend pages | `/academic/years`, `/academic/terms`, `/academic/classes`, `/academic/sections`, `/academic/subjects` |
| Portal | SA |
| Components | `<AcademicYearCard>`, `<ClassCard>` |
| Forms | AcademicYearForm, TermForm, ClassForm, SectionForm, SubjectForm |
| Tables | YearsTable, TermsTable, ClassesTable, SectionsTable, SubjectsTable |
| Dialogs | ConfirmArchiveYearDialog (warns about cascading) |
| Permissions | `academic.read`, `academic.write` |
| Feature flags | — |

---

## 7. Student

| Backend endpoints | `GET/POST/PATCH /students`, `GET /students/:id`, `POST /students/:id/users`, `POST /students/:id/users/resend-invite`, `POST /students/:id/users/suspend|reactivate|archive`, `GET /students/me/profile`, `GET /students/me/academic-year`, `GET /students/me/class`, `GET /students/me/section`, `GET /students/me/preferences`, `PATCH /students/me/preferences`, `POST /students/promotion` |
|---|---|
| Frontend pages | `/students`, `/students/[id]`, `/students/new`, `/students/promotion` (SA); `/dashboard`, `/me/profile`, `/me/academic-year`, `/me/class`, `/me/section`, `/me/preferences` (ST) |
| Portal | SA, ST |
| Components | `<StudentCard>`, `<StudentDetailTabs>`, `<StatusBadge>`, `<PermissionGate>` |
| Forms | AddStudentForm, EditStudentForm (`<IfMatchForm>`), StudentInviteForm, BulkPromotionForm, StudentPreferenceForm |
| Tables | StudentsTable (grid + table toggle, CursorPaginator) |
| Dialogs | ConfirmArchiveStudentDialog, ConfirmSuspendStudentUserDialog, ConvertAdmissionDialog (cross-module) |
| Permissions | `student.read`, `student.write`, `student-user.invite|read|suspend|reactivate|archive`, `student.read-self` |
| Feature flags | `student_portal` gates ST routes + admin invite endpoints |

---

## 8. Parent

| Backend endpoints | `GET/POST/PATCH /parents`, `GET /parents/:id`, `POST /parents/:id/users`, `POST /parents/:id/users/{resend|suspend|reactivate|archive}`, `GET /parents/me/profile`, `GET /parents/me/children`, `GET /parents/me/children/:id`, `GET /parents/me/preferences`, `PATCH /parents/me/preferences`, `POST /parent-student-links`, `DELETE /parent-student-links/:id` |
|---|---|
| Frontend pages | `/parents`, `/parents/[id]`, `/parents/new` (SA); `/dashboard`, `/me/children`, `/me/children/[id]`, `/me/profile`, `/me/preferences` (PR) |
| Portal | SA, PR |
| Components | `<ParentCard>`, `<ChildSwitcher>`, `<StatusBadge>` |
| Forms | AddParentForm, EditParentForm (`<IfMatchForm>`), ParentInviteForm, LinkChildForm, ParentPreferenceForm |
| Tables | ParentsTable (CursorPaginator), LinkedChildrenTable |
| Dialogs | ConfirmRemoveLinkDialog, ConfirmSuspendParentUserDialog |
| Permissions | `parent.read`, `parent.write`, `parent-user.invite|read|suspend|reactivate|archive`, `parent.read-self`, `parent-student-link.write` |
| Feature flags | `parent_portal` gates PR routes + admin invite endpoints |

---

## 9. Admission

| Backend endpoints | `GET/POST /admissions`, `GET /admissions/:id`, `PATCH /admissions/:id`, `POST /admissions/:id/approve|reject|convert` |
|---|---|
| Frontend pages | `/admissions`, `/admissions/[id]`, `/admissions/new` |
| Portal | SA |
| Components | `<AdmissionTimeline>`, `<DocumentUpload>` |
| Forms | AdmissionApplicationForm, AdmissionReviewForm |
| Tables | AdmissionsTable (filter by status) |
| Dialogs | ApproveAdmissionDialog, RejectAdmissionDialog, ConvertToStudentDialog |
| Permissions | `admission.read`, `admission.write`, `admission.approve` |
| Feature flags | — |

---

## 10. Staff (incl. teachers)

| Backend endpoints | `GET/POST/PATCH /staff`, `GET /staff/:id`, `GET /staff/departments`, `POST /staff/departments` |
|---|---|
| Frontend pages | `/staff`, `/staff/[id]`, `/teachers`, `/teachers/[id]`, `/teachers/new`, `/departments` |
| Portal | SA |
| Components | `<StaffCard>`, `<DepartmentChip>` |
| Forms | AddStaffForm, EditStaffForm (`<IfMatchForm>`), DepartmentForm |
| Tables | StaffTable, TeachersTable, DepartmentsTable |
| Dialogs | ConfirmArchiveStaffDialog |
| Permissions | `staff.read`, `staff.write`, `department.write` |
| Feature flags | — |

---

## 11. Attendance

| Backend endpoints | `GET /attendance/sessions`, `POST /attendance/sessions/:id/mark`, `GET /attendance/summary`, `GET /attendance/student/:id` |
|---|---|
| Frontend pages | `/attendance`, `/attendance/mark` (SA); teacher's mark-attendance flow within `/me/classes/[id]/attendance` (TC) |
| Portal | SA, TC |
| Components | `<AttendanceGrid>`, `<AttendanceSummaryCard>` |
| Forms | MarkAttendanceForm (bulk), CorrectAttendanceForm |
| Tables | AttendanceSummaryTable, StudentAttendanceHistoryTable |
| Dialogs | ConfirmBulkAttendanceDialog |
| Permissions | `attendance.read`, `attendance.write` |
| Feature flags | — |

---

## 12. Timetable

| Backend endpoints | `GET /timetable`, `PATCH /timetable`, `GET /timetable/class/:id`, `GET /me/timetable` |
|---|---|
| Frontend pages | `/timetable`, `/timetable/class/[id]` (SA); `/me/timetable` (TC); read-only views in ST/PR (deferred) |
| Portal | SA, TC |
| Components | `<TimetableCalendar>` (FullCalendar), `<PeriodCard>` |
| Forms | EditPeriodForm (`<IfMatchForm>`) |
| Tables | — (calendar view) |
| Dialogs | EditPeriodDialog, ConflictResolutionDialog |
| Permissions | `timetable.read`, `timetable.write` |
| Feature flags | — |

---

## 13. Homework / Assignments / Syllabus (Academic Content)

| Backend endpoints | `GET/POST /academic-content/homework`, `PATCH /academic-content/homework/:id`, `GET /academic-content/assignments`, `GET /academic-content/syllabus` |
|---|---|
| Frontend pages | `/homework`, `/homework/new`, `/assignments`, `/syllabus` (SA); `/me/homework`, `/me/homework/new` (TC); read-only views in ST/PR (deferred) |
| Portal | SA, TC |
| Components | `<HomeworkCard>`, `<RichTextEditor>` (TipTap), `<FileDropzone>` |
| Forms | HomeworkForm, AssignmentForm, SyllabusForm |
| Tables | HomeworkTable |
| Dialogs | ConfirmDeleteHomeworkDialog |
| Permissions | `academic-content.read`, `academic-content.write` |
| Feature flags | — |

---

## 14. Examination

| Backend endpoints | `GET/POST /examinations`, `PATCH /examinations/:id`, `POST /examinations/:id/results`, `GET /examinations/report-cards`, `GET /examinations/student/:id/results` |
|---|---|
| Frontend pages | `/exams`, `/exams/[id]`, `/exams/report-cards` (SA); `/me/exams/[id]/results` (TC) |
| Portal | SA, TC |
| Components | `<ExamScheduleCard>`, `<GradeEntryGrid>`, `<ReportCardPreview>` |
| Forms | ExamForm, GradeEntryForm |
| Tables | ExamsTable, ResultsTable, ReportCardsTable |
| Dialogs | PublishResultsDialog (requires typed confirmation) |
| Permissions | `examination.read`, `examination.write`, `examination.publish` |
| Feature flags | — |

---

## 15. School Fees (charges parents) + Hybrid Fee Collection

| Backend endpoints | `GET/POST /fees/groups`, `GET/POST /fees/types`, `GET/POST /fees/master`, `GET /fees/invoices`, `GET /fees/invoices/:id`, `POST /fees/payments`, `POST /fees/payments/manual`, `POST /fees/refunds`, `GET /fees/collections` |
|---|---|
| Frontend pages | `/fees/groups`, `/fees/types`, `/fees/master`, `/fees/collections`, `/fees/invoices`, `/fees/invoices/[id]` (SA); `/me/children/[id]/fees` + pay-invoice modal (PR) |
| Portal | SA, PR |
| Components | `<FeeInvoiceCard>`, `<PaymentMethodSelector>`, `<RazorpayCheckout>`, `<ManualPaymentForm>` |
| Forms | FeeGroupForm, FeeTypeForm, FeeMasterForm, PayInvoiceForm, ManualPaymentForm, RefundForm |
| Tables | InvoicesTable, CollectionsTable |
| Dialogs | PayInvoiceDialog, RecordManualPaymentDialog, RefundDialog (typed confirm) |
| Permissions | `fees.read`, `fees.write`, `fees.collect`, `fees.refund` |
| Feature flags | `module.fees` (always on for SA in v1); Razorpay availability via `module.fees_online` if defined |

> **Separation:** This module is School Fees only. SaaS Billing (§22) lives in entirely separate routes (`/platform/billing/*`, `/settings/billing/*`). No shared components, no shared dialogs.

---

## 16. Notification / Communication Foundation

| Backend endpoints | `GET /notifications/events`, `GET /me/preferences`, `PATCH /me/preferences`, `GET /me/notifications`, `POST /me/notifications/:id/read` |
|---|---|
| Frontend pages | `/settings/notifications` (all portals via `/me/preferences`), header notification drawer |
| Portal | All |
| Components | `<NotificationDrawer>`, `<NotificationBell>`, `<PreferenceMatrix>` |
| Forms | NotificationPreferenceForm |
| Tables | NotificationEventsTable (PL diagnostic) |
| Dialogs | — |
| Permissions | All users have `me.notifications.read|write`; event catalog needs `notification.read` |
| Feature flags | — |

---

## 17. Communication Center

| Backend endpoints | `GET/POST /communication/campaigns`, `GET /communication/campaigns/:id`, `POST /communication/campaigns/:id/send`, `GET/POST /communication/templates` |
|---|---|
| Frontend pages | `/communication/compose`, `/communication/campaigns`, `/communication/campaigns/[id]`, `/communication/templates` (SA); cross-tenant view in `/platform/communication/campaigns` (PL) |
| Portal | SA, PL |
| Components | `<CampaignComposer>`, `<RecipientSelector>`, `<TemplatePicker>`, `<CampaignTimeline>` |
| Forms | CampaignForm, TemplateForm |
| Tables | CampaignsTable, TemplatesTable |
| Dialogs | SendCampaignConfirmDialog (typed confirm with recipient count), PauseCampaignDialog |
| Permissions | `communication.read`, `communication.write`, `communication.send` |
| Feature flags | `communication.center` gates all routes |

---

## 18. Reporting Foundation (incl. Import / Export / Bulk)

| Backend endpoints | `GET /reporting/definitions`, `POST /reporting/exports`, `GET /reporting/exports`, `GET /reporting/exports/:id`, `POST /reporting/imports`, `GET /reporting/imports`, `GET /reporting/imports/:id`, `POST /reporting/bulk` |
|---|---|
| Frontend pages | `/reports`, `/reports/students`, `/reports/finance`, `/reports/attendance`, `/reports/classes`, `/reports/imports`, `/reports/exports`, `/reports/bulk` |
| Portal | SA (and module-scoped views in PL) |
| Components | `<ReportFilters>`, `<JobStatusCard>` |
| Forms | ReportFilterForm, BulkImportForm |
| Tables | ImportJobsTable, ExportJobsTable, ReportResultsTable |
| Dialogs | StartExportDialog, BulkOperationConfirmDialog |
| Permissions | `report.read`, `report.export`, `report.import`, `report.bulk` |
| Feature flags | — |

---

## 19. Events & Activities

| Backend endpoints | `GET/POST /events`, `PATCH /events/:id`, `GET /events/calendar`, `POST /events/:id/rsvp` |
|---|---|
| Frontend pages | `/events`, `/events/[id]`, `/calendar` |
| Portal | SA, ST, PR (read-only) |
| Components | `<EventCard>`, `<CalendarView>` (FullCalendar) |
| Forms | EventForm, RSVPForm |
| Tables | EventsTable |
| Dialogs | CreateEventDialog, EditEventDialog, RSVPDialog |
| Permissions | `event.read`, `event.write`, `event.rsvp` |
| Feature flags | — |

---

## 20. Super Admin + Provisioning + Lifecycle

| Backend endpoints | `GET /super-admin/schools`, `GET /super-admin/schools/:id`, `POST /super-admin/provisioning`, `POST /super-admin/schools/:id/suspend|archive|reactivate`, `GET /super-admin/health` |
|---|---|
| Frontend pages | `/platform/dashboard`, `/platform/schools`, `/platform/schools/[id]`, `/platform/schools/new` (wizard) |
| Portal | PL |
| Components | `<TenantSwitcher>`, `<ProvisioningWizard>`, `<SchoolHealthCard>` |
| Forms | ProvisionSchoolForm (multi-step wizard) |
| Tables | SchoolsTable |
| Dialogs | SuspendSchoolDialog (typed confirm), ArchiveSchoolDialog (typed confirm) |
| Permissions | `super-admin.*`, `provisioning.create` |
| Feature flags | — |

---

## 21. SaaS Subscription

| Backend endpoints | `GET /subscription/plans`, `GET /subscription/:schoolId`, `PATCH /subscription/:schoolId`, `GET /subscription/:schoolId/history`, `POST /subscription/:schoolId/change-plan`, `GET /subscription/me` |
|---|---|
| Frontend pages | `/platform/plans`, `/platform/schools/[id]/subscription` (PL); `/settings/subscription` (SA self-view) |
| Portal | PL, SA |
| Components | `<PlanCard>`, `<SubscriptionStateBadge>`, `<SubscriptionHistoryTimeline>` |
| Forms | ChangePlanForm |
| Tables | PlansTable, SubscriptionHistoryTable |
| Dialogs | ChangePlanDialog (shows pro-rated impact), CancelSubscriptionDialog |
| Permissions | `subscription.read`, `subscription.write`, `subscription.change-plan` |
| Feature flags | — |

---

## 22. SaaS Billing Foundation (charges schools)

| Backend endpoints | `GET /billing/accounts`, `GET /billing/accounts/:id`, `GET /billing/invoices`, `GET /billing/invoices/:id`, `POST /billing/invoices/:id/pay` (Razorpay-initiated), `POST /billing/payments/manual`, `POST /billing/refunds`, `GET /billing/credit-notes/:id`, `GET /billing/adjustments`, `GET/POST /billing/payment-sources`, `GET /billing/audits` |
|---|---|
| Frontend pages | `/platform/billing/accounts`, `/platform/billing/accounts/[id]`, `/platform/billing/invoices`, `/platform/billing/invoices/[id]`, `/platform/billing/credit-notes/[id]`, `/platform/billing/adjustments`, `/platform/billing/payment-sources`, `/platform/billing/audit` (PL); `/settings/subscription`, `/settings/billing/invoices`, `/settings/billing/invoices/[id]`, `/settings/billing/payment-methods` (SA self-view) |
| Portal | PL, SA |
| Components | `<BillingInvoiceCard>`, `<RazorpayKeyForm>` (encrypted), `<BillingAuditTimeline>`, `<TaxBreakdown>` |
| Forms | ManualPaymentForm, RefundForm, CreditNoteForm, AdjustmentForm, RazorpayConfigForm |
| Tables | BillingAccountsTable, BillingInvoicesTable, RefundsTable, CreditNotesTable, AdjustmentsTable, BillingAuditTable |
| Dialogs | RecordManualPaymentDialog, RefundDialog (typed confirm), CreditNoteDialog, AdjustmentDialog (typed confirm) |
| Permissions | `billing.account.read`, `billing.invoice.read`, `billing.payment.write`, `billing.refund.write`, `billing.credit-note.write`, `billing.adjustment.write`, `billing.payment-source.write`, `billing.audit.read` |
| Feature flags | `module.billing`, `module.billing_razorpay`, `module.billing_admin` |

> **Separation:** SaaS Billing is independent from School Fees (§15). UI tree, components, dialogs, and routes are disjoint. `BillingSubscriptionIntegrationService` is the only seam to Subscription (§21) — surfaced as labels on UI only; UI never calls Subscription endpoints from a Billing component directly.

---

## 23. Settings (SchoolAdmin-side)

| Backend endpoints | `GET/PATCH /schools/:id`, `GET/PATCH /schools/:id/settings`, `GET /sequences`, `GET /audit/entries`, `GET /feature-flags?self=true` |
|---|---|
| Frontend pages | `/settings/school`, `/settings/branding`, `/settings/users`, `/settings/rbac`, `/settings/notifications`, `/settings/sequences`, `/settings/audit`, `/settings/features` |
| Portal | SA |
| Components | `<SettingsNav>` |
| Forms | (per page) |
| Tables | SequencesTable, AuditTable, UsersTable, FeatureFlagsTable |
| Dialogs | (per page) |
| Permissions | various `settings.*` |
| Feature flags | — |

---

## 24. Profile & Notification Preferences (cross-portal)

| Backend endpoints | `GET /me/profile`, `PATCH /me/profile`, `GET/PATCH /me/preferences`, `POST /me/password` |
|---|---|
| Frontend pages | `/me/profile`, `/me/preferences`, `/change-password` |
| Portal | All |
| Components | `<ProfileCard>`, `<PreferenceMatrix>` |
| Forms | ProfileForm (`<IfMatchForm>`), PreferenceForm, ChangePasswordForm |
| Tables | — |
| Dialogs | ConfirmEmailChangeDialog |
| Permissions | implicit "self" |
| Feature flags | — |

---

## 25. Platform-only diagnostics

| Backend endpoints | `GET /outbox/events`, `GET /jobs/status`, `GET /audit/entries`, `GET /feature-flags`, `GET /notifications/events` |
|---|---|
| Frontend pages | `/platform/outbox`, `/platform/jobs`, `/platform/audit`, `/platform/flags`, `/platform/notifications/events` |
| Portal | PL |
| Components | `<JobsTable>`, `<OutboxTable>`, `<AuditTimeline>` |
| Forms | — (read-only diagnostics in v1) |
| Tables | JobsTable, OutboxTable, AuditTable, FeatureFlagsTable, NotificationEventsTable |
| Dialogs | RetryJobDialog, ReplayOutboxEventDialog |
| Permissions | `platform.diagnostics.*` |
| Feature flags | — |

---

## 26. Coverage check

| Frozen backend module (per `BACKEND_FREEZE_v1.md` §3) | Covered above? |
|---|---|
| Authentication & Identity | ✓ §1 |
| RBAC | ✓ §2 |
| Multi-Tenant Foundation | ✓ §3 |
| Organization & Branch | ✓ §4 |
| School Management | ✓ §5 |
| Academic | ✓ §6 |
| Student | ✓ §7 |
| Parent | ✓ §8 |
| Admission | ✓ §9 |
| Staff | ✓ §10 |
| Attendance | ✓ §11 |
| Fees & Payments + Hybrid Fee Collection | ✓ §15 |
| Examination | ✓ §14 |
| Timetable | ✓ §12 |
| Notification / Communication Foundation | ✓ §16 |
| Events & Activities | ✓ §19 |
| Academic Content | ✓ §13 |
| Reporting Foundation (+ Import / Export / Bulk) | ✓ §18 |
| Super Admin + Provisioning + Lifecycle | ✓ §20 |
| SaaS Subscription | ✓ §21 |
| Communication Center | ✓ §17 |
| SaaS Billing Foundation | ✓ §22 |

All 22 frozen backend modules are mapped. Settings, Profile/Preferences, and Platform diagnostics (§23–§25) are aggregator surfaces composed of the above modules.

---

## 27. Cross-module rules embedded in this mapping

1. **School Fees and SaaS Billing share zero components / dialogs / pages.** A search for `import` paths between `app/(school)/fees/*` and `app/(school)/settings/billing/*` must return empty.
2. **Billing UI never imports Subscription clients directly.** It uses `BillingSubscriptionIntegrationService`-derived labels via its own billing client.
3. **Notification Foundation vs Communication Center stay separate.** Foundation = per-user preferences + system events. Center = admin-composed campaigns. UI under `/settings/notifications` is Foundation; UI under `/communication/*` is Center.
4. **All cross-tenant operations live in PL portal only.** SchoolAdmin sees only the calling school's data.
5. **Every `me/*` route resolves the calling user via JWT** — no path parameter for self.

This mapping is binding. New endpoints or pages must update this document in the same PR.
