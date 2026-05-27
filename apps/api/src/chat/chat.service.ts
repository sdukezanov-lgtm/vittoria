import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types/auth-user';

export interface ChatSummary {
  id: string;
  order_id: string;
  created_at: Date;
  unread_count: number;
}

export interface ListMessagesArgs {
  before?: string;
  limit?: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async findOrCreateForOrder(orderId: string, requester: AuthUser): Promise<ChatSummary> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    if (requester.role === 'client' && order.clientUserId !== requester.id) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    let chat = await this.prisma.chat.findUnique({ where: { orderId } });
    if (!chat) {
      chat = await this.prisma.chat.create({ data: { orderId } });
    }

    const unread_count = await this.prisma.message.count({
      where: {
        chatId: chat.id,
        senderUserId: { not: requester.id },
        readAt: null,
      },
    });

    return { id: chat.id, order_id: chat.orderId, created_at: chat.createdAt, unread_count };
  }

  async listMessages(chatId: string, requester: AuthUser, args: ListMessagesArgs): Promise<Message[]> {
    await this.assertChatAccess(chatId, requester);
    const limit = args.limit ?? 50;
    const where: { chatId: string; createdAt?: { lt: Date } } = { chatId };
    if (args.before) {
      const cursor = await this.prisma.message.findUnique({ where: { id: args.before } });
      if (cursor && cursor.chatId === chatId) {
        where.createdAt = { lt: cursor.createdAt };
      }
    }
    return this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async assertChatAccess(chatId: string, requester: AuthUser): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { order: true },
    });
    if (!chat) {
      throw new NotFoundException({ code: 'CHAT_NOT_FOUND', message: 'Chat not found' });
    }
    if (requester.role === 'client' && chat.order.clientUserId !== requester.id) {
      throw new NotFoundException({ code: 'CHAT_NOT_FOUND', message: 'Chat not found' });
    }
  }
}
