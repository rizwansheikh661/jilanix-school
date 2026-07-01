import { Module } from '@nestjs/common';

import { SubscriptionModule } from '../subscription';
import { FileAssetController } from './file-asset/file-asset.controller';
import { FileAssetService } from './file-asset/file-asset.service';
import { FileStoragePermissionsSeeder } from './file-storage-permissions.seeder';
import { StorageProviderProvider } from './providers/storage-provider.factory';
import { FileAclGrantRepository } from './repositories/file-acl-grant.repository';
import { FileAssetRepository } from './repositories/file-asset.repository';

@Module({
  imports: [SubscriptionModule],
  controllers: [FileAssetController],
  providers: [
    StorageProviderProvider,
    FileAssetRepository,
    FileAclGrantRepository,
    FileAssetService,
    FileStoragePermissionsSeeder,
  ],
  exports: [FileAssetService, StorageProviderProvider],
})
export class FileStorageModule {}
