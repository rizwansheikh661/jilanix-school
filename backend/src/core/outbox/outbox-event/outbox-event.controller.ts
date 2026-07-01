import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator';
import { OutboxPermissions } from '../outbox.constants';
import {
  OutboxDeadLetterQueryDto,
  OutboxEventListResponseDto,
  OutboxEventResponseDto,
  OutboxListQueryDto,
} from './outbox-event.dto';
import { OutboxEventService } from './outbox-event.service';

@ApiTags('Outbox')
@ApiBearerAuth('access-token')
@Controller({ path: 'outbox', version: '1' })
export class OutboxEventController {
  constructor(private readonly service: OutboxEventService) {}

  @Get()
  @RequirePermissions(OutboxPermissions.READ)
  @ApiOkResponse({ type: OutboxEventListResponseDto })
  public async list(@Query() query: OutboxListQueryDto): Promise<OutboxEventListResponseDto> {
    const rows = await this.service.list({
      ...(query.topic !== undefined ? { topic: query.topic } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(OutboxEventResponseDto.from) };
  }

  @Get('dead-letter')
  @RequirePermissions(OutboxPermissions.DEAD_LETTER_READ)
  @ApiOkResponse({ type: OutboxEventListResponseDto })
  public async listDeadLetter(
    @Query() query: OutboxDeadLetterQueryDto,
  ): Promise<OutboxEventListResponseDto> {
    const rows = await this.service.listDeadLetter({
      ...(query.topic !== undefined ? { topic: query.topic } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
    });
    return { items: rows.map(OutboxEventResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(OutboxPermissions.READ)
  @ApiOkResponse({ type: OutboxEventResponseDto })
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OutboxEventResponseDto> {
    const row = await this.service.getById(id);
    return OutboxEventResponseDto.from(row);
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(OutboxPermissions.REPLAY)
  @ApiOkResponse({ type: OutboxEventResponseDto })
  public async replay(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OutboxEventResponseDto> {
    const row = await this.service.replay(id);
    return OutboxEventResponseDto.from(row);
  }

  @Post('dead-letter/:id/replay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(OutboxPermissions.DEAD_LETTER_REPLAY)
  @ApiOkResponse({ type: OutboxEventResponseDto })
  public async replayDeadLetter(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OutboxEventResponseDto> {
    const row = await this.service.replay(id);
    return OutboxEventResponseDto.from(row);
  }
}
