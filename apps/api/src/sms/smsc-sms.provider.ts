import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Env } from '../config/env.schema';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

interface SmscResponse {
  id?: number;
  cnt?: number;
  error?: string;
  error_code?: number;
}

@Injectable()
export class SmscSmsProvider implements SmsProvider {
  private readonly logger = new Logger(SmscSmsProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const baseUrl = this.config.get('SMSC_BASE_URL', { infer: true }).replace(/\/$/, '');
    const sender = this.config.get('SMSC_SENDER', { infer: true });

    const params = new URLSearchParams();
    params.set('login', this.config.get('SMSC_LOGIN', { infer: true }));
    params.set('psw', this.config.get('SMSC_PASSWORD', { infer: true }));
    params.set('phones', message.to);
    params.set('mes', message.text);
    params.set('fmt', '3');
    params.set('charset', 'utf-8');
    if (sender) params.set('sender', sender);

    const res = await axios.post<SmscResponse>(`${baseUrl}/sys/send.php`, params, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = res.data;
    if (data.error || data.error_code) {
      this.logger.warn(`SMSC send failed: error_code=${data.error_code}`);
      throw new Error(`SMSC error ${data.error_code}: ${data.error ?? 'unknown'}`);
    }
    if (data.id == null) {
      throw new Error('SMSC response missing id');
    }

    return { providerMessageId: String(data.id) };
  }
}
