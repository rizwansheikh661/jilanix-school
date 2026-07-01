/**
 * Email channel adapter (Sprint N1 — transport landing).
 *
 * The providerCode stays `ses` because the existing
 * `CommunicationChannelRegistry` registers the first EMAIL adapter as the
 * default for that channel and downstream feature flags / template rows
 * already key off `ses`. The adapter itself is now provider-agnostic — it
 * delegates to `EmailTransportService`, which speaks SMTP. In dev that's
 * Mailpit on :1025; in prod it can be SES SMTP, SendGrid SMTP, or any
 * transactional provider exposing SMTP. Swapping providers is an
 * env-only change.
 */
import { Injectable } from '@nestjs/common';

import type {
  ChannelSendInput,
  ChannelSendResult,
  CommunicationChannelAdapter,
} from '../communication-channel.port';
import { CommunicationChannelRegistry } from '../communication-channel.registry';
import { EmailTransportService } from '../email-transport.service';

@Injectable()
export class SesAdapter implements CommunicationChannelAdapter {
  public readonly channel = 'EMAIL' as const;
  public readonly providerCode = 'ses' as const;

  constructor(
    registry: CommunicationChannelRegistry,
    private readonly transport: EmailTransportService,
  ) {
    registry.register(this);
  }

  public async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    // The dispatcher writes `subjectRendered` and `bodyRendered`; EMAIL must
    // have a non-null subject (enforced by `renderTemplateForChannel`).
    const subject = input.subject ?? '';
    const result = await this.transport.send({
      to: input.recipientAddress,
      subject,
      text: input.bodyText,
      html: input.bodyHtml,
      headers: input.metadata?.['messageId']
        ? { 'X-SchoolOS-Message-Id': String(input.metadata['messageId']) }
        : undefined,
    });
    return {
      providerMessageId: result.messageId,
      providerStatus: 'SENT',
      providerCode: this.providerCode,
    };
  }
}
