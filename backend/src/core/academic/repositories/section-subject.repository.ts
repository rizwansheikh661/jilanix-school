/**
 * SectionSubjectRepository — CRUD on section-level subject overrides
 * (`section_subjects` table). Read paths also enumerate the parent class's
 * default subjects so the service can resolve the effective set.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type { SectionSubjectMode, SectionSubjectRow } from '../academic.types';

export interface CreateSectionSubjectInput {
  readonly sectionId: string;
  readonly subjectId: string;
  readonly mode: SectionSubjectMode;
  readonly replacesSubjectId?: string;
}

@Injectable()
export class SectionSubjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string, tx?: PrismaTx): Promise<SectionSubjectRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await reader.sectionSubject.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null ? null : mapRow(row);
  }

  public async findAllForSection(
    sectionId: string,
    tx?: PrismaTx,
  ): Promise<readonly SectionSubjectRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const rows = await reader.sectionSubject.findMany({
      where: { schoolId, sectionId },
      orderBy: [{ subjectId: 'asc' }],
    });
    return rows.map(mapRow);
  }

  public async create(
    input: CreateSectionSubjectInput,
    tx?: PrismaTx,
  ): Promise<SectionSubjectRow> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    const row = await writer.sectionSubject.create({
      data: {
        schoolId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        mode: input.mode,
        replacesSubjectId: input.replacesSubjectId ?? null,
      },
    });
    return mapRow(row);
  }

  public async deleteById(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = this.tenantContext();
    await writer.sectionSubject.deleteMany({
      where: { schoolId, id },
    });
  }

  private reader(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  private tenantContext(): { schoolId: string } {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('SectionSubjectRepository requires a tenant-scoped RequestContext.');
    }
    return { schoolId: ctx.schoolId };
  }
}

function mapRow(row: {
  id: string;
  schoolId: string;
  sectionId: string;
  subjectId: string;
  mode: SectionSubjectMode;
  replacesSubjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}): SectionSubjectRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    sectionId: row.sectionId,
    subjectId: row.subjectId,
    mode: row.mode,
    replacesSubjectId: row.replacesSubjectId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}
