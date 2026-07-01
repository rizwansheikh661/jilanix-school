import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { NotFoundError, VersionConflict } from '../errors/domain-error';
import { RequestContextRegistry } from '../request-context';
import {
  DuplicateJobDefinitionNameError,
  InvalidCronExpressionError,
} from './jobs.errors';
import type {
  JobDefinitionRow,
  JobDeadLetterRow,
  JobRunRow,
  JobRunStatus,
  JobDeadLetterStatus,
} from './jobs.types';
import { JobDeadLetterRepository } from './repositories/job-dead-letter.repository';
import { JobDefinitionRepository } from './repositories/job-definition.repository';
import { JobRunRepository } from './repositories/job-run.repository';
import { JobEnqueueService } from './services/job-enqueue.service';
import { JobSchedulerService } from './services/job-scheduler.service';

const CRON_REGEX = /^(\S+\s+){4}\S+$/;

export interface CreateJobDefinitionArgs {
  readonly schoolId: string | null;
  readonly name: string;
  readonly queue: string;
  readonly handlerName: string;
  readonly scheduleCron: string | null;
  readonly payloadTemplate?: Prisma.InputJsonValue;
  readonly isActive: boolean;
  readonly description: string | null;
}

export interface UpdateJobDefinitionArgs {
  readonly queue?: string;
  readonly handlerName?: string;
  readonly scheduleCron?: string | null;
  readonly payloadTemplate?: Prisma.InputJsonValue | null;
  readonly isActive?: boolean;
  readonly description?: string | null;
  readonly expectedVersion: number;
}

@Injectable()
export class JobDefinitionService {
  constructor(
    private readonly definitions: JobDefinitionRepository,
    private readonly scheduler: JobSchedulerService,
  ) {}

  public async create(input: CreateJobDefinitionArgs): Promise<JobDefinitionRow> {
    const ctx = RequestContextRegistry.require();
    if (input.scheduleCron !== null) {
      this.assertCronValid(input.scheduleCron);
    }
    const existing = await this.definitions.findByName(input.schoolId, input.name);
    if (existing !== null) {
      throw new DuplicateJobDefinitionNameError(input.schoolId, input.name);
    }
    return this.definitions.create({
      id: ulid(),
      schoolId: input.schoolId,
      name: input.name,
      queue: input.queue,
      handlerName: input.handlerName,
      scheduleCron: input.scheduleCron,
      ...(input.payloadTemplate !== undefined ? { payloadTemplate: input.payloadTemplate } : {}),
      isActive: input.isActive,
      description: input.description,
      createdBy: ctx.userId ?? null,
    });
  }

  public async update(id: string, input: UpdateJobDefinitionArgs): Promise<JobDefinitionRow> {
    const ctx = RequestContextRegistry.require();
    if (input.scheduleCron !== undefined && input.scheduleCron !== null) {
      this.assertCronValid(input.scheduleCron);
    }
    const existing = await this.definitions.findById(id);
    if (existing === null) throw new NotFoundError('JobDefinition', id);

    const updated = await this.definitions.update(
      id,
      {
        ...(input.queue !== undefined ? { queue: input.queue } : {}),
        ...(input.handlerName !== undefined ? { handlerName: input.handlerName } : {}),
        ...(input.scheduleCron !== undefined ? { scheduleCron: input.scheduleCron } : {}),
        ...(input.payloadTemplate !== undefined ? { payloadTemplate: input.payloadTemplate } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedBy: ctx.userId ?? null,
      },
      input.expectedVersion,
    );
    if (updated === null) {
      throw new VersionConflict('JobDefinition', id, input.expectedVersion);
    }
    return updated;
  }

  public async list(query: { schoolId?: string | null; queue?: string; isActive?: boolean; limit?: number }): Promise<readonly JobDefinitionRow[]> {
    return this.definitions.list({
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.queue !== undefined ? { queue: query.queue } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      limit: Math.min(query.limit ?? 50, 200),
    });
  }

  public async getById(id: string): Promise<JobDefinitionRow> {
    const row = await this.definitions.findById(id);
    if (row === null) throw new NotFoundError('JobDefinition', id);
    return row;
  }

  public async setActive(id: string, isActive: boolean, expectedVersion: number): Promise<JobDefinitionRow> {
    return this.update(id, { isActive, expectedVersion });
  }

  public async delete(id: string): Promise<void> {
    const count = await this.definitions.delete(id);
    if (count === 0) throw new NotFoundError('JobDefinition', id);
  }

  /** Exposed so the scheduler test path can introspect cron parsing. */
  public testCron(expression: string, when: Date): boolean {
    return this.scheduler.cronMatches(expression, when);
  }

  private assertCronValid(expression: string): void {
    if (!CRON_REGEX.test(expression)) {
      throw new InvalidCronExpressionError(expression);
    }
    // Round-trip parse — bubbles up shape errors.
    this.scheduler.cronMatches(expression, new Date());
  }
}

@Injectable()
export class JobRunService {
  constructor(private readonly runs: JobRunRepository) {}

  public async list(query: { definitionId?: string; jobId?: string; status?: JobRunStatus; schoolId?: string | null; limit?: number }): Promise<readonly JobRunRow[]> {
    return this.runs.list({
      ...(query.definitionId !== undefined ? { definitionId: query.definitionId } : {}),
      ...(query.jobId !== undefined ? { jobId: query.jobId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      limit: Math.min(query.limit ?? 50, 200),
    });
  }

  public async getById(id: string): Promise<JobRunRow> {
    const row = await this.runs.findById(id);
    if (row === null) throw new NotFoundError('JobRun', id);
    return row;
  }
}

@Injectable()
export class JobDeadLetterService {
  constructor(
    private readonly dlq: JobDeadLetterRepository,
    private readonly enqueueService: JobEnqueueService,
  ) {}

  public async list(query: { status?: JobDeadLetterStatus; queue?: string; schoolId?: string | null; limit?: number }): Promise<readonly JobDeadLetterRow[]> {
    return this.dlq.list({
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.queue !== undefined ? { queue: query.queue } : {}),
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      limit: Math.min(query.limit ?? 50, 200),
    });
  }

  public async getById(id: string): Promise<JobDeadLetterRow> {
    const row = await this.dlq.findById(id);
    if (row === null) throw new NotFoundError('JobDeadLetter', id);
    return row;
  }

  public async replay(id: string): Promise<JobDeadLetterRow> {
    const row = await this.getById(id);
    if (row.status !== 'PENDING') {
      throw new NotFoundError('JobDeadLetter', id);
    }
    await this.enqueueService.enqueue({
      queue: row.queue,
      handlerName: row.handlerName,
      schoolId: row.schoolId,
      payload: row.payload as Prisma.InputJsonValue,
    });
    await this.dlq.markReplayed(id);
    return this.getById(id);
  }

  public async archive(id: string): Promise<void> {
    const count = await this.dlq.archive(id);
    if (count === 0) throw new NotFoundError('JobDeadLetter', id);
  }
}
