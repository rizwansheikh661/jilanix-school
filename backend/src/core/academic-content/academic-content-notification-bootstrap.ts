/**
 * AcademicContentNotificationBootstrap — registers the 7 event-key catalog
 * entries for the academic-content domain with Sprint 10's
 * NotificationEventRegistry on application bootstrap. Templates are NOT
 * auto-seeded (each school authors its own copy).
 *
 * Audience for all 7 keys is `USER` per Sprint 11 precedent. The catalog
 * entry's recipient resolver (wired in the future Portal sprint) decides
 * whether a given key reaches the student, the parent, the teacher, or some
 * combination. This satisfies user-spec Module 10 "Parent Communication
 * Foundation" — no new tables; the audience tag is the integration point.
 *
 * `HOMEWORK_DUE_REMINDER` and `ASSIGNMENT_DUE_REMINDER` are registered for
 * catalog completeness; the scheduler that fires them is deferred (mirrors
 * Sprint 11's `EVENT_REMINDER` registered-but-not-scheduled pattern).
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationEventDefinition } from '../notifications/notification-events.catalog';
import { NotificationEventRegistry } from '../notifications/notification-event.registry';
import { AcademicContentNotificationEventKeys } from './academic-content.constants';

@Injectable()
export class AcademicContentNotificationBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(AcademicContentNotificationBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    for (const def of ACADEMIC_CONTENT_NOTIFICATION_DEFINITIONS) {
      this.registry.register(def);
    }
    this.logger.log(
      `Academic-content notification catalog registered: ${ACADEMIC_CONTENT_NOTIFICATION_DEFINITIONS.length} keys.`,
    );
  }
}

const HW_SAMPLE = {
  homeworkCode: 'HW-000123',
  homeworkTitle: 'Chapter 5: Photosynthesis — read & summarise',
  subjectName: 'Biology',
  className: 'Grade 8',
  sectionName: 'A',
  dueDate: '2026-07-15',
} as const;

const ASGN_SAMPLE = {
  assignmentCode: 'ASGN-000456',
  assignmentTitle: 'Unit Test — Algebra basics',
  subjectName: 'Mathematics',
  className: 'Grade 9',
  sectionName: 'B',
  dueDate: '2026-07-20',
  maxMarks: 50,
} as const;

const ACADEMIC_CONTENT_NOTIFICATION_DEFINITIONS: readonly NotificationEventDefinition[] =
  Object.freeze([
    {
      key: AcademicContentNotificationEventKeys.HOMEWORK_PUBLISHED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'New homework published',
      sampleVariables: HW_SAMPLE,
    },
    {
      key: AcademicContentNotificationEventKeys.HOMEWORK_DUE_REMINDER,
      category: 'COMMUNICATION',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Homework due soon (scheduler deferred)',
      sampleVariables: { ...HW_SAMPLE, dueInHours: 24 },
    },
    {
      key: AcademicContentNotificationEventKeys.HOMEWORK_CLOSED,
      category: 'COMMUNICATION',
      defaultPriority: 'LOW',
      audience: 'USER',
      description: 'Homework closed',
      sampleVariables: HW_SAMPLE,
    },
    {
      key: AcademicContentNotificationEventKeys.ASSIGNMENT_PUBLISHED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'New assignment published',
      sampleVariables: ASGN_SAMPLE,
    },
    {
      key: AcademicContentNotificationEventKeys.ASSIGNMENT_DUE_REMINDER,
      category: 'COMMUNICATION',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Assignment due soon (scheduler deferred)',
      sampleVariables: { ...ASGN_SAMPLE, dueInHours: 24 },
    },
    {
      key: AcademicContentNotificationEventKeys.ASSIGNMENT_SUBMITTED,
      category: 'COMMUNICATION',
      defaultPriority: 'LOW',
      audience: 'USER',
      description: 'Assignment submitted by student',
      sampleVariables: {
        ...ASGN_SAMPLE,
        studentName: 'Aarav Sharma',
        submittedAt: '2026-07-19T14:30:00+05:30',
        isLate: false,
      },
    },
    {
      key: AcademicContentNotificationEventKeys.ASSIGNMENT_EVALUATED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Assignment evaluated',
      sampleVariables: {
        ...ASGN_SAMPLE,
        marksObtained: 42,
      },
    },
  ]);
