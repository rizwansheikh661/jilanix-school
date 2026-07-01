/**
 * Pino options factory. Builds the `Params` consumed by `nestjs-pino`'s
 * `LoggerModule.forRootAsync(...)` from the validated `ConfigService`
 * snapshot.
 *
 * The factory does three things that matter for production hygiene:
 *
 *   1. **Pretty vs structured** — In dev (`LOG_PRETTY=true`) we pipe to
 *      `pino-pretty` for human-readable single-line output. In every other
 *      environment we emit one JSON object per line so log shippers (Loki,
 *      Vector, CloudWatch) can index fields. EnvSchema enforces
 *      `LOG_PRETTY=false` in production.
 *
 *   2. **Snake_case canonical keys** — BACKEND_ARCHITECTURE §10.1 mandates
 *      `request_id`, `tenant_id`, `user_id`, `route`, `latency_ms`, etc.
 *      Camel-case at the TS edge would force every consumer (Grafana,
 *      Loki labels) to know two names. We use pino's `formatters.log` to
 *      transform on the way out.
 *
 *   3. **Per-request log binding** — pino-http reads `req.id` (set by the
 *      correlation middleware) and adds it to every log line emitted via
 *      `req.log.*`. Our `LoggerService.fromContext()` re-binds the same id
 *      from AsyncLocalStorage for code that has no `req`.
 *
 * Quiet paths (probes, /metrics) are excluded from the per-request access
 * log to keep the signal-to-noise ratio sane.
 */
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ConfigService } from '../config';
import {
  CLIENT_NAME_HEADER,
  CLIENT_VERSION_HEADER,
  REQUEST_ID_HEADER,
  REQUEST_ID_HEADER_OUT,
  normaliseRequestId,
} from './correlation';
import { PINO_REDACT_CENSOR, PINO_REDACT_PATHS } from './redaction';

interface RequestWithId extends IncomingMessage {
  id: string;
}

function buildExcludeMatcher(paths: readonly string[]): (path: string) => boolean {
  if (paths.length === 0) {
    return () => false;
  }
  const set = new Set(paths.map((p) => (p.startsWith('/') ? p : `/${p}`)));
  return (path: string) => set.has(path);
}

function asInfoSampler(rate: number): (level: number) => boolean {
  // Pino default level numbers: trace=10 debug=20 info=30 warn=40 error=50 fatal=60.
  // We sample only the info band — error+ is always 100%.
  if (rate >= 1) {
    return () => true;
  }
  if (rate <= 0) {
    return (level) => level >= 40;
  }
  return (level) => {
    if (level >= 40) {
      return true;
    }
    if (level >= 30) {
      return Math.random() < rate;
    }
    return true;
  };
}

export function buildPinoParams(config: ConfigService): Params {
  const { logger: log, app } = config;
  const isExcluded = buildExcludeMatcher(log.httpExcludePaths);
  const shouldEmitInfo = asInfoSampler(log.sampleRateInfo);

  const baseBindings = log.baseBindings
    ? {
        service: app.name,
        env: app.env,
        version: app.version,
        commit: app.build.commit,
      }
    : {};

  return {
    pinoHttp: {
      level: log.level,
      base: baseBindings,
      messageKey: 'msg',
      timestamp: () => `,"ts":"${new Date().toISOString()}"`,
      // Stable, canonical log keys — see BACKEND_ARCHITECTURE §10.1.
      formatters: {
        level: (label) => ({ level: label }),
      },
      redact: log.redactSecrets
        ? {
            paths: [...PINO_REDACT_PATHS],
            censor: PINO_REDACT_CENSOR,
            remove: false,
          }
        : undefined,

      // ----- Per-request id -----
      genReqId: (req: IncomingMessage, res: ServerResponse): string => {
        const headerVal = req.headers[REQUEST_ID_HEADER];
        const id = normaliseRequestId(
          Array.isArray(headerVal) ? headerVal[0] : headerVal,
        );
        (req as RequestWithId).id = id;
        // Echo back so the client can include it in any bug report.
        if (!res.headersSent) {
          res.setHeader(REQUEST_ID_HEADER_OUT, id);
        }
        return id;
      },

      // ----- Per-request custom props (lifted onto every log line) -----
      customProps: (req) => {
        const clientName = req.headers[CLIENT_NAME_HEADER];
        const clientVersion = req.headers[CLIENT_VERSION_HEADER];
        return {
          request_id: (req as RequestWithId).id,
          client_name: Array.isArray(clientName) ? clientName[0] : clientName,
          client_version: Array.isArray(clientVersion)
            ? clientVersion[0]
            : clientVersion,
        };
      },

      // ----- Quiet paths -----
      autoLogging: {
        ignore: (req) => isExcluded(req.url?.split('?')[0] ?? ''),
      },

      // ----- Serializers — keep payloads small and PII-free -----
      serializers: {
        req: (req: IncomingMessage & { id?: string; url?: string; method?: string }) => ({
          id: req.id,
          method: req.method,
          // Strip query string from `route` to avoid PII in URLs. The full
          // path is still available on the per-line `req.url` if needed.
          route: req.url?.split('?')[0],
        }),
        res: (res: ServerResponse) => ({
          status: res.statusCode,
        }),
        err: (err: Error & { code?: string; statusCode?: number }) => ({
          type: err.name,
          code: err.code,
          status: err.statusCode,
          msg: err.message,
          // Stack is the only large field we keep — useful and we want it.
          stack: err.stack,
        }),
      },

      // ----- Custom levels per response -----
      customLogLevel: (_req, res, err) => {
        if (err) {
          return 'error';
        }
        const status = res.statusCode;
        if (status >= 500) {
          return 'error';
        }
        if (status >= 400) {
          return 'warn';
        }
        return 'info';
      },

      customSuccessMessage: (req, res) =>
        `${req.method ?? '?'} ${(req as RequestWithId).id ?? '-'} ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method ?? '?'} ${(req as RequestWithId).id ?? '-'} ${res.statusCode} ${err.message}`,

      // ----- Sampling — drop a fraction of read-only info logs -----
      hooks: {
        logMethod(args, method, level) {
          if (shouldEmitInfo(level)) {
            return method.apply(this, args);
          }
          return undefined;
        },
      },

      // ----- Transport -----
      transport: log.pretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,service,env,version,commit',
              messageFormat: '{request_id} {msg}',
            },
          }
        : undefined,
    },
  };
}
