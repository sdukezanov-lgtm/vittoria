import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { DevSmsProvider } from './dev-sms.provider';
import { SmscSmsProvider } from './smsc-sms.provider';
import { SmsRuProvider } from './smsru-sms.provider';
import { FallbackSmsProvider } from './fallback-sms.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms.types';

@Module({
  providers: [
    DevSmsProvider,
    SmscSmsProvider,
    SmsRuProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevSmsProvider, SmscSmsProvider, SmsRuProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevSmsProvider,
        smsc: SmscSmsProvider,
        smsru: SmsRuProvider,
      ): SmsProvider => {
        if (config.get('SMS_PROVIDER_MODE', { infer: true }) !== 'smsc') return dev;
        if (config.get('SMS_RU_API_ID', { infer: true })) return new FallbackSmsProvider(smsc, smsru);
        return smsc;
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
