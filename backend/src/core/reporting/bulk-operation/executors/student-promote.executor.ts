/**
 * StudentPromoteExecutor — `STUDENT_PROMOTE` bulk-operation.
 *
 * Promotes a set of students from a source academic year to a target
 * academic year. Section placement defaults to the student's current
 * sectionId unless the optional `sectionMapping` rewrites
 * `sourceSectionId → targetSectionId`.
 *
 * Params shape:
 *   {
 *     sourceAcademicYearId: string;
 *     targetAcademicYearId: string;
 *     studentIds: string[];
 *     sectionMapping?: Record<string, string>;
 *   }
 *
 * - preview: read-only roll-up over the supplied studentIds: per-class
 *   counts, plus any source sectionIds with no mapping (informational only
 *   — execute still falls back to the current sectionId).
 * - validate: per-target issue list — students not found, students not in
 *   the source academic year, students already in the target academic
 *   year, students whose status != ACTIVE.
 * - execute: updates each student row in a guarded `updateMany` so a
 *   concurrent mutator races out cleanly via `count === 0`. Audit category
 *   is `general` per Wave 7 plan.
 */
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';

import { PrismaService } from '../../../../infra/prisma';
import type { PrismaTx } from '../../../../infra/prisma/types';
import { AuditService } from '../../../audit/audit.service';
import type { AuditTxLike } from '../../../audit/audit.types';
import type { BulkOperationKindValue } from '../../reporting.constants';
import type {
  BulkOperationExecutionResult,
  BulkOperationPreviewResult,
  BulkOperationValidationResult,
  RowValidationIssue,
} from '../../reporting.types';
import { BulkOperationExecutorRegistry } from './executor.registry';
import type {
  BulkOperationExecutor,
  BulkOperationExecutorContext,
} from './executor.types';

interface StudentPromoteParams {
  readonly sourceAcademicYearId: string;
  readonly targetAcademicYearId: string;
  readonly studentIds: readonly string[];
  readonly sectionMapping?: Record<string, string>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class StudentPromoteExecutor
  implements BulkOperationExecutor, OnApplicationBootstrap
{
  public readonly kind: BulkOperationKindValue = 'STUDENT_PROMOTE';
  private readonly logger = new Logger(StudentPromoteExecutor.name);

  constructor(
    private readonly registry: BulkOperationExecutorRegistry,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register(this);
  }

  // ---------------------------------------------------------------------------
  // preview
  // ---------------------------------------------------------------------------
  public async preview(
    params: Record<string, unknown>,
    ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationPreviewResult> {
    const parsed = this.parse(params);
    const client = (this.prisma.client as unknown as PrismaTx);
    const students = await client.student.findMany({
      where: {
        schoolId: ctx.schoolId,
        id: { in: [...parsed.studentIds] },
        academicYearId: parsed.sourceAcademicYearId,
        deletedAt: null,
      },
      select: {
        id: true,
        classId: true,
        sectionId: true,
        status: true,
      },
    });

    const byClass: Record<string, number> = {};
    const sourceSectionIds = new Set<string>();
    let eligibleCount = 0;
    for (const s of students) {
      if (s.status === 'ACTIVE') eligibleCount += 1;
      byClass[s.classId] = (byClass[s.classId] ?? 0) + 1;
      sourceSectionIds.add(s.sectionId);
    }

    const missingTargetMapping: string[] = [];
    if (parsed.sectionMapping !== undefined) {
      for (const sid of sourceSectionIds) {
        if (parsed.sectionMapping[sid] === undefined) {
          missingTargetMapping.push(sid);
        }
      }
    }

    return {
      targetCount: parsed.studentIds.length,
      summary: {
        eligibleCount,
        byClass,
        missingTargetMapping,
        foundCount: students.length,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // validate
  // ---------------------------------------------------------------------------
  public async validate(
    params: Record<string, unknown>,
    ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationValidationResult> {
    const parsed = this.parse(params);
    const client = (this.prisma.client as unknown as PrismaTx);
    const rows = await client.student.findMany({
      where: {
        schoolId: ctx.schoolId,
        id: { in: [...parsed.studentIds] },
        deletedAt: null,
      },
      select: {
        id: true,
        academicYearId: true,
        sectionId: true,
        status: true,
      },
    });

    const byId = new Map<string, (typeof rows)[number]>();
    for (const r of rows) byId.set(r.id, r);

    const issues: RowValidationIssue[] = [];
    parsed.studentIds.forEach((id, idx) => {
      const rowNumber = idx + 1;
      const row = byId.get(id);
      if (row === undefined) {
        issues.push({
          rowNumber,
          severity: 'ERROR',
          code: 'STUDENT_NOT_FOUND',
          message: `Student ${id} not found in this tenant.`,
        });
        return;
      }
      if (row.academicYearId === parsed.targetAcademicYearId) {
        issues.push({
          rowNumber,
          severity: 'ERROR',
          code: 'STUDENT_ALREADY_IN_TARGET_YEAR',
          message: `Student ${id} is already in the target academic year.`,
        });
        return;
      }
      if (row.academicYearId !== parsed.sourceAcademicYearId) {
        issues.push({
          rowNumber,
          severity: 'ERROR',
          code: 'STUDENT_NOT_IN_SOURCE_YEAR',
          message: `Student ${id} is not in the source academic year.`,
        });
        return;
      }
      if (row.status !== 'ACTIVE') {
        issues.push({
          rowNumber,
          severity: 'ERROR',
          code: 'STUDENT_NOT_ACTIVE',
          message: `Student ${id} is not ACTIVE (status=${row.status}).`,
        });
        return;
      }
      if (
        parsed.sectionMapping !== undefined &&
        parsed.sectionMapping[row.sectionId] === undefined
      ) {
        issues.push({
          rowNumber,
          severity: 'WARNING',
          code: 'MISSING_SECTION_MAPPING',
          message: `No section mapping for sourceSection=${row.sectionId}; will retain current section.`,
        });
      }
    });

    return { targetCount: parsed.studentIds.length, issues };
  }

  // ---------------------------------------------------------------------------
  // execute
  // ---------------------------------------------------------------------------
  public async execute(
    params: Record<string, unknown>,
    ctx: BulkOperationExecutorContext,
  ): Promise<BulkOperationExecutionResult> {
    const parsed = this.parse(params);
    const perTarget: {
      targetId: string;
      ok: boolean;
      error?: string;
    }[] = [];
    let succeededCount = 0;
    let failedCount = 0;

    for (const studentId of parsed.studentIds) {
      try {
        await this.prisma.transaction(async (rawTx) => {
          const tx = rawTx as unknown as PrismaTx;
          const before = await tx.student.findFirst({
            where: {
              schoolId: ctx.schoolId,
              id: studentId,
              deletedAt: null,
            },
          });
          if (before === null) {
            throw new Error(`Student ${studentId} not found.`);
          }
          if (before.academicYearId !== parsed.sourceAcademicYearId) {
            throw new Error(
              `Student ${studentId} is not in the source academic year (current=${before.academicYearId}).`,
            );
          }
          if (before.status !== 'ACTIVE') {
            throw new Error(
              `Student ${studentId} is not ACTIVE (status=${before.status}).`,
            );
          }

          const mappedSectionId =
            parsed.sectionMapping?.[before.sectionId] ?? before.sectionId;

          const data: Record<string, unknown> = {
            academicYearId: parsed.targetAcademicYearId,
            sectionId: mappedSectionId,
            version: { increment: 1 },
            updatedBy: ctx.userId,
          };
          const result = await tx.student.updateMany({
            where: {
              schoolId: ctx.schoolId,
              id: studentId,
              version: before.version,
              deletedAt: null,
            },
            data,
          });
          if (result.count === 0) {
            throw new Error(
              `Student ${studentId} version conflict during promotion.`,
            );
          }
          const after = await tx.student.findFirst({
            where: {
              schoolId: ctx.schoolId,
              id: studentId,
              deletedAt: null,
            },
          });
          await this.audit.record(
            {
              action: 'student.promote',
              category: 'general',
              resourceType: 'Student',
              resourceId: studentId,
              before,
              after,
            },
            { tx: tx as unknown as AuditTxLike },
          );
        });
        perTarget.push({ targetId: studentId, ok: true });
        succeededCount += 1;
      } catch (err) {
        const message = (err as Error).message ?? 'Unknown error.';
        perTarget.push({ targetId: studentId, ok: false, error: message });
        failedCount += 1;
        this.logger.warn(
          `student.promote failed studentId=${studentId} bulkOpId=${ctx.bulkOperationId}: ${message}`,
        );
      }
    }

    return {
      processedCount: parsed.studentIds.length,
      succeededCount,
      failedCount,
      perTarget,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private parse(params: Record<string, unknown>): StudentPromoteParams {
    const sourceAcademicYearId = params['sourceAcademicYearId'];
    const targetAcademicYearId = params['targetAcademicYearId'];
    const studentIdsRaw = params['studentIds'];
    const sectionMappingRaw = params['sectionMapping'];

    if (
      typeof sourceAcademicYearId !== 'string' ||
      !UUID_RE.test(sourceAcademicYearId)
    ) {
      throw new Error(
        'STUDENT_PROMOTE params.sourceAcademicYearId must be a UUID string.',
      );
    }
    if (
      typeof targetAcademicYearId !== 'string' ||
      !UUID_RE.test(targetAcademicYearId)
    ) {
      throw new Error(
        'STUDENT_PROMOTE params.targetAcademicYearId must be a UUID string.',
      );
    }
    if (sourceAcademicYearId === targetAcademicYearId) {
      throw new Error(
        'STUDENT_PROMOTE source and target academic year must differ.',
      );
    }
    if (!Array.isArray(studentIdsRaw) || studentIdsRaw.length === 0) {
      throw new Error(
        'STUDENT_PROMOTE params.studentIds must be a non-empty UUID array.',
      );
    }
    const studentIds: string[] = [];
    for (const raw of studentIdsRaw) {
      if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
        throw new Error(
          'STUDENT_PROMOTE params.studentIds must contain only UUID strings.',
        );
      }
      studentIds.push(raw);
    }

    let sectionMapping: Record<string, string> | undefined;
    if (sectionMappingRaw !== undefined && sectionMappingRaw !== null) {
      if (typeof sectionMappingRaw !== 'object' || Array.isArray(sectionMappingRaw)) {
        throw new Error(
          'STUDENT_PROMOTE params.sectionMapping must be a flat string→string object.',
        );
      }
      const entries = Object.entries(sectionMappingRaw as Record<string, unknown>);
      const map: Record<string, string> = {};
      for (const [k, v] of entries) {
        if (!UUID_RE.test(k) || typeof v !== 'string' || !UUID_RE.test(v)) {
          throw new Error(
            'STUDENT_PROMOTE params.sectionMapping keys+values must be UUIDs.',
          );
        }
        map[k] = v;
      }
      sectionMapping = map;
    }

    return {
      sourceAcademicYearId,
      targetAcademicYearId,
      studentIds,
      ...(sectionMapping !== undefined ? { sectionMapping } : {}),
    };
  }
}
