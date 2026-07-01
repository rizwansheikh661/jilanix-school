/**
 * Repositories for school-domain sibling tables (Profile, Branding,
 * Contact, Document). Mirrors the Sprint 4 staff repository pattern.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import { VersionConflictError } from '../../../infra/prisma/errors';
import type { PrismaTx } from '../../../infra/prisma/types';
import { RequestContextRegistry } from '../../request-context';
import type {
  ContactTypeValue,
  SchoolBoardValue,
  SchoolBrandingRow,
  SchoolCategoryValue,
  SchoolContactRow,
  SchoolDocumentRow,
  SchoolDocumentTypeValue,
  SchoolGenderTypeValue,
  SchoolProfileRow,
  SchoolTypeValue,
} from '../school.types';

type Reader = PrismaTx;

function tenantContext(): { schoolId: string } {
  const ctx = RequestContextRegistry.require();
  if (ctx.schoolId === undefined) {
    throw new Error('SchoolRepository requires a tenant-scoped RequestContext.');
  }
  return { schoolId: ctx.schoolId };
}

// ---------------------------------------------------------------------------
// SchoolProfile (1:1)
// ---------------------------------------------------------------------------

export interface UpsertSchoolProfileInput {
  readonly board?: SchoolBoardValue | null;
  readonly affiliationNumber?: string | null;
  readonly affiliationValidTill?: Date | null;
  readonly schoolType?: SchoolTypeValue;
  readonly schoolCategory?: SchoolCategoryValue;
  readonly genderType?: SchoolGenderTypeValue;
  readonly mediumOfInstruction?: string;
  readonly establishedYear?: number | null;
  readonly registrationNumber?: string | null;
  readonly trustName?: string | null;
  readonly principalName?: string | null;
  readonly principalPhone?: string | null;
  readonly principalEmail?: string | null;
  readonly totalAreaSqft?: number | null;
  readonly builtUpAreaSqft?: number | null;
  readonly studentCapacity?: number | null;
  readonly motto?: string | null;
  readonly mission?: string | null;
  readonly vision?: string | null;
}

@Injectable()
export class SchoolProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async find(tx?: PrismaTx): Promise<SchoolProfileRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = tenantContext();
    const row = await reader.schoolProfile.findFirst({ where: { schoolId, deletedAt: null } });
    return row === null ? null : mapProfile(row);
  }

  public async upsert(
    expectedVersion: number | null,
    input: UpsertSchoolProfileInput,
    tx?: PrismaTx,
  ): Promise<SchoolProfileRow> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    const existing = await writer.schoolProfile.findFirst({ where: { schoolId, deletedAt: null } });
    if (existing === null) {
      const created = await writer.schoolProfile.create({
        data: {
          id: randomUUID(),
          schoolId,
          ...(input.board !== undefined ? { board: input.board } : {}),
          affiliationNumber: input.affiliationNumber ?? null,
          affiliationValidTill: input.affiliationValidTill ?? null,
          ...(input.schoolType !== undefined ? { schoolType: input.schoolType } : {}),
          ...(input.schoolCategory !== undefined ? { schoolCategory: input.schoolCategory } : {}),
          ...(input.genderType !== undefined ? { genderType: input.genderType } : {}),
          ...(input.mediumOfInstruction !== undefined
            ? { mediumOfInstruction: input.mediumOfInstruction }
            : {}),
          establishedYear: input.establishedYear ?? null,
          registrationNumber: input.registrationNumber ?? null,
          trustName: input.trustName ?? null,
          principalName: input.principalName ?? null,
          principalPhone: input.principalPhone ?? null,
          principalEmail: input.principalEmail ?? null,
          totalAreaSqft: input.totalAreaSqft ?? null,
          builtUpAreaSqft: input.builtUpAreaSqft ?? null,
          studentCapacity: input.studentCapacity ?? null,
          motto: input.motto ?? null,
          mission: input.mission ?? null,
          vision: input.vision ?? null,
          createdBy: ctx.userId ?? null,
          updatedBy: ctx.userId ?? null,
        },
      });
      return mapProfile(created);
    }
    if (expectedVersion === null || existing.version !== expectedVersion) {
      throw new VersionConflictError('SchoolProfile', existing.id, expectedVersion ?? 0);
    }
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: ctx.userId ?? null };
    const fields: ReadonlyArray<keyof UpsertSchoolProfileInput> = [
      'board', 'affiliationNumber', 'affiliationValidTill',
      'schoolType', 'schoolCategory', 'genderType', 'mediumOfInstruction',
      'establishedYear', 'registrationNumber', 'trustName',
      'principalName', 'principalPhone', 'principalEmail',
      'totalAreaSqft', 'builtUpAreaSqft', 'studentCapacity',
      'motto', 'mission', 'vision',
    ];
    for (const k of fields) {
      if (input[k] !== undefined) data[k] = input[k];
    }
    const result = await writer.schoolProfile.updateMany({
      where: { schoolId, id: existing.id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('SchoolProfile', existing.id, expectedVersion);
    }
    const updated = await writer.schoolProfile.findUnique({
      where: { schoolId_id: { schoolId, id: existing.id } },
    });
    if (updated === null) {
      throw new VersionConflictError('SchoolProfile', existing.id, expectedVersion);
    }
    return mapProfile(updated);
  }
}

interface RawProfile {
  id: string;
  schoolId: string;
  board: string | null;
  affiliationNumber: string | null;
  affiliationValidTill: Date | null;
  schoolType: string;
  schoolCategory: string;
  genderType: string;
  mediumOfInstruction: string;
  establishedYear: number | null;
  registrationNumber: string | null;
  trustName: string | null;
  principalName: string | null;
  principalPhone: string | null;
  principalEmail: string | null;
  totalAreaSqft: number | null;
  builtUpAreaSqft: number | null;
  studentCapacity: number | null;
  motto: string | null;
  mission: string | null;
  vision: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapProfile(row: RawProfile): SchoolProfileRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    board: row.board === null ? null : (row.board as SchoolBoardValue),
    affiliationNumber: row.affiliationNumber,
    affiliationValidTill: row.affiliationValidTill,
    schoolType: row.schoolType as SchoolTypeValue,
    schoolCategory: row.schoolCategory as SchoolCategoryValue,
    genderType: row.genderType as SchoolGenderTypeValue,
    mediumOfInstruction: row.mediumOfInstruction,
    establishedYear: row.establishedYear,
    registrationNumber: row.registrationNumber,
    trustName: row.trustName,
    principalName: row.principalName,
    principalPhone: row.principalPhone,
    principalEmail: row.principalEmail,
    totalAreaSqft: row.totalAreaSqft,
    builtUpAreaSqft: row.builtUpAreaSqft,
    studentCapacity: row.studentCapacity,
    motto: row.motto,
    mission: row.mission,
    vision: row.vision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

// ---------------------------------------------------------------------------
// SchoolBranding (1:1, no soft-delete)
// ---------------------------------------------------------------------------

export interface UpsertSchoolBrandingInput {
  readonly shortName?: string | null;
  readonly tagline?: string | null;
  readonly logoUrl?: string | null;
  readonly darkLogoUrl?: string | null;
  readonly faviconUrl?: string | null;
  readonly letterheadUrl?: string | null;
  readonly loginBackgroundUrl?: string | null;
  readonly emailBannerUrl?: string | null;
  readonly pdfHeaderUrl?: string | null;
  readonly pdfFooterUrl?: string | null;
  readonly brandPrimaryHex?: string | null;
  readonly brandSecondaryHex?: string | null;
  readonly brandAccentHex?: string | null;
  readonly fontFamily?: string | null;
  readonly supportEmail?: string | null;
  readonly supportPhone?: string | null;
  readonly websiteUrl?: string | null;
  readonly footerText?: string | null;
  readonly copyrightText?: string | null;
  readonly socialLinksJson?: Record<string, unknown> | null;
}

@Injectable()
export class SchoolBrandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async find(tx?: PrismaTx): Promise<SchoolBrandingRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = tenantContext();
    const row = await reader.schoolBranding.findFirst({ where: { schoolId } });
    return row === null ? null : mapBranding(row);
  }

  public async upsert(
    expectedVersion: number | null,
    input: UpsertSchoolBrandingInput,
    tx?: PrismaTx,
  ): Promise<SchoolBrandingRow> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    const existing = await writer.schoolBranding.findFirst({ where: { schoolId } });
    if (existing === null) {
      const created = await writer.schoolBranding.create({
        data: {
          id: randomUUID(),
          schoolId,
          shortName: input.shortName ?? null,
          tagline: input.tagline ?? null,
          logoUrl: input.logoUrl ?? null,
          darkLogoUrl: input.darkLogoUrl ?? null,
          faviconUrl: input.faviconUrl ?? null,
          letterheadUrl: input.letterheadUrl ?? null,
          loginBackgroundUrl: input.loginBackgroundUrl ?? null,
          emailBannerUrl: input.emailBannerUrl ?? null,
          pdfHeaderUrl: input.pdfHeaderUrl ?? null,
          pdfFooterUrl: input.pdfFooterUrl ?? null,
          brandPrimaryHex: input.brandPrimaryHex ?? null,
          brandSecondaryHex: input.brandSecondaryHex ?? null,
          brandAccentHex: input.brandAccentHex ?? null,
          fontFamily: input.fontFamily ?? null,
          supportEmail: input.supportEmail ?? null,
          supportPhone: input.supportPhone ?? null,
          websiteUrl: input.websiteUrl ?? null,
          footerText: input.footerText ?? null,
          copyrightText: input.copyrightText ?? null,
          socialLinksJson:
            input.socialLinksJson === undefined || input.socialLinksJson === null
              ? Prisma.JsonNull
              : (input.socialLinksJson as Prisma.InputJsonValue),
          createdBy: ctx.userId ?? null,
          updatedBy: ctx.userId ?? null,
        },
      });
      return mapBranding(created);
    }
    if (expectedVersion === null || existing.version !== expectedVersion) {
      throw new VersionConflictError('SchoolBranding', existing.id, expectedVersion ?? 0);
    }
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: ctx.userId ?? null };
    const fields: ReadonlyArray<keyof UpsertSchoolBrandingInput> = [
      'shortName', 'tagline',
      'logoUrl', 'darkLogoUrl', 'faviconUrl', 'letterheadUrl',
      'loginBackgroundUrl', 'emailBannerUrl', 'pdfHeaderUrl', 'pdfFooterUrl',
      'brandPrimaryHex', 'brandSecondaryHex', 'brandAccentHex',
      'fontFamily',
      'supportEmail', 'supportPhone', 'websiteUrl',
      'footerText', 'copyrightText',
    ];
    for (const k of fields) {
      if (input[k] !== undefined) data[k] = input[k];
    }
    if (input.socialLinksJson !== undefined) {
      data.socialLinksJson =
        input.socialLinksJson === null
          ? Prisma.JsonNull
          : (input.socialLinksJson as Prisma.InputJsonValue);
    }
    const result = await writer.schoolBranding.updateMany({
      where: { schoolId, id: existing.id, version: expectedVersion },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('SchoolBranding', existing.id, expectedVersion);
    }
    const updated = await writer.schoolBranding.findUnique({
      where: { schoolId_id: { schoolId, id: existing.id } },
    });
    if (updated === null) {
      throw new VersionConflictError('SchoolBranding', existing.id, expectedVersion);
    }
    return mapBranding(updated);
  }
}

interface RawBranding {
  id: string;
  schoolId: string;
  shortName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  letterheadUrl: string | null;
  loginBackgroundUrl: string | null;
  emailBannerUrl: string | null;
  pdfHeaderUrl: string | null;
  pdfFooterUrl: string | null;
  brandPrimaryHex: string | null;
  brandSecondaryHex: string | null;
  brandAccentHex: string | null;
  fontFamily: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  footerText: string | null;
  copyrightText: string | null;
  socialLinksJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
}

function mapBranding(row: RawBranding): SchoolBrandingRow {
  return {
    ...row,
    socialLinksJson:
      row.socialLinksJson === null || typeof row.socialLinksJson !== 'object' || Array.isArray(row.socialLinksJson)
        ? null
        : (row.socialLinksJson as Readonly<Record<string, unknown>>),
  };
}

// ---------------------------------------------------------------------------
// SchoolContactInformation (1:N)
// ---------------------------------------------------------------------------

export interface CreateSchoolContactInput {
  readonly contactType: ContactTypeValue;
  readonly label: string;
  readonly value: string;
  readonly isPrimary?: boolean;
  readonly sortOrder?: number;
}

export interface UpdateSchoolContactInput {
  readonly contactType?: ContactTypeValue;
  readonly label?: string;
  readonly value?: string;
  readonly isPrimary?: boolean;
  readonly sortOrder?: number;
}

@Injectable()
export class SchoolContactRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findById(id: string, tx?: PrismaTx): Promise<SchoolContactRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = tenantContext();
    const row = await reader.schoolContactInformation.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null || row.deletedAt !== null ? null : mapContact(row);
  }

  public async listAll(tx?: PrismaTx): Promise<readonly SchoolContactRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = tenantContext();
    const rows = await reader.schoolContactInformation.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: [{ contactType: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(mapContact);
  }

  public async demotePrimaryFor(contactType: ContactTypeValue, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    await writer.schoolContactInformation.updateMany({
      where: { schoolId, contactType, isPrimary: true, deletedAt: null },
      data: { isPrimary: false, version: { increment: 1 } },
    });
  }

  public async create(input: CreateSchoolContactInput, tx?: PrismaTx): Promise<SchoolContactRow> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.schoolContactInformation.create({
      data: {
        schoolId,
        contactType: input.contactType,
        label: input.label,
        value: input.value,
        isPrimary: input.isPrimary ?? false,
        sortOrder: input.sortOrder ?? 0,
        createdBy: ctx.userId ?? null,
        updatedBy: ctx.userId ?? null,
      },
    });
    return mapContact(row);
  }

  public async update(
    id: string,
    expectedVersion: number,
    input: UpdateSchoolContactInput,
    tx?: PrismaTx,
  ): Promise<SchoolContactRow> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    const data: Record<string, unknown> = { version: { increment: 1 }, updatedBy: ctx.userId ?? null };
    const fields: ReadonlyArray<keyof UpdateSchoolContactInput> = [
      'contactType', 'label', 'value', 'isPrimary', 'sortOrder',
    ];
    for (const k of fields) {
      if (input[k] !== undefined) data[k] = input[k];
    }
    const result = await writer.schoolContactInformation.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data,
    });
    if (result.count === 0) {
      throw new VersionConflictError('SchoolContactInformation', id, expectedVersion);
    }
    const updated = await writer.schoolContactInformation.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    if (updated === null) {
      throw new VersionConflictError('SchoolContactInformation', id, expectedVersion);
    }
    return mapContact(updated);
  }

  public async softDelete(id: string, expectedVersion: number, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    const result = await writer.schoolContactInformation.updateMany({
      where: { schoolId, id, version: expectedVersion, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw new VersionConflictError('SchoolContactInformation', id, expectedVersion);
    }
  }
}

interface RawContact {
  id: string;
  schoolId: string;
  contactType: string;
  label: string;
  value: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  version: number;
  deletedAt: Date | null;
}

function mapContact(row: RawContact): SchoolContactRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    contactType: row.contactType as ContactTypeValue,
    label: row.label,
    value: row.value,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  };
}

// ---------------------------------------------------------------------------
// SchoolDocument (1:N)
// ---------------------------------------------------------------------------

export interface CreateSchoolDocumentInput {
  readonly documentType: SchoolDocumentTypeValue;
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
  readonly issueDate?: Date | null;
  readonly expiryDate?: Date | null;
  readonly issuingAuthority?: string | null;
  readonly docNumber?: string | null;
  readonly notes?: string | null;
}

@Injectable()
export class SchoolDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private reader(tx?: PrismaTx): Reader {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findById(id: string, tx?: PrismaTx): Promise<SchoolDocumentRow | null> {
    const reader = this.reader(tx);
    const { schoolId } = tenantContext();
    const row = await reader.schoolDocument.findUnique({
      where: { schoolId_id: { schoolId, id } },
    });
    return row === null || row.deletedAt !== null ? null : mapDocument(row);
  }

  public async listAll(
    filter: { documentType?: SchoolDocumentTypeValue } = {},
    tx?: PrismaTx,
  ): Promise<readonly SchoolDocumentRow[]> {
    const reader = this.reader(tx);
    const { schoolId } = tenantContext();
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (filter.documentType !== undefined) where.documentType = filter.documentType;
    const rows = await reader.schoolDocument.findMany({
      where,
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapDocument);
  }

  public async create(input: CreateSchoolDocumentInput, tx?: PrismaTx): Promise<SchoolDocumentRow> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    const row = await writer.schoolDocument.create({
      data: {
        schoolId,
        documentType: input.documentType,
        label: input.label,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageUrl: input.storageUrl,
        issueDate: input.issueDate ?? null,
        expiryDate: input.expiryDate ?? null,
        issuingAuthority: input.issuingAuthority ?? null,
        docNumber: input.docNumber ?? null,
        notes: input.notes ?? null,
        uploadedBy: ctx.userId ?? null,
        createdBy: ctx.userId ?? null,
        updatedBy: ctx.userId ?? null,
      },
    });
    return mapDocument(row);
  }

  public async softDelete(id: string, tx?: PrismaTx): Promise<void> {
    const writer = this.reader(tx);
    const { schoolId } = tenantContext();
    const ctx = RequestContextRegistry.require();
    await writer.schoolDocument.updateMany({
      where: { schoolId, id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId ?? null,
      },
    });
  }
}

interface RawDocument {
  id: string;
  schoolId: string;
  documentType: string;
  label: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  issuingAuthority: string | null;
  docNumber: string | null;
  notes: string | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  deletedAt: Date | null;
}

function mapDocument(row: RawDocument): SchoolDocumentRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    documentType: row.documentType as SchoolDocumentTypeValue,
    label: row.label,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageUrl: row.storageUrl,
    issueDate: row.issueDate,
    expiryDate: row.expiryDate,
    issuingAuthority: row.issuingAuthority,
    docNumber: row.docNumber,
    notes: row.notes,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
  };
}
