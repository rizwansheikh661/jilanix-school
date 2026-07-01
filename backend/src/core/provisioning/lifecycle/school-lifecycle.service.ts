/**
 * SchoolLifecycleService — owns transitions on `schools.lifecycle_status`.
 *
 * Sprint 14 (Wave 4) ships five entry points:
 *   - activate(schoolId, version)      — TRIAL/SUSPENDED/EXPIRED → ACTIVE
 *                                        (requires an assigned plan).
 *   - suspend(schoolId, version, reason)
 *                                      — ACTIVE → SUSPENDED + revoke all
 *                                        live sessions for the tenant.
 *   - reactivate(schoolId, version)    — SUSPENDED → ACTIVE.
 *   - cancel(schoolId, version, reason)
 *                                      — any non-CANCELLED → CANCELLED
 *                                        (terminal; revokes all sessions).
 *   - expireTrial(schoolId, tx?)       — TRIAL → EXPIRED (called by the
 *                                        trial-expiry job; no version arg
 *                                        because the job loop owns rows
 *                                        snapshot-by-snapshot).
 *
 * Each mutator opens a single transaction, runs the state assertion,
 * writes the new row, publishes an outbox event, and emits a `tenancy`
 * audit row in the same tx.
 *
 * Sessions: revocation runs on the same `userSession` table via a
 * platform-bypass tx-stamp so the tenant-scope extension does not refuse
 * the cross-tenant updateMany from a super-admin context.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { SchoolRootRepository } from '../../school/school/school.repository';
import type { SchoolRootRow } from '../../school/school/school.types';
import { NotFoundError } from '../../errors/domain-error';
import {
  ProvisioningOutboxTopics,
  type ProvisioningOutboxTopic,
} from '../provisioning.constants';
import {
  PlanNotAssignedError,
  SchoolAlreadyCancelledError,
} from '../provisioning.errors';
import { assertLifecycleTransition } from './lifecycle-transitions';

@Injectable()
export class SchoolLifecycleService {
  private readonly logger = new Logger(SchoolLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolRootRepository,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async activate(schoolId: string, expectedVersion: number): Promise<SchoolRootRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, tx);
      this.assertNotCancelled(current);
      assertLifecycleTransition(current.lifecycleStatus, 'ACTIVE');
      if (current.planId === null) throw new PlanNotAssignedError(schoolId);

      const updated = await this.schools.updateLifecycle(
        schoolId,
        expectedVersion,
        {
          lifecycleStatus: 'ACTIVE',
          status: 'active',
          onboardedAt: current.onboardedAt ?? new Date(),
          planStatus: 'ACTIVE',
        },
        tx,
      );

      await this.emit(tx, current, updated, ProvisioningOutboxTopics.SCHOOL_ACTIVATED, 'SchoolActivated', {
        id: schoolId,
        previousStatus: current.lifecycleStatus,
      });
      return updated;
    });
  }

  public async suspend(
    schoolId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<SchoolRootRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, tx);
      this.assertNotCancelled(current);
      assertLifecycleTransition(current.lifecycleStatus, 'SUSPENDED');

      const now = new Date();
      const updated = await this.schools.updateLifecycle(
        schoolId,
        expectedVersion,
        {
          lifecycleStatus: 'SUSPENDED',
          status: 'suspended',
          suspendedAt: now,
          suspendedReason: reason,
        },
        tx,
      );

      const revoked = await this.revokeAllSessionsForSchool(tx, schoolId, now);
      await this.emit(tx, current, updated, ProvisioningOutboxTopics.SCHOOL_SUSPENDED, 'SchoolSuspended', {
        id: schoolId,
        reason,
        revokedSessions: revoked,
      });
      return updated;
    });
  }

  public async reactivate(
    schoolId: string,
    expectedVersion: number,
  ): Promise<SchoolRootRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, tx);
      this.assertNotCancelled(current);
      assertLifecycleTransition(current.lifecycleStatus, 'ACTIVE');

      const updated = await this.schools.updateLifecycle(
        schoolId,
        expectedVersion,
        {
          lifecycleStatus: 'ACTIVE',
          status: 'active',
          suspendedAt: null,
          suspendedReason: null,
        },
        tx,
      );

      await this.emit(tx, current, updated, ProvisioningOutboxTopics.SCHOOL_REACTIVATED, 'SchoolReactivated', {
        id: schoolId,
        previousStatus: current.lifecycleStatus,
      });
      return updated;
    });
  }

  public async cancel(
    schoolId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<SchoolRootRow> {
    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.loadOrThrow(schoolId, tx);
      if (current.lifecycleStatus === 'CANCELLED') {
        throw new SchoolAlreadyCancelledError(schoolId);
      }
      assertLifecycleTransition(current.lifecycleStatus, 'CANCELLED');

      const now = new Date();
      const updated = await this.schools.updateLifecycle(
        schoolId,
        expectedVersion,
        {
          lifecycleStatus: 'CANCELLED',
          status: 'cancelled',
          cancelledAt: now,
          planStatus: current.planId === null ? null : 'CANCELLED',
        },
        tx,
      );

      const revoked = await this.revokeAllSessionsForSchool(tx, schoolId, now);
      await this.emit(tx, current, updated, ProvisioningOutboxTopics.SCHOOL_CANCELLED, 'SchoolCancelled', {
        id: schoolId,
        reason,
        revokedSessions: revoked,
      });
      return updated;
    });
  }

  /**
   * Job-handler entry: transition TRIAL → EXPIRED. Called inside the
   * trial-expiry job's own transaction; we accept the tx as a parameter
   * rather than opening a fresh one. No expectedVersion — the job loop
   * snapshots a window of expiring rows and processes each in turn; we
   * use the row's current version transparently.
   */
  public async expireTrial(schoolId: string, tx: PrismaTx): Promise<SchoolRootRow> {
    const current = await this.loadOrThrow(schoolId, tx);
    if (current.lifecycleStatus !== 'TRIAL') {
      // Idempotent — another worker already advanced this row. Don't throw.
      this.logger.debug(
        `expireTrial skipped — school ${schoolId} is no longer in TRIAL (now=${current.lifecycleStatus}).`,
      );
      return current;
    }
    assertLifecycleTransition('TRIAL', 'EXPIRED');

    const updated = await this.schools.updateLifecycle(
      schoolId,
      current.version,
      {
        lifecycleStatus: 'EXPIRED',
        status: 'expired',
        planStatus: current.planStatus === 'ASSIGNED' ? 'EXPIRED' : current.planStatus,
      },
      tx,
    );

    await this.emit(tx, current, updated, ProvisioningOutboxTopics.SCHOOL_TRIAL_EXPIRED, 'SchoolTrialExpired', {
      id: schoolId,
      trialEndDate: current.trialEndDate?.toISOString() ?? null,
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private async loadOrThrow(schoolId: string, tx: PrismaTx): Promise<SchoolRootRow> {
    const row = await this.schools.findById(schoolId, tx);
    if (row === null) throw new NotFoundError('School', schoolId);
    return row;
  }

  private assertNotCancelled(row: SchoolRootRow): void {
    if (row.lifecycleStatus === 'CANCELLED') {
      throw new SchoolAlreadyCancelledError(row.id);
    }
  }

  /**
   * Cross-tenant updateMany — we're running as super-admin (actorScope=
   * 'global') so the tenant-scope extension won't refuse the query. Returns
   * the number of sessions revoked.
   */
  private async revokeAllSessionsForSchool(
    tx: PrismaTx,
    schoolId: string,
    at: Date,
  ): Promise<number> {
    const result = await tx.userSession.updateMany({
      where: { schoolId, revokedAt: null },
      data: { revokedAt: at, revokedReason: 'admin' },
    });
    return result.count;
  }

  private async emit(
    tx: PrismaTx,
    before: SchoolRootRow,
    after: SchoolRootRow,
    topic: ProvisioningOutboxTopic,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.outbox.publish(tx, {
      topic,
      eventType,
      aggregateType: 'School',
      aggregateId: after.id,
      schoolId: after.id,
      payload: payload as unknown as Prisma.InputJsonValue,
    });
    await this.audit.record(
      {
        action: `provisioning.school.${after.lifecycleStatus.toLowerCase()}`,
        category: 'tenancy',
        resourceType: 'School',
        resourceId: after.id,
        schoolId: after.id,
        before,
        after,
      },
      { tx: tx as unknown as AuditTxLike },
    );
    this.logger.log(
      `School ${after.id} lifecycle ${before.lifecycleStatus} → ${after.lifecycleStatus}.`,
    );
  }
}
