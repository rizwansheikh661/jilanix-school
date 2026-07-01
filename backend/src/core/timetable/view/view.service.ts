/**
 * TimetableViewService — derived weekly grids over `TimetableEntry`.
 *
 * Three perspectives:
 *   - sectionView(versionId, sectionId)
 *   - teacherView(versionId, staffId)
 *   - roomView(versionId, roomId)
 *
 * Each returns `{ version, periods, days, cells[] }` where `cells` is a
 * flat list of `{ dayOfWeek, periodIndex, entry | null }`. The frontend
 * pivots into a day×period grid.
 */
import { Injectable } from '@nestjs/common';

import { PeriodTemplateRepository } from '../period-template/period-template.repository';
import {
  TimetableVersionNotFoundError,
} from '../timetable.errors';
import type {
  PeriodTemplatePeriodRow,
  TimetableEntryRow,
  TimetableVersionRow,
} from '../timetable.types';
import { TimetableVersionRepository } from '../version/version.repository';
import { TimetableEntryRepository } from '../entry/entry.repository';

export interface TimetableViewCell {
  readonly dayOfWeek: number;
  readonly periodIndex: number;
  readonly entry: TimetableEntryRow | null;
}

export interface TimetableView {
  readonly version: TimetableVersionRow;
  readonly periods: readonly PeriodTemplatePeriodRow[];
  readonly days: readonly number[];
  readonly cells: readonly TimetableViewCell[];
}

@Injectable()
export class TimetableViewService {
  constructor(
    private readonly versionRepo: TimetableVersionRepository,
    private readonly templateRepo: PeriodTemplateRepository,
    private readonly entryRepo: TimetableEntryRepository,
  ) {}

  public async sectionView(versionId: string, sectionId: string): Promise<TimetableView> {
    const { version, template } = await this.loadVersion(versionId);
    const entries = await this.entryRepo.findActiveForSection(versionId, sectionId);
    return this.toView(version, template.periods, template.days, entries);
  }

  public async teacherView(versionId: string, staffId: string): Promise<TimetableView> {
    const { version, template } = await this.loadVersion(versionId);
    const entries = await this.entryRepo.findActiveForStaff(versionId, staffId);
    return this.toView(version, template.periods, template.days, entries);
  }

  public async roomView(versionId: string, roomId: string): Promise<TimetableView> {
    const { version, template } = await this.loadVersion(versionId);
    const entries = await this.entryRepo.findActiveForRoom(versionId, roomId);
    return this.toView(version, template.periods, template.days, entries);
  }

  private async loadVersion(versionId: string): Promise<{
    version: TimetableVersionRow;
    template: { periods: readonly PeriodTemplatePeriodRow[]; days: readonly number[] };
  }> {
    const version = await this.versionRepo.findById(versionId);
    if (version === null) throw new TimetableVersionNotFoundError(versionId);
    const template = await this.templateRepo.findById(version.periodTemplateId);
    if (template === null) {
      throw new TimetableVersionNotFoundError(versionId);
    }
    return { version, template: { periods: template.periods, days: template.days } };
  }

  private toView(
    version: TimetableVersionRow,
    periods: readonly PeriodTemplatePeriodRow[],
    days: readonly number[],
    entries: readonly TimetableEntryRow[],
  ): TimetableView {
    const byKey = new Map<string, TimetableEntryRow>();
    for (const e of entries) byKey.set(cellKey(e.dayOfWeek, e.periodIndex), e);

    const cells: TimetableViewCell[] = [];
    const sortedDays = [...days].sort((a, b) => a - b);
    const teachingPeriods = periods.filter((p) => p.type === 'TEACHING');
    for (const dow of sortedDays) {
      for (const p of teachingPeriods) {
        cells.push({
          dayOfWeek: dow,
          periodIndex: p.index,
          entry: byKey.get(cellKey(dow, p.index)) ?? null,
        });
      }
    }
    return { version, periods, days: sortedDays, cells };
  }
}

function cellKey(dow: number, periodIndex: number): string {
  return `${dow}:${periodIndex}`;
}
