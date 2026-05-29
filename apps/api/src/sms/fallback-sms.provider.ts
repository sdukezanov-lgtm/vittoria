import { Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

/** Tries the primary provider; on failure, falls back to the secondary. */
export class FallbackSmsProvider implements SmsProvider {
  private readonly logger = new Logger(FallbackSmsProvider.name);

  constructor(
    private readonly primary: SmsProvider,
    private readonly fallback: SmsProvider,
  ) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    try {
      return await this.primary.send(message);
    } catch (err) {
      this.logger.warn(`primary SMS failed, falling back: ${(err as Error).message}`);
      return this.fallback.send(message);
    }
  }
}
