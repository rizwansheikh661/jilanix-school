import { Module } from '@nestjs/common';

import { SchoolBrandingController } from './branding/school-branding.controller';
import { SchoolBrandingResolverService } from './branding/school-branding-resolver.service';
import { SchoolBrandingService } from './branding/school-branding.service';
import { SchoolContactController } from './contact/school-contact.controller';
import { SchoolContactService } from './contact/school-contact.service';
import { SchoolDocumentController } from './document/school-document.controller';
import { SchoolDocumentService } from './document/school-document.service';
import { SchoolProfileController } from './profile/school-profile.controller';
import { SchoolProfileService } from './profile/school-profile.service';
import {
  SchoolBrandingRepository,
  SchoolContactRepository,
  SchoolDocumentRepository,
  SchoolProfileRepository,
} from './repositories/school.repositories';
import { OutboxModule } from '../outbox';
import { SchoolPermissionsSeeder } from './school-permissions.seeder';
import { SchoolRootController } from './school/school.controller';
import { SchoolRootRepository } from './school/school.repository';
import { SchoolRootService } from './school/school.service';
import { SchoolSettingsController } from './settings/school-settings.controller';
import { SchoolSettingsRepository } from './settings/school-settings.repository';
import { SchoolSettingsService } from './settings/school-settings.service';

@Module({
  imports: [OutboxModule],
  controllers: [
    SchoolRootController,
    SchoolProfileController,
    SchoolBrandingController,
    SchoolContactController,
    SchoolDocumentController,
    SchoolSettingsController,
  ],
  providers: [
    SchoolRootRepository,
    SchoolProfileRepository,
    SchoolBrandingRepository,
    SchoolContactRepository,
    SchoolDocumentRepository,
    SchoolSettingsRepository,
    SchoolRootService,
    SchoolProfileService,
    SchoolBrandingService,
    SchoolBrandingResolverService,
    SchoolContactService,
    SchoolDocumentService,
    SchoolSettingsService,
    SchoolPermissionsSeeder,
  ],
  exports: [
    SchoolRootService,
    SchoolRootRepository,
    SchoolSettingsService,
    SchoolSettingsRepository,
    SchoolProfileService,
    SchoolBrandingService,
    SchoolBrandingResolverService,
    SchoolContactService,
    SchoolDocumentService,
  ],
})
export class SchoolModule {}
