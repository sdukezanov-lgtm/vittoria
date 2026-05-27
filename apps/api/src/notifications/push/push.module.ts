import { Module } from '@nestjs/common';
import { DevPushProvider } from './dev-push.provider';
import { PUSH_PROVIDER } from './push.types';

@Module({
  providers: [
    {
      provide: PUSH_PROVIDER,
      useClass: DevPushProvider,
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
