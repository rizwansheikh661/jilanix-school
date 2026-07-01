/**
 * LoginEventRepository — append-only audit of every login attempt /
 * refresh / logout. Drives Sprint-2 lockout policy and gives ops a
 * forensic trail for password-spray investigations.
 *
 * The `user_login_events` table is `@audit immutable` (see schema), so
 * we only ever insert. No update/delete paths exist on purpose — if you
 * find yourself wanting to "fix" an event row, you actually want to
 * insert a corrective event.
 *
 * Identifier hashing: we hash the email/username the client *attempted*
 * (sha256 hex) so failed-login telemetry can correlate attempts without
 * leaking a raw email directory if this table is later exported.
 */
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';

export type LoginEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'refresh_rotated'
  | 'refresh_reused'
  | 'session_revoked'
  | 'account_locked'
  | 'account_unlocked';

export interface LoginEventInput {
  readonly schoolId: string;
  readonly userId: string | null;
  readonly eventType: LoginEventType;
  readonly reason?: string;
  readonly identifier?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

@Injectable()
export class LoginEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async record(event: LoginEventInput, tx?: PrismaTx): Promise<void> {
    const writer = this.resolve(tx);
    await writer.userLoginEvent.create({
      data: {
        schoolId: event.schoolId,
        userId: event.userId,
        eventType: event.eventType,
        reason: event.reason ?? null,
        identifierHash:
          event.identifier === undefined ? null : hashIdentifier(event.identifier),
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  }
}

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}
