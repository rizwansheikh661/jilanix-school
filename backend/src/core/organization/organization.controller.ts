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
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../http/if-match';
import { RequirePermissions } from '../rbac';
import { OrganizationPermissions } from './organization.constants';
import {
  CreateDepartmentDto,
  CreateDesignationDto,
  DepartmentListQueryDto,
  DepartmentListResponseDto,
  DepartmentResponseDto,
  DesignationListQueryDto,
  DesignationListResponseDto,
  DesignationResponseDto,
  UpdateDepartmentDto,
  UpdateDesignationDto,
} from './organization.dto';
import { DepartmentService, DesignationService } from './organization.service';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller({ path: 'departments', version: '1' })
export class DepartmentController {
  constructor(private readonly service: DepartmentService) {}

  @Get()
  @RequirePermissions(OrganizationPermissions.DEPARTMENT_READ)
  @ApiOkResponse({ type: DepartmentListResponseDto })
  public async list(@Query() query: DepartmentListQueryDto): Promise<DepartmentListResponseDto> {
    const items = await this.service.list({ branchId: query.branchId, type: query.type });
    return { items: items.map(DepartmentResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(OrganizationPermissions.DEPARTMENT_READ)
  @ApiOkResponse({ type: DepartmentResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<DepartmentResponseDto> {
    return DepartmentResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(OrganizationPermissions.DEPARTMENT_CREATE)
  @ApiCreatedResponse({ type: DepartmentResponseDto })
  public async create(@Body() body: CreateDepartmentDto): Promise<DepartmentResponseDto> {
    return DepartmentResponseDto.from(
      await this.service.create({
        branchId: body.branchId,
        parentDepartmentId: body.parentDepartmentId,
        code: body.code,
        name: body.name,
        type: body.type,
        description: body.description,
        headStaffId: body.headStaffId,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(OrganizationPermissions.DEPARTMENT_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: DepartmentResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateDepartmentDto,
  ): Promise<DepartmentResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return DepartmentResponseDto.from(
      await this.service.update(id, expectedVersion, {
        branchId: body.branchId,
        parentDepartmentId: body.parentDepartmentId,
        code: body.code,
        name: body.name,
        type: body.type,
        description: body.description,
        headStaffId: body.headStaffId,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(OrganizationPermissions.DEPARTMENT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}

@ApiTags('Designations')
@ApiBearerAuth()
@Controller({ path: 'designations', version: '1' })
export class DesignationController {
  constructor(private readonly service: DesignationService) {}

  @Get()
  @RequirePermissions(OrganizationPermissions.DESIGNATION_READ)
  @ApiOkResponse({ type: DesignationListResponseDto })
  public async list(@Query() query: DesignationListQueryDto): Promise<DesignationListResponseDto> {
    const items = await this.service.list({
      isTeaching: query.isTeaching,
      isManagement: query.isManagement,
    });
    return { items: items.map(DesignationResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(OrganizationPermissions.DESIGNATION_READ)
  @ApiOkResponse({ type: DesignationResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<DesignationResponseDto> {
    return DesignationResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(OrganizationPermissions.DESIGNATION_CREATE)
  @ApiCreatedResponse({ type: DesignationResponseDto })
  public async create(@Body() body: CreateDesignationDto): Promise<DesignationResponseDto> {
    return DesignationResponseDto.from(
      await this.service.create({
        code: body.code,
        name: body.name,
        rank: body.rank,
        isTeaching: body.isTeaching,
        isManagement: body.isManagement,
        description: body.description,
        reportsToDesignationId: body.reportsToDesignationId,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(OrganizationPermissions.DESIGNATION_UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: DesignationResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateDesignationDto,
  ): Promise<DesignationResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return DesignationResponseDto.from(
      await this.service.update(id, expectedVersion, {
        code: body.code,
        name: body.name,
        rank: body.rank,
        isTeaching: body.isTeaching,
        isManagement: body.isManagement,
        description: body.description,
        reportsToDesignationId: body.reportsToDesignationId,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(OrganizationPermissions.DESIGNATION_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }
}
