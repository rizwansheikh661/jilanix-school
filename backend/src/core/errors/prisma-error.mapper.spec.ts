import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import {
  ConflictError,
  DomainError,
  DuplicateResourceError,
  InternalError,
  mapPrismaError,
  NotFoundError,
  VersionConflict,
} from './';
import {
  TenantContextMissingError,
  TenantScopeViolationError,
  VersionConflictError as InfraVersionConflictError,
} from '../../infra/prisma/errors';

function makeKnownError(
  code: string,
  meta?: Record<string, unknown>,
): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError(`prisma ${code}`, {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('mapPrismaError', () => {
  it('passes DomainError through unchanged', () => {
    const err = new NotFoundError('Student', 's1');
    expect(mapPrismaError(err)).toBe(err);
  });

  it('rewrites TenantScopeViolationError as RESOURCE_NOT_FOUND', () => {
    const err = new TenantScopeViolationError('Student', 'school-a', 'school-b');
    const out = mapPrismaError(err);
    expect(out).toBeInstanceOf(NotFoundError);
    expect(out?.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rewrites TenantContextMissingError as INTERNAL_ERROR', () => {
    const err = new TenantContextMissingError('Student');
    const out = mapPrismaError(err);
    expect(out).toBeInstanceOf(InternalError);
    expect(out?.code).toBe('INTERNAL_ERROR');
  });

  it('rewrites infra VersionConflictError as domain VersionConflict (409)', () => {
    const err = new InfraVersionConflictError('Student', 's1', 3);
    const out = mapPrismaError(err);
    expect(out).toBeInstanceOf(VersionConflict);
    expect(out?.code).toBe('VERSION_CONFLICT');
    expect(out?.details).toEqual({ resource: 'Student', id: 's1', expectedVersion: 3 });
  });

  it('maps P2002 to DUPLICATE_RESOURCE with field list', () => {
    const out = mapPrismaError(makeKnownError('P2002', { modelName: 'Student', target: ['email'] }));
    expect(out).toBeInstanceOf(DuplicateResourceError);
    expect(out?.code).toBe('DUPLICATE_RESOURCE');
    expect(out?.details).toEqual({ resource: 'Student', fields: ['email'] });
  });

  it('maps P2025 to RESOURCE_NOT_FOUND', () => {
    const out = mapPrismaError(makeKnownError('P2025', { modelName: 'Student' }));
    expect(out).toBeInstanceOf(NotFoundError);
    expect(out?.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('maps P2003 to STATE_INVALID', () => {
    const out = mapPrismaError(makeKnownError('P2003', { modelName: 'Enrollment' }));
    expect(out).toBeInstanceOf(ConflictError);
    expect(out?.code).toBe('STATE_INVALID');
  });

  it('maps unknown P-codes to INTERNAL_ERROR', () => {
    const out = mapPrismaError(makeKnownError('P9999'));
    expect(out).toBeInstanceOf(InternalError);
    expect(out?.code).toBe('INTERNAL_ERROR');
  });

  it('returns undefined for non-Prisma, non-domain errors', () => {
    expect(mapPrismaError(new Error('boom'))).toBeUndefined();
    expect(mapPrismaError('string error')).toBeUndefined();
  });

  it('returned value is always a DomainError when defined', () => {
    const out = mapPrismaError(makeKnownError('P2002', { modelName: 'X', target: ['y'] }));
    expect(out).toBeInstanceOf(DomainError);
  });
});
