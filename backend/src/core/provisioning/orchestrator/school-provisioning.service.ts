/**
 * SchoolProvisioningService — the saga that boots a brand-new tenant.
 *
 * Wave 6 ships:
 *   - provisionSchool(input) — orchestrates the create-school flow:
 *       1. validate slug, resolve plan
 *       2. open a SchoolProvisioningRun row (status=RUNNING)
 *       3. inside a single Prisma tx:
 *            a. INSERT into `schools` (lifecycle=TRIAL, plan pre-assigned)
 *            b. seed `school_settings` row
 *            c. seed primary `branches` row
 *            d. seed current `academic_years` row
 *            e. seed school_admin user + argon2 password (mustChangePassword)
 *            f. assign the school_admin role
 *            g. seed `school_communication_entitlements` from plan defaults
 *       4. mark the run SUCCEEDED + publish SCHOOL_PROVISIONED outbox event
 *       5. on failure, mark the run FAILED and rethrow — the tx rolls back
 *          everything, so there is no compensation work needed for the
 *          mutated tables (the journal row outside the tx is the only
 *          artefact that survives).
 *
 *   - assignPlan(schoolId, expectedVersion, planId) — re-assigns a plan to
 *       an existing school and syncs entitlements. Also publishes
 *       PLAN_ASSIGNED.
 *
 * Why direct Prisma writes instead of nested service calls?
 *   Each TENANT_OWNED service expects a tenant-scoped RequestContext to
 *   already be bound. The orchestrator runs in a super-admin context; we
 *   either (a) re-bind context per nested call or (b) talk to the tables
 *   directly inside the saga tx. (b) is simpler, avoids double-audit /
 *   double-outbox, and keeps the saga in one place.
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { PasswordService } from '../../auth/password/password.service';
import { ConflictError, NotFoundError, ValidationFailedError } from '../../errors/domain-error';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RoleRepository } from '../../rbac/repositories/role.repository';
import { UserRoleRepository } from '../../rbac/repositories/user-role.repository';
import { RoleKeys } from '../../rbac/rbac.constants';
import { RequestContextRegistry } from '../../request-context';
import { SchoolRootRepository } from '../../school/school/school.repository';
import type { SchoolRootRow } from '../../school/school/school.types';
import { SubscriptionService } from '../../subscription/subscription/subscription.service';
import { SchoolUsageService } from '../../subscription/usage/school-usage.service';
import { PlanRepository } from '../plan/plan.repository';
import { ProvisioningOutboxTopics } from '../provisioning.constants';
import { PlanNotFoundError } from '../provisioning.errors';
import type { PlanRow } from '../provisioning.types';
import {
  ProvisioningRunRepository,
  type ProvisioningRunStep,
} from './provisioning-run.repository';
import { generateAdminUsername } from './username-generator';
import { generateTempPassword } from './temp-password-generator';

export interface ProvisionSchoolInput {
  readonly slug: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly countryCode?: string;
  readonly timezone?: string;
  readonly localeDefault?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly planId: string;
  /** Overrides plan default. If omitted, uses `plan.defaultTrialDays`. */
  readonly trialDays?: number;
  /** UUID of the platform admin triggering the provision. */
  readonly triggeredByUserId: string;
}

export interface ProvisionSchoolResult {
  readonly school: SchoolRootRow;
  readonly runId: string;
  readonly adminEmail: string;
  /** ONE-TIME cleartext password — communicate out-of-band, do not persist. */
  readonly adminTemporaryPassword: string;
  readonly plan: PlanRow;
}

export interface AssignPlanInput {
  readonly schoolId: string;
  readonly expectedVersion: number;
  readonly planId: string;
  /** Optional override for plan expiry (defaults to plan.defaultTrialDays from now). */
  readonly expiresInDays?: number;
}

@Injectable()
export class SchoolProvisioningService {
  private readonly logger = new Logger(SchoolProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schools: SchoolRootRepository,
    private readonly plans: PlanRepository,
    private readonly runs: ProvisioningRunRepository,
    private readonly roles: RoleRepository,
    private readonly userRoles: UserRoleRepository,
    private readonly passwords: PasswordService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionService,
    private readonly usage: SchoolUsageService,
  ) {}

  public async provisionSchool(input: ProvisionSchoolInput): Promise<ProvisionSchoolResult> {
    this.validateInput(input);

    const plan = await this.plans.findById(input.planId);
    if (plan === null) throw new PlanNotFoundError(input.planId);

    const slugTaken = await this.schools.findBySlug(input.slug);
    if (slugTaken !== null) {
      throw new ConflictError(`School slug "${input.slug}" is already in use.`, {
        details: { resourceType: 'School', conflictField: 'slug', slug: input.slug },
      });
    }

    // Journal row lives outside the saga tx so a rollback still leaves
    // forensic evidence of the attempt.
    const run = await this.runs.start({ triggeredByUserId: input.triggeredByUserId });

    const steps: ProvisioningRunStep[] = [];
    const stepStart = (name: string): ProvisioningRunStep => ({
      name,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    const stepDone = (s: ProvisioningRunStep, details?: Record<string, unknown>): ProvisioningRunStep => ({
      ...s,
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      ...(details === undefined ? {} : { details }),
    });

    const tempPassword = generateTempPassword();

    try {
      const result = await this.prisma.transaction(async (rawTx) => {
        const tx = rawTx as unknown as PrismaTx;

        // Step 1 — create the schools row.
        let s = stepStart('schools.create');
        const trialDays = input.trialDays ?? plan.defaultTrialDays;
        const now = new Date();
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const school = await this.schools.create(
          {
            slug: input.slug,
            legalName: input.legalName,
            displayName: input.displayName,
            countryCode: input.countryCode ?? 'IN',
            timezone: input.timezone ?? 'Asia/Kolkata',
            localeDefault: input.localeDefault ?? 'en-IN',
            email: input.contactEmail ?? null,
            phone: input.contactPhone ?? null,
            lifecycleStatus: 'TRIAL',
            status: 'trial',
            trialStartDate: now,
            trialEndDate: trialEnd,
            planId: plan.id,
            planAssignedAt: now,
            planExpiresAt: trialEnd,
            planStatus: 'ASSIGNED',
            createdBy: input.triggeredByUserId,
          },
          tx,
        );
        steps.push(stepDone(s, { schoolId: school.id, slug: school.slug }));
        await this.runs.attachSchool(run.id, school.id, tx);

        // Step 2 — seed school_settings.
        s = stepStart('school_settings.create');
        await tx.schoolSettings.create({
          data: {
            id: randomUUID(),
            schoolId: school.id,
            workingDaysJson: {
              mon: true, tue: true, wed: true, thu: true,
              fri: true, sat: true, sun: false,
            } as unknown as never,
            createdBy: input.triggeredByUserId,
            updatedBy: input.triggeredByUserId,
          },
        });
        steps.push(stepDone(s));

        // Step 3 — primary branch.
        s = stepStart('branches.create');
        const branchId = randomUUID();
        await tx.branch.create({
          data: {
            id: branchId,
            schoolId: school.id,
            code: 'MAIN',
            name: `${input.displayName} - Main`,
            isPrimary: true,
            status: 'ACTIVE',
            createdBy: input.triggeredByUserId,
            updatedBy: input.triggeredByUserId,
          } as never,
        });
        steps.push(stepDone(s, { branchId }));

        // Step 4 — current academic year.
        s = stepStart('academic_year.create');
        const { startDate, endDate, name } = this.defaultFinancialYear(now);
        const yearId = randomUUID();
        await tx.academicYear.create({
          data: {
            id: yearId,
            schoolId: school.id,
            name,
            startDate,
            endDate,
            isCurrent: true,
          } as never,
        });
        steps.push(stepDone(s, { academicYearId: yearId, name }));

        // Step 5 — school_admin user.
        s = stepStart('users.create');
        const adminEmail = await generateAdminUsername(school.slug, async (candidate) => {
          const existing = await tx.user.findFirst({
            where: { schoolId: school.id, email: candidate },
            select: { id: true },
          });
          return existing !== null;
        });
        const userId = randomUUID();
        await tx.user.create({
          data: {
            id: userId,
            schoolId: school.id,
            email: adminEmail,
            displayName: 'School Administrator',
            actorScope: 'tenant',
            status: 'active',
            mustChangePassword: true,
            passwordResetRequiredAt: now,
            passwordChangedAt: now,
            tokenSalt: randomUUID().replaceAll('-', '').slice(0, 24),
            createdBy: input.triggeredByUserId,
            updatedBy: input.triggeredByUserId,
          } as never,
        });
        steps.push(stepDone(s, { userId, email: adminEmail }));

        // Step 6 — password hash row.
        s = stepStart('user_password.create');
        const hash = await this.passwords.hash(tempPassword);
        await tx.userPassword.create({
          data: {
            id: randomUUID(),
            schoolId: school.id,
            userId,
            passwordHash: hash.passwordHash,
            algorithm: hash.algorithm,
            paramsJson: hash.params as unknown as never,
            pepperVersion: hash.pepperVersion,
            createdBy: input.triggeredByUserId,
            updatedBy: input.triggeredByUserId,
          } as never,
        });
        steps.push(stepDone(s));

        // Step 7 — assign school_admin role.
        s = stepStart('user_roles.assign');
        const role = await this.roles.findByKey(RoleKeys.SCHOOL_ADMIN, tx);
        if (role === null) {
          throw new Error(
            `Built-in role "${RoleKeys.SCHOOL_ADMIN}" is missing — has the RBAC seeder run?`,
          );
        }
        await this.userRoles.assign(
          {
            schoolId: school.id,
            userId,
            roleId: role.id,
            ...(input.triggeredByUserId !== undefined ? { assignedBy: input.triggeredByUserId } : {}),
          },
          tx,
        );
        steps.push(stepDone(s, { roleId: role.id, roleKey: role.key }));

        // Step 8 — communication entitlements from plan defaults.
        s = stepStart('school_communication_entitlements.create');
        const periodStart = startOfMonth(now);
        const periodEnd = endOfMonth(now);
        await tx.schoolCommunicationEntitlement.create({
          data: {
            schoolId: school.id,
            emailEnabled: plan.emailEnabled,
            smsEnabled: plan.smsEnabled,
            whatsappEnabled: false,
            inAppEnabled: plan.inAppEnabled,
            emailMonthlyLimit: plan.emailMonthlyLimit === 0 ? null : plan.emailMonthlyLimit,
            smsMonthlyLimit: plan.smsMonthlyLimit === 0 ? null : plan.smsMonthlyLimit,
            whatsappMonthlyLimit: null,
            usagePeriodStart: periodStart,
            usagePeriodEnd: periodEnd,
            isTrial: true,
            trialExpiresAt: trialEnd,
            createdBy: input.triggeredByUserId,
            updatedBy: input.triggeredByUserId,
          } as never,
        });
        steps.push(stepDone(s));

        // Step 8.5 — Sprint 15 Subscription + SchoolUsage bootstrap.
        // Seeds the canonical per-school Subscription row (status=TRIAL,
        // billingCycle=TRIAL) tied to the assigned plan so downstream
        // guard checks have something to read against. Also primes the
        // SchoolUsage singleton with zeroed counters.
        s = stepStart('subscription.assignInitial');
        const subscription = await this.subscriptions.assignInitialSubscription(
          school.id,
          plan.id,
          'TRIAL',
          tx,
        );
        steps.push(stepDone(s, { subscriptionId: subscription.id, status: subscription.status }));

        s = stepStart('school_usage.bootstrap');
        await this.usage.bootstrapForSchool(school.id, tx);
        steps.push(stepDone(s));

        // Step 9 — outbox + audit.
        s = stepStart('outbox.publish');
        await this.outbox.publish(tx, {
          topic: ProvisioningOutboxTopics.SCHOOL_PROVISIONED,
          eventType: 'SchoolProvisioned',
          aggregateType: 'School',
          aggregateId: school.id,
          schoolId: school.id,
          payload: {
            id: school.id,
            slug: school.slug,
            displayName: school.displayName,
            planId: plan.id,
            planCode: plan.code,
            adminEmail,
            trialDays,
            trialEndDate: trialEnd.toISOString(),
          },
        });
        await this.outbox.publish(tx, {
          topic: ProvisioningOutboxTopics.TRIAL_STARTED,
          eventType: 'TrialStarted',
          aggregateType: 'School',
          aggregateId: school.id,
          schoolId: school.id,
          payload: {
            id: school.id,
            trialStartDate: now.toISOString(),
            trialEndDate: trialEnd.toISOString(),
            trialDays,
          },
        });
        steps.push(stepDone(s));

        s = stepStart('audit.record');
        await this.audit.record(
          {
            action: 'provisioning.school.create',
            category: 'tenancy',
            resourceType: 'School',
            resourceId: school.id,
            schoolId: school.id,
            after: { ...school, planId: plan.id, planCode: plan.code, adminEmail },
          },
          { tx: tx as unknown as AuditTxLike },
        );
        steps.push(stepDone(s));

        return { school, adminEmail };
      });

      await this.runs.markCompleted(run.id, steps);
      this.logger.log(
        `School provisioned id=${result.school.id} slug=${result.school.slug} ` +
          `plan=${plan.code} runId=${run.id} admin=${result.adminEmail}.`,
      );
      return {
        school: result.school,
        runId: run.id,
        adminEmail: result.adminEmail,
        adminTemporaryPassword: tempPassword,
        plan,
      };
    } catch (err) {
      const errorMessage = (err as Error).message ?? 'unknown';
      // Mark the running step (if any) as failed for diagnosis.
      const last = steps[steps.length - 1];
      if (last !== undefined && last.status === 'running') {
        steps[steps.length - 1] = {
          ...last,
          status: 'failed',
          error: errorMessage,
          completedAt: new Date().toISOString(),
        };
      }
      await this.runs.markFailed(run.id, steps, errorMessage);
      throw err;
    }
  }

  public async assignPlan(input: AssignPlanInput): Promise<SchoolRootRow> {
    const plan = await this.plans.findById(input.planId);
    if (plan === null) throw new PlanNotFoundError(input.planId);
    const school = await this.schools.findById(input.schoolId);
    if (school === null) throw new NotFoundError('School', input.schoolId);

    return this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const now = new Date();
      const days = input.expiresInDays ?? plan.defaultTrialDays;
      const expires = days > 0 ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null;

      const updated = await this.schools.updatePlanAssignment(
        input.schoolId,
        input.expectedVersion,
        {
          planId: plan.id,
          planAssignedAt: now,
          planExpiresAt: expires,
          planStatus: 'ASSIGNED',
        },
        tx,
      );

      // Sync entitlements caps from the new plan. The row is a singleton
      // upsert keyed on schoolId; if missing (e.g. legacy tenant) we create.
      const existing = await tx.schoolCommunicationEntitlement.findUnique({
        where: { schoolId: input.schoolId },
      });
      if (existing === null) {
        await tx.schoolCommunicationEntitlement.create({
          data: {
            schoolId: input.schoolId,
            emailEnabled: plan.emailEnabled,
            smsEnabled: plan.smsEnabled,
            whatsappEnabled: false,
            inAppEnabled: plan.inAppEnabled,
            emailMonthlyLimit: plan.emailMonthlyLimit === 0 ? null : plan.emailMonthlyLimit,
            smsMonthlyLimit: plan.smsMonthlyLimit === 0 ? null : plan.smsMonthlyLimit,
            whatsappMonthlyLimit: null,
            usagePeriodStart: startOfMonth(now),
            usagePeriodEnd: endOfMonth(now),
          } as never,
        });
      } else {
        await tx.schoolCommunicationEntitlement.update({
          where: { schoolId: input.schoolId },
          data: {
            emailEnabled: plan.emailEnabled,
            smsEnabled: plan.smsEnabled,
            inAppEnabled: plan.inAppEnabled,
            emailMonthlyLimit: plan.emailMonthlyLimit === 0 ? null : plan.emailMonthlyLimit,
            smsMonthlyLimit: plan.smsMonthlyLimit === 0 ? null : plan.smsMonthlyLimit,
            version: { increment: 1 },
          },
        });
      }

      await this.outbox.publish(tx, {
        topic: ProvisioningOutboxTopics.PLAN_ASSIGNED,
        eventType: 'PlanAssigned',
        aggregateType: 'School',
        aggregateId: input.schoolId,
        schoolId: input.schoolId,
        payload: {
          id: input.schoolId,
          planId: plan.id,
          planCode: plan.code,
          planExpiresAt: expires?.toISOString() ?? null,
        },
      });

      await this.audit.record(
        {
          action: 'provisioning.plan.assign',
          category: 'tenancy',
          resourceType: 'School',
          resourceId: input.schoolId,
          schoolId: input.schoolId,
          before: school,
          after: updated,
        },
        { tx: tx as unknown as AuditTxLike },
      );

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private validateInput(input: ProvisionSchoolInput): void {
    const issues: { path: string; code: string; message: string }[] = [];
    if (!/^[a-z0-9-]{3,100}$/.test(input.slug)) {
      issues.push({
        path: 'slug',
        code: 'INVALID_SLUG',
        message: 'slug must be 3-100 chars, lowercase alphanumeric or dashes only.',
      });
    }
    if (input.legalName.trim().length === 0) {
      issues.push({ path: 'legalName', code: 'REQUIRED', message: 'legalName is required.' });
    }
    if (input.displayName.trim().length === 0) {
      issues.push({ path: 'displayName', code: 'REQUIRED', message: 'displayName is required.' });
    }
    if (input.trialDays !== undefined && (input.trialDays < 1 || input.trialDays > 365)) {
      issues.push({ path: 'trialDays', code: 'OUT_OF_RANGE', message: 'trialDays must be 1..365.' });
    }
    if (issues.length > 0) {
      throw new ValidationFailedError(issues, 'School provisioning input invalid');
    }
    // surface the current actor as fallback if the caller forgot to thread one through
    if (input.triggeredByUserId === '') {
      const ctx = RequestContextRegistry.peek();
      if (ctx?.userId === undefined) {
        throw new ValidationFailedError(
          [{ path: 'triggeredByUserId', code: 'REQUIRED', message: 'triggeredByUserId is required.' }],
          'Missing triggering user',
        );
      }
    }
  }

  /**
   * Default to an April-March Indian financial year. If we're in Jan-Mar we
   * pick "FY{year-1}-{year}" (the year already underway), otherwise "FY{year}-{year+1}".
   */
  private defaultFinancialYear(now: Date): { name: string; startDate: Date; endDate: Date } {
    const m = now.getMonth(); // 0..11
    const y = now.getFullYear();
    const startYear = m >= 3 ? y : y - 1;
    const start = new Date(Date.UTC(startYear, 3, 1));
    const end = new Date(Date.UTC(startYear + 1, 2, 31));
    const name = `FY${startYear.toString()}-${(startYear + 1).toString().slice(-2)}`;
    return { name, startDate: start, endDate: end };
  }
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
