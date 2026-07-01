/**
 * ImportJobIssueRepository — persistence for `import_job_issues` rows.
 *
 * Issues are insert-only (validator emits them) and read in pages via the
 * controller. Soft-delete cascades from the parent ImportJob.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ImportIssueSeverityValue } from '../reporting.constants';
import type { ImportJobIssueRow, RowValidationIssue } from '../reporting.types';

const ISSUE_BATCH_SIZE = 500;

export interface ListImportJobIssuesArgs {
  readonly importJobId: string;
  readonly severity?: ImportIssueSeverityValue;
  readonly limit: number;
  readonly cursorId?: string;
}

@Injectable()
export class ImportJobIssueRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ImportJobIssueRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async createMany(
    importJobId: string,
    issues: readonly RowValidationIssue[],
    tx?: PrismaTx,
  ): Promise<number> {
    if (issues.length === 0) return 0;
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();

    let written = 0;
    for (let i = 0; i < issues.length; i += ISSUE_BATCH_SIZE) {
      const slice = issues.slice(i, i + ISSUE_BATCH_SIZE);
      const data = slice.map((issue) => ({
        schoolId,
        importJobId,
        rowNumber: issue.rowNumber,
        columnName: issue.columnName ?? null,
        severity: issue.severity,
        code: issue.code,
        message: issue.message.slice(0, 1000),
        providedValue:
          issue.providedValue === undefined || issue.providedValue === null
            ? null
            : issue.providedValue.slice(0, 500),
        rowSnapshot:
          issue.rowSnapshot === undefined
            ? Prisma.JsonNull
            : (issue.rowSnapshot as Prisma.InputJsonValue),
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      }));
      const result = await writer.importJobIssue.createMany({ data });
      written += result.count;
    }
    return written;
  }

  public async list(
    args: ListImportJobIssuesArgs,
    tx?: PrismaTx,
  ): Promise<{
    readonly rows: readonly ImportJobIssueRow[];
    readonly nextCursorId: string | null;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      importJobId: args.importJobId,
      deletedAt: null,
    };
    if (args.severity !== undefined) where.severity = args.severity;
    const rows = await reader.importJobIssue.findMany({
      where,
      orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      take: args.limit + 1,
      ...(args.cursorId !== undefined
        ? { cursor: { schoolId_id: { schoolId, id: args.cursorId } }, skip: 1 }
        : {}),
    });
    const nextCursorId =
      rows.length > args.limit ? (rows.pop()?.id ?? null) : null;
    return {
      rows: rows.map((r) => mapRow(r as unknown as RawImportJobIssue)),
      nextCursorId,
    };
  }

  public async countByJob(
    importJobId: string,
    tx?: PrismaTx,
  ): Promise<{
    readonly total: number;
    readonly errors: number;
    readonly warnings: number;
    readonly infos: number;
  }> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const grouped = await reader.importJobIssue.groupBy({
      by: ['severity'],
      where: { schoolId, importJobId, deletedAt: null },
      _count: { _all: true },
    });
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const g of grouped as Array<{
      severity: string;
      _count: { _all: number };
    }>) {
      if (g.severity === 'ERROR') errors = g._count._all;
      else if (g.severity === 'WARNING') warnings = g._count._all;
      else if (g.severity === 'INFO') infos = g._count._all;
    }
    return { total: errors + warnings + infos, errors, warnings, infos };
  }
}

interface RawImportJobIssue {
  id: string;
  schoolId: string;
  importJobId: string;
  rowNumber: number;
  columnName: string | null;
  severity: string;
  code: string;
  message: string;
  providedValue: string | null;
  rowSnapshot: unknown;
  createdAt: Date;
  version: number;
}

function mapRow(row: RawImportJobIssue): ImportJobIssueRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    importJobId: row.importJobId,
    rowNumber: row.rowNumber,
    columnName: row.columnName,
    severity: row.severity as ImportJobIssueRow['severity'],
    code: row.code,
    message: row.message,
    providedValue: row.providedValue ?? null,
    rowSnapshot:
      row.rowSnapshot === null
        ? null
        : (row.rowSnapshot as Record<string, unknown>),
    version: row.version,
    createdAt: row.createdAt,
  };
}
