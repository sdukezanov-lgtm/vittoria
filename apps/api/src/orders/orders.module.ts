import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_AMOCRM_OUTBOUND })],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
