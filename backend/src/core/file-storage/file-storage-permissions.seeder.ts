import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PermissionRepository } from '../rbac/repositories/permission.repository';
import {
  FILE_STORAGE_PERMISSION_DESCRIPTIONS,
  FileStoragePermissions,
} from './file-storage.constants';

@Injectable()
export class FileStoragePermissionsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(FileStoragePermissionsSeeder.name);

  constructor(private readonly permissionsRepo: PermissionRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seed();
    } catch (err) {
      this.logger.error(
        `File-storage permission seed failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async seed(): Promise<void> {
    const keys = Object.values(FileStoragePermissions);
    for (const key of keys) {
      const [resource, ...rest] = key.split('.');
      const action = rest.join('.');
      if (resource === undefined || action === '') {
        this.logger.warn(`malformed file-storage permission key "${key}" — skipped.`);
        continue;
      }
      await this.permissionsRepo.upsert({
        key,
        resource,
        action,
        description: FILE_STORAGE_PERMISSION_DESCRIPTIONS[key],
      });
    }
    this.logger.log(`File-storage permissions seeded: ${keys.length} keys.`);
  }
}
