/**
 * Holiday lookup helper. Sprint 6 service-level rule 2: when bulk-marking
 * on a holiday, every student row is inserted with status=HOLIDAY; explicit
 * non-HOLIDAY status on a holiday returns 409 (single-mark) or is coerced
 * (bulk).
 *
 * Authoritative source: `Holiday` table from Sprint 4.5 calendar. A holiday
 * counts when:
 *   - `attendance_treatment = 'HOLIDAY'`
 *   - `deleted_at IS NULL`
 *   - `branch_id IS NULL` (school-wide) OR matches the resolved branch
 *
 * Cached per-request via the request-context meta bag to avoid N queries
 * per bulk row.
 */
import { Injectable } from '@nestjs/common';

import type { PrismaTx } from '../../infra/prisma/types';
import { PrismaService } from '../../infra/prisma';
import { RequestContextRegistry } from '../request-context';

interface HolidayHit {
  readonly id: string;
  readonly date: Date;
  readonly branchId: string | null;
  readonly isFullDay: boolean;
}

@Injectable()
export class HolidayLookupService {
  // Per-request in-process cache. Key = `${schoolId}|${dateISO}|${branchId ?? ''}`.
  private readonly cache = new Map<string, HolidayHit | null>();

  constructor(private readonly prisma: PrismaService) {}

  private cacheKey(schoolId: string, date: Date, branchId: string | null): string {
    return `${schoolId}|${this.toDateString(date)}|${branchId ?? ''}`;
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  public async findHoliday(
    date: Date,
    branchId: string | null,
    tx?: PrismaTx,
  ): Promise<HolidayHit | null> {
    const ctx = RequestContextRegistry.require();
    const schoolId = ctx.schoolId;
    if (schoolId === undefined) throw new Error('HolidayLookupService requires tenant scope.');

    const key = this.cacheKey(schoolId, date, branchId);
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    const reader = tx ?? (this.prisma.client as unknown as PrismaTx);
    const dayStart = new Date(this.toDateString(date) + 'T00:00:00.000Z');

    const branchFilter =
      branchId === null
        ? { branchId: null }
        : { OR: [{ branchId: null }, { branchId }] };

    const row = await reader.holiday.findFirst({
      where: {
        schoolId,
        date: dayStart,
        attendanceTreatment: 'HOLIDAY',
        deletedAt: null,
        ...branchFilter,
      },
      select: { id: true, date: true, branchId: true, isFullDay: true },
    });

    const hit: HolidayHit | null = row === null
      ? null
      : {
          id: row.id,
          date: row.date,
          branchId: row.branchId,
          isFullDay: row.isFullDay,
        };
    this.cache.set(key, hit);
    return hit;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
