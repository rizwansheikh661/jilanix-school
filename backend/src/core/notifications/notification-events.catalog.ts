/**
 * Notification event catalog — code-side registry of every domain event
 * that may produce a notification. Mirrors the payment-gateway constants
 * registry pattern: definitions are plain `as const` objects and the
 * accompanying `NotificationEventRegistry` exposes runtime lookup with
 * an `UnknownEvent` error.
 *
 * Each entry binds an event key (uppercase + underscores) to:
 *   - category          — drives template lookup + audit grouping.
 *   - defaultPriority   — bypassable by `EventDispatchInput.overridePriority`.
 *   - audience          — USER, PARENT or STUDENT. Decides resolver lambda.
 *   - description       — operator-facing one-liner shown in /events catalog.
 *   - sampleVariables   — realistic payload shape for `/events/{key}/test-fire`
 *                         + Swagger doc samples.
 *
 * Sprint 10 SHIPS the registry but does NOT wire it from the existing
 * domains (FeePaymentService, AttendanceMarkingService, ...). Each domain
 * owner will add `eventDispatcher.dispatch(...)` calls in their own
 * Sprint 10.1 follow-on so payload shapes can be reviewed.
 */
import type {
  NotificationAudienceValue,
  NotificationCategoryValue,
  NotificationPriorityValue,
} from './notifications.constants';

/**
 * Definition of a single event understood by the dispatcher. `key` is the
 * value persisted on `NotificationTemplate.eventKey` and emitted on
 * outbox / audit rows.
 */
export type NotificationEventDefinition = {
  readonly key: string;
  readonly category: NotificationCategoryValue;
  readonly defaultPriority: NotificationPriorityValue;
  readonly audience: NotificationAudienceValue;
  readonly description: string;
  readonly sampleVariables: Readonly<Record<string, unknown>>;
};

/**
 * 16 built-in events covering admissions, attendance, examination, fees,
 * staff, timetable, billing system alerts, and the cross-cutting
 * "pending approvals" digest used by approval workflows.
 */
export const NOTIFICATION_EVENTS = {
  STUDENT_ADMISSION_CREATED: {
    key: 'STUDENT_ADMISSION_CREATED',
    category: 'ADMISSIONS',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'New admission accepted',
    sampleVariables: {
      studentName: 'Aisha Khan',
      admissionNo: 'ADM/2026-27/000042',
      className: 'Grade 5',
      sectionName: 'A',
    },
  },
  STUDENT_ATTENDANCE_MARKED: {
    key: 'STUDENT_ATTENDANCE_MARKED',
    category: 'ATTENDANCE',
    defaultPriority: 'LOW',
    audience: 'PARENT',
    description: 'Daily attendance marked',
    sampleVariables: {
      studentName: 'Aisha Khan',
      date: '2026-06-22',
      status: 'PRESENT',
    },
  },
  STUDENT_ATTENDANCE_ABSENT: {
    key: 'STUDENT_ATTENDANCE_ABSENT',
    category: 'ATTENDANCE',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Student absent today',
    sampleVariables: {
      studentName: 'Aisha Khan',
      date: '2026-06-22',
      sectionName: '5-A',
    },
  },
  EXAM_PUBLISHED: {
    key: 'EXAM_PUBLISHED',
    category: 'EXAMINATION',
    defaultPriority: 'MEDIUM',
    audience: 'USER',
    description: 'Exam schedule published',
    sampleVariables: {
      examName: 'Mid-Term 2026-27',
      startDate: '2026-09-15',
      endDate: '2026-09-25',
    },
  },
  EXAM_RESULT_PUBLISHED: {
    key: 'EXAM_RESULT_PUBLISHED',
    category: 'EXAMINATION',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Result published for exam',
    sampleVariables: {
      studentName: 'Aisha Khan',
      examName: 'Mid-Term 2026-27',
      percentage: 87.5,
      grade: 'A',
    },
  },
  FEE_INVOICE_GENERATED: {
    key: 'FEE_INVOICE_GENERATED',
    category: 'FEES',
    defaultPriority: 'MEDIUM',
    audience: 'PARENT',
    description: 'New fee invoice',
    sampleVariables: {
      studentName: 'Aisha Khan',
      invoiceNo: 'INV/2026-27/000123',
      amount: 12500,
      dueDate: '2026-07-10',
    },
  },
  FEE_PAYMENT_RECEIVED: {
    key: 'FEE_PAYMENT_RECEIVED',
    category: 'FEES',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Fee payment received',
    sampleVariables: {
      studentName: 'Aisha',
      amount: 5000,
      receiptNo: 'RCP/2026-27/000001',
    },
  },
  FEE_DUE_REMINDER: {
    key: 'FEE_DUE_REMINDER',
    category: 'FEES',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Fee due soon',
    sampleVariables: {
      studentName: 'Aisha Khan',
      invoiceNo: 'INV/2026-27/000123',
      balance: 7500,
      dueDate: '2026-07-10',
    },
  },
  FEE_VERIFICATION_PENDING: {
    key: 'FEE_VERIFICATION_PENDING',
    category: 'FEES',
    defaultPriority: 'MEDIUM',
    audience: 'USER',
    description: 'Manual payment awaiting verification',
    sampleVariables: {
      studentName: 'Aisha Khan',
      paymentNo: 'PAY/2026-27/000077',
      method: 'UPI_MANUAL',
      amount: 5000,
    },
  },
  FEE_REFUND_APPROVED: {
    key: 'FEE_REFUND_APPROVED',
    category: 'FEES',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Refund approved',
    sampleVariables: {
      studentName: 'Aisha Khan',
      refundNo: 'REF/2026-27/000004',
      amount: 1500,
    },
  },
  STAFF_LEAVE_REQUEST: {
    key: 'STAFF_LEAVE_REQUEST',
    category: 'STAFF',
    defaultPriority: 'MEDIUM',
    audience: 'USER',
    description: 'New leave request to approve',
    sampleVariables: {
      requesterName: 'R. Sharma',
      leaveType: 'CASUAL',
      fromDate: '2026-07-01',
      toDate: '2026-07-02',
    },
  },
  STAFF_LEAVE_APPROVED: {
    key: 'STAFF_LEAVE_APPROVED',
    category: 'STAFF',
    defaultPriority: 'MEDIUM',
    audience: 'USER',
    description: 'Leave approved',
    sampleVariables: {
      requesterName: 'R. Sharma',
      leaveType: 'CASUAL',
      fromDate: '2026-07-01',
      toDate: '2026-07-02',
      approverName: 'Principal',
    },
  },
  TIMETABLE_PUBLISHED: {
    key: 'TIMETABLE_PUBLISHED',
    category: 'TIMETABLE',
    defaultPriority: 'MEDIUM',
    audience: 'USER',
    description: 'New timetable published',
    sampleVariables: {
      timetableName: 'Term 1 2026-27',
      effectiveFrom: '2026-07-01',
    },
  },
  SUBSCRIPTION_EXPIRY_WARNING: {
    key: 'SUBSCRIPTION_EXPIRY_WARNING',
    category: 'SYSTEM',
    defaultPriority: 'HIGH',
    audience: 'USER',
    description: 'Subscription expires soon',
    sampleVariables: {
      schoolName: 'Sunrise Public School',
      expiresAt: '2026-07-15',
      daysRemaining: 23,
    },
  },
  SYSTEM_ALERT: {
    key: 'SYSTEM_ALERT',
    category: 'SYSTEM',
    defaultPriority: 'CRITICAL',
    audience: 'USER',
    description: 'Critical system alert',
    sampleVariables: {
      alertCode: 'PROVIDER_OUTAGE',
      summary: 'SMS provider unreachable for >10 minutes',
    },
  },
  PENDING_APPROVALS: {
    key: 'PENDING_APPROVALS',
    category: 'COMMUNICATION',
    defaultPriority: 'MEDIUM',
    audience: 'USER',
    description: 'Items awaiting your approval',
    sampleVariables: {
      pendingCount: 4,
      summary: '2 discount approvals, 1 leave, 1 payment verification',
    },
  },
  // -------------------------------------------------------------------------
  // Sprint 17 — Parent Portal lifecycle events.
  //
  // `NotificationCategory` enum has no `IDENTITY` or `ENROLLMENT` value, so
  // all 6 keys fall back to `SYSTEM` per the Sprint 17 plan §11. Default
  // channels (EMAIL + IN_APP for all, plus SMS for INVITED + SUSPENDED) are
  // owned by the per-tenant template registry — the catalog itself does not
  // carry a `defaultChannels` field.
  // -------------------------------------------------------------------------
  PARENT_INVITED: {
    key: 'PARENT_INVITED',
    category: 'SYSTEM',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Parent user invited to the portal',
    sampleVariables: {
      parentName: 'Asha Khan',
      activationLink: 'https://app.schoolos.example/parents/activate?t=\u2026',
      expiresAt: '2026-07-01T00:00:00Z',
    },
  },
  PARENT_ACTIVATED: {
    key: 'PARENT_ACTIVATED',
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    audience: 'PARENT',
    description: 'Parent user activated their portal account',
    sampleVariables: {
      parentName: 'Asha Khan',
      activatedAt: '2026-06-24T10:00:00Z',
    },
  },
  PARENT_SUSPENDED: {
    key: 'PARENT_SUSPENDED',
    category: 'SYSTEM',
    defaultPriority: 'HIGH',
    audience: 'PARENT',
    description: 'Parent user suspended from the portal',
    sampleVariables: {
      parentName: 'Asha Khan',
      suspendedAt: '2026-06-25T10:00:00Z',
      reason: 'Disputed pickup authorization',
    },
  },
  PARENT_ARCHIVED: {
    key: 'PARENT_ARCHIVED',
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    audience: 'PARENT',
    description: 'Parent user archived (terminal)',
    sampleVariables: {
      parentName: 'Asha Khan',
      archivedAt: '2026-06-26T10:00:00Z',
    },
  },
  PARENT_LINKED: {
    key: 'PARENT_LINKED',
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    audience: 'PARENT',
    description: 'Parent linked to a student',
    sampleVariables: {
      parentName: 'Asha Khan',
      studentName: 'Aisha Khan',
      relation: 'MOTHER',
    },
  },
  PARENT_UNLINKED: {
    key: 'PARENT_UNLINKED',
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    audience: 'PARENT',
    description: 'Parent unlinked from a student',
    sampleVariables: {
      parentName: 'Asha Khan',
      studentName: 'Aisha Khan',
      relation: 'MOTHER',
    },
  },
  STUDENT_INVITED: {
    key: 'STUDENT_INVITED',
    category: 'SYSTEM',
    defaultPriority: 'HIGH',
    audience: 'STUDENT',
    description: 'Student user invited to the portal',
    sampleVariables: {
      studentName: 'Aisha Khan',
      activationLink: 'https://app.schoolos.example/students/activate?t=\u2026',
      expiresAt: '2026-07-01T00:00:00Z',
    },
  },
  STUDENT_ACTIVATED: {
    key: 'STUDENT_ACTIVATED',
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    audience: 'STUDENT',
    description: 'Student user activated their portal account',
    sampleVariables: {
      studentName: 'Aisha Khan',
      activatedAt: '2026-06-24T10:00:00Z',
    },
  },
  STUDENT_SUSPENDED: {
    key: 'STUDENT_SUSPENDED',
    category: 'SYSTEM',
    defaultPriority: 'HIGH',
    audience: 'STUDENT',
    description: 'Student user suspended from the portal',
    sampleVariables: {
      studentName: 'Aisha Khan',
      suspendedAt: '2026-06-25T10:00:00Z',
      reason: 'Disciplinary review',
    },
  },
  STUDENT_ARCHIVED: {
    key: 'STUDENT_ARCHIVED',
    category: 'SYSTEM',
    defaultPriority: 'LOW',
    audience: 'STUDENT',
    description: 'Student user archived (terminal)',
    sampleVariables: {
      studentName: 'Aisha Khan',
      archivedAt: '2026-06-26T10:00:00Z',
    },
  },
} as const satisfies Readonly<Record<string, NotificationEventDefinition>>;

export type NotificationEventKey = keyof typeof NOTIFICATION_EVENTS;
