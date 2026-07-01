/**
 * ExamScheduleRepository — persistence for `exam_schedules`.
 * One schedule row per (exam, subject, section); single roomId +
 * single invigilatorStaffId per slot (Sprint 8 simplification).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { ExamScheduleRow } from '../examination.types';

export interface CreateExamScheduleInput {
  readonly examId: string;
  readonly subjectId: string;
  readonly sectionId: string;
  readonly roomId: string | null;
  readonly invigilatorStaffId: string | null;
  readonly date: Date;
  readonly startTime: string;
  readonly endTime: string;
  readonly maxMarks: number;
  readonly passMarks: number;
  readonly instructions: string | null;
}

export interface UpdateExamScheduleInput {
  readonly subjectId?: string;
  readonly sectionId?: string;
  readonly roomId?: string | null;
  readonly invigilatorStaffId?: string | null;
  readonly date?: Date;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly maxMarks?: number;
  readonly passMarks?: number;
  readonly instructions?: string | null;
}

export interface ListExamScheduleArgs {
  readonly examId: string;
  readonly sectionId?: string;
  readonly subjectId?: string;
}

@Injectable()
export class ExamScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenant(): { schoolId: string; userId: string | undefined } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('ExamScheduleRepository requires tenant scope.');
    }
    return { schoolId: ctx.schoolId, userId: ctx.userId ?? undefined };
  }

  public async findById(id: string, tx?: PrismaTx): Promise<ExamScheduleRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.examSchedule.findFirst({
      where: { schoolId, id, deletedAt: null },
    });
    return row === null ? null : mapSchedule(row);
  }

  public async findActiveBySlot(
    examId: string,
    subjectId: string,
    sectionId: string,
    tx?: PrismaTx,
  ): Promise<ExamScheduleRow | null> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const row = await reader.examSchedule.findFirst({
      where: {
        schoolId,
        examId,
        subjectId,
        sectionId,
        deletedAt: null,
      },
    });
    return row === null ? null : mapSchedule(row);
  }

  public async list(
    args: ListExamScheduleArgs,
    tx?: PrismaTx,
  ): Promise<readonly ExamScheduleRow[]> {
    const reader = this.resolve(tx);
    const { schoolId } = this.tenant();
    const where: Record<string, unknown> = {
      schoolId,
      examId: args.examId,
      deletedAt: null,
    };
    if (args.sectionId !== undefined) where.sectionId = args.sectionId;
    if (args.subjectId !== undefined) where.subjectId = args.subjectId;
    const rows = await reader.examSchedule.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(mapSchedule);
  }

  public async create(
    input: CreateExamScheduleInput,
    tx?: PrismaTx,
  ): Promise<ExamScheduleRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const row = await writer.examSchedule.create({
      data: {
        schoolId,
        examId: input.examId,
        subjectId: input.subjectId,
        sectionId: input.sectionId,
        roomId: input.roomId,
        invigilatorStaffId: input.invigilatorStaffId,
        date: input.date,
        startTime: timeStringToDate(input.startTime),
        endTime: timeStringToDate(input.endTime),
        maxMarks: input.maxMarks,
        passMarks: input.passMarks,
        instructions: input.instructions,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
    return mapSchedule(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateExamScheduleInput,
    tx?: PrismaTx,
  ): Promise<ExamScheduleRow> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const data: Record<string, unknown> = {
      version: { increment: 1 },
      updatedBy: userId ?? null,
    };
    if (input.subjectId !== undefined) data.subjectId = input.subjectId;
    if (input.sectionId !== undefined) data.sectionId = input.sectionId;
    if (input.roomId !== undefined) data.roomId = input.roomId;
    if (input.invigilatorStaffId !== undefined) {
      data.invigilatorStaffId = input.invigilatorStaffId;
    }
    if (input.date !== undefined) data.date = input.date;
    if (input.startTime !== undefined) data.startTime = timeStringToDate(input.startTime);
    if (input.endTime !== undefined) data.endTime = timeStringToDate(input.endTime);
    if (input.maxMarks !== undefined) data.maxMarks = input.maxMarks;
    if (input.passMarks !== undefined) data.passMarks = input.passMarks;
    if (input.instructions !== undefined) data.instructions = input.instructions;
    const result = await writer.examSchedule.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('ExamSchedule', id, expectedVersion);
    }
    const reloaded = await writer.examSchedule.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (reloaded === null) {
      throw new VersionConflictError('ExamSchedule', id, expectedVersion);
    }
    return mapSchedule(reloaded);
  }

  public async softDelete(
    id: string,
    expectedVersion: number,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    const { schoolId, userId } = this.tenant();
    const result = await writer.examSchedule.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId ?? null,
        version: { increment: 1 },
        updatedBy: userId ?? null,
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('ExamSchedule', id, expectedVersion);
    }
  }
}

interface RawSchedule {
  id: string;
  schoolId: string;
  examId: string;
  subjectId: string;
  sectionId: string;
  roomId: string | null;
  invigilatorStaffId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  maxMarks: unknown;
  passMarks: unknown;
  instructions: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v !== null && typeof v === 'object' && 'toNumber' in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function mapSchedule(row: RawSchedule): ExamScheduleRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    examId: row.examId,
    subjectId: row.subjectId,
    sectionId: row.sectionId,
    roomId: row.roomId,
    invigilatorStaffId: row.invigilatorStaffId,
    date: row.date,
    startTime: dateToTimeString(row.startTime),
    endTime: dateToTimeString(row.endTime),
    maxMarks: toNumber(row.maxMarks),
    passMarks: toNumber(row.passMarks),
    instructions: row.instructions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    version: row.version,
  };
}

function timeStringToDate(value: string): Date {
  const [h, m, s = '00'] = value.split(':');
  if (h === undefined || m === undefined) {
    throw new Error(`Invalid time string: "${value}"`);
  }
  return new Date(Date.UTC(1970, 0, 1, Number(h), Number(m), Number(s)));
}

function dateToTimeString(value: Date): string {
  const h = value.getUTCHours().toString().padStart(2, '0');
  const m = value.getUTCMinutes().toString().padStart(2, '0');
  const s = value.getUTCSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const __test__ = { timeStringToDate, dateToTimeString, toNumber };
