/**
 * AppLogger — a thin wrapper over `PinoLogger` that automatically attaches
 * the canonical structured fields from the active `RequestContext`.
 *
 * Why a wrapper?
 *   - `PinoLogger` (from `nestjs-pino`) gives us request-scoped binding ONLY
 *     when called inside an HTTP request (it uses ALS internally). Code that
 *     runs in seed scripts, queue workers, or Prisma extensions needs the
 *     same context fields, and the source of truth for them is
 *     `RequestContextRegistry`, not the HTTP req.
 *   - We need to emit BACKEND_ARCHITECTURE §10.1's snake_case keys (`request_id`,
 *     `tenant_id`, `user_id`, `scope`) consistently regardless of caller.
 *
 * Use this everywhere instead of `console.*` or `new Logger(...)`.
 *
 * Typical usage:
 *
 *   constructor(private readonly logger: AppLogger) {
 *     logger.setContext(MyService.name);
 *   }
 *
 *   this.logger.info('student.created', { student_id });
 *
 * For a one-off scope override (e.g. inside a job):
 *
 *   logger.child({ job: 'nightly-rollup' }).info('started');
 */
import { Inject, Injectable, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { RequestContextRegistry } from '../request-context';

type LogObject = Record<string, unknown>;

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger {
  private readonly pino: PinoLogger;
  private contextName = 'app';

  constructor(@Inject(PinoLogger) pino: PinoLogger) {
    this.pino = pino;
  }

  public setContext(name: string): void {
    this.contextName = name;
    this.pino.setContext(name);
  }

  public trace(message: string, payload?: LogObject): void {
    this.pino.trace(this.merge(payload), message);
  }
  public debug(message: string, payload?: LogObject): void {
    this.pino.debug(this.merge(payload), message);
  }
  public info(message: string, payload?: LogObject): void {
    this.pino.info(this.merge(payload), message);
  }
  public warn(message: string, payload?: LogObject): void {
    this.pino.warn(this.merge(payload), message);
  }
  public error(message: string, payload?: LogObject & { err?: Error }): void {
    this.pino.error(this.merge(payload), message);
  }
  public fatal(message: string, payload?: LogObject & { err?: Error }): void {
    this.pino.fatal(this.merge(payload), message);
  }

  /** Return a child logger pre-bound with extra fields (cheap; not a fork). */
  public child(bindings: LogObject): AppLogger {
    const child = new AppLogger(this.pino);
    child.contextName = this.contextName;
    child.pino.assign({ ...bindings });
    return child;
  }

  /**
   * Merge the active RequestContext fields into the per-call payload. Caller
   * payload wins on key collision — useful for explicit overrides (e.g. an
   * impersonation banner setting `user_id` to the impersonator's id).
   */
  private merge(payload?: LogObject): LogObject {
    const ctx = RequestContextRegistry.peek();
    if (ctx === undefined) {
      return { context: this.contextName, ...(payload ?? {}) };
    }
    return {
      context: this.contextName,
      request_id: ctx.requestId,
      trace_id: ctx.traceId,
      tenant_id: ctx.schoolId,
      user_id: ctx.userId,
      scope: ctx.actorScope,
      client_name: ctx.clientName,
      client_version: ctx.clientVersion,
      route: ctx.route,
      ...(payload ?? {}),
    };
  }
}
