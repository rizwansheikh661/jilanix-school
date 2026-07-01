/**
 * StudentFeeDiscountController — `/fees/student-discounts` routes.
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
  ApiTags,
} from '@nestjs/swagger';

import { parseIfMatch } from '../../http/if-match';
import { PAGINATION_DEFAULT_LIMIT } from '../../http/pagination.dto';
import { RequirePermissions } from '../../rbac';
import { FeesPermissions } from '../fees.constants';
import {
  CreateStudentFeeDiscountDto,
  StudentFeeDiscountListQueryDto,
  StudentFeeDiscountListResponseDto,
  StudentFeeDiscountResponseDto,
} from './fee-discount.dto';
import { StudentFeeDiscountService } from './student-fee-discount.service';

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees/student-discounts', version: '1' })
export class StudentFeeDiscountController {
  constructor(private readonly service: StudentFeeDiscountService) {}

  @Get()
  @RequirePermissions(FeesPermissions.STUDENT_DISCOUNT_READ)
  @ApiOperation({ summary: 'List student fee-discount assignments (cursor paginated).' })
  @ApiOkResponse({ type: StudentFeeDiscountListResponseDto })
  public async list(
    @Query() query: StudentFeeDiscountListQueryDto,
  ): Promise<StudentFeeDiscountListResponseDto> {
    const { items, nextCursorId } = await this.service.list({
      limit: query.limit ?? PAGINATION_DEFAULT_LIMIT,
      ...(query.cursor !== undefined ? { cursorId: query.cursor } : {}),
      ...(query.studentId !== undefined ? { studentId: query.studentId } : {}),
      ...(query.academicYearId !== undefined
        ? { academicYearId: query.academicYearId }
        : {}),
      ...(query.feeDiscountId !== undefined
        ? { feeDiscountId: query.feeDiscountId }
        : {}),
      ...(query.approvedOnly !== undefined
        ? { approvedOnly: query.approvedOnly }
        : {}),
    });
    return {
      items: items.map(StudentFeeDiscountResponseDto.from),
      nextCursor: nextCursorId,
    };
  }

  @Get(':id')
  @RequirePermissions(FeesPermissions.STUDENT_DISCOUNT_READ)
  @ApiOperation({ summary: 'Get a student fee-discount assignment by id.' })
  @ApiOkResponse({ type: StudentFeeDiscountResponseDto })
  @ApiNotFoundResponse()
  public async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StudentFeeDiscountResponseDto> {
    return StudentFeeDiscountResponseDto.from(await this.service.getById(id));
  }

  @Post()
  @RequirePermissions(FeesPermissions.STUDENT_DISCOUNT_CREATE)
  @ApiOperation({ summary: 'Assign a fee discount to a student.' })
  @ApiCreatedResponse({ type: StudentFeeDiscountResponseDto })
  public async create(
    @Body() body: CreateStudentFeeDiscountDto,
  ): Promise<StudentFeeDiscountResponseDto> {
    const row = await this.service.create({
      studentId: body.studentId,
      feeDiscountId: body.feeDiscountId,
      academicYearId: body.academicYearId,
      validFrom: new Date(body.validFrom),
      ...(body.validTo !== undefined && body.validTo !== null
        ? { validTo: new Date(body.validTo) }
        : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });
    return StudentFeeDiscountResponseDto.from(row);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(FeesPermissions.STUDENT_DISCOUNT_DELETE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Soft-delete (unassign) a student fee-discount.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const expectedVersion = parseIfMatch(ifMatch);
    await this.service.softDelete(id, expectedVersion);
  }

  @Post(':id/approve')
  @RequirePermissions(FeesPermissions.STUDENT_DISCOUNT_APPROVE)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOperation({ summary: 'Approve a student fee-discount assignment.' })
  @ApiOkResponse({ type: StudentFeeDiscountResponseDto })
  @ApiNotFoundResponse()
  public async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<StudentFeeDiscountResponseDto> {
    const expectedVersion = parseIfMatch(ifMatch);
    const row = await this.service.approve(id, expectedVersion);
    return StudentFeeDiscountResponseDto.from(row);
  }
}
