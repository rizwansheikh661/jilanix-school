/**
 * Feature-flag permissions (11 total). All PLATFORM_ONLY at this stage;
 * Sprint 7 may surface tenant-scoped read of the effective evaluation.
 */
export const FeatureFlagPermissions = {
  READ: 'feature_flag.read',
  CREATE: 'feature_flag.create',
  UPDATE: 'feature_flag.update',
  DELETE: 'feature_flag.delete',
  TENANT_OVERRIDE_READ: 'feature_flag.tenant_override.read',
  TENANT_OVERRIDE_UPSERT: 'feature_flag.tenant_override.upsert',
  TENANT_OVERRIDE_DELETE: 'feature_flag.tenant_override.delete',
  ROLLOUT_READ: 'feature_flag.rollout.read',
  ROLLOUT_CREATE: 'feature_flag.rollout.create',
  ROLLOUT_UPDATE: 'feature_flag.rollout.update',
  ROLLOUT_DELETE: 'feature_flag.rollout.delete',
  AUDIT_READ: 'feature_flag.audit.read',
} as const;

export type FeatureFlagPermission =
  (typeof FeatureFlagPermissions)[keyof typeof FeatureFlagPermissions];

export const FEATURE_FLAG_PERMISSION_DESCRIPTIONS: Readonly<
  Record<FeatureFlagPermission, string>
> = Object.freeze({
  [FeatureFlagPermissions.READ]: 'List and read feature flag definitions.',
  [FeatureFlagPermissions.CREATE]: 'Create a feature flag definition.',
  [FeatureFlagPermissions.UPDATE]: 'Update a feature flag definition.',
  [FeatureFlagPermissions.DELETE]: 'Delete (retire) a feature flag definition.',
  [FeatureFlagPermissions.TENANT_OVERRIDE_READ]: 'Read tenant feature-flag overrides.',
  [FeatureFlagPermissions.TENANT_OVERRIDE_UPSERT]: 'Set or update a tenant feature-flag override.',
  [FeatureFlagPermissions.TENANT_OVERRIDE_DELETE]: 'Remove a tenant feature-flag override.',
  [FeatureFlagPermissions.ROLLOUT_READ]: 'Read feature-flag rollouts.',
  [FeatureFlagPermissions.ROLLOUT_CREATE]: 'Create a feature-flag rollout.',
  [FeatureFlagPermissions.ROLLOUT_UPDATE]: 'Update a feature-flag rollout.',
  [FeatureFlagPermissions.ROLLOUT_DELETE]: 'Delete a feature-flag rollout.',
  [FeatureFlagPermissions.AUDIT_READ]: 'Read the feature-flag change audit log.',
});

export const FEATURE_FLAG_CHANGED_TOPIC = 'feature_flag.changed';
export const FEATURE_FLAG_AUDIT_SCOPES = Object.freeze({
  DEFINITION: 'definition',
  PLAN_MAP: 'plan_map',
  TENANT_OVERRIDE: 'tenant_override',
  ROLLOUT: 'rollout',
} as const);

export type FeatureFlagAuditScope =
  (typeof FEATURE_FLAG_AUDIT_SCOPES)[keyof typeof FEATURE_FLAG_AUDIT_SCOPES];
