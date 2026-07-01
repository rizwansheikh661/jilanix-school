/**
 * TeacherLoadRecomputer — recomputes one teacher's load metrics from
 * the current set of active entries in a version, then upserts the
 * derived row. Called by `TimetableEntryService` after every mutation.
 *
 * Metrics:
 *   - periodsPerWeek: count of active TEACHING entries.
 *   - maxConsecutive: max run of consecutive period indices on any day
 *     (entries are 1-based period indices; consecutive means
 *     `periodIndex[i+1] === periodIndex[i] + 1`).
 *   - dailyCounts: { dayOfWeek: count }.
 *   - subjectMix:  { subjectId: count }.
 *
 * After upsert, publishes `timetable.teacher_load.recomputed` to the
 * outbox so downstream listeners (analytics, alerts) can react.
 */
import { Injectable } from '@nestjs/common';

import type { PrismaTx } from '../../../infra/prisma/types';
import { OutboxPublisherService } from '../../outbox/services/outbox-publisher.service';
import { TimetableOutboxTopics } from '../timetable.constants';
import { TimetableEntryRepository } from '../entry/entry.repository';
import { TeacherLoadRepository } from './teacher-load.repository';

@Injectable()
export class TeacherLoadRecomputer {
  constructor(
    private readonly entryRepo: TimetableEntryRepository,
    private readonly loadRepo: TeacherLoadRepository,
    private readonly outbox: OutboxPublisherService,
  ) {}

  public async recompute(
    timetableVersionId: string,
    staffId: string,
    tx: PrismaTx,
  ): Promise<void> {
    const entries = await this.entryRepo.findActiveForStaff(timetableVersionId, staffId, tx);
    const periodsPerWeek = entries.length;
    const dailyCounts: Record<string, number> = {};
    const subjectMix: Record<string, number> = {};
    const byDay = new Map<number, number[]>();

    for (const e of entries) {
      const dayKey = String(e.dayOfWeek);
      dailyCounts[dayKey] = (dailyCounts[dayKey] ?? 0) + 1;
      subjectMix[e.subjectId] = (subjectMix[e.subjectId] ?? 0) + 1;
      const arr = byDay.get(e.dayOfWeek) ?? [];
      arr.push(e.periodIndex);
      byDay.set(e.dayOfWeek, arr);
    }

    let maxConsecutive = 0;
    for (const periods of byDay.values()) {
      periods.sort((a, b) => a - b);
      let run = 1;
      let best = periods.length === 0 ? 0 : 1;
      for (let i = 1; i < periods.length; i += 1) {
        const prev = periods[i - 1];
        const cur = periods[i];
        if (prev !== undefined && cur !== undefined && cur === prev + 1) {
          run += 1;
          if (run > best) best = run;
        } else {
          run = 1;
        }
      }
      if (best > maxConsecutive) maxConsecutive = best;
    }

    await this.loadRepo.upsert(
      {
        timetableVersionId,
        staffId,
        periodsPerWeek,
        maxConsecutive,
        dailyCounts,
        subjectMix,
        computedAt: new Date(),
      },
      tx,
    );

    await this.outbox.publish(tx, {
      topic: TimetableOutboxTopics.TEACHER_LOAD_RECOMPUTED,
      eventType: 'TeacherLoadRecomputed',
      aggregateType: 'TeacherLoad',
      aggregateId: `${timetableVersionId}:${staffId}`,
      payload: {
        versionId: timetableVersionId,
        staffId,
        periodsPerWeek,
        maxConsecutive,
      },
    });
  }
}
