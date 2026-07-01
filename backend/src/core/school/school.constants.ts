/**
 * SchoolPermissions — 12 keys covering the school-level identity sibling
 * tables (Profile, Branding, Contacts, Documents). Mirrors the Sprint 4
 * staff convention: one resource prefix per sibling entity.
 */
export const SchoolPermissions = {
  // The /school root surfaces the canonical schools row (legal name, etc.).
  // Only the platform-admin path edits it; tenant admins read-only.
  READ: 'school.read',
  UPDATE: 'school.update',

  // Profile (academic identity: board / affiliation / principal / medium)
  PROFILE_READ: 'school.profile.read',
  PROFILE_UPDATE: 'school.profile.update',

  // Branding (logo / colours / fonts)
  BRANDING_READ: 'school.branding.read',
  BRANDING_UPDATE: 'school.branding.update',

  // Contacts (1:N — phones / emails / persons / social / emergency)
  CONTACT_READ: 'school.contact.read',
  CONTACT_CREATE: 'school.contact.create',
  CONTACT_UPDATE: 'school.contact.update',
  CONTACT_DELETE: 'school.contact.delete',

  // Documents (registration / affiliation certs etc — metadata only)
  DOCUMENT_READ: 'school.document.read',
  DOCUMENT_CREATE: 'school.document.create',
  DOCUMENT_DELETE: 'school.document.delete',

  // Sprint 14 — lifecycle read (super-admin list/get) + settings entries.
  LIFECYCLE_READ: 'school.lifecycle.read',
  SETTINGS_READ: 'school.settings.read',
  SETTINGS_UPDATE: 'school.settings.update',
} as const;

export type SchoolPermission = (typeof SchoolPermissions)[keyof typeof SchoolPermissions];

export const SCHOOL_PERMISSION_DESCRIPTIONS: Readonly<Record<SchoolPermission, string>> =
  Object.freeze({
    [SchoolPermissions.READ]: 'Read the school root record.',
    [SchoolPermissions.UPDATE]: 'Update the school root record.',
    [SchoolPermissions.PROFILE_READ]: 'Read academic-identity profile (board, affiliation, etc.).',
    [SchoolPermissions.PROFILE_UPDATE]: 'Update academic-identity profile.',
    [SchoolPermissions.BRANDING_READ]: 'Read brand identity (logo, colours, fonts).',
    [SchoolPermissions.BRANDING_UPDATE]: 'Update brand identity.',
    [SchoolPermissions.CONTACT_READ]: 'List school contact entries.',
    [SchoolPermissions.CONTACT_CREATE]: 'Add a school contact entry.',
    [SchoolPermissions.CONTACT_UPDATE]: 'Update a school contact entry.',
    [SchoolPermissions.CONTACT_DELETE]: 'Delete a school contact entry.',
    [SchoolPermissions.DOCUMENT_READ]: 'List school document metadata.',
    [SchoolPermissions.DOCUMENT_CREATE]: 'Attach a school document.',
    [SchoolPermissions.DOCUMENT_DELETE]: 'Detach a school document.',
    [SchoolPermissions.LIFECYCLE_READ]: 'Read the school lifecycle (trial, plan, suspension state).',
    [SchoolPermissions.SETTINGS_READ]: 'Read the school operational settings (working days, windows, comm prefs).',
    [SchoolPermissions.SETTINGS_UPDATE]: 'Update the school operational settings.',
  });
