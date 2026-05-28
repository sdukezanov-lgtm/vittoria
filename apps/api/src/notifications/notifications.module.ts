import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsDedupService } from './notifications.dedup.service';
import { NotificationsProcessor } from './jobs/notifications.processor';
import { OrderProgressListener } from './listeners/order-progress.listener';
import { PushModule } from './push/push.module';
import { SmsModule } from '../sms/sms.module';
import { PushTokensController } from './push-tokens.controller';
import { NotificationTemplatesController } from './notification-templates.controller';
import { TemplatesService } from './templates.service';
import { QUEUE_NOTIFICATIONS } from '../queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    PushModule,
    SmsModule,
  ],
  controllers: [PushTokensController, NotificationTemplatesController],
  providers: [NotificationsService, NotificationsDedupService, NotificationsProcessor, OrderProgressListener, TemplatesService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
