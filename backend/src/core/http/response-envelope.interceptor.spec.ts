import { firstValueFrom, of } from 'rxjs';
import { ExecutionContext } from '@nestjs/common';

import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';
import { RequestContextRegistry } from '../request-context/request-context.service';

function makeCtx(path: string): ExecutionContext {
  const req = { path };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: <T>() => req as unknown as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
  } as unknown as ExecutionContext;
}

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps a raw return value in { data, meta: { requestId } }', async () => {
    const ctx = makeCtx('/api/v1/students/1');
    const handler = { handle: () => of({ id: 's1' }) };
    const out = await RequestContextRegistry.run(
      makeContext('req-123'),
      () => firstValueFrom(interceptor.intercept(ctx, handler)),
    );
    expect(out).toEqual({ data: { id: 's1' }, meta: { requestId: 'req-123' } });
  });

  it('passes through unmodified for envelope-exempt paths', async () => {
    const ctx = makeCtx('/health');
    const raw = { status: 'ok' };
    const handler = { handle: () => of(raw) };
    const out = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(out).toBe(raw);
  });

  it('merges requestId into a controller-supplied envelope shape', async () => {
    const ctx = makeCtx('/api/v1/students');
    const handler = {
      handle: () =>
        of({ data: [{ id: 's1' }], meta: { totalCount: 42 } }),
    };
    const out = await RequestContextRegistry.run(
      makeContext('req-xyz'),
      () => firstValueFrom(interceptor.intercept(ctx, handler)),
    );
    expect(out).toEqual({
      data: [{ id: 's1' }],
      meta: { requestId: 'req-xyz', totalCount: 42 },
    });
  });

  it('falls back to "unknown" when no RequestContext is bound', async () => {
    const ctx = makeCtx('/api/v1/foo');
    const handler = { handle: () => of('hello') };
    const out = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(out).toEqual({ data: 'hello', meta: { requestId: 'unknown' } });
  });
});

function makeContext(requestId: string) {
  return RequestContextRegistry.makeSystemContext({
    requestId,
    actorScope: 'public',
  });
}
