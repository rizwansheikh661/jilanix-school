import { FinanceChainService } from './chain.service';
import type { ChainableRow } from './chain.types';

function row(overrides: Partial<ChainableRow> = {}): ChainableRow {
  return {
    schoolId: 'school-1',
    category: 'finance',
    action: 'invoice.create',
    resourceType: 'Invoice',
    resourceId: 'inv-1',
    actorUserId: 'user-1',
    actorScope: 'tenant',
    beforeJson: null,
    afterJson: { amount: 100 },
    ipAddress: '10.0.0.1',
    userAgent: 'agent',
    requestId: 'req-1',
    createdAt: new Date('2026-06-17T00:00:00Z'),
    ...overrides,
  };
}

describe('FinanceChainService', () => {
  const svc = new FinanceChainService();

  it('hashes deterministically for the same inputs', () => {
    const r = row();
    const h1 = svc.hashRow(null, r);
    const h2 = svc.hashRow(null, r);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex
  });

  it('produces different hashes when prev_hash changes', () => {
    const r = row();
    const a = svc.hashRow(null, r);
    const b = svc.hashRow('a'.repeat(64), r);
    expect(a).not.toBe(b);
  });

  it('verify returns -1 for an intact chain', () => {
    const r1 = row({ resourceId: 'inv-1' });
    const h1 = svc.hashRow(null, r1);
    const r2 = row({ resourceId: 'inv-2' });
    const h2 = svc.hashRow(h1, r2);
    const chain = [
      { ...r1, prevHash: null, rowHash: h1 },
      { ...r2, prevHash: h1, rowHash: h2 },
    ];
    expect(svc.verify(chain)).toBe(-1);
  });

  it('verify pinpoints a tampered row', () => {
    const r1 = row({ resourceId: 'inv-1' });
    const h1 = svc.hashRow(null, r1);
    const r2 = row({ resourceId: 'inv-2' });
    const h2 = svc.hashRow(h1, r2);
    const chain = [
      { ...r1, prevHash: null, rowHash: h1 },
      // Mutate the second row's afterJson — its rowHash no longer matches.
      { ...r2, afterJson: { amount: 999 }, prevHash: h1, rowHash: h2 },
    ];
    expect(svc.verify(chain)).toBe(1);
  });

  it('compute pulls prev_hash from the supplied tx and chains it', async () => {
    const r = row();
    const previousHash = 'd'.repeat(64);
    const fakeTx = {
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({ rowHash: previousHash }),
        create: jest.fn(),
      },
    };
    const out = await svc.compute(fakeTx, { schoolId: 'school-1', category: 'finance' }, r);
    expect(out.prevHash).toBe(previousHash);
    expect(out.rowHash).toBe(svc.hashRow(previousHash, r));
    expect(fakeTx.auditLog.findFirst).toHaveBeenCalledWith({
      where: { schoolId: 'school-1', category: 'finance' },
      orderBy: { createdAt: 'desc' },
      select: { rowHash: true },
    });
  });
});
