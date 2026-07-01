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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { RequirePermissions } from '../../rbac';
import { SchoolPermissions } from '../school.constants';
import {
  CreateSchoolContactDto,
  SchoolContactListResponseDto,
  SchoolContactResponseDto,
  UpdateSchoolContactDto,
} from './school-contact.dto';
import { SchoolContactService } from './school-contact.service';

@ApiTags('SchoolContacts')
@ApiBearerAuth()
@Controller({ path: 'school/contacts', version: '1' })
export class SchoolContactController {
  constructor(private readonly service: SchoolContactService) {}

  @Get()
  @RequirePermissions(SchoolPermissions.CONTACT_READ)
  @ApiOperation({ summary: 'List school contacts.' })
  @ApiOkResponse({ type: SchoolContactListResponseDto })
  public async list(): Promise<SchoolContactListResponseDto> {
    const items = await this.service.list();
    return { items: items.map(SchoolContactResponseDto.from) };
  }

  @Post()
  @RequirePermissions(SchoolPermissions.CONTACT_CREATE)
  @ApiOperation({ summary: 'Create a new school contact entry.' })
  @ApiCreatedResponse({ type: SchoolContactResponseDto })
  public async create(@Body() body: CreateSchoolContactDto): Promise<SchoolContactResponseDto> {
    return SchoolContactResponseDto.from(
      await this.service.create({
        contactType: body.contactType,
        label: body.label,
        value: body.value,
        isPrimary: body.isPrimary,
        sortOrder: body.sortOrder,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(SchoolPermissions.CONTACT_UPDATE)
  @ApiOperation({ summary: 'Update a school contact entry.' })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: SchoolContactResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSchoolContactDto,
  ): Promise<SchoolContactResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return SchoolContactResponseDto.from(
      await this.service.update(id, expectedVersion, {
        contactType: body.contactType,
        label: body.label,
        value: body.value,
        isPrimary: body.isPrimary,
        sortOrder: body.sortOrder,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(SchoolPermissions.CONTACT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Delete a school contact entry.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}
