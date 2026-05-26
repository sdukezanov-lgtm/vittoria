import { Module } from '@nestjs/common';
import { DevSmsProvider } from './dev-sms.provider';
import { SMS_PROVIDER } from './sms.types';

@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      useClass: DevSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
