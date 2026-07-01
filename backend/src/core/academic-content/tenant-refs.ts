/**
 * Cross-tenant FK guard shared by all academic-content services.
 *
 * Extends Sprint 11's `EventService.assertTenantRefs` branches with the
 * academic + student references the academic-content domain needs. Each
 * branch checks existence (and non-soft-deletion) inside the active tenant
 * scope; missing rows throw `TenantRefMissingError`.
 *
 * Caller passes only ids that need checking (omit empty arrays / undefined).
 * Single-column FK for FileAsset by precedent — FileAsset is
 * TENANT_SHARED_PLATFORM with nullable school_id, so a composite FK would
 * refuse platform-owned rows. We only verify ID existence here; cross-tenancy
 * is enforced by the purpose discriminator on FileAsset and the upload path
 * that always tags the school context.
 */
import type { PrismaTx } from '../../infra/prisma/types';

import { TenantRefMissingError } from './academic-content.errors';

export interface AcademicContentTenantRefs {
  readonly academicYearIds?: readonly string[];
  readonly classIds?: readonly string[];
  readonly sectionIds?: readonly string[];
  readonly subjectIds?: readonly string[];
  readonly studentIds?: readonly string[];
  readonly staffIds?: readonly string[];
  readonly fileAssetIds?: readonly string[];
}

export async function assertTenantRefs(
  tx: PrismaTx,
  schoolId: string,
  refs: AcademicContentTenantRefs,
): Promise<void> {
  if (refs.academicYearIds && refs.academicYearIds.length > 0) {
    const ids = [...new Set(refs.academicYearIds)];
    const found = await tx.academicYear.findMany({
      where: { schoolId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('AcademicYear', ids, found);
  }

  if (refs.classIds && refs.classIds.length > 0) {
    const ids = [...new Set(refs.classIds)];
    const found = await tx.class.findMany({
      where: { schoolId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('Class', ids, found);
  }

  if (refs.sectionIds && refs.sectionIds.length > 0) {
    const ids = [...new Set(refs.sectionIds)];
    const found = await tx.section.findMany({
      where: { schoolId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('Section', ids, found);
  }

  if (refs.subjectIds && refs.subjectIds.length > 0) {
    const ids = [...new Set(refs.subjectIds)];
    const found = await tx.subject.findMany({
      where: { schoolId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('Subject', ids, found);
  }

  if (refs.studentIds && refs.studentIds.length > 0) {
    const ids = [...new Set(refs.studentIds)];
    const found = await tx.student.findMany({
      where: { schoolId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('Student', ids, found);
  }

  if (refs.staffIds && refs.staffIds.length > 0) {
    const ids = [...new Set(refs.staffIds)];
    const found = await tx.staff.findMany({
      where: { schoolId, id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('Staff', ids, found);
  }

  if (refs.fileAssetIds && refs.fileAssetIds.length > 0) {
    // FileAsset has single-column PK + TENANT_SHARED_PLATFORM scope.
    // Existence check only; cross-tenancy is enforced by the upload path.
    const ids = [...new Set(refs.fileAssetIds)];
    const found = await tx.fileAsset.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    assertAllFound('FileAsset', ids, found);
  }
}

function assertAllFound(
  refType: string,
  requested: readonly string[],
  found: readonly { readonly id: string }[],
): void {
  const ok = new Set(found.map((r) => r.id));
  for (const id of requested) {
    if (!ok.has(id)) {
      throw new TenantRefMissingError(refType, id);
    }
  }
}
