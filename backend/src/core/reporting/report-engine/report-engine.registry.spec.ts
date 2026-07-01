/**
 * ReportEngineRegistry + ReportEngineService unit specs.
 */
import { ReportKindUnknownError } from '../reporting.errors';
import type { ReportKindValue } from '../reporting.constants';
import type { ReportRowSet } from '../reporting.types';
import { ReportEngineRegistry } from './report-engine.registry';
import { ReportEngineService } from './report-engine.service';
import type { ReportEngine } from './report-engine.types';

function makeEngine(kind: ReportKindValue, rows: ReportRowSet): ReportEngine {
  return {
    kind,
    execute: jest.fn(async () => rows),
  };
}

describe('ReportEngineRegistry', () => {
  it('registers and retrieves an engine by kind', () => {
    const reg = new ReportEngineRegistry();
    const engine = makeEngine('STUDENT_LIST', { columns: [], rows: [] });
    reg.register(engine);
    expect(reg.get('STUDENT_LIST')).toBe(engine);
  });

  it('overwrites with a warning when the same kind is registered twice', () => {
    const reg = new ReportEngineRegistry();
    const a = makeEngine('STUDENT_LIST', { columns: [], rows: [] });
    const b = makeEngine('STUDENT_LIST', { columns: [], rows: [] });
    reg.register(a);
    reg.register(b);
    expect(reg.get('STUDENT_LIST')).toBe(b);
  });

  it('returns undefined for an unregistered kind', () => {
    const reg = new ReportEngineRegistry();
    expect(reg.get('FEE_OUTSTANDING')).toBeUndefined();
  });

  it('list() returns registered kinds sorted', () => {
    const reg = new ReportEngineRegistry();
    reg.register(makeEngine('STUDENT_LIST', { columns: [], rows: [] }));
    reg.register(makeEngine('FEE_OUTSTANDING', { columns: [], rows: [] }));
    expect(reg.list()).toEqual(['FEE_OUTSTANDING', 'STUDENT_LIST']);
  });
});

describe('ReportEngineService', () => {
  it('delegates to the registered engine', async () => {
    const reg = new ReportEngineRegistry();
    const expected: ReportRowSet = {
      columns: [{ key: 'id', header: 'ID' }],
      rows: [{ id: 'a' }],
    };
    const engine = makeEngine('STUDENT_LIST', expected);
    reg.register(engine);
    const svc = new ReportEngineService(reg);
    const result = await svc.execute(
      'STUDENT_LIST',
      {},
      { schoolId: 's1', userId: 'u1' } as never,
    );
    expect(result).toEqual(expected);
    expect(engine.execute).toHaveBeenCalled();
  });

  it('throws ReportKindUnknownError when no engine is registered', async () => {
    const reg = new ReportEngineRegistry();
    const svc = new ReportEngineService(reg);
    await expect(
      svc.execute(
        'STUDENT_LIST',
        {},
        { schoolId: 's1', userId: 'u1' } as never,
      ),
    ).rejects.toBeInstanceOf(ReportKindUnknownError);
  });
});
