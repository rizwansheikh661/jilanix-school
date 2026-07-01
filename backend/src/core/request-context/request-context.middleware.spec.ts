import { EventEmitter } from 'node:events';

import { RequestContextRegistry } from './request-context.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { REQUEST_ID_HEADER_OUT, isUlid } from '../logger/correlation';

interface FakeReq {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  originalUrl?: string;
  url?: string;
  method?: string;
  id?: string;
}

class FakeRes extends EventEmitter {
  public headersSent = false;
  public statusCode = 200;
  private readonly headers = new Map<string, string>();

  public setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
  public getHeader(name: string): string | undefined {
    return this.headers.get(name);
  }
  public allHeaders(): Map<string, string> {
    return this.headers;
  }
}

function makeReq(overrides: Partial<FakeReq> = {}): FakeReq {
  return {
    headers: {},
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
    originalUrl: '/api/v1/students/abc?expand=true',
    url: '/api/v1/students/abc?expand=true',
    method: 'GET',
    ...overrides,
  };
}

describe('RequestContextMiddleware', () => {
  const mw = new RequestContextMiddleware();

  it('generates a ULID request id when no header is supplied', (done) => {
    const req = makeReq();
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      const ctx = RequestContextRegistry.peek();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toBeDefined();
      expect(isUlid(ctx!.requestId)).toBe(true);
      expect(res.getHeader(REQUEST_ID_HEADER_OUT)).toBe(ctx!.requestId);
      done();
    });
  });

  it('echoes the upstream X-Request-Id verbatim when valid', (done) => {
    const upstream = '550e8400-e29b-41d4-a716-446655440000';
    const req = makeReq({ headers: { 'x-request-id': upstream } });
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      expect(RequestContextRegistry.peek()!.requestId).toBe(upstream);
      expect(res.getHeader(REQUEST_ID_HEADER_OUT)).toBe(upstream);
      done();
    });
  });

  it('strips query string from route', (done) => {
    const req = makeReq();
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      expect(RequestContextRegistry.peek()!.route).toBe('/api/v1/students/abc');
      done();
    });
  });

  it('extracts trace id from a well-formed traceparent', (done) => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const req = makeReq({ headers: { traceparent } });
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      expect(RequestContextRegistry.peek()!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      done();
    });
  });

  it('captures client headers, user-agent, ip, locale', (done) => {
    const req = makeReq({
      headers: {
        'user-agent': 'jest/1.0',
        'x-client-name': 'schoolos-web',
        'x-client-version': '0.5.0',
        'accept-language': 'en-IN,en;q=0.8',
      },
    });
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      const ctx = RequestContextRegistry.peek()!;
      expect(ctx.userAgent).toBe('jest/1.0');
      expect(ctx.clientName).toBe('schoolos-web');
      expect(ctx.clientVersion).toBe('0.5.0');
      expect(ctx.locale).toBe('en-IN');
      expect(ctx.ip).toBe('203.0.113.10');
      done();
    });
  });

  it('defaults actorScope to "public" before auth wires up', (done) => {
    const req = makeReq();
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      expect(RequestContextRegistry.peek()!.actorScope).toBe('public');
      done();
    });
  });

  it('reuses req.id when pino-http already populated it', (done) => {
    const req = makeReq({ id: 'preexisting-id-value-1234' });
    const res = new FakeRes();
    mw.use(req as never, res as never, () => {
      expect(RequestContextRegistry.peek()!.requestId).toBe('preexisting-id-value-1234');
      done();
    });
  });
});
