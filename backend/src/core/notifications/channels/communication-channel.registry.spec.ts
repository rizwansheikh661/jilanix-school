/**
 * CommunicationChannelRegistry unit spec — verifies adapter
 * registration/listing, default-provider tracking, and the two-stage flag
 * gating (channel flag first, then provider flag for non-IN_APP) on
 * `resolve`. Also covers the Sprint 10 stub adapters: each self-registers
 * via the constructor and throws CommunicationChannelNotImplementedError
 * from `send()`.
 */
import { InAppAdapter } from './adapters/in-app.adapter';
import { Msg91Adapter } from './adapters/msg91.adapter';
import { SendgridAdapter } from './adapters/sendgrid.adapter';
import { SesAdapter } from './adapters/ses.adapter';
import { TwilioAdapter } from './adapters/twilio.adapter';
import { WabaAdapter } from './adapters/waba.adapter';
import type {
  ChannelSendInput,
  ChannelSendResult,
  CommunicationChannelAdapter,
} from './communication-channel.port';
import { CommunicationChannelRegistry } from './communication-channel.registry';
import {
  CommunicationChannelDisabledError,
  CommunicationChannelNotImplementedError,
} from '../notifications.errors';

const SCHOOL = 'school-1';

/** A `FeatureFlagService` stub whose `isEnabled` resolution is keyed off
 * an in-memory map. Keys not present default to `true` so tests only need
 * to opt out specific flags. */
function makeFlags(overrides: Record<string, boolean> = {}) {
  return {
    isEnabled: jest.fn(async (key: string) => {
      if (key in overrides) return overrides[key]!;
      return true;
    }),
  };
}

function makeAdapter(
  channel: CommunicationChannelAdapter['channel'],
  providerCode: CommunicationChannelAdapter['providerCode'],
  send?: (i: ChannelSendInput) => Promise<ChannelSendResult>,
): CommunicationChannelAdapter {
  return {
    channel,
    providerCode,
    send:
      send ??
      (async () => ({
        providerCode,
        providerMessageId: null,
        providerStatus: 'DELIVERED',
      })),
  };
}

describe('CommunicationChannelRegistry.register / listRegistered', () => {
  it('lists adapters that have been registered, marking the first per channel as default', () => {
    const flags = makeFlags();
    const reg = new CommunicationChannelRegistry(flags as never);

    const ses = makeAdapter('EMAIL', 'ses');
    const sendgrid = makeAdapter('EMAIL', 'sendgrid');
    reg.register(ses);
    reg.register(sendgrid);

    const list = reg.listRegistered();
    expect(list).toEqual(
      expect.arrayContaining([
        { channel: 'EMAIL', providerCode: 'ses', isDefault: true },
        { channel: 'EMAIL', providerCode: 'sendgrid', isDefault: false },
      ]),
    );
    expect(list).toHaveLength(2);
  });

  it('register is idempotent — registering the same channel:provider twice does not duplicate', () => {
    const reg = new CommunicationChannelRegistry(makeFlags() as never);
    const ses = makeAdapter('EMAIL', 'ses');
    reg.register(ses);
    reg.register(ses);
    expect(reg.listRegistered()).toHaveLength(1);
  });
});

describe('CommunicationChannelRegistry.resolve', () => {
  it('returns the in-app adapter when comms.channel.in_app flag is on (no provider flag check for IN_APP)', async () => {
    const flags = makeFlags();
    const reg = new CommunicationChannelRegistry(flags as never);
    const inApp = makeAdapter('IN_APP', 'in-app');
    reg.register(inApp);

    const resolved = await reg.resolve('IN_APP', 'in-app', { schoolId: SCHOOL });
    expect(resolved).toBe(inApp);
    // Only the channel flag should have been consulted.
    const lookups = flags.isEnabled.mock.calls.map((c) => c[0]);
    expect(lookups).toContain('comms.channel.in_app');
    expect(lookups).not.toContain('comms.provider.in-app');
  });

  it('throws CommunicationChannelDisabledError(CHANNEL_FLAG_DISABLED) when comms.channel.email is off', async () => {
    const flags = makeFlags({ 'comms.channel.email': false });
    const reg = new CommunicationChannelRegistry(flags as never);
    reg.register(makeAdapter('EMAIL', 'ses'));

    await expect(reg.resolve('EMAIL', 'ses', { schoolId: SCHOOL })).rejects.toMatchObject({
      message: expect.stringContaining('EMAIL'),
      details: expect.objectContaining({
        reason: 'CHANNEL_DISABLED',
        gate: 'CHANNEL_FLAG_DISABLED',
        channel: 'EMAIL',
      }),
    });
    await expect(
      reg.resolve('EMAIL', 'ses', { schoolId: SCHOOL }),
    ).rejects.toBeInstanceOf(CommunicationChannelDisabledError);
  });

  it('throws CommunicationChannelDisabledError(PROVIDER_FLAG_DISABLED) when comms.provider.ses is off but channel flag on', async () => {
    const flags = makeFlags({
      'comms.channel.email': true,
      'comms.provider.ses': false,
    });
    const reg = new CommunicationChannelRegistry(flags as never);
    reg.register(makeAdapter('EMAIL', 'ses'));

    await expect(
      reg.resolve('EMAIL', 'ses', { schoolId: SCHOOL }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        gate: 'PROVIDER_FLAG_DISABLED',
        channel: 'EMAIL',
      }),
    });
  });

  it('returns the adapter when both channel + provider flags are on', async () => {
    const flags = makeFlags({
      'comms.channel.email': true,
      'comms.provider.ses': true,
    });
    const reg = new CommunicationChannelRegistry(flags as never);
    const ses = makeAdapter('EMAIL', 'ses');
    reg.register(ses);

    await expect(
      reg.resolve('EMAIL', 'ses', { schoolId: SCHOOL }),
    ).resolves.toBe(ses);
  });

  it('throws CommunicationChannelDisabledError(ADAPTER_NOT_REGISTERED) when no waba adapter is registered', async () => {
    const flags = makeFlags();
    const reg = new CommunicationChannelRegistry(flags as never);
    // No adapter registered for WHATSAPP at all -> the default lookup throws.
    await expect(
      reg.resolve('WHATSAPP', 'waba', { schoolId: SCHOOL }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        gate: 'ADAPTER_NOT_REGISTERED',
        channel: 'WHATSAPP',
      }),
    });
  });
});

describe('CommunicationChannelRegistry.setDefault / getDefaultProvider', () => {
  it('setDefault overrides the default and getDefaultProvider returns it', () => {
    const reg = new CommunicationChannelRegistry(makeFlags() as never);
    reg.register(makeAdapter('EMAIL', 'ses'));
    reg.register(makeAdapter('EMAIL', 'sendgrid'));

    expect(reg.getDefaultProvider('EMAIL')).toBe('ses');
    reg.setDefault('EMAIL', 'sendgrid');
    expect(reg.getDefaultProvider('EMAIL')).toBe('sendgrid');

    const flagged = reg.listRegistered().find((d) => d.providerCode === 'sendgrid');
    expect(flagged?.isDefault).toBe(true);
  });

  it('setDefault throws when targeting an unregistered provider', () => {
    const reg = new CommunicationChannelRegistry(makeFlags() as never);
    expect(() => reg.setDefault('EMAIL', 'sendgrid')).toThrow(
      CommunicationChannelDisabledError,
    );
  });

  it('getDefaultProvider throws when channel has no registered adapters', () => {
    const reg = new CommunicationChannelRegistry(makeFlags() as never);
    expect(() => reg.getDefaultProvider('SMS')).toThrow(
      CommunicationChannelDisabledError,
    );
  });
});

describe('CommunicationChannel adapters (Sprint 10 stubs + in-app)', () => {
  it('InAppAdapter.send returns {providerCode:"in-app", providerStatus:"DELIVERED", providerMessageId:null}', async () => {
    const reg = new CommunicationChannelRegistry(makeFlags() as never);
    const adapter = new InAppAdapter(reg);
    const result = await adapter.send({
      schoolId: SCHOOL,
      recipientAddress: 'user-1',
      subject: null,
      bodyText: 'hi',
      bodyHtml: null,
    });
    expect(result).toEqual({
      providerCode: 'in-app',
      providerStatus: 'DELIVERED',
      providerMessageId: null,
    });
  });

  it('InAppAdapter self-registers in the registry on construction', () => {
    const reg = new CommunicationChannelRegistry(makeFlags() as never);
    new InAppAdapter(reg);
    expect(reg.listRegistered()).toContainEqual({
      channel: 'IN_APP',
      providerCode: 'in-app',
      isDefault: true,
    });
  });

  const stubCases: Array<{
    label: string;
    factory: (reg: CommunicationChannelRegistry) => CommunicationChannelAdapter;
    channel: CommunicationChannelAdapter['channel'];
    providerCode: CommunicationChannelAdapter['providerCode'];
  }> = [
    { label: 'SesAdapter', factory: (r) => new SesAdapter(r), channel: 'EMAIL', providerCode: 'ses' },
    { label: 'SendgridAdapter', factory: (r) => new SendgridAdapter(r), channel: 'EMAIL', providerCode: 'sendgrid' },
    { label: 'Msg91Adapter', factory: (r) => new Msg91Adapter(r), channel: 'SMS', providerCode: 'msg91' },
    { label: 'TwilioAdapter', factory: (r) => new TwilioAdapter(r), channel: 'SMS', providerCode: 'twilio' },
    { label: 'WabaAdapter', factory: (r) => new WabaAdapter(r), channel: 'WHATSAPP', providerCode: 'waba' },
  ];

  it.each(stubCases)(
    '$label self-registers and send() throws CommunicationChannelNotImplementedError($providerCode)',
    async ({ factory, channel, providerCode }) => {
      const reg = new CommunicationChannelRegistry(makeFlags() as never);
      const adapter = factory(reg);
      expect(reg.listRegistered()).toContainEqual(
        expect.objectContaining({ channel, providerCode }),
      );
      const input: ChannelSendInput = {
        schoolId: SCHOOL,
        recipientAddress: 'x',
        subject: null,
        bodyText: 'hi',
        bodyHtml: null,
      };
      try {
        await adapter.send(input);
        fail('expected CommunicationChannelNotImplementedError');
      } catch (err) {
        expect(err).toBeInstanceOf(CommunicationChannelNotImplementedError);
        expect((err as CommunicationChannelNotImplementedError).message).toContain(
          providerCode,
        );
      }
    },
  );
});
