import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

export interface AmoFieldIds {
  stage: number;
  progress: number;
  adminComment: number;
  prepayment: number;
  partnerUserId: number;
  partnerServices: number;
}

@Injectable()
export class AmocrmConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get baseUrl(): string {
    return this.config.get('AMOCRM_BASE_URL', { infer: true });
  }

  get accessToken(): string {
    return this.config.get('AMOCRM_ACCESS_TOKEN', { infer: true });
  }

  get webhookSecret(): string {
    return this.config.get('AMOCRM_WEBHOOK_SECRET', { infer: true });
  }

  get webhookIpAllowlist(): string[] {
    const raw = this.config.get('AMOCRM_WEBHOOK_IP_ALLOWLIST', { infer: true });
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  get mode(): 'mock' | 'http' {
    return this.config.get('AMOCRM_CLIENT_MODE', { infer: true });
  }

  get failsafeCron(): string {
    return this.config.get('AMOCRM_FAILSAFE_CRON', { infer: true });
  }

  get pipelineId(): number {
    return this.config.get('AMOCRM_PIPELINE_ID', { infer: true });
  }

  get statusToStage(): Map<number, string> {
    try {
      const raw = this.config.get('AMOCRM_STATUS_STAGE_MAP', { infer: true });
      const obj = JSON.parse(raw) as Record<string, string>;
      return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
    } catch {
      return new Map();
    }
  }

  get fieldIds(): AmoFieldIds {
    return {
      stage: this.config.get('AMOCRM_FIELD_STAGE_ID', { infer: true }),
      progress: this.config.get('AMOCRM_FIELD_PROGRESS_ID', { infer: true }),
      adminComment: this.config.get('AMOCRM_FIELD_ADMIN_COMMENT_ID', { infer: true }),
      prepayment: this.config.get('AMOCRM_FIELD_PREPAYMENT_ID', { infer: true }),
      partnerUserId: this.config.get('AMOCRM_FIELD_PARTNER_USER_ID', { infer: true }),
      partnerServices: this.config.get('AMOCRM_FIELD_PARTNER_SERVICES_ID', { infer: true }),
    };
  }
}
