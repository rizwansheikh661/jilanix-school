import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import type { PrismaTx } from '../../../infra/prisma/types';
import type { JobRow } from '../jobs.types';
import { JobClaimRepository } from '../repositories/job-claim.repository';

export interface EnqueueJobInput {
  readonly queue: string;
  readonly handlerName: string;
  readonly payload: Prisma.InputJsonValue;
  readonly schoolId?: string | null;
  readonly priority?: number;
  readonly maxAttempts?: number;
  readonly runAt?: Date;
}

@Injectable()
export class JobEnqueueService {
  constructor(private readonly claims: JobClaimRepository) {}

  public async enqueue(input: EnqueueJobInput, tx?: PrismaTx): Promise<JobRow> {
    return this.claims.enqueue(
      {
        id: ulid(),
        schoolId: input.schoolId ?? null,
        queue: input.queue,
        type: input.handlerName,
        payload: input.payload,
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        ...(input.runAt !== undefined ? { runAt: input.runAt } : {}),
      },
      tx,
    );
  }
}
