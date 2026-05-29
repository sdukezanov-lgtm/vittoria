import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { DevSmsProvider } from './dev-sms.provider';
import { SmscSmsProvider } from './smsc-sms.provider';
import { SMS_PROVIDER } from './sms.types';

@Module({
  providers: [
    DevSmsProvider,
    SmscSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevSmsProvider, SmscSmsProvider],
      useFactory: (config: ConfigService<Env, true>, dev: DevSmsProvider, smsc: SmscSmsProvider) =>
        config.get('SMS_PROVIDER_MODE', { infer: true }) === 'smsc' ? smsc : dev,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
