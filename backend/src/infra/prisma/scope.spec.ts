import { TenantContextMissingError, TenantScopeViolationError, VersionConflictError } from './errors';
import { getModelScope, isAppendOnlyModel, isSoftDeleteModel, MODEL_SCOPE } from './scope';

describe('prisma/scope registry', () => {
  it('exposes a non-empty registry', () => {
    expect(Object.keys(MODEL_SCOPE).length).toBeGreaterThan(0);
  });

  it('classifies School as PLATFORM_ONLY', () => {
    expect(getModelScope('School')).toBe('PLATFORM_ONLY');
  });

  it('classifies SchoolSettings as TENANT_OWNED', () => {
    expect(getModelScope('SchoolSettings')).toBe('TENANT_OWNED');
  });

  it('classifies AuditLog as CROSS_TENANT_OPERATIONAL and append-only', () => {
    expect(getModelScope('AuditLog')).toBe('CROSS_TENANT_OPERATIONAL');
    expect(isAppendOnlyModel('AuditLog')).toBe(true);
  });

  it('returns undefined for unknown models so PrismaService can fail loud', () => {
    expect(getModelScope('NotAModel')).toBeUndefined();
  });

  it('soft-delete set is a strict subset of registered models', () => {
    for (const model of ['School', 'SchoolSettings']) {
      expect(isSoftDeleteModel(model)).toBe(true);
      expect(getModelScope(model)).toBeDefined();
    }
  });

  it('append-only models are not soft-deletable', () => {
    expect(isSoftDeleteModel('AuditLog')).toBe(false);
  });
});

describe('prisma/errors', () => {
  it('TenantContextMissingError exposes the offending model', () => {
    const err = new TenantContextMissingError('SchoolSettings');
    expect(err.name).toBe('TenantContextMissingError');
    expect(err.model).toBe('SchoolSettings');
    expect(err.message).toContain('SchoolSettings');
    expect(err.message).toContain('RequestContextRegistry');
  });

  it('TenantScopeViolationError captures both school IDs', () => {
    const err = new TenantScopeViolationError('SchoolSettings', 'ctx-1', 'arg-2');
    expect(err.contextSchoolId).toBe('ctx-1');
    expect(err.suppliedSchoolId).toBe('arg-2');
  });

  it('VersionConflictError carries id + expected version', () => {
    const err = new VersionConflictError('Outbox', 'abc', 7);
    expect(err.id).toBe('abc');
    expect(err.expectedVersion).toBe(7);
    expect(err.message).toContain('Outbox#abc');
  });
});
