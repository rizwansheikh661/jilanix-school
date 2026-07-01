export const OrganizationPermissions = {
  DEPARTMENT_READ: 'department.read',
  DEPARTMENT_CREATE: 'department.create',
  DEPARTMENT_UPDATE: 'department.update',
  DEPARTMENT_DELETE: 'department.delete',
  DESIGNATION_READ: 'designation.read',
  DESIGNATION_CREATE: 'designation.create',
  DESIGNATION_UPDATE: 'designation.update',
  DESIGNATION_DELETE: 'designation.delete',
} as const;

export type OrganizationPermission = (typeof OrganizationPermissions)[keyof typeof OrganizationPermissions];

export const ORGANIZATION_PERMISSION_DESCRIPTIONS: Readonly<Record<OrganizationPermission, string>> =
  Object.freeze({
    [OrganizationPermissions.DEPARTMENT_READ]: 'List or read departments.',
    [OrganizationPermissions.DEPARTMENT_CREATE]: 'Create a department.',
    [OrganizationPermissions.DEPARTMENT_UPDATE]: 'Update a department.',
    [OrganizationPermissions.DEPARTMENT_DELETE]: 'Delete a department.',
    [OrganizationPermissions.DESIGNATION_READ]: 'List or read designations.',
    [OrganizationPermissions.DESIGNATION_CREATE]: 'Create a designation.',
    [OrganizationPermissions.DESIGNATION_UPDATE]: 'Update a designation.',
    [OrganizationPermissions.DESIGNATION_DELETE]: 'Delete a designation.',
  });
