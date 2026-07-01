/**
 * AuditServiceBridge — module-static handle that the Prisma `auditExt`
 * extension uses to push captured intents into the AuditRecorder buffer.
 *
 * Why a bridge instead of importing AuditService directly?
 *   Prisma extensions are constructed at PrismaService instantiation time,
 *   before AuditModule has wired its providers. They cannot use Nest DI.
 *   The bridge lets AuditModule "publish" itself at boot, after which the
 *   extension calls into a stable function reference.
 *
 * Sprint 1: the extension only buffers intents — it does NOT write rows.
 * The bridge therefore exposes a `push(intent)` method that goes straight
 * into `AuditRecorder`. When the audit interceptor / transactional flush
 * lands, the bridge will additionally expose a `flush(tx)` hook.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuditRecorder } from './audit.recorder';
import type { AuditIntent } from './audit.types';

let publishedPush: ((intent: AuditIntent) => void) | undefined;

export function auditBridgePush(intent: AuditIntent): void {
  if (publishedPush !== undefined) {
    publishedPush(intent);
  }
}

export function auditBridgeIsBound(): boolean {
  return publishedPush !== undefined;
}

/** Test helper — reset the bridge between tests so leftovers don't bleed. */
export function __resetAuditBridge(): void {
  publishedPush = undefined;
}

@Injectable()
export class AuditServiceBridge implements OnModuleInit {
  public onModuleInit(): void {
    publishedPush = (intent) => AuditRecorder.push(intent);
  }
}
