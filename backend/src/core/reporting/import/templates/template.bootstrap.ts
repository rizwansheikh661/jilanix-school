/**
 * ImportTemplateBootstrap — registers the 5 import-template specs with
 * ImportTemplateRegistry on application boot. Mirrors `ValidatorBootstrap`.
 */
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { STUDENT_TEMPLATE_SPEC } from './student.template';
import {
  ATTENDANCE_TEMPLATE_SPEC,
  EXAM_MARKS_TEMPLATE_SPEC,
  FEE_PAYMENT_TEMPLATE_SPEC,
  STAFF_TEMPLATE_SPEC,
} from './stub.templates';
import { ImportTemplateRegistry } from './template.registry';

@Injectable()
export class ImportTemplateBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportTemplateBootstrap.name);

  constructor(private readonly registry: ImportTemplateRegistry) {}

  public onApplicationBootstrap(): void {
    this.registry.register(STUDENT_TEMPLATE_SPEC);
    this.registry.register(STAFF_TEMPLATE_SPEC);
    this.registry.register(EXAM_MARKS_TEMPLATE_SPEC);
    this.registry.register(ATTENDANCE_TEMPLATE_SPEC);
    this.registry.register(FEE_PAYMENT_TEMPLATE_SPEC);
    this.logger.log('Registered 5 import template specs.');
  }
}
