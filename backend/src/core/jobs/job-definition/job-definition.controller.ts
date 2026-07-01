import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { JobsPermissions } from '../jobs.constants';
import {
  CreateJobDefinitionDto,
  JobDefinitionListQueryDto,
  JobDefinitionListResponseDto,
  JobDefinitionResponseDto,
  UpdateJobDefinitionDto,
} from '../jobs.dto';
import { JobDefinitionService } from '../jobs.service';

@ApiTags('Jobs')
@ApiBearerAuth('access-token')
@Controller({ path: 'jobs/definitions', version: '1' })
export class JobDefinitionController {
  constructor(private readonly service: JobDefinitionService) {}

  @Get()
  @RequirePermissions(JobsPermissions.DEFINITION_READ)
  @ApiOkResponse({ type: JobDefinitionListResponseDto })
  public async list(@Query() query: JobDefinitionListQueryDto): Promise<JobDefinitionListResponseDto> {
    const rows = await this.service.list({
      ...(query.queue !== undefined ? { queue: query.queue } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(JobDefinitionResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(JobsPermissions.DEFINITION_READ)
  @ApiOkResponse({ type: JobDefinitionResponseDto })
  public async getOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<JobDefinitionResponseDto> {
    const row = await this.service.getById(id);
    return JobDefinitionResponseDto.from(row);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(JobsPermissions.DEFINITION_CREATE)
  @ApiOkResponse({ type: JobDefinitionResponseDto })
  public async create(@Body() body: CreateJobDefinitionDto): Promise<JobDefinitionResponseDto> {
    const row = await this.service.create({
      schoolId: null,
      name: body.name,
      queue: body.queue,
      handlerName: body.handlerName,
      scheduleCron: body.scheduleCron ?? null,
      ...(body.payloadTemplate !== undefined
        ? { payloadTemplate: body.payloadTemplate as Prisma.InputJsonValue }
        : {}),
      isActive: body.isActive ?? true,
      description: body.description ?? null,
    });
    return JobDefinitionResponseDto.from(row);
  }

  @Patch(':id')
  @RequirePermissions(JobsPermissions.DEFINITION_UPDATE)
  @ApiOkResponse({ type: JobDefinitionResponseDto })
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateJobDefinitionDto,
    @Headers('if-match') ifMatch?: string,
  ): Promise<JobDefinitionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.update(id, {
      ...(body.queue !== undefined ? { queue: body.queue } : {}),
      ...(body.handlerName !== undefined ? { handlerName: body.handlerName } : {}),
      ...(body.scheduleCron !== undefined ? { scheduleCron: body.scheduleCron } : {}),
      ...(body.payloadTemplate !== undefined
        ? { payloadTemplate: body.payloadTemplate as Prisma.InputJsonValue | null }
        : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      expectedVersion,
    });
    return JobDefinitionResponseDto.from(row);
  }

  @Post(':id/enable')
  @RequirePermissions(JobsPermissions.DEFINITION_UPDATE)
  public async enable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch?: string,
  ): Promise<JobDefinitionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.setActive(id, true, expectedVersion);
    return JobDefinitionResponseDto.from(row);
  }

  @Post(':id/disable')
  @RequirePermissions(JobsPermissions.DEFINITION_UPDATE)
  public async disable(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch?: string,
  ): Promise<JobDefinitionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.setActive(id, false, expectedVersion);
    return JobDefinitionResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(JobsPermissions.DEFINITION_DELETE)
  public async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(id);
  }
}
