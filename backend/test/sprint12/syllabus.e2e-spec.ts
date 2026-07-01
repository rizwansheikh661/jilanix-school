/**
 * Sprint 12 e2e — Syllabus tree + completion bubble-up.
 *
 * Builds a 2 UNITs × 2 CHAPTERs × 2 TOPICs (8 leaf + 6 inner = 12 children +
 * 2 roots) tree, completes 6 of 8 topics, and asserts the syllabus header
 * percent is correctly recomputed (75.00) and status flips IN_PROGRESS.
 * Then completes the last 2 → 100.00 + COMPLETED + actualCompletionDate set.
 */
import { AcademicContentOutboxTopics } from '../../src/core/academic-content/academic-content.constants';
import {
  DuplicateSyllabusError,
  SyllabusNodeHierarchyInvalidError,
} from '../../src/core/academic-content/academic-content.errors';
import type { SyllabusNodeRow } from '../../src/core/academic-content/academic-content.types';
import { createSprint12Harness } from './helpers';

describe('Sprint 12 — Syllabus e2e', () => {
  it('builds tree, hierarchy validates, completion bubbles bottom-up', async () => {
    const h = createSprint12Harness();

    const syl = await h.withCtx(() =>
      h.syllabusService.create({
        academicYearId: 'ay-1',
        classId: 'cls-1',
        subjectId: 'sub-1',
        ownedByStaffId: 'staff-1',
      }),
    );
    expect(syl.status).toBe('NOT_STARTED');
    expect(syl.completionPercent).toBe(0);

    // Duplicate active syllabus refused.
    await expect(
      h.withCtx(() =>
        h.syllabusService.create({
          academicYearId: 'ay-1',
          classId: 'cls-1',
          subjectId: 'sub-1',
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateSyllabusError);

    // -- Build 2 UNITs ------------------------------------------------------
    const units: SyllabusNodeRow[] = [];
    for (let i = 1; i <= 2; i++) {
      units.push(
        await h.withCtx(() =>
          h.syllabusService.upsertNode({
            syllabusId: syl.id,
            nodeType: 'UNIT',
            name: `Unit ${i}`,
            sequence: i,
          }),
        ),
      );
    }

    // UNIT with non-null parent refused.
    await expect(
      h.withCtx(() =>
        h.syllabusService.upsertNode({
          syllabusId: syl.id,
          nodeType: 'UNIT',
          parentNodeId: units[0]!.id,
          name: 'Bad Unit',
          sequence: 99,
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNodeHierarchyInvalidError);

    // -- 2 CHAPTERs under each UNIT (4 total) ------------------------------
    const chapters: SyllabusNodeRow[] = [];
    for (const unit of units) {
      for (let c = 1; c <= 2; c++) {
        chapters.push(
          await h.withCtx(() =>
            h.syllabusService.upsertNode({
              syllabusId: syl.id,
              nodeType: 'CHAPTER',
              parentNodeId: unit.id,
              name: `Chapter ${c}`,
              sequence: c,
            }),
          ),
        );
      }
    }

    // TOPIC with UNIT parent refused.
    await expect(
      h.withCtx(() =>
        h.syllabusService.upsertNode({
          syllabusId: syl.id,
          nodeType: 'TOPIC',
          parentNodeId: units[0]!.id,
          name: 'bad-topic',
          sequence: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(SyllabusNodeHierarchyInvalidError);

    // -- 2 TOPICs under each CHAPTER (8 total) -----------------------------
    const topics: SyllabusNodeRow[] = [];
    for (const chap of chapters) {
      for (let t = 1; t <= 2; t++) {
        topics.push(
          await h.withCtx(() =>
            h.syllabusService.upsertNode({
              syllabusId: syl.id,
              nodeType: 'TOPIC',
              parentNodeId: chap.id,
              name: `Topic ${t}`,
              sequence: t,
            }),
          ),
        );
      }
    }
    expect(topics).toHaveLength(8);

    // -- Complete 6 of 8 topics → 75.00 % + IN_PROGRESS --------------------
    for (let i = 0; i < 6; i++) {
      const topic = topics[i]!;
      await h.withCtx(() =>
        h.syllabusService.completeTopic(topic.id, topic.version, {
          completedByStaffId: 'staff-1',
          actualCompletionDate: new Date('2026-07-15'),
        }),
      );
    }
    const after6 = await h.withCtx(() => h.syllabusService.getById(syl.id));
    expect(after6.completionPercent).toBe(75);
    expect(after6.status).toBe('IN_PROGRESS');
    expect(after6.actualCompletionDate).toBeNull();

    // -- Complete remaining 2 → 100.00 + COMPLETED + actualCompletionDate --
    for (let i = 6; i < 8; i++) {
      const topic = topics[i]!;
      await h.withCtx(() =>
        h.syllabusService.completeTopic(topic.id, topic.version, {
          completedByStaffId: 'staff-1',
          actualCompletionDate: new Date('2026-07-20'),
        }),
      );
    }
    const final = await h.withCtx(() => h.syllabusService.getById(syl.id));
    expect(final.completionPercent).toBe(100);
    expect(final.status).toBe('COMPLETED');
    expect(final.actualCompletionDate).toBeInstanceOf(Date);

    // -- Outbox: 1 SYLLABUS_CREATED + 14 node upserts + 8 node completes ---
    const topics_ = h.outboxTopics();
    expect(
      topics_.filter((t) => t === AcademicContentOutboxTopics.SYLLABUS_CREATED),
    ).toHaveLength(1);
    expect(
      topics_.filter((t) => t === AcademicContentOutboxTopics.SYLLABUS_NODE_UPSERTED),
    ).toHaveLength(14); // 2 UNIT + 4 CHAPTER + 8 TOPIC
    expect(
      topics_.filter((t) => t === AcademicContentOutboxTopics.SYLLABUS_NODE_COMPLETED),
    ).toHaveLength(8);
  });
});
