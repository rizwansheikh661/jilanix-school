/**
 * ValidatorBootstrap — single OnApplicationBootstrap class that registers
 * the 5 row validators (1 live + 4 stubs) with ValidatorRegistry.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { StudentImportRowValidator } from './student-import-row.validator';
import {
  AttendanceImportRowValidator,
  ExamMarksImportRowValidator,
  FeePaymentImportRowValidator,
  StaffImportRowValidator,
} from './stub-validators';
import { ValidatorRegistry } from './validator.registry';

@Injectable()
export class ValidatorBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ValidatorBootstrap.name);

  constructor(
    private readonly registry: ValidatorRegistry,
    private readonly student: StudentImportRowValidator,
    private readonly staff: StaffImportRowValidator,
    private readonly examMarks: ExamMarksImportRowValidator,
    private readonly attendance: AttendanceImportRowValidator,
    private readonly feePayment: FeePaymentImportRowValidator,
  ) {}

  public onApplicationBootstrap(): void {
    this.registry.register('STUDENT', this.student);
    this.registry.register('STAFF', this.staff);
    this.registry.register('EXAM_MARKS', this.examMarks);
    this.registry.register('ATTENDANCE', this.attendance);
    this.registry.register('FEE_PAYMENT', this.feePayment);
    this.logger.log('Registered 5 import-row validators.');
  }
}
