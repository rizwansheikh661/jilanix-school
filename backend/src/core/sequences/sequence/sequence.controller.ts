/**
 * SequenceController — read-only admin endpoints for inspecting the per-tenant
 * counter catalog. Sequence consumption (incrementing) is service-internal and
 * does NOT have an HTTP route — domain services call
 * `SequenceService.nextValue(...)` directly inside their business transactions.
 *
 * A future Sprint-18 reset endpoint will land here with the `sequence.reset`
 * permission already declared in `sequences.constants`.
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { SequencesPermissions } from '../sequences.constants';
import { PeekSequenceQueryDto, SequenceListResponseDto, SequenceResponseDto } from './sequence.dto';
import { SequenceService } from './sequence.service';

@ApiTags('Sequences')
@ApiBearerAuth()
@Controller({ path: 'sequences', version: '1' })
export class SequenceController {
  constructor(private readonly service: SequenceService) {}

  @Get()
  @RequirePermissions(SequencesPermissions.SEQUENCE_READ)
  @ApiOperation({ summary: 'List current values of every tenant sequence.' })
  @ApiOkResponse({ type: SequenceListResponseDto })
  public async list(): Promise<SequenceListResponseDto> {
    const rows = await this.service.list();
    return { items: rows.map(SequenceResponseDto.from) };
  }

  @Get(':name')
  @RequirePermissions(SequencesPermissions.SEQUENCE_READ)
  @ApiParam({
    name: 'name',
    description: 'Sequence name from SEQ_NAMES (admission, employee, invoice, receipt, tc, certificate).',
  })
  @ApiOperation({ summary: 'Peek the current value of a single tenant sequence.' })
  @ApiOkResponse({ type: SequenceResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown sequence name.' })
  @ApiUnprocessableEntityResponse({ description: 'fiscalYear required/unexpected/malformed.' })
  public async peek(
    @Param('name') name: string,
    @Query() query: PeekSequenceQueryDto,
  ): Promise<SequenceResponseDto> {
    const result = await this.service.peek(
      name,
      query.fiscalYear !== undefined ? { fiscalYear: query.fiscalYear } : {},
    );
    return SequenceResponseDto.fromPeek(result);
  }
}
