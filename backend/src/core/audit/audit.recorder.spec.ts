import { AuditRecorder } from './audit.recorder';
import type { AuditIntent } from './audit.types';

const sample = (model: string): AuditIntent => ({
  model,
  operation: 'update',
  category: 'general',
  schoolId: 'school-1',
  before: undefined,
  after: { id: 'x' },
  capturedAt: Date.now(),
});

describe('AuditRecorder', () => {
  it('peek returns empty when no buffer is bound', () => {
    expect(AuditRecorder.peek()).toEqual([]);
  });

  it('push is a no-op outside a buffer', () => {
    AuditRecorder.push(sample('Student'));
    expect(AuditRecorder.peek()).toEqual([]);
  });

  it('buffers and drains intents inside run', async () => {
    const drained = AuditRecorder.run(() => {
      AuditRecorder.push(sample('Student'));
      AuditRecorder.push(sample('Invoice'));
      expect(AuditRecorder.peek()).toHaveLength(2);
      const out = AuditRecorder.drain();
      expect(out).toHaveLength(2);
      expect(AuditRecorder.peek()).toEqual([]);
      return out;
    });
    expect(drained.map((i) => i.model)).toEqual(['Student', 'Invoice']);
  });

  it('isolates parallel buffers', async () => {
    const [a, b] = await Promise.all([
      AuditRecorder.run(async () => {
        AuditRecorder.push(sample('A'));
        await new Promise((r) => setTimeout(r, 5));
        return AuditRecorder.drain();
      }),
      AuditRecorder.run(async () => {
        AuditRecorder.push(sample('B'));
        await new Promise((r) => setTimeout(r, 1));
        return AuditRecorder.drain();
      }),
    ]);
    expect(a.map((i) => i.model)).toEqual(['A']);
    expect(b.map((i) => i.model)).toEqual(['B']);
  });
});
