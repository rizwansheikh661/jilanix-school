/**
 * ExaminationFeatureFlagsBootstrap — registers the 4 examination feature
 * flags with `FeatureFlagRegistry` at construct time so the entries are
 * present when the registry's `onApplicationBootstrap` upserts them.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { ExaminationFeatureFlags } from './examination.constants';

@Injectable()
export class ExaminationFeatureFlagsBootstrap {
  private readonly logger = new Logger(ExaminationFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: ExaminationFeatureFlags.MODULE,
      name: 'Examination module',
      description:
        'Enables exam schemes, definitions, schedules, marks entry, and result computation.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'examination',
    });
    registry.register({
      key: ExaminationFeatureFlags.ALLOW_OVERSCORE,
      name: 'Allow overscore marks',
      description:
        'Bypass the marks <= maxMarks bound; for special-case bonus rubrics.',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'examination',
    });
    registry.register({
      key: ExaminationFeatureFlags.RECOMPUTE_ON_MARKS_CHANGE,
      name: 'Auto-recompute results on marks change',
      description:
        'When enabled, every marks mutation triggers in-tx result recomputation. Default off (manual /compute).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'examination',
    });
    registry.register({
      key: ExaminationFeatureFlags.PUBLISH_RESULTS,
      name: 'Publish exam results',
      description:
        'Reserved — gates the COMPUTED \u2192 PUBLISHED transition for parent visibility.',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'examination',
    });
    this.logger.log('Examination feature flags registered: 4 keys.');
  }
}
