import { Module } from '@nestjs/common';

import { OutboxEventController } from './outbox-event/outbox-event.controller';
import { OutboxEventService } from './outbox-event/outbox-event.service';
import { OutboxPermissionsSeeder } from './outbox-permissions.seeder';
import { OutboxRepository } from './repositories/outbox.repository';
import { OutboxDispatcherService } from './services/outbox-dispatcher.service';
import { OutboxHandlerRegistry } from './services/outbox-handler.registry';
import { OutboxPublisherService } from './services/outbox-publisher.service';

@Module({
  controllers: [OutboxEventController],
  providers: [
    OutboxRepository,
    OutboxHandlerRegistry,
    OutboxPublisherService,
    OutboxDispatcherService,
    OutboxEventService,
    OutboxPermissionsSeeder,
  ],
  exports: [OutboxPublisherService, OutboxHandlerRegistry, OutboxDispatcherService],
})
export class OutboxModule {}
