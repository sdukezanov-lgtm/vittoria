import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Env } from '../../config/env.schema';
import { FcmTokenService } from './fcm-token.service';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

interface FcmSendResponse {
  name: string;
}

@Injectable()
export class FcmPushProvider implements PushProvider {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: FcmTokenService,
  ) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    if (message.platform !== 'android') {
      throw new Error('FcmPushProvider handles Android only');
    }

    const projectId = this.config.get('FCM_PROJECT_ID', { infer: true });
    const accessToken = await this.tokenService.getAccessToken();

    const fcmMessage: {
      token: string;
      notification: { title: string; body: string };
      data?: Record<string, string>;
    } = {
      token: message.token,
      notification: { title: message.title, body: message.body },
    };
    if (message.data && Object.keys(message.data).length > 0) {
      fcmMessage.data = message.data;
    }

    const res = await axios.post<FcmSendResponse>(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      { message: fcmMessage },
      {
        timeout: 10_000,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      },
    );

    return { providerMessageId: res.data.name };
  }
}
