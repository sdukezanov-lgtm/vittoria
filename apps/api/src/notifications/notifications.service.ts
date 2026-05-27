import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../queues/queue-names';
import { NotificationsDedupService } from './notifications.dedup.service';
import { CHANNEL_MATRIX, type NotificationEvent } from './notifications.types';
import { isQuietHour, deferUntilMorning } from './notifications.quiet-hours';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly dedup: NotificationsDedupService,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async send(
    userId: string,
    event: NotificationEvent,
    data: { orderId: string; [k: string]: unknown },
  ): Promise<void> {
    const isNew = await this.dedup.shouldSend(userId, event, data.orderId);
    if (!isNew) {
      this.logger.debug(`dedup skip: user=${userId} event=${event} order=${data.orderId}`);
      return;
    }

    const matrix = CHANNEL_MATRIX[event];
    const now = new Date();
    const delay = !matrix.critical && isQuietHour(now) ? deferUntilMorning(now) : 0;

    await this.queue.add(
      'dispatch',
      { userId, event, data },
      { delay, jobId: `${userId}_${event}_${data.orderId}_${Date.now()}` },
    );
  }
}
