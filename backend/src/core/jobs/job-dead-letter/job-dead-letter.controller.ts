import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { JobsPermissions } from '../jobs.constants';
import { JobDeadLetterService } from '../jobs.service';
import {
  JobDeadLetterListQueryDto,
  JobDeadLetterListResponseDto,
  JobDeadLetterResponseDto,
} from './job-dead-letter.dto';

@ApiTags('Jobs')
@ApiBearerAuth('access-token')
@Controller({ path: 'jobs/dead-letter', version: '1' })
export class JobDeadLetterController {
  constructor(private readonly service: JobDeadLetterService) {}

  @Get()
  @RequirePermissions(JobsPermissions.DEAD_LETTER_READ)
  @ApiOkResponse({ type: JobDeadLetterListResponseDto })
  public async list(@Query() query: JobDeadLetterListQueryDto): Promise<JobDeadLetterListResponseDto> {
    const rows = await this.service.list({
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.queue !== undefined ? { queue: query.queue } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(JobDeadLetterResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(JobsPermissions.DEAD_LETTER_READ)
  @ApiOkResponse({ type: JobDeadLetterResponseDto })
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<JobDeadLetterResponseDto> {
    const row = await this.service.getById(id);
    return JobDeadLetterResponseDto.from(row);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(JobsPermissions.DEAD_LETTER_REPLAY)
  @ApiOkResponse({ type: JobDeadLetterResponseDto })
  public async replay(@Param('id', new ParseUUIDPipe()) id: string): Promise<JobDeadLetterResponseDto> {
    const row = await this.service.replay(id);
    return JobDeadLetterResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(JobsPermissions.DEAD_LETTER_DELETE)
  public async archive(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.archive(id);
  }
}
