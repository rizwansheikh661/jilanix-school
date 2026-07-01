/**
 * Cross-tenant FK guard shared by reporting services.
 *
 * Re-exports the Sprint 12 academic-content helper to avoid duplicating the
 * same logic — reporting imports the same DTO id-set surface (academicYear /
 * class / section / subject / student / staff / fileAsset). If a future
 * change makes the academic-content helper diverge from reporting's needs,
 * split the helper then.
 */
export {
  assertTenantRefs,
  type AcademicContentTenantRefs as ReportingTenantRefs,
} from '../academic-content/tenant-refs';
