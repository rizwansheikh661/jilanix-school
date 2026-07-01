import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { JobsPermissions } from '../jobs.constants';
import {
  JobRunListQueryDto,
  JobRunListResponseDto,
  JobRunResponseDto,
} from '../jobs.dto';
import { JobRunService } from '../jobs.service';

@ApiTags('Jobs')
@ApiBearerAuth('access-token')
@Controller({ path: 'jobs/runs', version: '1' })
export class JobRunController {
  constructor(private readonly service: JobRunService) {}

  @Get()
  @RequirePermissions(JobsPermissions.RUN_READ)
  @ApiOkResponse({ type: JobRunListResponseDto })
  public async list(@Query() query: JobRunListQueryDto): Promise<JobRunListResponseDto> {
    const rows = await this.service.list({
      ...(query.definitionId !== undefined ? { definitionId: query.definitionId } : {}),
      ...(query.jobId !== undefined ? { jobId: query.jobId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(JobRunResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(JobsPermissions.RUN_READ)
  @ApiOkResponse({ type: JobRunResponseDto })
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<JobRunResponseDto> {
    const row = await this.service.getById(id);
    return JobRunResponseDto.from(row);
  }
}
