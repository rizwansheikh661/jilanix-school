import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../../errors/domain-error';
import { EventNotReplayableError } from '../outbox.errors';
import type { OutboxEventRow, OutboxStatus } from '../outbox.types';
import { OutboxRepository } from '../repositories/outbox.repository';

export interface ListOutboxQuery {
  readonly schoolId?: string | null;
  readonly topic?: string;
  readonly status?: OutboxStatus;
  readonly limit?: number;
}

@Injectable()
export class OutboxEventService {
  constructor(private readonly repo: OutboxRepository) {}

  public async list(query: ListOutboxQuery): Promise<readonly OutboxEventRow[]> {
    const limit = Math.min(query.limit ?? 50, 200);
    return this.repo.list({
      ...(query.schoolId !== undefined ? { schoolId: query.schoolId } : {}),
      ...(query.topic !== undefined ? { topic: query.topic } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      limit,
    });
  }

  public async listDeadLetter(query: { schoolId?: string | null; topic?: string; limit?: number }): Promise<readonly OutboxEventRow[]> {
    return this.list({ ...query, status: 'dead' });
  }

  public async getById(id: string): Promise<OutboxEventRow> {
    const row = await this.repo.findById(id);
    if (row === null) {
      throw new NotFoundError('OutboxEvent', id);
    }
    return row;
  }

  public async replay(id: string): Promise<OutboxEventRow> {
    const row = await this.getById(id);
    if (row.status !== 'delivered' && row.status !== 'failed' && row.status !== 'dead') {
      throw new EventNotReplayableError(id, row.status);
    }
    const updated = await this.repo.resetForReplay(id);
    if (updated === 0) {
      throw new EventNotReplayableError(id, row.status);
    }
    return this.getById(id);
  }
}
