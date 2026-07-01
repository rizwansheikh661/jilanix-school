import { RequestContextRegistry } from './request-context.service';

describe('RequestContextRegistry', () => {
  it('peek returns undefined when no context is bound', () => {
    expect(RequestContextRegistry.peek()).toBeUndefined();
  });

  it('require throws when no context is bound', () => {
    expect(() => RequestContextRegistry.require()).toThrow(/RequestContext not bound/);
  });

  it('run binds the context for the duration of the callback', async () => {
    const ctx = RequestContextRegistry.makeSystemContext({
      requestId: 'r1',
      schoolId: 'school-1',
      userId: 'user-1',
      actorScope: 'tenant',
    });

    const result = await RequestContextRegistry.run(ctx, async () => {
      const peeked = RequestContextRegistry.peek();
      expect(peeked).toBe(ctx);
      expect(peeked?.requestId).toBe('r1');
      expect(peeked?.schoolId).toBe('school-1');
      // Crosses an async boundary — AsyncLocalStorage must propagate.
      await Promise.resolve();
      expect(RequestContextRegistry.peek()?.userId).toBe('user-1');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(RequestContextRegistry.peek()).toBeUndefined();
  });

  it('makeSystemContext freezes the result and its inner arrays', () => {
    const ctx = RequestContextRegistry.makeSystemContext({
      roleIds: ['a'],
      permissions: ['student.read'],
    });
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.roleIds)).toBe(true);
    expect(Object.isFrozen(ctx.permissions)).toBe(true);
    expect(ctx.actorScope).toBe('global');
  });

  it('parallel runs do not leak context across siblings', async () => {
    const a = RequestContextRegistry.makeSystemContext({ requestId: 'A', schoolId: 'a' });
    const b = RequestContextRegistry.makeSystemContext({ requestId: 'B', schoolId: 'b' });

    const [resA, resB] = await Promise.all([
      RequestContextRegistry.run(a, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return RequestContextRegistry.peek()?.requestId;
      }),
      RequestContextRegistry.run(b, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return RequestContextRegistry.peek()?.requestId;
      }),
    ]);

    expect(resA).toBe('A');
    expect(resB).toBe('B');
  });
});
