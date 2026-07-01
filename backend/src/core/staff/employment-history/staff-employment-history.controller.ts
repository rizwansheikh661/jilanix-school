/**
 * StaffEmploymentHistoryController — read-only `/staff/:id/employment-history`.
 * Records are appended by StaffService inside the same transaction as the
 * staff lifecycle change that produced them.
 */
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { NotFoundError } from '../../errors/domain-error';
import { RequirePermissions } from '../../rbac';
import { StaffRepository } from '../repositories/staff.repository';
import { StaffEmploymentHistoryRepository } from '../repositories/staff-employment-history.repository';
import { StaffPermissions } from '../staff.constants';
import {
  EMPLOYMENT_EVENT_VALUES,
  type EmploymentEventValue,
  type StaffEmploymentHistoryRow,
} from '../staff.types';

class StaffEmploymentHistoryResponseDto {
  @ApiProperty({ format: 'uuid' }) public readonly id!: string;
  @ApiProperty({ format: 'uuid' }) public readonly staffId!: string;
  @ApiProperty({ enum: EMPLOYMENT_EVENT_VALUES as unknown as string[] })
  public readonly event!: EmploymentEventValue;
  @ApiProperty({ format: 'date' }) public readonly effectiveDate!: string;
  @ApiProperty({ nullable: true }) public readonly fromValue!: string | null;
  @ApiProperty({ nullable: true }) public readonly toValue!: string | null;
  @ApiProperty({ nullable: true }) public readonly note!: string | null;
  @ApiProperty({ nullable: true, format: 'uuid' }) public readonly actorId!: string | null;
  @ApiProperty({ format: 'date-time' }) public readonly occurredAt!: string;

  public static from(row: StaffEmploymentHistoryRow): StaffEmploymentHistoryResponseDto {
    return {
      id: row.id,
      staffId: row.staffId,
      event: row.event,
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      fromValue: row.fromValue,
      toValue: row.toValue,
      note: row.note,
      actorId: row.actorId,
      occurredAt: row.occurredAt.toISOString(),
    };
  }
}

class StaffEmploymentHistoryListResponseDto {
  @ApiProperty({ type: [StaffEmploymentHistoryResponseDto] })
  public readonly items!: readonly StaffEmploymentHistoryResponseDto[];
}

@ApiTags('StaffEmploymentHistory')
@ApiBearerAuth()
@Controller({ path: 'staff/:id/employment-history', version: '1' })
export class StaffEmploymentHistoryController {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly repo: StaffEmploymentHistoryRepository,
  ) {}

  @Get()
  @RequirePermissions(StaffPermissions.EMPLOYMENT_HISTORY_READ)
  @ApiOperation({ summary: 'List employment-history events for a staff member.' })
  @ApiOkResponse({ type: StaffEmploymentHistoryListResponseDto })
  @ApiNotFoundResponse()
  public async list(
    @Param('id', new ParseUUIDPipe()) staffId: string,
  ): Promise<StaffEmploymentHistoryListResponseDto> {
    const staff = await this.staffRepo.findById(staffId);
    if (staff === null) throw new NotFoundError('Staff', staffId);
    const rows = await this.repo.findByStaff(staffId);
    return { items: rows.map(StaffEmploymentHistoryResponseDto.from) };
  }
}
