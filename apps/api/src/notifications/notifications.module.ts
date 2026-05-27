import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsDedupService } from './notifications.dedup.service';
import { NotificationsProcessor } from './jobs/notifications.processor';
import { PushModule } from './push/push.module';
import { SmsModule } from '../sms/sms.module';
import { QUEUE_NOTIFICATIONS } from '../queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    PushModule,
    SmsModule,
  ],
  providers: [NotificationsService, NotificationsDedupService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
