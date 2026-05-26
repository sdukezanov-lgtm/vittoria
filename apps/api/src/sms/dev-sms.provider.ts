import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

@Injectable()
export class DevSmsProvider implements SmsProvider {
  private readonly logger = new Logger(DevSmsProvider.name);

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const id = `dev-${randomUUID()}`;
    this.logger.log(`[DEV-SMS] to=${message.to} text="${message.text}" providerMessageId=${id}`);
    return { providerMessageId: id };
  }
}
