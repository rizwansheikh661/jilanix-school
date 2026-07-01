/**
 * InApp adapter — the only real adapter in Sprint 10.
 *
 * In-app messages are delivered by the act of creating the NotificationMessage
 * row (the dispatcher won't call this adapter for IN_APP — service layer
 * creates the message with status=DELIVERED directly). This implementation
 * is a no-op success path so a defensive call site never throws.
 */
import { Injectable } from '@nestjs/common';

import type {
  ChannelSendInput,
  ChannelSendResult,
  CommunicationChannelAdapter,
} from '../communication-channel.port';
import { CommunicationChannelRegistry } from '../communication-channel.registry';

@Injectable()
export class InAppAdapter implements CommunicationChannelAdapter {
  public readonly channel = 'IN_APP' as const;
  public readonly providerCode = 'in-app' as const;

  constructor(registry: CommunicationChannelRegistry) {
    registry.register(this);
  }

  public async send(_input: ChannelSendInput): Promise<ChannelSendResult> {
    return {
      providerMessageId: null,
      providerStatus: 'DELIVERED',
      providerCode: this.providerCode,
    };
  }
}
