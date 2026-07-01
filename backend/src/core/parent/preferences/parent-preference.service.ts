/**
 * ParentPreferenceService — Sprint 17 W5.
 *
 * Thin wrapper around `NotificationPreferenceService` that resolves the
 * calling parent's User row via the `RequestContext` and reads/writes the
 * underlying `NotificationUserPreference` row. The wrapper exists so the
 * `/api/v1/parents/me/preferences` controller can:
 *
 *   - Enforce the `parent_portal` feature flag (admin + /me/* are both gated).
 *   - Ensure a `ParentUser` row exists for the calling user (non-parents get
 *     403 `INSUFFICIENT_PERMISSIONS` rather than a 404 on the underlying
 *     preference row).
 *   - Delegate channel/quiet-hours/locale persistence to the existing,
 *     audit + outbox-aware NotificationPreferenceService.
 *
 * Get path: ensures a default preference row exists (silent lazy-create) and
 * returns it. Patch path: forwards to NotificationPreferenceService.update
 * which handles version + audit + outbox.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import {
  NotificationPreferenceService,
  type UpdateNotificationPreferenceArgs,
} from '../../notifications/notification-preference/notification-preference.service';
import type { NotificationUserPreferenceRow } from '../../notifications/notifications.types';
import { RequestContextRegistry } from '../../request-context';
import { ParentFeatureFlags } from '../parent.constants';
import {
  NotAParentUserError,
  ParentPortalDisabledError,
} from '../parent.errors';
import { ParentUserService } from '../parent-user/parent-user.service';

export type ParentPreferencePatch = UpdateNotificationPreferenceArgs;

@Injectable()
export class ParentPreferenceService {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly preferences: NotificationPreferenceService,
    private readonly parentUsers: ParentUserService,
  ) {}

  public async getMine(): Promise<NotificationUserPreferenceRow> {
    await this.assertPortalEnabled();
    await this.requireParentUser();
    return this.preferences.getOrCreateDefault();
  }

  public async updateMine(
    expectedVersion: number,
    patch: ParentPreferencePatch,
  ): Promise<NotificationUserPreferenceRow> {
    await this.assertPortalEnabled();
    await this.requireParentUser();
    return this.preferences.update(expectedVersion, patch);
  }

  private async requireParentUser(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new NotAParentUserError();
    }
    const row = await this.parentUsers.findAliveByUserId(ctx.userId);
    if (row === null) {
      throw new NotAParentUserError();
    }
  }

  private async assertPortalEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      ParentFeatureFlags.PARENT_PORTAL,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new ParentPortalDisabledError();
    }
  }
}
