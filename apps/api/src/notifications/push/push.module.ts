import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { DevPushProvider } from './dev-push.provider';
import { FcmTokenService } from './fcm-token.service';
import { FcmPushProvider } from './fcm-push.provider';
import { PUSH_PROVIDER } from './push.types';

@Module({
  providers: [
    DevPushProvider,
    FcmTokenService,
    FcmPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, DevPushProvider, FcmPushProvider],
      useFactory: (config: ConfigService<Env, true>, dev: DevPushProvider, fcm: FcmPushProvider) =>
        config.get('PUSH_PROVIDER_MODE', { infer: true }) === 'real' ? fcm : dev,
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
