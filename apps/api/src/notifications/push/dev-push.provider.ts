import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

@Injectable()
export class DevPushProvider implements PushProvider {
  private readonly logger = new Logger(DevPushProvider.name);

  async send(message: PushMessage): Promise<PushSendResult> {
    const id = `dev-push-${randomUUID()}`;
    this.logger.log(
      `[DEV-PUSH] platform=${message.platform} token=${message.token.slice(0, 8)}... title="${message.title}" body="${message.body}" id=${id}`,
    );
    return { providerMessageId: id };
  }
}
