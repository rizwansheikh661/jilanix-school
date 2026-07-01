/**
 * Static scope registry.
 *
 * Each Prisma model declares a `/// @scope ...` comment in the schema.
 * Long-term we plan to parse those comments from the generated DMMF at
 * boot. For Sprint 1 the model count is small enough that hand-maintaining
 * a registry is faster, less error-prone, and avoids depending on Prisma's
 * undocumented DMMF surface. The registry is checked at boot against the
 * generated client (see `assertScopesCoverGeneratedClient`) so a model
 * added without a registry entry fails fast rather than silently bypassing
 * the tenant-scope extension.
 */

export type ModelScope =
  | 'PLATFORM_ONLY'              // platform table; no schoolId column.
  | 'TENANT_OWNED'               // schoolId required; tenant scope enforced.
  | 'TENANT_SHARED_PLATFORM'     // schoolId nullable; both platform and tenant actors read.
  | 'CROSS_TENANT_OPERATIONAL';  // workers / relays read across tenants.

/**
 * Source of truth for model scopes. Keys are Prisma model names (PascalCase
 * singular, the form used in `prisma.modelName.findMany(...)`).
 */
export const MODEL_SCOPE: Readonly<Record<string, ModelScope>> = Object.freeze({
  // platform.prisma
  School: 'PLATFORM_ONLY',
  SchoolSettings: 'TENANT_OWNED',
  Region: 'PLATFORM_ONLY',

  // identity.prisma
  User: 'TENANT_OWNED',
  UserPassword: 'TENANT_OWNED',
  UserSession: 'TENANT_OWNED',
  UserLoginEvent: 'TENANT_OWNED',
  Role: 'PLATFORM_ONLY',
  Permission: 'PLATFORM_ONLY',
  RolePermission: 'PLATFORM_ONLY',
  UserRole: 'TENANT_OWNED',

  // audit.prisma
  AuditLog: 'CROSS_TENANT_OPERATIONAL',
  AuditAnchor: 'CROSS_TENANT_OPERATIONAL',

  // ops.prisma
  Outbox: 'CROSS_TENANT_OPERATIONAL',
  IdempotencyKey: 'CROSS_TENANT_OPERATIONAL',
  Job: 'CROSS_TENANT_OPERATIONAL',
  TenantSequence: 'TENANT_OWNED',

  // academic.prisma
  AcademicYear: 'TENANT_OWNED',
  Class: 'TENANT_OWNED',
  Section: 'TENANT_OWNED',
  Subject: 'TENANT_OWNED',
  AcademicTerm: 'TENANT_OWNED',
  ClassSubject: 'TENANT_OWNED',
  SectionSubject: 'TENANT_OWNED',
  AcademicYearPromotion: 'TENANT_OWNED',

  // students.prisma
  Student: 'TENANT_OWNED',
  Parent: 'TENANT_OWNED',
  ParentStudentLink: 'TENANT_OWNED',
  Admission: 'TENANT_OWNED',
  AdmissionDocument: 'TENANT_OWNED',
  AdmissionHistory: 'TENANT_OWNED',
  // Sprint 17 — Parent ↔ User junction (parent-portal lifecycle).
  ParentUser: 'TENANT_OWNED',

  // staff.prisma
  Staff: 'TENANT_OWNED',
  StaffEmploymentHistory: 'TENANT_OWNED',
  StaffQualification: 'TENANT_OWNED',
  StaffSubjectQualification: 'TENANT_OWNED',
  StaffSectionAssignment: 'TENANT_OWNED',
  ClassTeacher: 'TENANT_OWNED',
  StaffLeave: 'TENANT_OWNED',
  StaffDocument: 'TENANT_OWNED',

  // schools.prisma (Sprint 4.5)
  SchoolProfile: 'TENANT_OWNED',
  SchoolBranding: 'TENANT_OWNED',
  SchoolContactInformation: 'TENANT_OWNED',
  SchoolDocument: 'TENANT_OWNED',

  // branches.prisma (Sprint 4.5)
  Branch: 'TENANT_OWNED',
  BranchSettings: 'TENANT_OWNED',

  // organization.prisma (Sprint 4.5)
  Department: 'TENANT_OWNED',
  Designation: 'TENANT_OWNED',

  // houses.prisma (Sprint 4.5)
  House: 'TENANT_OWNED',
  HouseAssignment: 'TENANT_OWNED',

  // rooms.prisma (Sprint 4.5)
  RoomType: 'TENANT_OWNED',
  Room: 'TENANT_OWNED',

  // calendar.prisma (Sprint 4.5)
  WorkingDaysConfiguration: 'TENANT_OWNED',
  CalendarEvent: 'TENANT_OWNED',
  Holiday: 'TENANT_OWNED',

  // files.prisma (Sprint 5)
  FileAsset: 'TENANT_SHARED_PLATFORM',
  FileAssetAclGrant: 'TENANT_OWNED',

  // flags.prisma (Sprint 5)
  FeatureFlagDefinition: 'PLATFORM_ONLY',
  FeatureFlagPlanMap: 'PLATFORM_ONLY',
  FeatureFlagTenantOverride: 'TENANT_OWNED',
  FeatureFlagRollout: 'PLATFORM_ONLY',
  FeatureFlagAuditLog: 'TENANT_SHARED_PLATFORM',

  // ops.prisma (Sprint 5 additions)
  JobDefinition: 'CROSS_TENANT_OPERATIONAL',
  JobRun: 'CROSS_TENANT_OPERATIONAL',
  JobDeadLetter: 'CROSS_TENANT_OPERATIONAL',

  // attendance.prisma (Sprint 6)
  AttendanceDaily: 'TENANT_OWNED',
  StaffAttendance: 'TENANT_OWNED',
  AttendanceLockWindow: 'TENANT_OWNED',
  AttendanceCorrection: 'TENANT_OWNED',
  AttendanceStatusHistory: 'TENANT_OWNED',
  AttendanceConfig: 'TENANT_OWNED',

  // timetable.prisma (Sprint 7)
  PeriodTemplate: 'TENANT_OWNED',
  PeriodTemplatePeriod: 'TENANT_OWNED',
  TimetableVersion: 'TENANT_OWNED',
  TimetableEntry: 'TENANT_OWNED',
  TeacherLoad: 'TENANT_OWNED',
  TeacherAvailability: 'TENANT_OWNED',
  TimetableConflict: 'TENANT_OWNED',
  TimetableSubstitution: 'TENANT_OWNED',

  // examination.prisma (Sprint 8)
  ExamScheme: 'TENANT_OWNED',
  ExamSchemeBand: 'TENANT_OWNED',
  Exam: 'TENANT_OWNED',
  ExamClassMap: 'TENANT_OWNED',
  ExamSectionMap: 'TENANT_OWNED',
  ExamSchedule: 'TENANT_OWNED',
  ExamMarks: 'TENANT_OWNED',
  ExamMarksEditHistory: 'TENANT_OWNED',
  ExamResult: 'TENANT_OWNED',
  ExamSubjectResult: 'TENANT_OWNED',

  // fees.prisma (Sprint 9)
  FeeHead: 'TENANT_OWNED',
  FeeStructure: 'TENANT_OWNED',
  FeeStructureLine: 'TENANT_OWNED',
  FeeDiscount: 'TENANT_OWNED',
  StudentFeeDiscount: 'TENANT_OWNED',
  FeeLateFinePolicy: 'TENANT_OWNED',
  FeeInvoice: 'TENANT_OWNED',
  FeeInvoiceLine: 'TENANT_OWNED',
  FeePayment: 'TENANT_OWNED',
  FeePaymentAllocation: 'TENANT_OWNED',
  FeeReceipt: 'TENANT_OWNED',
  FeeRefund: 'TENANT_OWNED',

  // notifications.prisma (Sprint 10)
  NotificationTemplate: 'TENANT_OWNED',
  NotificationTemplateVersion: 'TENANT_OWNED',
  NotificationMessage: 'TENANT_OWNED',
  NotificationMessageEvent: 'TENANT_OWNED',
  NotificationUserPreference: 'TENANT_OWNED',
  NotificationCampaign: 'TENANT_OWNED',
  NotificationCampaignRecipient: 'TENANT_OWNED',
  // Singleton row per school with mutable usage counters — neither soft-delete
  // nor append-only. Service auto-upserts on first access.
  SchoolCommunicationEntitlement: 'TENANT_OWNED',

  // events.prisma (Sprint 11)
  Event: 'TENANT_OWNED',
  EventParticipant: 'TENANT_OWNED',
  EventAttendance: 'TENANT_OWNED',
  EventDocument: 'TENANT_OWNED',
  EventFeeAssignment: 'TENANT_OWNED',
  EventResult: 'TENANT_OWNED',

  // academic-content.prisma (Sprint 12)
  Homework: 'TENANT_OWNED',
  HomeworkAttachment: 'TENANT_OWNED',
  Assignment: 'TENANT_OWNED',
  AssignmentAttachment: 'TENANT_OWNED',
  AssignmentSubmission: 'TENANT_OWNED',
  AssignmentSubmissionAttachment: 'TENANT_OWNED',
  Syllabus: 'TENANT_OWNED',
  SyllabusNode: 'TENANT_OWNED',

  // reporting.prisma (Sprint 13)
  ReportRun: 'TENANT_OWNED',
  ImportJob: 'TENANT_OWNED',
  ImportJobIssue: 'TENANT_OWNED',
  BulkOperation: 'TENANT_OWNED',
  Dashboard: 'TENANT_OWNED',
  DashboardWidget: 'TENANT_OWNED',
  ReportSchedule: 'TENANT_OWNED',
  ReportTemplate: 'TENANT_OWNED',

  // platform.prisma (Sprint 14 — Super Admin & School Provisioning)
  Plan: 'PLATFORM_ONLY',
  SchoolProvisioningRun: 'CROSS_TENANT_OPERATIONAL',

  // identity.prisma (Sprint 14 — Super Admin & School Provisioning)
  PasswordResetRequest: 'TENANT_OWNED',

  // subscriptions.prisma (Sprint 15 — SaaS Subscription & Plan Management)
  PlanFeature: 'PLATFORM_ONLY',
  Subscription: 'TENANT_OWNED',
  SubscriptionHistory: 'TENANT_OWNED',
  SchoolUsage: 'TENANT_OWNED',
  UsageEvent: 'TENANT_OWNED',
  UsageThresholdState: 'TENANT_OWNED',
});

export function getModelScope(model: string): ModelScope | undefined {
  return MODEL_SCOPE[model];
}

/**
 * Models that own a `deletedAt` column and should opt into the soft-delete
 * extension. Kept narrow on purpose — only soft-delete what the product
 * actually demands a restore path for.
 */
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  'School',
  'SchoolSettings',
  'AcademicYear',
  'Class',
  'Section',
  'Subject',
  'AcademicTerm',
  'AcademicYearPromotion',
  'Student',
  'Parent',
  'Admission',
  // Sprint 17 — ParentUser is soft-delete so an archived parent-portal user
  // can be restored without losing history. Status=ARCHIVED is the canonical
  // tombstone, but soft-delete kept for hard cleanups (GDPR).
  'ParentUser',
  'Staff',
  'StaffLeave',
  // Sprint 4.5 — soft-delete only what the product needs a restore path for.
  // Excluded on purpose: HouseAssignment (history-style, supersede via
  // endedOn), WorkingDaysConfiguration (history-style, supersede via
  // effective windows), SchoolBranding (single row per school — no restore),
  // BranchSettings (single row per branch — no restore).
  'SchoolProfile',
  'SchoolContactInformation',
  'SchoolDocument',
  'Branch',
  'Department',
  'Designation',
  'House',
  'RoomType',
  'Room',
  'CalendarEvent',
  'Holiday',
  // Sprint 5 — soft-delete the file metadata so admins can restore an asset
  // (the underlying object stays on disk until the cleanup job runs).
  'FileAsset',
  // Sprint 6 — attendance soft-deletes. Lock-window soft-delete = "unlocked".
  'AttendanceDaily',
  'StaffAttendance',
  'AttendanceLockWindow',
  'AttendanceConfig',
  // Sprint 7 — timetable soft-deletes. Conflict is APPEND_ONLY,
  // PeriodTemplatePeriod cascades with its template.
  'PeriodTemplate',
  'TimetableVersion',
  'TimetableEntry',
  'TeacherLoad',
  'TeacherAvailability',
  'TimetableSubstitution',
  // Sprint 8 — examination soft-deletes. Edit-history is APPEND_ONLY,
  // ExamSchemeBand / ExamClassMap / ExamSectionMap cascade with parent.
  'ExamScheme',
  'Exam',
  'ExamSchedule',
  'ExamMarks',
  'ExamResult',
  'ExamSubjectResult',
  // Sprint 9 — fees soft-deletes. FeePaymentAllocation + FeeRefund are
  // APPEND_ONLY (immutable money trail); FeeReceipt soft-delete is reserved
  // for housekeeping — cancellation flips `status=CANCELLED` instead.
  'FeeHead',
  'FeeStructure',
  'FeeStructureLine',
  'FeeDiscount',
  'StudentFeeDiscount',
  'FeeLateFinePolicy',
  'FeeInvoice',
  'FeeInvoiceLine',
  'FeePayment',
  'FeeReceipt',
  // Sprint 10 — notifications soft-deletes. Append-only sub-tables
  // (NotificationTemplateVersion, NotificationMessageEvent,
  // NotificationCampaignRecipient) live in APPEND_ONLY_MODELS instead.
  // SchoolCommunicationEntitlement is excluded — singleton row with mutable
  // counters; deletion would orphan the running window.
  'NotificationTemplate',
  'NotificationMessage',
  'NotificationUserPreference',
  'NotificationCampaign',
  // Sprint 11 — events soft-deletes. EventAttendance is APPEND_ONLY.
  'Event',
  'EventParticipant',
  'EventDocument',
  'EventFeeAssignment',
  'EventResult',
  // Sprint 12 — academic-content soft-deletes. No APPEND_ONLY additions.
  'Homework',
  'HomeworkAttachment',
  'Assignment',
  'AssignmentAttachment',
  'AssignmentSubmission',
  'AssignmentSubmissionAttachment',
  'Syllabus',
  'SyllabusNode',
  // Sprint 13 — reporting / data-ops soft-deletes. No APPEND_ONLY additions
  // (counters live on the parent rows; per-row issues stay queryable for
  // post-mortem so admins can restore an accidentally deleted import-job
  // and its issues together).
  'ReportRun',
  'ImportJob',
  'ImportJobIssue',
  'BulkOperation',
  'Dashboard',
  'DashboardWidget',
  'ReportSchedule',
  'ReportTemplate',
  // Sprint 14 — soft-delete on Plan only. PasswordResetRequest uses
  // `cancelledAt`/`consumedAt` instead; SchoolProvisioningRun is append-only.
  'Plan',
  // Sprint 15 — subscription foundation soft-deletes. PlanFeature (catalog) and
  // Subscription (per-school) both carry soft-delete + STORED `deleted_at_key`.
  // SchoolUsage is mutable singleton (no soft-delete), UsageThresholdState is
  // mutable singleton-per-key (no soft-delete), UsageEvent and SubscriptionHistory
  // are APPEND_ONLY.
  'PlanFeature',
  'Subscription',
]);

export function isSoftDeleteModel(model: string): boolean {
  return SOFT_DELETE_MODELS.has(model);
}

/**
 * Models that are write-once / append-only. The audit extension refuses to
 * generate a second audit row for changes to these (since by definition
 * there are none) and the soft-delete extension never rewrites their
 * deletes. Useful guardrail when someone tries to "fix" an audit row in a
 * hotpatch.
 */
export const APPEND_ONLY_MODELS: ReadonlySet<string> = new Set([
  'AuditLog',
  'UserLoginEvent',
  // Sprint 5 — both grow monotonically; rewriting them defeats the audit trail.
  'JobRun',
  'FeatureFlagAuditLog',
  // Sprint 6 — append-only status ledger.
  'AttendanceStatusHistory',
  // Sprint 7 — append-only conflict detection log.
  'TimetableConflict',
  // Sprint 8 — append-only marks edit history.
  'ExamMarksEditHistory',
  // Sprint 9 — immutable money trail. Allocation reversal writes
  // `reversedAt` rather than mutating; refunds are write-once.
  'FeePaymentAllocation',
  'FeeRefund',
  // Sprint 10 — append-only notification sub-tables. Template versions are
  // immutable history; message events are a per-message ledger; campaign
  // recipients are a resolution log.
  'NotificationTemplateVersion',
  'NotificationMessageEvent',
  'NotificationCampaignRecipient',
  // Sprint 11 — append-only event attendance ledger. Latest-row-wins
  // aggregation drives the current participant status; counters on Event
  // are recomputed inside the same tx.
  'EventAttendance',
  // Sprint 15 — subscription/usage append-only ledgers. SubscriptionHistory is
  // the journal of every state change; UsageEvent is the per-delta ledger that
  // backs SchoolUsage and reconciliation via `recompute()`.
  'SubscriptionHistory',
  'UsageEvent',
]);

export function isAppendOnlyModel(model: string): boolean {
  return APPEND_ONLY_MODELS.has(model);
}
