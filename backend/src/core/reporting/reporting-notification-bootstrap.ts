/**
 * ReportingNotificationBootstrap — registers the 5 event-key catalog
 * entries for the reporting domain with Sprint 10's
 * NotificationEventRegistry on application bootstrap. Templates are NOT
 * auto-seeded (each school authors its own copy).
 *
 * Audience for all 5 keys is `USER` per Sprint 11/12 precedent — the
 * catalog entry's recipient resolver (lands with a Portal sprint) decides
 * whether a given key reaches the requesting user, the admin, or both.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { NotificationEventDefinition } from '../notifications/notification-events.catalog';
import { NotificationEventRegistry } from '../notifications/notification-event.registry';
import { ReportingNotificationEventKeys } from './reporting.constants';

@Injectable()
export class ReportingNotificationBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportingNotificationBootstrap.name);

  constructor(private readonly registry: NotificationEventRegistry) {}

  public onApplicationBootstrap(): void {
    for (const def of REPORTING_NOTIFICATION_DEFINITIONS) {
      this.registry.register(def);
    }
    this.logger.log(
      `Reporting notification catalog registered: ${REPORTING_NOTIFICATION_DEFINITIONS.length} keys.`,
    );
  }
}

const REPORT_SAMPLE = {
  reportCode: 'RPT-000123',
  reportKind: 'STUDENT_LIST',
  format: 'EXCEL',
  rowCount: 482,
  downloadUrl: 'https://app.example.com/reports/<id>/download',
} as const;

const IMPORT_SAMPLE = {
  importCode: 'IMP-000045',
  importKind: 'STUDENT',
  totalRows: 250,
  committedRows: 248,
  errorRows: 2,
} as const;

const BULK_OP_SAMPLE = {
  bulkOpCode: 'BOP-000017',
  bulkOpKind: 'STUDENT_PROMOTE',
  processedCount: 120,
  succeededCount: 118,
  failedCount: 2,
} as const;

const REPORTING_NOTIFICATION_DEFINITIONS: readonly NotificationEventDefinition[] =
  Object.freeze([
    {
      key: ReportingNotificationEventKeys.REPORT_READY,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Your requested report is ready to download',
      sampleVariables: REPORT_SAMPLE,
    },
    {
      key: ReportingNotificationEventKeys.REPORT_FAILED,
      category: 'COMMUNICATION',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Report generation failed',
      sampleVariables: {
        ...REPORT_SAMPLE,
        errorMessage: 'Internal error: dataset exceeded streaming cap',
      },
    },
    {
      key: ReportingNotificationEventKeys.IMPORT_COMPLETED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Import finished',
      sampleVariables: IMPORT_SAMPLE,
    },
    {
      key: ReportingNotificationEventKeys.IMPORT_FAILED,
      category: 'COMMUNICATION',
      defaultPriority: 'HIGH',
      audience: 'USER',
      description: 'Import failed',
      sampleVariables: {
        ...IMPORT_SAMPLE,
        errorMessage: 'Parser failed at row 47: unrecognized class code',
      },
    },
    {
      key: ReportingNotificationEventKeys.BULK_OPERATION_COMPLETED,
      category: 'COMMUNICATION',
      defaultPriority: 'MEDIUM',
      audience: 'USER',
      description: 'Bulk operation finished',
      sampleVariables: BULK_OP_SAMPLE,
    },
  ]);
