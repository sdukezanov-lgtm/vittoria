import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import { OrdersController } from './orders.controller';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_AMOCRM_OUTBOUND })],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersMapper],
  exports: [OrdersService, OrdersMapper],
})
export class OrdersModule {}
