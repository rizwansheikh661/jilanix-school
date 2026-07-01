/**
 * AdmissionDocumentService — manages metadata-only document records
 * attached to an admission. The `storageUrl` is treated as an opaque
 * string for Sprint 3; a future sprint adds the presigned-URL upload
 * pipeline.
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import { NotFoundError } from '../../errors/domain-error';
import { AdmissionDocumentNotFoundError } from '../admission.errors';
import type { AdmissionDocumentRow } from '../admission.types';
import { AdmissionRepository } from '../repositories/admission.repository';
import {
  AdmissionDocumentRepository,
  type CreateAdmissionDocumentInput,
} from '../repositories/admission-document.repository';

export interface CreateAdmissionDocumentArgs {
  readonly label: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
}

@Injectable()
export class AdmissionDocumentService {
  private readonly logger = new Logger(AdmissionDocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admissionRepo: AdmissionRepository,
    private readonly docRepo: AdmissionDocumentRepository,
  ) {}

  public async list(admissionId: string): Promise<readonly AdmissionDocumentRow[]> {
    const admission = await this.admissionRepo.findById(admissionId);
    if (admission === null) {
      throw new NotFoundError('Admission', admissionId);
    }
    return this.docRepo.findByAdmission(admissionId);
  }

  public async create(
    admissionId: string,
    args: CreateAdmissionDocumentArgs,
  ): Promise<AdmissionDocumentRow> {
    return this.prisma.transaction(async (tx) => {
      const admission = await this.admissionRepo.findById(admissionId, tx);
      if (admission === null) {
        throw new NotFoundError('Admission', admissionId);
      }
      const input: CreateAdmissionDocumentInput = {
        admissionId,
        label: args.label,
        fileName: args.fileName,
        mimeType: args.mimeType,
        sizeBytes: args.sizeBytes,
        storageUrl: args.storageUrl,
      };
      const row = await this.docRepo.create(input, tx);
      this.logger.log(`Attached document ${row.id} to Admission ${admissionId}.`);
      return row;
    });
  }

  public async delete(admissionId: string, documentId: string): Promise<void> {
    await this.prisma.transaction(async (tx) => {
      const doc = await this.docRepo.findById(documentId, tx);
      if (doc === null || doc.admissionId !== admissionId) {
        throw new AdmissionDocumentNotFoundError(documentId);
      }
      await this.docRepo.delete(documentId, tx);
      this.logger.log(`Detached document ${documentId} from Admission ${admissionId}.`);
    });
  }
}
