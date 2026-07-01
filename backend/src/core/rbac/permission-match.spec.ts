import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isValidPermissionKey,
  permissionMatches,
} from './permission-match';

describe('permissionMatches', () => {
  it('matches exact equality', () => {
    expect(permissionMatches('students.read', 'students.read')).toBe(true);
    expect(permissionMatches('students.read', 'students.write')).toBe(false);
  });

  it('the global wildcard `*` matches everything', () => {
    expect(permissionMatches('*', 'students.read')).toBe(true);
    expect(permissionMatches('*', 'a.b.c.d')).toBe(true);
  });

  it('resource wildcard matches any action under that resource', () => {
    expect(permissionMatches('students.*', 'students.read')).toBe(true);
    expect(permissionMatches('students.*', 'students.write')).toBe(true);
    expect(permissionMatches('students.*', 'students.bulk_import')).toBe(true);
  });

  it('resource wildcard does NOT match foreign resources', () => {
    expect(permissionMatches('students.*', 'staff.read')).toBe(false);
  });

  it('resource wildcard does NOT match the bare resource (needs a trailing segment)', () => {
    expect(permissionMatches('students.*', 'students')).toBe(false);
  });

  it('resource wildcard does NOT match a similarly-prefixed resource', () => {
    // `studentsfoo.read` must not match `students.*`.
    expect(permissionMatches('students.*', 'studentsfoo.read')).toBe(false);
  });

  it('action wildcard matches any resource with that action', () => {
    expect(permissionMatches('*.read', 'students.read')).toBe(true);
    expect(permissionMatches('*.read', 'staff.read')).toBe(true);
    expect(permissionMatches('*.read', 'students.write')).toBe(false);
  });

  it('action wildcard does NOT match the bare action', () => {
    expect(permissionMatches('*.read', 'read')).toBe(false);
  });
});

describe('hasPermission / hasAllPermissions / hasAnyPermission', () => {
  it('hasPermission with empty grants is always false', () => {
    expect(hasPermission([], 'students.read')).toBe(false);
  });

  it('hasAllPermissions with empty required is true (no requirements)', () => {
    expect(hasAllPermissions(['students.read'], [])).toBe(true);
  });

  it('hasAnyPermission with empty required is true (no requirements)', () => {
    expect(hasAnyPermission(['students.read'], [])).toBe(true);
  });

  it('AND-mode: every required must be matched', () => {
    expect(
      hasAllPermissions(['students.read', 'students.write'], ['students.read', 'students.write']),
    ).toBe(true);
    expect(
      hasAllPermissions(['students.read'], ['students.read', 'students.write']),
    ).toBe(false);
  });

  it('OR-mode: at least one required must be matched', () => {
    expect(hasAnyPermission(['students.read'], ['students.read', 'students.write'])).toBe(true);
    expect(hasAnyPermission(['attendance.mark'], ['students.read', 'students.write'])).toBe(false);
  });

  it('a global `*` grant satisfies any required permission', () => {
    expect(hasAllPermissions(['*'], ['students.read', 'attendance.mark', 'whatever.action'])).toBe(true);
  });
});

describe('isValidPermissionKey', () => {
  it('accepts the global wildcard', () => {
    expect(isValidPermissionKey('*')).toBe(true);
  });

  it('accepts standard resource.action shapes', () => {
    expect(isValidPermissionKey('students.read')).toBe(true);
    expect(isValidPermissionKey('attendance.bulk_mark')).toBe(true);
    expect(isValidPermissionKey('billing.invoices.read')).toBe(true);
  });

  it('accepts the two wildcard shapes', () => {
    expect(isValidPermissionKey('students.*')).toBe(true);
    expect(isValidPermissionKey('*.read')).toBe(true);
  });

  it('rejects single-segment keys', () => {
    expect(isValidPermissionKey('students')).toBe(false);
    expect(isValidPermissionKey('read')).toBe(false);
  });

  it('rejects internal wildcards', () => {
    expect(isValidPermissionKey('students.*.read')).toBe(false);
    expect(isValidPermissionKey('a.b*c')).toBe(false);
  });

  it('rejects uppercase / dashes', () => {
    expect(isValidPermissionKey('Students.read')).toBe(false);
    expect(isValidPermissionKey('students-and-staff.read')).toBe(false);
  });

  it('rejects empty / whitespace', () => {
    expect(isValidPermissionKey('')).toBe(false);
    expect(isValidPermissionKey('.read')).toBe(false);
    expect(isValidPermissionKey('students.')).toBe(false);
  });
});
