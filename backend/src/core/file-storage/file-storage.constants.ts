/**
 * File-storage permission keys (8 total) — gating the `/uploads` surface and
 * the per-asset ACL grants.
 */
export const FileStoragePermissions = {
  CREATE: 'file.create',
  READ: 'file.read',
  DOWNLOAD: 'file.download',
  DELETE: 'file.delete',
  ACL_READ: 'file.acl.read',
  ACL_GRANT: 'file.acl.grant',
  ACL_REVOKE: 'file.acl.revoke',
  PURGE: 'file.purge',
} as const;

export type FileStoragePermission =
  (typeof FileStoragePermissions)[keyof typeof FileStoragePermissions];

export const FILE_STORAGE_PERMISSION_DESCRIPTIONS: Readonly<
  Record<FileStoragePermission, string>
> = Object.freeze({
  [FileStoragePermissions.CREATE]: 'Upload a new file asset.',
  [FileStoragePermissions.READ]: 'List and read file-asset metadata.',
  [FileStoragePermissions.DOWNLOAD]: 'Obtain a download URL for a file asset.',
  [FileStoragePermissions.DELETE]: 'Soft-delete a file asset.',
  [FileStoragePermissions.ACL_READ]: 'List ACL grants on a file asset.',
  [FileStoragePermissions.ACL_GRANT]: 'Add an ACL grant to a file asset.',
  [FileStoragePermissions.ACL_REVOKE]: 'Revoke an ACL grant on a file asset.',
  [FileStoragePermissions.PURGE]: 'Permanently purge a soft-deleted file asset.',
});

/**
 * Per-purpose upload-size caps. Bound below STORAGE_MAX_UPLOAD_BYTES — the
 * service rejects anything above min(perPurposeCap, configCap).
 */
export const FILE_SIZE_LIMITS = Object.freeze({
  STUDENT_PHOTO: 2 * 1024 * 1024,
  STAFF_PHOTO: 2 * 1024 * 1024,
  ADMISSION_DOCUMENT: 10 * 1024 * 1024,
  SCHOOL_DOCUMENT: 25 * 1024 * 1024,
  SCHOOL_LOGO: 1 * 1024 * 1024,
  MESSAGE_ATTACHMENT: 10 * 1024 * 1024,
  REPORT_EXPORT: 50 * 1024 * 1024,
  BULK_IMPORT: 50 * 1024 * 1024,
  EVENT_DOCUMENT: 20 * 1024 * 1024,
  HOMEWORK_ATTACHMENT: 20 * 1024 * 1024,
  ASSIGNMENT_ATTACHMENT: 20 * 1024 * 1024,
  ASSIGNMENT_SUBMISSION: 25 * 1024 * 1024,
  OTHER: 25 * 1024 * 1024,
}) satisfies Record<string, number>;

/** Symbol token for the StorageProvider DI binding. */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
