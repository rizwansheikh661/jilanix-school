/**
 * ReportingFeatureFlagsBootstrap — registers the 6 reporting feature flags
 * with `FeatureFlagRegistry` at construct time. Mirrors
 * `AcademicContentFeatureFlagsBootstrap`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { ReportingFeatureFlags } from './reporting.constants';

@Injectable()
export class ReportingFeatureFlagsBootstrap {
  private readonly logger = new Logger(ReportingFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: ReportingFeatureFlags.MODULE,
      name: 'Reporting module',
      description:
        'Enables reporting, import/export, bulk operations, dashboards, schedules, and templates.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'reporting',
    });
    registry.register({
      key: ReportingFeatureFlags.ALLOW_REPORT_RUN,
      name: 'Allow report run',
      description:
        'When enabled, callers can request new report runs via POST /api/v1/reports.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'reporting',
    });
    registry.register({
      key: ReportingFeatureFlags.ALLOW_IMPORT,
      name: 'Allow imports',
      description:
        'When enabled, callers can upload import spreadsheets via POST /api/v1/imports.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'reporting',
    });
    registry.register({
      key: ReportingFeatureFlags.ALLOW_BULK_OPERATIONS,
      name: 'Allow bulk operations',
      description:
        'When enabled, callers can submit bulk operations via POST /api/v1/bulk-operations.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'reporting',
    });
    registry.register({
      key: ReportingFeatureFlags.IMPORT_STUDENT_ENABLED,
      name: 'Student import enabled',
      description:
        'When enabled, kind=STUDENT imports are processed; otherwise the parser short-circuits.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'reporting',
    });
    registry.register({
      key: ReportingFeatureFlags.NOTIFY_ON_COMPLETION,
      name: 'Notify on reporting completion',
      description:
        'When enabled, REPORT_READY/REPORT_FAILED/IMPORT_*/BULK_OPERATION_COMPLETED notifications dispatch from job handlers.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'reporting',
    });
    this.logger.log('Reporting feature flags registered: 6 keys.');
  }
}
