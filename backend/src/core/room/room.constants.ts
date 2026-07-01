export const RoomPermissions = {
  READ: 'room.read',
  CREATE: 'room.create',
  UPDATE: 'room.update',
  DELETE: 'room.delete',
  TYPE_READ: 'room.type.read',
  TYPE_CREATE: 'room.type.create',
  TYPE_UPDATE: 'room.type.update',
  TYPE_DELETE: 'room.type.delete',
} as const;

export type RoomPermission = (typeof RoomPermissions)[keyof typeof RoomPermissions];

export const ROOM_PERMISSION_DESCRIPTIONS: Readonly<Record<RoomPermission, string>> = Object.freeze({
  [RoomPermissions.READ]: 'List or read rooms.',
  [RoomPermissions.CREATE]: 'Create a room.',
  [RoomPermissions.UPDATE]: 'Update a room.',
  [RoomPermissions.DELETE]: 'Delete a room.',
  [RoomPermissions.TYPE_READ]: 'List or read room types.',
  [RoomPermissions.TYPE_CREATE]: 'Create a room type.',
  [RoomPermissions.TYPE_UPDATE]: 'Update a room type.',
  [RoomPermissions.TYPE_DELETE]: 'Delete a room type.',
});

export const ROOM_STATUS_VALUES = ['ACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'] as const;
export type RoomStatusValue = (typeof ROOM_STATUS_VALUES)[number];
