/**
 * CommunicationChannelRegistry — runtime lookup for CommunicationChannelAdapter
 * instances.
 *
 * Adapters self-register in their constructor (canonical NestJS plugin pattern,
 * since Nest instantiates all providers on boot). `resolve` enforces the
 * per-tenant channel + provider feature flags before returning the adapter so
 * disabled channels/providers cannot be used even if their adapter is wired in.
 *
 * Entitlement enforcement is NOT done here — it happens at the message-creation
 * layer in a later wave. This registry only does code-side flag gating.
 */
import { Injectable, Logger } from '@nestjs/common';

import { FeatureFlagService } from '../../feature-flag/services/feature-flag.service';
import { CommunicationChannelDisabledError } from '../notifications.errors';

import type {
  ChannelCode,
  CommunicationChannelAdapter,
  ProviderCode,
} from './communication-channel.port';

type AdapterKey = `${ChannelCode}:${ProviderCode}`;

export interface RegisteredAdapterDescriptor {
  readonly channel: ChannelCode;
  readonly providerCode: ProviderCode;
  readonly isDefault: boolean;
}

@Injectable()
export class CommunicationChannelRegistry {
  private readonly logger = new Logger(CommunicationChannelRegistry.name);
  private readonly adapters = new Map<AdapterKey, CommunicationChannelAdapter>();
  private readonly defaults = new Map<ChannelCode, ProviderCode>();

  constructor(private readonly featureFlags: FeatureFlagService) {}

  /** Idempotent registration; first adapter per channel becomes the default. */
  public register(adapter: CommunicationChannelAdapter): void {
    const key = this.keyFor(adapter.channel, adapter.providerCode);
    if (this.adapters.has(key)) {
      return;
    }
    this.adapters.set(key, adapter);
    if (!this.defaults.has(adapter.channel)) {
      this.defaults.set(adapter.channel, adapter.providerCode);
    }
    this.logger.debug(
      `Registered communication adapter ${adapter.channel}:${adapter.providerCode}` +
        (this.defaults.get(adapter.channel) === adapter.providerCode ? ' (default)' : ''),
    );
  }

  /** Explicit override of the default provider for a channel. */
  public setDefault(channel: ChannelCode, providerCode: ProviderCode): void {
    const key = this.keyFor(channel, providerCode);
    if (!this.adapters.has(key)) {
      throw new CommunicationChannelDisabledError({
        channel,
        reason: 'ADAPTER_NOT_REGISTERED',
      });
    }
    this.defaults.set(channel, providerCode);
  }

  /** Default provider for a channel — throws if no adapter registered. */
  public getDefaultProvider(channel: ChannelCode): ProviderCode {
    const provider = this.defaults.get(channel);
    if (provider === undefined) {
      throw new CommunicationChannelDisabledError({
        channel,
        reason: 'ADAPTER_NOT_REGISTERED',
      });
    }
    return provider;
  }

  /** Enumerate all registered adapters — for the admin listing endpoint. */
  public listRegistered(): readonly RegisteredAdapterDescriptor[] {
    const items: RegisteredAdapterDescriptor[] = [];
    for (const adapter of this.adapters.values()) {
      items.push({
        channel: adapter.channel,
        providerCode: adapter.providerCode,
        isDefault: this.defaults.get(adapter.channel) === adapter.providerCode,
      });
    }
    return items;
  }

  /**
   * Resolve an adapter for the given channel + (optional) provider, gating
   * on the per-tenant channel flag and (for non-IN_APP) the provider flag.
   */
  public async resolve(
    channel: ChannelCode,
    providerCode: ProviderCode | undefined,
    ctx: { schoolId: string },
  ): Promise<CommunicationChannelAdapter> {
    const resolvedProvider = providerCode ?? this.getDefaultProvider(channel);

    // Gate 1: channel flag (`comms.channel.<channel>`).
    const channelFlagKey = `comms.channel.${channel.toLowerCase()}`;
    const channelEnabled = await this.featureFlags.isEnabled(channelFlagKey, {
      schoolId: ctx.schoolId,
    });
    if (!channelEnabled) {
      this.logger.warn(
        `Channel ${channel} disabled for school ${ctx.schoolId} (flag ${channelFlagKey} off)`,
      );
      throw new CommunicationChannelDisabledError({
        channel,
        reason: 'CHANNEL_FLAG_DISABLED',
      });
    }

    // Gate 2: provider flag (`comms.provider.<provider>`) — IN_APP skips.
    if (channel !== 'IN_APP') {
      const providerFlagKey = `comms.provider.${resolvedProvider}`;
      const providerEnabled = await this.featureFlags.isEnabled(providerFlagKey, {
        schoolId: ctx.schoolId,
      });
      if (!providerEnabled) {
        this.logger.warn(
          `Provider ${resolvedProvider} disabled for school ${ctx.schoolId} (flag ${providerFlagKey} off)`,
        );
        throw new CommunicationChannelDisabledError({
          channel,
          reason: 'PROVIDER_FLAG_DISABLED',
        });
      }
    }

    const adapter = this.adapters.get(this.keyFor(channel, resolvedProvider));
    if (adapter === undefined) {
      this.logger.warn(
        `No adapter registered for ${channel}:${resolvedProvider}`,
      );
      throw new CommunicationChannelDisabledError({
        channel,
        reason: 'ADAPTER_NOT_REGISTERED',
      });
    }
    return adapter;
  }

  private keyFor(channel: ChannelCode, providerCode: ProviderCode): AdapterKey {
    return `${channel}:${providerCode}`;
  }
}
