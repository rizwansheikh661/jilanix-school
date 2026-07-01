/**
 * CommunicationChannelPort — abstraction for outbound communication
 * adapters (Email/SMS/WhatsApp/In-App).
 *
 * Adapters (SES/SendGrid/MSG91/Twilio/WABA/InApp) implement this port and
 * self-register in CommunicationChannelRegistry. In Sprint 10 the five
 * external adapters are stubs that throw CommunicationChannelNotImplementedError;
 * only the in-app adapter is functional (a no-op success path, since the
 * service layer creates the NotificationMessage row directly for IN_APP).
 */

export type ChannelCode = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP';

export type ProviderCode = 'ses' | 'sendgrid' | 'msg91' | 'twilio' | 'waba' | 'in-app';

export type ChannelSendInput = {
  readonly schoolId: string;
  readonly recipientAddress: string; // email / phone / userId
  readonly subject: string | null;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ChannelSendResult = {
  readonly providerMessageId: string | null;
  readonly providerStatus: 'SENT' | 'DELIVERED' | 'QUEUED_REMOTE';
  readonly providerCode: ProviderCode;
};

export interface CommunicationChannelAdapter {
  readonly channel: ChannelCode;
  readonly providerCode: ProviderCode;
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
  verifyWebhook?(payload: unknown, signature: string): Promise<boolean>;
}
