/**
 * StudentFeatureFlagsBootstrap — registers the Student module's feature
 * flags with `FeatureFlagRegistry` at construct time so the entries are
 * present when the registry's `onApplicationBootstrap` upserts them.
 *
 * Currently only one key: `student_portal`. Although it is already
 * plan-mapped via the `subscription_foundation` migration, the registry
 * still needs an in-memory `register({...})` call so
 * `FeatureFlagService.assert(...)` will not reject the key as unknown.
 *
 * Mirrors `ParentFeatureFlagsBootstrap`.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagRegistry } from '../feature-flag/services/feature-flag.registry';
import { StudentFeatureFlags } from './student.constants';

@Injectable()
export class StudentFeatureFlagsBootstrap {
  private readonly logger = new Logger(StudentFeatureFlagsBootstrap.name);

  constructor(registry: FeatureFlagRegistry) {
    registry.register({
      key: StudentFeatureFlags.STUDENT_PORTAL,
      name: 'Student Portal',
      description:
        'Enables the student-portal admin endpoints (invite/suspend/reactivate/archive) and the `/me/*` self-service surface. Plan-mapped (see plan_features.student_portal).',
      kind: 'ENTITLEMENT',
      defaultValue: true,
      owner: 'student',
    });
    this.logger.log('Student feature flags registered: 1 key.');
  }
}
