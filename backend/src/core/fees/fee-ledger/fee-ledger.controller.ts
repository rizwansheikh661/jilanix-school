/**
 * FeeLedgerController — base path `/api/v1/fees/ledger/students`.
 *
 * Routes:
 *   GET /:studentId?academicYearId=<uuid> — computed read-only ledger for
 *     the given student, optionally narrowed to a single academic year.
 *
 * Resolves the tenant `schoolId` from RequestContextRegistry (mirrors the
 * sibling fee-receipt controller's contract; the service does the actual
 * lookup so RBAC + tenant guards are exercised before any query runs).
 */
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { RequestContextRegistry } from '../../request-context';
import { FeesPermissions } from '../fees.constants';
import {
  LedgerQueryDto,
  StudentFeeLedgerResponseDto,
} from './fee-ledger.dto';
import { FeeLedgerService } from './fee-ledger.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/ledger/students', version: '1' })
export class FeeLedgerController {
  constructor(private readonly service: FeeLedgerService) {}

  @Get(':studentId')
  @RequirePermissions(FeesPermissions.LEDGER_READ)
  @ApiOperation({
    summary:
      "Get a student's computed fee ledger (debit/credit timeline + totals).",
  })
  @ApiOkResponse({ type: StudentFeeLedgerResponseDto })
  public async get(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: LedgerQueryDto,
  ): Promise<StudentFeeLedgerResponseDto> {
    const ctx = RequestContextRegistry.require();
    if (ctx.schoolId === undefined) {
      throw new Error('FeeLedgerController requires tenant scope.');
    }
    const ledger = await this.service.getStudentLedger({
      schoolId: ctx.schoolId,
      studentId,
      ...(query.academicYearId !== undefined
        ? { academicYearId: query.academicYearId }
        : {}),
    });
    return StudentFeeLedgerResponseDto.from(ledger);
  }
}
