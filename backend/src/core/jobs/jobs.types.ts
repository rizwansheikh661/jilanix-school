import type { Prisma } from '@prisma/client';

import type { JobStatus } from './jobs.constants';

export type { JobStatus };

export type JobRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';
export type JobDeadLetterStatus = 'PENDING' | 'REPLAYED' | 'ARCHIVED';

export interface JobDefinitionRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly name: string;
  readonly queue: string;
  readonly handlerName: string;
  readonly scheduleCron: string | null;
  readonly payloadTemplate: Prisma.JsonValue | null;
  readonly isActive: boolean;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly version: number;
}

export interface JobRunRow {
  readonly id: string;
  readonly jobId: string | null;
  readonly definitionId: string | null;
  readonly schoolId: string | null;
  readonly queue: string;
  readonly handlerName: string;
  readonly attempt: number;
  readonly status: JobRunStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly errorMessage: string | null;
  readonly errorCode: string | null;
  readonly outputJson: Prisma.JsonValue | null;
  readonly durationMs: number | null;
  readonly createdAt: Date;
}

export interface JobDeadLetterRow {
  readonly id: string;
  readonly jobId: string;
  readonly definitionId: string | null;
  readonly schoolId: string | null;
  readonly queue: string;
  readonly handlerName: string;
  readonly payload: Prisma.JsonValue;
  readonly attempts: number;
  readonly firstFailedAt: Date;
  readonly lastFailedAt: Date;
  readonly lastError: string | null;
  readonly status: JobDeadLetterStatus;
  readonly replayedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface JobRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly queue: string;
  readonly type: string;
  readonly payload: Prisma.JsonValue;
  readonly priority: number;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly runAt: Date;
  readonly claimedAt: Date | null;
  readonly claimedBy: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface JobHandlerContext {
  readonly job: JobRow;
  readonly attempt: number;
}

export type JobHandler<TPayload = unknown> = (
  payload: TPayload,
  ctx: JobHandlerContext,
) => Promise<Prisma.InputJsonValue | void>;
