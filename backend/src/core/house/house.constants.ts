export const HousePermissions = {
  READ: 'house.read',
  CREATE: 'house.create',
  UPDATE: 'house.update',
  DELETE: 'house.delete',
  ASSIGNMENT_READ: 'house.assignment.read',
  ASSIGNMENT_CREATE: 'house.assignment.create',
  ASSIGNMENT_DELETE: 'house.assignment.delete',
} as const;

export type HousePermission = (typeof HousePermissions)[keyof typeof HousePermissions];

export const HOUSE_PERMISSION_DESCRIPTIONS: Readonly<Record<HousePermission, string>> = Object.freeze({
  [HousePermissions.READ]: 'List or read houses.',
  [HousePermissions.CREATE]: 'Create a house.',
  [HousePermissions.UPDATE]: 'Update a house.',
  [HousePermissions.DELETE]: 'Delete a house.',
  [HousePermissions.ASSIGNMENT_READ]: 'Read house assignments.',
  [HousePermissions.ASSIGNMENT_CREATE]: 'Assign a student to a house.',
  [HousePermissions.ASSIGNMENT_DELETE]: 'End a student-to-house assignment.',
});
