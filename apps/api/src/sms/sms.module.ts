import { Module } from '@nestjs/common';
import { SmscSmsProvider } from './smsc-sms.provider';
import { SMS_PROVIDER } from './sms.types';

@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      useClass: SmscSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
