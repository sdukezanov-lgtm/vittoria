import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';

interface OrderProgressUpdatedEvent {
  orderId: string;
  clientUserId: string;
  before: { stage: string; progressPercent: number };
  after: { stage: string; progressPercent: number };
  contractNumber: string | null;
  productName: string | null;
}

@Injectable()
export class OrderProgressListener {
  private readonly logger = new Logger(OrderProgressListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('order.progress.updated')
  async handle(event: OrderProgressUpdatedEvent): Promise<void> {
    const stageChanged = event.before.stage !== event.after.stage;
    const progressDelta = Math.abs(event.after.progressPercent - event.before.progressPercent);

    if (event.after.stage === 'ready_for_delivery' && stageChanged) {
      await this.notifications.send(event.clientUserId, 'order.ready', {
        orderId: event.orderId,
        contractNumber: event.contractNumber,
        productName: event.productName,
      });
      return;
    }

    if (stageChanged) {
      await this.notifications.send(event.clientUserId, 'order.stage.changed', {
        orderId: event.orderId,
        contractNumber: event.contractNumber,
        productName: event.productName,
        newStage: event.after.stage,
        oldStage: event.before.stage,
      });
    } else if (progressDelta >= 10) {
      await this.notifications.send(event.clientUserId, 'order.progress.changed', {
        orderId: event.orderId,
        contractNumber: event.contractNumber,
        productName: event.productName,
        newPercent: event.after.progressPercent,
        oldPercent: event.before.progressPercent,
      });
    }
  }
}
