/**
 * WABA (WhatsApp Business API) adapter — Sprint 10 stub. `send` throws
 * CommunicationChannelNotImplementedError. Self-registers in the registry.
 */
import { Injectable } from '@nestjs/common';

import { CommunicationChannelNotImplementedError } from '../../notifications.errors';
import type {
  ChannelSendInput,
  ChannelSendResult,
  CommunicationChannelAdapter,
} from '../communication-channel.port';
import { CommunicationChannelRegistry } from '../communication-channel.registry';

@Injectable()
export class WabaAdapter implements CommunicationChannelAdapter {
  public readonly channel = 'WHATSAPP' as const;
  public readonly providerCode = 'waba' as const;

  constructor(registry: CommunicationChannelRegistry) {
    registry.register(this);
  }

  public send(_input: ChannelSendInput): Promise<ChannelSendResult> {
    throw new CommunicationChannelNotImplementedError(this.providerCode);
  }
}
