import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../../queues/queue-names';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.types';
import { PUSH_PROVIDER, type PushProvider } from '../push/push.types';
import { TemplatesService } from '../templates.service';
import { buildVars } from '../notifications.vars';
import { CHANNEL_MATRIX, type NotificationEvent } from '../notifications.types';

interface DispatchJob {
  userId: string;
  event: NotificationEvent;
  data: { orderId: string; [k: string]: unknown };
}

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
  ) {
    super();
  }

  async process(job: Job<DispatchJob>): Promise<{ pushSent: number; smsSent: number }> {
    const { userId, event, data } = job.data;
    const matrix = CHANNEL_MATRIX[event];
    const template = await this.templates.render(event, buildVars(event, data));

    let pushSent = 0;
    let smsSent = 0;

    if (matrix.push) {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
      for (const t of tokens) {
        try {
          await this.push.send({
            token: t.token,
            platform: t.platform,
            title: template.title,
            body: template.body,
            data: { event, orderId: data.orderId },
          });
          pushSent++;
        } catch (err) {
          this.logger.warn(`push send failed for user=${userId} device=${t.deviceId}: ${(err as Error).message}`);
        }
      }
    }

    if (matrix.sms) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.phone) {
        try {
          await this.sms.send({ to: user.phone, text: template.body });
          smsSent = 1;
        } catch (err) {
          this.logger.warn(`sms send failed for user=${userId}: ${(err as Error).message}`);
        }
      }
    }

    await this.audit.record({
      actorUserId: null,
      action: 'notification.dispatched',
      entity: 'User',
      entityId: userId,
      after: { event, pushSent, smsSent },
    });

    return { pushSent, smsSent };
  }
}
