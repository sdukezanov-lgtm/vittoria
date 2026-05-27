import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';
import type { OrderStage } from '@prisma/client';

export interface UpdateProgressInput {
  stage?: OrderStage;
  progressPercent?: number;
  comment?: string;
  actorUserId?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_AMOCRM_OUTBOUND) private readonly outQueue: Queue,
  ) {}

  async updateProgress(orderId: string, input: UpdateProgressInput): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (input.stage !== undefined) data.currentStage = input.stage;
    if (input.progressPercent !== undefined) {
      data.progressPercent = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
    }
    if (input.comment !== undefined) data.lastAdminComment = input.comment;

    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data }),
      this.prisma.orderStageHistory.create({
        data: {
          orderId,
          stage: input.stage ?? order.currentStage,
          progressPercent: input.progressPercent ?? order.progressPercent,
          comment: input.comment ?? null,
          changedByUserId: input.actorUserId ?? null,
        },
      }),
    ]);

    await this.audit.record({
      actorUserId: input.actorUserId ?? null,
      action: 'order.progress.updated',
      entity: 'Order',
      entityId: orderId,
      before: {
        stage: order.currentStage,
        progress: order.progressPercent,
        comment: order.lastAdminComment,
      },
      after: input,
    });

    await this.outQueue.add(
      'push',
      {
        orderId,
        amocrmDealId: order.amocrmDealId,
        stage: input.stage,
        progressPercent: input.progressPercent,
        comment: input.comment,
      },
      { jobId: `${orderId}_${Date.now()}` },
    );
  }
}
