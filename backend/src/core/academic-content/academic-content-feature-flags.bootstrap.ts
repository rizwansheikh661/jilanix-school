/**
 * AcademicContentFeatureFlagsBootstrap — registers the 5 academic-content
 * feature flags with `FeatureFlagRegistry` at construct time. Mirrors
 * `EventsFeatureFlagsBootstrap`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { AcademicContentFeatureFlags } from './academic-content.constants';

@Injectable()
export class AcademicContentFeatureFlagsBootstrap {
  private readonly logger = new Logger(AcademicContentFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: AcademicContentFeatureFlags.MODULE,
      name: 'Academic-content module',
      description:
        'Enables homework, assignments, submissions, and syllabus management.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'academic-content',
    });
    registry.register({
      key: AcademicContentFeatureFlags.ALLOW_HOMEWORK_PUBLISH,
      name: 'Allow homework publish',
      description:
        'When enabled, DRAFT homework can be published (and HOMEWORK_PUBLISHED notification fires).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'academic-content',
    });
    registry.register({
      key: AcademicContentFeatureFlags.ALLOW_ASSIGNMENT_PUBLISH,
      name: 'Allow assignment publish',
      description:
        'When enabled, DRAFT assignments can be published (and ASSIGNMENT_PUBLISHED notification fires).',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'academic-content',
    });
    registry.register({
      key: AcademicContentFeatureFlags.ALLOW_SUBMISSIONS,
      name: 'Allow assignment submissions',
      description:
        'When enabled, teachers may record student submissions and evaluate them.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'academic-content',
    });
    registry.register({
      key: AcademicContentFeatureFlags.NOTIFY_ON_LIFECYCLE,
      name: 'Notify on academic-content lifecycle',
      description:
        'When enabled, services dispatch notifications at publish / close / submit / evaluate transitions.',
      kind: 'RELEASE',
      defaultValue: true,
      owner: 'academic-content',
    });
    this.logger.log('Academic-content feature flags registered: 5 keys.');
  }
}
