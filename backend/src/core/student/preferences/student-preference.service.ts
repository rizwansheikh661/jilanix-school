/**
 * StudentPreferenceService — Sprint 18 W4.
 *
 * Thin wrapper around `NotificationPreferenceService` that resolves the
 * calling student's User row via the `RequestContext` and reads/writes the
 * underlying `NotificationUserPreference` row. Mirrors
 * `ParentPreferenceService`.
 *
 *   - Enforces the `student_portal` feature flag.
 *   - Ensures an alive `StudentUser` row exists for the calling user
 *     (non-students get 403 INSUFFICIENT_PERMISSIONS).
 *   - Delegates channel/quiet-hours/locale persistence to the existing,
 *     audit + outbox-aware NotificationPreferenceService.
 */
import { Injectable } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import {
  NotificationPreferenceService,
  type UpdateNotificationPreferenceArgs,
} from '../../notifications/notification-preference/notification-preference.service';
import type { NotificationUserPreferenceRow } from '../../notifications/notifications.types';
import { RequestContextRegistry } from '../../request-context';
import { StudentFeatureFlags } from '../student.constants';
import {
  NotAStudentUserError,
  StudentPortalDisabledError,
} from '../student.errors';
import { StudentUserService } from '../student-user/student-user.service';

export type StudentPreferencePatch = UpdateNotificationPreferenceArgs;

@Injectable()
export class StudentPreferenceService {
  constructor(
    private readonly featureFlags: FeatureFlagService,
    private readonly preferences: NotificationPreferenceService,
    private readonly studentUsers: StudentUserService,
  ) {}

  public async getMine(): Promise<NotificationUserPreferenceRow> {
    await this.assertPortalEnabled();
    await this.requireStudentUser();
    return this.preferences.getOrCreateDefault();
  }

  public async updateMine(
    expectedVersion: number,
    patch: StudentPreferencePatch,
  ): Promise<NotificationUserPreferenceRow> {
    await this.assertPortalEnabled();
    await this.requireStudentUser();
    return this.preferences.update(expectedVersion, patch);
  }

  private async requireStudentUser(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    if (ctx.userId === undefined) {
      throw new NotAStudentUserError();
    }
    const row = await this.studentUsers.findAliveByUserId(ctx.userId);
    if (row === null) {
      throw new NotAStudentUserError();
    }
  }

  private async assertPortalEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      StudentFeatureFlags.STUDENT_PORTAL,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) {
      throw new StudentPortalDisabledError();
    }
  }
}
