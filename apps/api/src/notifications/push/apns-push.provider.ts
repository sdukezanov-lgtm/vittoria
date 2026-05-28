import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { ApnsTokenService } from './apns-token.service';
import { ApnsHttp2Client } from './apns-http2.client';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

interface ApnsErrorBody {
  reason?: string;
}

@Injectable()
export class ApnsPushProvider implements PushProvider {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: ApnsTokenService,
    private readonly http2: ApnsHttp2Client,
  ) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    if (message.platform !== 'ios') {
      throw new Error('APNs handles iOS only');
    }

    const useSandbox = this.config.get('APNS_USE_SANDBOX', { infer: true });
    const host = useSandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const bundleId = this.config.get('APNS_BUNDLE_ID', { infer: true });
    const token = this.tokenService.getProviderToken();

    const headers: Record<string, string> = {
      authorization: `bearer ${token}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
    };

    const payload: Record<string, unknown> = {
      aps: { alert: { title: message.title, body: message.body } },
    };
    if (message.data && Object.keys(message.data).length > 0) {
      Object.assign(payload, message.data);
    }

    const res = await this.http2.post(host, message.token, headers, payload);

    if (res.status !== 200) {
      let reason = 'unknown';
      try {
        reason = (JSON.parse(res.body) as ApnsErrorBody).reason ?? 'unknown';
      } catch {
        reason = res.body || 'unknown';
      }
      throw new Error(`APNs ${res.status}: ${reason}`);
    }

    return { providerMessageId: res.apnsId ?? '' };
  }
}
