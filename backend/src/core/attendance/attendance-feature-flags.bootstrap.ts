/**
 * AttendanceFeatureFlagsBootstrap — registers the 5 attendance feature
 * flags with `FeatureFlagRegistry` so they appear in
 * `feature_flag_definitions` on every boot.
 *
 * Registration is done in the constructor (not `onApplicationBootstrap`)
 * because `FeatureFlagRegistry.onApplicationBootstrap()` calls
 * `upsertAll()`; provider constructors run before any lifecycle hook
 * fires, guaranteeing our entries are present when the registry persists.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { AttendanceFeatureFlags } from './attendance.constants';

@Injectable()
export class AttendanceFeatureFlagsBootstrap {
  private readonly logger = new Logger(AttendanceFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: AttendanceFeatureFlags.MODULE,
      name: 'Attendance module',
      description: 'Enables student + staff attendance APIs.',
      kind: 'MODULE',
      defaultValue: true,
      owner: 'attendance',
    });
    registry.register({
      key: AttendanceFeatureFlags.PERIOD_WISE,
      name: 'Period-wise attendance',
      description: 'Reserved — period-level attendance marking (not yet shipped).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'attendance',
    });
    registry.register({
      key: AttendanceFeatureFlags.SUBJECT_WISE,
      name: 'Subject-wise attendance',
      description: 'Reserved — subject-level attendance marking (not yet shipped).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'attendance',
    });
    registry.register({
      key: AttendanceFeatureFlags.BIOMETRIC,
      name: 'Biometric attendance source',
      description: 'Reserved — biometric/RFID/face source ingestion (not yet shipped).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'attendance',
    });
    registry.register({
      key: AttendanceFeatureFlags.MOBILE_APP,
      name: 'Mobile-app self-marking',
      description: 'Reserved — student/staff self-marking via mobile app (not yet shipped).',
      kind: 'RELEASE',
      defaultValue: false,
      owner: 'attendance',
    });
    this.logger.log('Attendance feature flags registered: 5 keys.');
  }
}
