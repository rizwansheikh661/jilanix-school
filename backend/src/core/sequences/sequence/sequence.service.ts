/**
 * SequenceService — the gap-free counter allocator for per-tenant identifiers
 * (admission no, employee code, invoice no, receipt no, TC no, certificate
 * no).
 *
 * Public surface:
 *   - `nextValue(name, opts?)` — allocates and returns the next integer.
 *     Caller MUST be inside a transaction (`tx` argument or wrap a
 *     `prisma.transaction(...)` around the business operation). If `tx` is
 *     omitted, this service opens its own transaction — typically only fine
 *     for synthetic / admin paths.
 *   - `peek(name, opts?)` — returns current `lastValue` for the tenant
 *     without advancing it. Used by the read controller.
 *   - `list()` — enumerates every counter row for the current tenant.
 *
 * Gap-free contract (BUSINESS_RULES §11): when the caller's outer business
 * tx rolls back, the counter increment rolls back with it — so an aborted
 * operation does NOT consume an integer. This is achieved by reusing the
 * caller-supplied `tx` for the increment statement instead of opening a
 * nested transaction.
 *
 * Fiscal-year scoping: `SEQUENCE_REQUIRES_FISCAL_YEAR` (in `sequences.constants`)
 * declares which sequences reset annually. The service validates the
 * `fiscalYear` argument against that table — passing it for an evergreen
 * sequence (or omitting it for a fiscal one) throws `SequenceFiscalYearMismatchError`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { TenantSequenceRepository } from '../repositories/tenant-sequence.repository';
import {
  ALL_SEQUENCE_NAMES,
  SEQUENCE_REQUIRES_FISCAL_YEAR,
  type SequenceName,
} from '../sequences.constants';
import {
  SequenceFiscalYearMalformedError,
  SequenceFiscalYearMismatchError,
  UnknownSequenceError,
} from '../sequences.errors';
import type { TenantSequenceRow } from '../sequences.types';

export interface SequenceCallArgs {
  readonly fiscalYear?: string;
  readonly tx?: PrismaTx;
}

const FISCAL_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;

@Injectable()
export class SequenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TenantSequenceRepository,
  ) {}

  /**
   * Allocate the next integer for `(currentTenant, name, fiscalYear?)`.
   * Returns a plain JS number (always <= 2^53 — the repository guards the
   * BIGINT boundary).
   *
   * If `args.tx` is supplied (the common case), the increment runs inside
   * that transaction so an outer rollback rolls the counter back too. If
   * omitted, the service opens its own transaction — only safe when the
   * caller has nothing to roll back together with the allocation.
   */
  public async nextValue(name: string, args: SequenceCallArgs = {}): Promise<number> {
    const sequenceName = this.requireKnownName(name);
    const fiscalYear = this.normaliseFiscalYear(sequenceName, args.fiscalYear);

    if (args.tx !== undefined) {
      const { value } = await this.repo.allocateNext(sequenceName, fiscalYear, args.tx);
      return value;
    }
    return this.prisma.transaction(async (tx) => {
      const { value } = await this.repo.allocateNext(sequenceName, fiscalYear, tx);
      return value;
    });
  }

  /**
   * Read the current `lastValue` for a counter without incrementing it.
   * Returns 0 if the row hasn't been created yet (no allocations to date).
   */
  public async peek(name: string, args: { readonly fiscalYear?: string } = {}): Promise<{
    readonly sequenceName: SequenceName;
    readonly fiscalYear: string | null;
    readonly lastValue: number;
    readonly updatedAt: Date | null;
  }> {
    const sequenceName = this.requireKnownName(name);
    const fiscalYear = this.normaliseFiscalYear(sequenceName, args.fiscalYear);
    const row = await this.repo.findByName(sequenceName, fiscalYear);
    return {
      sequenceName,
      fiscalYear,
      lastValue: row?.lastValue ?? 0,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  public async list(): Promise<readonly TenantSequenceRow[]> {
    return this.repo.findAll();
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private requireKnownName(name: string): SequenceName {
    if ((ALL_SEQUENCE_NAMES as readonly string[]).includes(name)) {
      return name as SequenceName;
    }
    throw new UnknownSequenceError(name);
  }

  private normaliseFiscalYear(
    name: SequenceName,
    fiscalYear: string | undefined,
  ): string | null {
    const requires = SEQUENCE_REQUIRES_FISCAL_YEAR[name];
    if (requires) {
      if (fiscalYear === undefined || fiscalYear === '') {
        throw new SequenceFiscalYearMismatchError({ sequenceName: name, reason: 'required' });
      }
      this.assertFiscalYearShape(fiscalYear);
      return fiscalYear;
    }
    if (fiscalYear !== undefined && fiscalYear !== '') {
      throw new SequenceFiscalYearMismatchError({ sequenceName: name, reason: 'unexpected' });
    }
    return null;
  }

  /**
   * `YYYY-YY` — second pair must be `firstPair + 1 (mod 100)` so "2026-27" is
   * valid but "2026-29" is not. Catches accidental typos that would otherwise
   * sit silently in the DB.
   */
  private assertFiscalYearShape(value: string): void {
    const match = FISCAL_YEAR_PATTERN.exec(value);
    if (match === null) {
      throw new SequenceFiscalYearMalformedError(value);
    }
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    const expectedEnd = (startYear + 1) % 100;
    if (endYear !== expectedEnd) {
      throw new SequenceFiscalYearMalformedError(value);
    }
  }
}
