import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Env } from '../config/env.schema';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

interface SmsRuResponse {
  status?: string;
  status_code?: number;
  status_text?: string;
  sms?: Record<string, { status?: string; sms_id?: string }>;
}

@Injectable()
export class SmsRuProvider implements SmsProvider {
  private readonly logger = new Logger(SmsRuProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const baseUrl = this.config.get('SMS_RU_BASE_URL', { infer: true }).replace(/\/$/, '');
    const params = new URLSearchParams();
    params.set('api_id', this.config.get('SMS_RU_API_ID', { infer: true }));
    params.set('to', message.to);
    params.set('msg', message.text);
    params.set('json', '1');

    const res = await axios.post<SmsRuResponse>(`${baseUrl}/sms/send`, params, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = res.data;
    if (data.status !== 'OK') {
      this.logger.warn(`SMS.ru send failed: status_code=${data.status_code}`);
      throw new Error(`SMS.ru error ${data.status_code}: ${data.status_text ?? 'unknown'}`);
    }
    const first = data.sms ? Object.values(data.sms)[0] : undefined;
    return { providerMessageId: first?.sms_id ?? 'smsru-unknown' };
  }
}
