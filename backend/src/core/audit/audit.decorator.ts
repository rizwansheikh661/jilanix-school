/**
 * Decorators for declaring auditable surface area on services.
 *
 *   @Audit({ action: 'student.update', category: 'general',
 *            entityType: 'student' })
 *   async update(input) { ... }
 *
 *   @AuditCategory('finance')
 *   class InvoiceService { ... }
 *
 * The AuditInterceptor reads this metadata after a service method returns
 * and emits an AuditEvent. Decorator metadata is merged: a method-level
 * `@Audit` wins over a class-level `@AuditCategory`.
 *
 * Sprint 1 ships the decorators and the metadata reflectors; the
 * interceptor wires them into `AuditService.record(...)`. Note that
 * decorator-driven audit relies on `reflect-metadata`, which is already in
 * the dependency tree.
 */
import { SetMetadata } from '@nestjs/common';

import type { AuditCategory as AuditCategoryEnum } from './audit.types';

export const AUDIT_META = '__schoolos_audit_meta__';
export const AUDIT_CATEGORY_META = '__schoolos_audit_category_meta__';

export interface AuditMeta {
  readonly action: string;
  readonly category?: AuditCategoryEnum;
  readonly entityType?: string;
  /**
   * Where to find the entity id in the method arguments / return value.
   * Conventions evaluated in order:
   *   - `'return.id'`        → result.id
   *   - `'args.0.id'`        → args[0].id
   *   - `'args.0.studentId'` → args[0].studentId
   * Sprint 1 only supports these dotted paths. A richer extractor lands
   * with the full audit module.
   */
  readonly idFrom?: string;
  readonly sensitiveFields?: readonly string[];
}

export const Audit = (meta: AuditMeta): MethodDecorator => SetMetadata(AUDIT_META, meta);

export const AuditCategory = (category: AuditCategoryEnum): ClassDecorator =>
  SetMetadata(AUDIT_CATEGORY_META, category);
