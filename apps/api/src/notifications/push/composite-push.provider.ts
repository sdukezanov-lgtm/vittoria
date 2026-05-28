import { Injectable } from '@nestjs/common';
import { FcmPushProvider } from './fcm-push.provider';
import { ApnsPushProvider } from './apns-push.provider';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

@Injectable()
export class CompositePushProvider implements PushProvider {
  constructor(
    private readonly fcm: FcmPushProvider,
    private readonly apns: ApnsPushProvider,
  ) {}

  send(message: PushMessage): Promise<PushSendResult> {
    return message.platform === 'ios' ? this.apns.send(message) : this.fcm.send(message);
  }
}
