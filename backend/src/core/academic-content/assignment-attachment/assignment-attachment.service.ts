/**
 * AssignmentAttachmentService — orchestrates uploads + soft-delete of files
 * attached to an Assignment row. No counter on Assignment for attachments
 * (only submission/evaluated/late counters are tracked).
 */
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import { AuditService } from '../../audit/audit.service';
import type { AuditTxLike } from '../../audit/audit.types';
import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { FileAssetService } from '../../file-storage/file-asset/file-asset.service';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { RequestContextRegistry } from '../../request-context';
import {
  AcademicContentFeatureFlags,
  AcademicContentOutboxTopics,
  FILE_PURPOSE_ASSIGNMENT_ATTACHMENT,
  type AttachmentTypeValue,
} from '../academic-content.constants';
import {
  AcademicContentModuleDisabledError,
  AssignmentAttachmentNotFoundError,
  AssignmentNotFoundError,
} from '../academic-content.errors';
import type { AssignmentAttachmentRow } from '../academic-content.types';
import { AssignmentRepository } from '../assignment/assignment.repository';
import {
  AssignmentAttachmentRepository,
  type ListAssignmentAttachmentArgs,
} from './assignment-attachment.repository';

export interface UploadAssignmentAttachmentArgs {
  readonly assignmentId: string;
  readonly attachmentType: AttachmentTypeValue;
  readonly title: string;
  readonly uploadedByStaffId?: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly body: Buffer;
}

@Injectable()
export class AssignmentAttachmentService {
  private readonly logger = new Logger(AssignmentAttachmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AssignmentAttachmentRepository,
    private readonly assignmentRepo: AssignmentRepository,
    private readonly fileAssetService: FileAssetService,
    private readonly featureFlags: FeatureFlagService,
    private readonly outbox: OutboxPublisherService,
    private readonly audit: AuditService,
  ) {}

  public async list(args: ListAssignmentAttachmentArgs): Promise<{
    readonly items: readonly AssignmentAttachmentRow[];
    readonly nextCursorId: string | null;
  }> {
    await this.assertModuleEnabled();
    const assignment = await this.assignmentRepo.findById(args.assignmentId);
    if (assignment === null) throw new AssignmentNotFoundError(args.assignmentId);
    const { rows, nextCursorId } = await this.repo.list(args);
    return { items: rows, nextCursorId };
  }

  public async upload(
    args: UploadAssignmentAttachmentArgs,
  ): Promise<AssignmentAttachmentRow> {
    await this.assertModuleEnabled();
    const assignment = await this.assignmentRepo.findById(args.assignmentId);
    if (assignment === null) throw new AssignmentNotFoundError(args.assignmentId);

    const asset = await this.fileAssetService.upload({
      purpose: FILE_PURPOSE_ASSIGNMENT_ATTACHMENT,
      fileName: args.fileName,
      mimeType: args.mimeType,
      body: args.body,
      isPublic: false,
    });

    try {
      return await this.prisma.transaction(async (rawTx) => {
        const tx = rawTx as unknown as PrismaTx;
        const created = await this.repo.create(
          {
            assignmentId: args.assignmentId,
            fileAssetId: asset.id,
            attachmentType: args.attachmentType,
            title: args.title,
            uploadedByStaffId: args.uploadedByStaffId ?? null,
          },
          tx,
        );
        await this.outbox.publish(tx, {
          topic: AcademicContentOutboxTopics.ASSIGNMENT_ATTACHMENT_UPLOADED,
          eventType: 'AssignmentAttachmentUploaded',
          aggregateType: 'AssignmentAttachment',
          aggregateId: created.id,
          payload: {
            id: created.id,
            assignmentId: args.assignmentId,
            fileAssetId: asset.id,
            attachmentType: args.attachmentType,
          },
        });
        await this.audit.record(
          {
            action: 'assignment-attachment.create',
            category: 'general',
            resourceType: 'AssignmentAttachment',
            resourceId: created.id,
            after: created,
          },
          { tx: tx as unknown as AuditTxLike },
        );
        return created;
      });
    } catch (err) {
      await this.tryCleanupAsset(asset.id);
      throw err;
    }
  }

  public async delete(
    assignmentId: string,
    attachmentId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.assertModuleEnabled();
    let fileAssetId: string | null = null;
    await this.prisma.transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaTx;
      const current = await this.repo.findById(attachmentId, tx);
      if (current === null || current.assignmentId !== assignmentId) {
        throw new AssignmentAttachmentNotFoundError(attachmentId);
      }
      fileAssetId = current.fileAssetId;
      await this.repo.softDelete(attachmentId, expectedVersion, tx);
      await this.outbox.publish(tx, {
        topic: AcademicContentOutboxTopics.ASSIGNMENT_ATTACHMENT_DELETED,
        eventType: 'AssignmentAttachmentDeleted',
        aggregateType: 'AssignmentAttachment',
        aggregateId: attachmentId,
        payload: {
          id: attachmentId,
          assignmentId,
          fileAssetId: current.fileAssetId,
        },
      });
      await this.audit.record(
        {
          action: 'assignment-attachment.delete',
          category: 'general',
          resourceType: 'AssignmentAttachment',
          resourceId: attachmentId,
          before: current,
        },
        { tx: tx as unknown as AuditTxLike },
      );
    });

    if (fileAssetId !== null) {
      await this.tryCleanupAsset(fileAssetId);
    }
  }

  private async tryCleanupAsset(fileAssetId: string): Promise<void> {
    try {
      await this.fileAssetService.softDelete(fileAssetId);
    } catch (err) {
      this.logger.warn(
        `Failed to soft-delete orphaned FileAsset=${fileAssetId}: ${(err as Error).message}`,
      );
    }
  }

  private async assertModuleEnabled(): Promise<void> {
    const ctx = RequestContextRegistry.require();
    const enabled = await this.featureFlags.isEnabled(
      AcademicContentFeatureFlags.MODULE,
      { schoolId: ctx.schoolId ?? null },
    );
    if (!enabled) throw new AcademicContentModuleDisabledError();
  }
}
