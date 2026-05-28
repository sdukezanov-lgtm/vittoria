import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { DevPushProvider } from './dev-push.provider';
import { FcmTokenService } from './fcm-token.service';
import { FcmPushProvider } from './fcm-push.provider';
import { ApnsTokenService } from './apns-token.service';
import { ApnsHttp2Client } from './apns-http2.client';
import { ApnsPushProvider } from './apns-push.provider';
import { CompositePushProvider } from './composite-push.provider';
import { PUSH_PROVIDER } from './push.types';

@Module({
  providers: [
    DevPushProvider,
    FcmTokenService,
    FcmPushProvider,
    ApnsTokenService,
    ApnsHttp2Client,
    ApnsPushProvider,
    CompositePushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, DevPushProvider, CompositePushProvider],
      useFactory: (config: ConfigService<Env, true>, dev: DevPushProvider, composite: CompositePushProvider) =>
        config.get('PUSH_PROVIDER_MODE', { infer: true }) === 'real' ? composite : dev,
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
