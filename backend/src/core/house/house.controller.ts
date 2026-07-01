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
import { HousePermissions } from './house.constants';
import {
  CreateHouseAssignmentDto,
  CreateHouseDto,
  HouseAssignmentListResponseDto,
  HouseAssignmentResponseDto,
  HouseListResponseDto,
  HouseResponseDto,
  UpdateHouseDto,
} from './house.dto';
import { HouseAssignmentService, HouseService } from './house.service';

@ApiTags('Houses')
@ApiBearerAuth()
@Controller({ path: 'houses', version: '1' })
export class HouseController {
  constructor(
    private readonly service: HouseService,
    private readonly assignments: HouseAssignmentService,
  ) {}

  @Get()
  @RequirePermissions(HousePermissions.READ)
  @ApiOkResponse({ type: HouseListResponseDto })
  public async list(): Promise<HouseListResponseDto> {
    const items = await this.service.list();
    return { items: items.map(HouseResponseDto.from) };
  }

  @Get(':id')
  @RequirePermissions(HousePermissions.READ)
  @ApiOkResponse({ type: HouseResponseDto })
  @ApiNotFoundResponse()
  public async get(@Param('id', new ParseUUIDPipe()) id: string): Promise<HouseResponseDto> {
    return HouseResponseDto.from(await this.service.get(id));
  }

  @Post()
  @RequirePermissions(HousePermissions.CREATE)
  @ApiCreatedResponse({ type: HouseResponseDto })
  public async create(@Body() body: CreateHouseDto): Promise<HouseResponseDto> {
    return HouseResponseDto.from(
      await this.service.create({
        code: body.code,
        name: body.name,
        colorHex: body.colorHex,
        motto: body.motto,
        captainStudentId: body.captainStudentId,
        viceCaptainStudentId: body.viceCaptainStudentId,
        photoUrl: body.photoUrl,
        sortOrder: body.sortOrder,
      }),
    );
  }

  @Patch(':id')
  @RequirePermissions(HousePermissions.UPDATE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: HouseResponseDto })
  @ApiNotFoundResponse()
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateHouseDto,
  ): Promise<HouseResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    return HouseResponseDto.from(
      await this.service.update(id, expectedVersion, {
        code: body.code,
        name: body.name,
        colorHex: body.colorHex,
        motto: body.motto,
        captainStudentId: body.captainStudentId,
        viceCaptainStudentId: body.viceCaptainStudentId,
        photoUrl: body.photoUrl,
        sortOrder: body.sortOrder,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(HousePermissions.DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiNoContentResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.delete(id, expectedVersion);
  }

  @Get(':id/assignments')
  @RequirePermissions(HousePermissions.ASSIGNMENT_READ)
  @ApiOkResponse({ type: HouseAssignmentListResponseDto })
  public async listAssignments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('academicYearId') academicYearId?: string,
  ): Promise<HouseAssignmentListResponseDto> {
    const items = await this.assignments.listForHouse({ houseId: id, academicYearId });
    return { items: items.map(HouseAssignmentResponseDto.from) };
  }
}

@ApiTags('House Assignments')
@ApiBearerAuth()
@Controller({ path: 'house-assignments', version: '1' })
export class HouseAssignmentController {
  constructor(private readonly service: HouseAssignmentService) {}

  @Post()
  @RequirePermissions(HousePermissions.ASSIGNMENT_CREATE)
  @ApiCreatedResponse({ type: HouseAssignmentResponseDto })
  public async create(@Body() body: CreateHouseAssignmentDto): Promise<HouseAssignmentResponseDto> {
    return HouseAssignmentResponseDto.from(
      await this.service.assign({
        studentId: body.studentId,
        houseId: body.houseId,
        academicYearId: body.academicYearId,
        assignedOn: body.assignedOn,
        reason: body.reason,
      }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(HousePermissions.ASSIGNMENT_DELETE)
  @ApiNoContentResponse()
  public async end(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.endAssignment(id, new Date());
  }
}

@ApiTags('Students')
@ApiBearerAuth()
@Controller({ path: 'students', version: '1' })
export class StudentHouseAssignmentController {
  constructor(private readonly service: HouseAssignmentService) {}

  @Get(':studentId/house-assignments')
  @RequirePermissions(HousePermissions.ASSIGNMENT_READ)
  @ApiOkResponse({ type: HouseAssignmentListResponseDto })
  public async list(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<HouseAssignmentListResponseDto> {
    const items = await this.service.listForStudent(studentId);
    return { items: items.map(HouseAssignmentResponseDto.from) };
  }
}
