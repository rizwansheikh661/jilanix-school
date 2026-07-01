/**
 * NotificationTemplateController — `/notifications/templates` routes
 * (Sprint 10 Wave 4). Mutations require `If-Match` for optimistic
 * concurrency; permissions enforced via `@RequirePermissions`.
 */
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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { NotificationsPermissions } from '../notifications.constants';
import type {
  NotificationTemplateRow,
  NotificationTemplateVersionRow,
} from '../notifications.types';
import {
  AppendNotificationTemplateVersionDto,
  CreateNotificationTemplateDto,
  ListNotificationTemplatesQueryDto,
  NotificationTemplateListResponseDto,
  NotificationTemplateResponseDto,
  NotificationTemplateVersionListResponseDto,
  NotificationTemplateVersionResponseDto,
  UpdateNotificationTemplateDto,
} from './notification-template.dto';
import {
  NotificationTemplateService,
  type NotificationTemplateWithVersion,
} from './notification-template.service';

const LIST_DEFAULT_LIMIT = 50;

@ApiTags('Notification Templates')
@ApiBearerAuth()
@Controller({ path: 'notifications/templates', version: '1' })
export class NotificationTemplateController {
  constructor(private readonly service: NotificationTemplateService) {}

  @Get()
  @RequirePermissions(NotificationsPermissions.TEMPLATE_READ)
  @ApiOperation({ summary: 'List notification templates (cursor paginated).' })
  @ApiOkResponse({ type: NotificationTemplateListResponseDto })
  public async list(
    @Query() query: ListNotificationTemplatesQueryDto,
  ): Promise<NotificationTemplateListResponseDto> {
    const { items, nextCursor } = await this.service.list({
      limit: query.limit ?? LIST_DEFAULT_LIMIT,
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.eventKey !== undefined ? { eventKey: query.eventKey } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
    return {
      items: items.map(toHeaderResponse),
      nextCursor,
    };
  }

  @Post()
  @RequirePermissions(NotificationsPermissions.TEMPLATE_CREATE)
  @ApiOperation({
    summary: 'Create a notification template (header + initial version 1).',
  })
  @ApiCreatedResponse({ type: NotificationTemplateResponseDto })
  public async create(
    @Body() body: CreateNotificationTemplateDto,
  ): Promise<NotificationTemplateResponseDto> {
    const result = await this.service.create({
      code: body.code,
      name: body.name,
      channel: body.channel,
      category: body.category,
      bodyText: body.bodyText,
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.eventKey !== undefined ? { eventKey: body.eventKey } : {}),
      ...(body.defaultPriority !== undefined
        ? { defaultPriority: body.defaultPriority }
        : {}),
      ...(body.locale !== undefined ? { locale: body.locale } : {}),
      ...(body.audience !== undefined ? { audience: body.audience } : {}),
      ...(body.variablesSpec !== undefined
        ? { variablesSpec: body.variablesSpec }
        : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.bodyHtml !== undefined ? { bodyHtml: body.bodyHtml } : {}),
    });
    return toHeaderResponseWithVersion(result);
  }

  @Get(':id')
  @RequirePermissions(NotificationsPermissions.TEMPLATE_READ)
  @ApiOperation({
    summary: 'Get a notification template by id (header + active version body).',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: NotificationTemplateResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NotificationTemplateResponseDto> {
    const result = await this.service.getById(id);
    return toHeaderResponseWithVersion(result);
  }

  @Patch(':id')
  @RequirePermissions(NotificationsPermissions.TEMPLATE_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary: 'Update header-only fields on a notification template.',
  })
  @ApiOkResponse({ type: NotificationTemplateResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateNotificationTemplateDto,
  ): Promise<NotificationTemplateResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const header = await this.service.update(id, expectedVersion, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.defaultPriority !== undefined
        ? { defaultPriority: body.defaultPriority }
        : {}),
      ...(body.locale !== undefined ? { locale: body.locale } : {}),
      ...(body.audience !== undefined ? { audience: body.audience } : {}),
      ...(body.eventKey !== undefined ? { eventKey: body.eventKey } : {}),
      ...(body.variablesSpec !== undefined
        ? { variablesSpec: body.variablesSpec }
        : {}),
    });
    return toHeaderResponse(header);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(NotificationsPermissions.TEMPLATE_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary:
      'Soft-delete a notification template (refused if referenced by queued messages or active campaigns).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }

  @Post(':id/versions')
  @RequirePermissions(NotificationsPermissions.TEMPLATE_CREATE_VERSION)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary:
      'Append a new immutable version and bump the active version pointer.',
  })
  @ApiCreatedResponse({ type: NotificationTemplateVersionResponseDto })
  @ApiNotFoundResponse()
  public async appendVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AppendNotificationTemplateVersionDto,
  ): Promise<NotificationTemplateVersionResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const { version } = await this.service.appendVersion(id, expectedVersion, {
      bodyText: body.bodyText,
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.bodyHtml !== undefined ? { bodyHtml: body.bodyHtml } : {}),
      ...(body.variablesSnapshot !== undefined
        ? { variablesSnapshot: body.variablesSnapshot }
        : {}),
    });
    return toVersionResponse(version);
  }

  @Get(':id/versions')
  @RequirePermissions(NotificationsPermissions.TEMPLATE_READ)
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary: 'List all versions for a notification template (oldest first).',
  })
  @ApiOkResponse({ type: NotificationTemplateVersionListResponseDto })
  @ApiNotFoundResponse()
  public async listVersions(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NotificationTemplateVersionListResponseDto> {
    const versions = await this.service.listVersions(id);
    return { items: versions.map(toVersionResponse) };
  }

  @Post(':id/activate')
  @RequirePermissions(NotificationsPermissions.TEMPLATE_ACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Activate a notification template.' })
  @ApiOkResponse({ type: NotificationTemplateResponseDto })
  @ApiNotFoundResponse()
  public async activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<NotificationTemplateResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const header = await this.service.activate(id, expectedVersion);
    return toHeaderResponse(header);
  }

  @Post(':id/deactivate')
  @RequirePermissions(NotificationsPermissions.TEMPLATE_DEACTIVATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Deactivate a notification template.' })
  @ApiOkResponse({ type: NotificationTemplateResponseDto })
  @ApiNotFoundResponse()
  public async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<NotificationTemplateResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const header = await this.service.deactivate(id, expectedVersion);
    return toHeaderResponse(header);
  }
}

function toHeaderResponse(
  row: NotificationTemplateRow,
): NotificationTemplateResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    code: row.code,
    name: row.name,
    description: row.description,
    channel: row.channel,
    category: row.category,
    eventKey: row.eventKey,
    defaultPriority: row.defaultPriority,
    locale: row.locale,
    isActive: row.isActive,
    activeVersionNo: row.activeVersionNo,
    audience: row.audience,
    variablesSpec: row.variablesSpec as Record<string, unknown> | null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHeaderResponseWithVersion(
  result: NotificationTemplateWithVersion,
): NotificationTemplateResponseDto {
  const base = toHeaderResponse(result.header);
  if (result.activeVersion === null) return base;
  return { ...base, activeVersion: toVersionResponse(result.activeVersion) };
}

function toVersionResponse(
  row: NotificationTemplateVersionRow,
): NotificationTemplateVersionResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    notificationTemplateId: row.notificationTemplateId,
    versionNo: row.versionNo,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    variablesSnapshot: row.variablesSnapshot as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}
