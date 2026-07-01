/**
 * ProvisioningRunRepository — write-only persistence for the append-only
 * `school_provisioning_runs` journal.
 *
 * Each call to `start()` creates a PENDING row that the orchestrator updates
 * as it walks through the saga steps. Completion / failure are recorded via
 * `markCompleted()` / `markFailed()`. We expose `appendStep()` so each step
 * inside the orchestrator can stamp its outcome onto `steps_json` without
 * round-tripping the entire payload.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';

export type ProvisioningRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'COMPENSATED';

export interface ProvisioningRunStep {
  readonly name: string;
  readonly status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly details?: Record<string, unknown>;
}

export interface ProvisioningRunRow {
  readonly id: string;
  readonly schoolId: string | null;
  readonly triggeredByUserId: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly status: ProvisioningRunStatus;
  readonly stepsJson: ProvisioningRunStep[];
  readonly errorMessage: string | null;
}

export interface StartRunInput {
  readonly triggeredByUserId: string;
  readonly initialSteps?: readonly ProvisioningRunStep[];
}

@Injectable()
export class ProvisioningRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async start(input: StartRunInput, tx?: PrismaTx): Promise<ProvisioningRunRow> {
    const writer = this.resolve(tx);
    const id = randomUUID();
    const created = await writer.schoolProvisioningRun.create({
      data: {
        id,
        triggeredByUserId: input.triggeredByUserId,
        status: 'RUNNING',
        stepsJson: (input.initialSteps ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
    return map(created);
  }

  public async attachSchool(
    runId: string,
    schoolId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.schoolProvisioningRun.update({
      where: { id: runId },
      data: { schoolId },
    });
  }

  public async replaceSteps(
    runId: string,
    steps: readonly ProvisioningRunStep[],
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.schoolProvisioningRun.update({
      where: { id: runId },
      data: { stepsJson: steps as unknown as Prisma.InputJsonValue },
    });
  }

  public async markCompleted(
    runId: string,
    steps: readonly ProvisioningRunStep[],
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.schoolProvisioningRun.update({
      where: { id: runId },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(),
        stepsJson: steps as unknown as Prisma.InputJsonValue,
      },
    });
  }

  public async markFailed(
    runId: string,
    steps: readonly ProvisioningRunStep[],
    errorMessage: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const writer = this.resolve(tx);
    await writer.schoolProvisioningRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: errorMessage.slice(0, 2000),
        stepsJson: steps as unknown as Prisma.InputJsonValue,
      },
    });
  }

  public async findById(runId: string, tx?: PrismaTx): Promise<ProvisioningRunRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.schoolProvisioningRun.findUnique({ where: { id: runId } });
    return row === null ? null : map(row);
  }
}

interface RawRow {
  id: string;
  schoolId: string | null;
  triggeredByUserId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  stepsJson: Prisma.JsonValue;
  errorMessage: string | null;
}

function map(row: RawRow): ProvisioningRunRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    triggeredByUserId: row.triggeredByUserId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status as ProvisioningRunStatus,
    stepsJson: Array.isArray(row.stepsJson) ? (row.stepsJson as unknown as ProvisioningRunStep[]) : [],
    errorMessage: row.errorMessage,
  };
}
