/**
 * TimetableFeatureFlagsBootstrap — registers the 5 timetable feature
 * flags with `FeatureFlagRegistry` at construct time so the entries are
 * present when the registry's `onApplicationBootstrap` upserts them.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { TimetableFeatureFlags } from './timetable.constants';

@Injectable()
export class TimetableFeatureFlagsBootstrap {
  private readonly logger = new Logger(TimetableFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: TimetableFeatureFlags.MODULE,
      name: 'Timetable module',
      description: 'Enables timetable configuration, versions, entries, and teacher views.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'timetable',
    });
    registry.register({
      key: TimetableFeatureFlags.AUTO_GENERATE,
      name: 'Timetable auto-generator',
      description: 'Reserved — constraint-solver auto-generator (not yet shipped).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'timetable',
    });
    registry.register({
      key: TimetableFeatureFlags.SUBSTITUTION,
      name: 'Timetable substitution workflow',
      description: 'Reserved — substitution request/approval workflow (scaffold only).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'timetable',
    });
    registry.register({
      key: TimetableFeatureFlags.SUBSTITUTION_NOTIFICATIONS,
      name: 'Timetable substitution notifications',
      description: 'Reserved — substitute-assignment notifications (not yet shipped).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'timetable',
    });
    registry.register({
      key: TimetableFeatureFlags.ALLOW_UNQUALIFIED_TEACHER,
      name: 'Allow unqualified teacher assignment',
      description:
        'Escape hatch — skips the StaffSubjectQualification check on entry create/update.',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'timetable',
    });
    this.logger.log('Timetable feature flags registered: 5 keys.');
  }
}
