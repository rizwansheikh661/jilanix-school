import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

import { GlobalExceptionFilter } from './global-exception.filter';
import { NotFoundError, ValidationFailedError } from '../errors';
import { RequestContextRegistry } from '../request-context/request-context.service';

interface ResStub {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  headersSent: boolean;
}

function makeHost(path: string, res: ResStub): ArgumentsHost {
  const req = { path, method: 'GET' };
  return {
    switchToHttp: () => ({
      getRequest: <T>() => req as unknown as T,
      getResponse: <T>() =>
        ({
          status(code: number) {
            res.statusCode = code;
            return this;
          },
          json(body: unknown) {
            res.body = body;
            return this;
          },
          setHeader(name: string, value: string) {
            res.headers[name] = value;
          },
          get headersSent() {
            return res.headersSent;
          },
        }) as unknown as T,
      getNext: <T>() => ({}) as T,
    }),
    getType: () => 'http',
  } as unknown as ArgumentsHost;
}

function makeRes(): ResStub {
  return { statusCode: 0, body: undefined, headers: {}, headersSent: false };
}

const fakeLogger = {
  setContext: () => {},
  warn: () => {},
  error: () => {},
};

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter(fakeLogger as never);

  function run(host: ArgumentsHost, exception: unknown, requestId = 'req-1'): void {
    const ctx = RequestContextRegistry.makeSystemContext({
      requestId,
      actorScope: 'public',
    });
    RequestContextRegistry.run(ctx, () => {
      filter.catch(exception, host);
    });
  }

  it('serialises a DomainError to the canonical envelope', () => {
    const res = makeRes();
    run(makeHost('/api/v1/students/abc', res), new NotFoundError('Student', 'abc'));
    expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(res.body).toEqual({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Student not found',
        details: { resource: 'Student', id: 'abc' },
        requestId: 'req-1',
      },
    });
    expect(res.headers['X-Request-Id']).toBe('req-1');
  });

  it('serialises a ValidationFailedError to 422 with field details', () => {
    const res = makeRes();
    const err = new ValidationFailedError([
      { path: 'name', code: 'IS_NOT_EMPTY', message: 'name should not be empty' },
    ]);
    run(makeHost('/api/v1/students', res), err);
    expect(res.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: {
          fields: [{ path: 'name', code: 'IS_NOT_EMPTY' }],
        },
      },
    });
  });

  it('coerces plain BadRequestException with class-validator messages to 422', () => {
    const res = makeRes();
    const err = new BadRequestException({
      statusCode: 400,
      message: ['email must be an email'],
      error: 'Bad Request',
    });
    run(makeHost('/api/v1/students', res), err);
    expect(res.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: { fields: [{ path: 'email' }] },
      },
    });
  });

  it('preserves status from a non-validation HttpException', () => {
    const res = makeRes();
    run(makeHost('/api/v1/x', res), new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT));
    expect(res.statusCode).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(res.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it('hides details for unknown errors and returns 500', () => {
    const res = makeRes();
    run(makeHost('/api/v1/x', res), new Error('database exploded'));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    // The internal message must not leak.
    expect(JSON.stringify(res.body)).not.toContain('database exploded');
  });

  it('passes raw HttpException response through for envelope-exempt paths', () => {
    const res = makeRes();
    const report = { status: 'not_ready', checks: { database: { status: 'down' } } };
    run(
      makeHost('/ready', res),
      new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE),
    );
    expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.body).toBe(report);
  });
});
