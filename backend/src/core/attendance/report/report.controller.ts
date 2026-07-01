/**
 * AttendanceReportController — `/api/v1/attendance/reports/*` read-only.
 */
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from '../../rbac';
import { AttendancePermissions } from '../attendance.constants';
import {
  AnalyticsReportQueryDto,
  AnalyticsReportResponseDto,
  ClassReportQueryDto,
  ClassReportResponseDto,
  MonthlyReportQueryDto,
  MonthlyReportResponseDto,
  StaffReportQueryDto,
  StaffReportResponseDto,
  StudentReportQueryDto,
  StudentReportResponseDto,
} from './report.dto';
import { AttendanceReportService } from './report.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller({ path: 'attendance/reports', version: '1' })
export class AttendanceReportController {
  constructor(private readonly service: AttendanceReportService) {}

  @Get('class')
  @RequirePermissions(AttendancePermissions.REPORT_READ)
  @ApiOperation({ summary: 'Per-section per-date status roll-up.' })
  @ApiOkResponse({ type: ClassReportResponseDto })
  public async classReport(
    @Query() query: ClassReportQueryDto,
  ): Promise<ClassReportResponseDto> {
    const r = await this.service.classReport({
      sectionId: query.sectionId,
      date: new Date(query.date),
    });
    return {
      sectionId: r.sectionId,
      date: r.date.toISOString().slice(0, 10),
      total: r.total,
      byStatus: r.byStatus,
    };
  }

  @Get('student/:studentId')
  @RequirePermissions(AttendancePermissions.REPORT_READ)
  @ApiOperation({ summary: 'Per-student status roll-up for a date range.' })
  @ApiOkResponse({ type: StudentReportResponseDto })
  public async studentReport(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: StudentReportQueryDto,
  ): Promise<StudentReportResponseDto> {
    const r = await this.service.studentReport({
      studentId,
      dateFrom: new Date(query.dateFrom),
      dateTo: new Date(query.dateTo),
    });
    return {
      studentId: r.studentId,
      dateFrom: r.dateFrom.toISOString().slice(0, 10),
      dateTo: r.dateTo.toISOString().slice(0, 10),
      total: r.total,
      byStatus: r.byStatus,
    };
  }

  @Get('staff/:staffId')
  @RequirePermissions(AttendancePermissions.REPORT_READ)
  @ApiOperation({ summary: 'Per-staff status roll-up for a date range.' })
  @ApiOkResponse({ type: StaffReportResponseDto })
  public async staffReport(
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @Query() query: StaffReportQueryDto,
  ): Promise<StaffReportResponseDto> {
    const r = await this.service.staffReport({
      staffId,
      dateFrom: new Date(query.dateFrom),
      dateTo: new Date(query.dateTo),
    });
    return {
      staffId: r.staffId,
      dateFrom: r.dateFrom.toISOString().slice(0, 10),
      dateTo: r.dateTo.toISOString().slice(0, 10),
      total: r.total,
      byStatus: r.byStatus,
    };
  }

  @Get('monthly')
  @RequirePermissions(AttendancePermissions.REPORT_READ)
  @ApiOperation({ summary: 'Section × month grid of attendance statuses.' })
  @ApiOkResponse({ type: MonthlyReportResponseDto })
  public async monthlyReport(
    @Query() query: MonthlyReportQueryDto,
  ): Promise<MonthlyReportResponseDto> {
    const r = await this.service.monthlyReport({
      sectionId: query.sectionId,
      month: query.month,
    });
    return {
      sectionId: r.sectionId,
      month: r.month,
      cells: r.cells.map((c) => ({
        studentId: c.studentId,
        date: c.date.toISOString().slice(0, 10),
        status: c.status,
      })),
    };
  }

  @Get('analytics')
  @RequirePermissions(AttendancePermissions.REPORT_READ)
  @ApiOperation({ summary: 'Status counts across a date range; foundation for dashboards.' })
  @ApiOkResponse({ type: AnalyticsReportResponseDto })
  public async analyticsReport(
    @Query() query: AnalyticsReportQueryDto,
  ): Promise<AnalyticsReportResponseDto> {
    const r = await this.service.analyticsReport({
      dateFrom: new Date(query.dateFrom),
      dateTo: new Date(query.dateTo),
      ...(query.branchId !== undefined ? { branchId: query.branchId } : {}),
      ...(query.sectionId !== undefined ? { sectionId: query.sectionId } : {}),
    });
    return {
      dateFrom: r.dateFrom.toISOString().slice(0, 10),
      dateTo: r.dateTo.toISOString().slice(0, 10),
      total: r.total,
      byStatus: r.byStatus,
    };
  }
}
