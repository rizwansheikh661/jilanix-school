/**
 * PermissionRepository — read/write paths for the `permissions` catalog.
 *
 * The catalog is small, static-ish, and seeded by code. We expose just
 * enough surface for the seeder and for an admin "what permissions exist?"
 * query. There is no `update` — permissions are immutable identifiers; if
 * a permission's meaning changes you mint a new key and migrate the grants.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma';
import type { PrismaTx } from '../../../infra/prisma/types';
import type { PermissionRow } from '../rbac.types';

export interface UpsertPermissionInput {
  readonly key: string;
  readonly resource: string;
  readonly action: string;
  readonly description?: string;
}

@Injectable()
export class PermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private resolve(tx?: PrismaTx): PrismaTx {
    return tx ?? (this.prisma.client as unknown as PrismaTx);
  }

  public async findByKey(key: string, tx?: PrismaTx): Promise<PermissionRow | null> {
    const reader = this.resolve(tx);
    const row = await reader.permission.findUnique({ where: { key } });
    return row === null ? null : mapPermission(row);
  }

  public async listAll(filter: { resource?: string } = {}): Promise<readonly PermissionRow[]> {
    const where = filter.resource === undefined ? {} : { resource: filter.resource };
    const reader = this.resolve();
    const rows = await reader.permission.findMany({
      where,
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
    return rows.map(mapPermission);
  }

  /**
   * Used by the seeder. Idempotent: re-running with the same input is a
   * no-op (description updates land, but `key` is the identity).
   */
  public async upsert(input: UpsertPermissionInput, tx?: PrismaTx): Promise<PermissionRow> {
    const writer = this.resolve(tx);
    const row = await writer.permission.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        resource: input.resource,
        action: input.action,
        description: input.description ?? null,
      },
      update: {
        resource: input.resource,
        action: input.action,
        description: input.description ?? null,
      },
    });
    return mapPermission(row);
  }
}

function mapPermission(row: {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
}): PermissionRow {
  return {
    id: row.id,
    key: row.key,
    resource: row.resource,
    action: row.action,
    description: row.description,
  };
}
