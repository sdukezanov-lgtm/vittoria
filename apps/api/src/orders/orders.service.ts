import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';
import type { Order, OrderStage, OrderStageHistory, Prisma } from '@prisma/client';

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

  async listForClient(clientUserId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { clientUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForPartner(partnerUserId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { partnerUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll(query: { search?: string; stage?: OrderStage; page?: number; pageSize?: number }): Promise<{ rows: Order[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.OrderWhereInput = {};
    if (query.stage) where.currentStage = query.stage;
    if (query.search) {
      where.OR = [
        { contractNumber: { contains: query.search, mode: 'insensitive' } },
        { productName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { rows, total };
  }

  async findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  async findByIdForClient(id: string, clientUserId: string): Promise<Order | null> {
    return this.prisma.order.findFirst({ where: { id, clientUserId } });
  }

  async findByIdForPartner(id: string, partnerUserId: string): Promise<Order | null> {
    return this.prisma.order.findFirst({ where: { id, partnerUserId } });
  }

  async getHistory(orderId: string): Promise<OrderStageHistory[]> {
    return this.prisma.orderStageHistory.findMany({
      where: { orderId },
      orderBy: { changedAt: 'desc' },
    });
  }
}
