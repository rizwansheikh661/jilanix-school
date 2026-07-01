export const BranchPermissions = {
  READ: 'branch.read',
  CREATE: 'branch.create',
  UPDATE: 'branch.update',
  DELETE: 'branch.delete',
  ACTIVATE: 'branch.activate',
  DEACTIVATE: 'branch.deactivate',
  SET_PRIMARY: 'branch.set_primary',
  SETTINGS_READ: 'branch.settings.read',
  SETTINGS_UPDATE: 'branch.settings.update',
} as const;

export type BranchPermission = (typeof BranchPermissions)[keyof typeof BranchPermissions];

export const BRANCH_PERMISSION_DESCRIPTIONS: Readonly<Record<BranchPermission, string>> =
  Object.freeze({
    [BranchPermissions.READ]: 'List or read a branch.',
    [BranchPermissions.CREATE]: 'Create a branch.',
    [BranchPermissions.UPDATE]: 'Update a branch.',
    [BranchPermissions.DELETE]: 'Delete (soft) a branch.',
    [BranchPermissions.ACTIVATE]: 'Mark a branch ACTIVE.',
    [BranchPermissions.DEACTIVATE]: 'Mark a branch INACTIVE.',
    [BranchPermissions.SET_PRIMARY]: 'Promote a branch to primary.',
    [BranchPermissions.SETTINGS_READ]: 'Read branch settings.',
    [BranchPermissions.SETTINGS_UPDATE]: 'Update branch settings.',
  });
