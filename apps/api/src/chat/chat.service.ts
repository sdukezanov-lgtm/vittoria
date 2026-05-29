import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Chat, Message, MessageSenderRole, Order } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import type { AuthUser } from '../common/types/auth-user';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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

export interface SendMessageArgs {
  text?: string;
  attachmentIds?: string[];
}

export interface AdminChatListItem {
  chat_id: string;
  order_id: string;
  contract_number: string | null;
  last_message_at: Date | null;
  unread_count: number;
}

export interface AdminChatListResult {
  rows: AdminChatListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListAdminChatsArgs {
  has_unread?: boolean;
  page?: number;
  page_size?: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
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

  private async assertChatAccess(
    chatId: string,
    requester: AuthUser,
  ): Promise<Chat & { order: Order }> {
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
    return chat;
  }

  async createAttachment(
    chatId: string,
    requester: AuthUser,
    file: { buffer: Buffer; size: number; mime: string },
  ): Promise<{ attachment_id: string; object_key: string }> {
    await this.assertChatAccess(chatId, requester);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException({ code: 'ATTACHMENT_TOO_LARGE', message: 'Max 10 MB' });
    }
    const objectKey = `chats/${chatId}/${randomUUID()}`;
    await this.storage.putObject(objectKey, file.buffer, file.mime);
    const row = await this.prisma.attachment.create({
      data: { chatId, uploaderUserId: requester.id, objectKey, mime: file.mime, size: file.size },
    });
    return { attachment_id: row.id, object_key: row.objectKey };
  }

  async sendMessage(chatId: string, requester: AuthUser, args: SendMessageArgs): Promise<Message> {
    const chat = await this.assertChatAccess(chatId, requester);

    const attachmentIds = args.attachmentIds ?? [];
    if (!args.text && attachmentIds.length === 0) {
      throw new BadRequestException({ code: 'MESSAGE_EMPTY', message: 'text or attachments required' });
    }

    let attachmentsJson: { object_key: string; mime: string; size: number }[] = [];
    if (attachmentIds.length > 0) {
      const atts = await this.prisma.attachment.findMany({
        where: { id: { in: attachmentIds }, chatId, uploaderUserId: requester.id, messageId: null },
      });
      if (atts.length !== attachmentIds.length) {
        throw new BadRequestException({ code: 'ATTACHMENT_INVALID', message: 'unknown or already-linked attachment' });
      }
      attachmentsJson = atts.map((a) => ({ object_key: a.objectKey, mime: a.mime, size: a.size }));
    }

    const senderRole: MessageSenderRole = requester.role === 'admin' ? 'admin' : 'client';
    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderUserId: requester.id,
        senderRole,
        text: args.text ?? null,
        attachments: attachmentsJson,
      },
    });

    if (attachmentIds.length > 0) {
      await this.prisma.attachment.updateMany({
        where: { id: { in: attachmentIds } },
        data: { messageId: message.id },
      });
    }

    await this.audit.record({
      actorUserId: requester.id,
      action: 'chat.message.sent',
      entity: 'Message',
      entityId: message.id,
      after: { chatId, senderRole },
    });

    if (senderRole === 'admin') {
      const preview = (args.text ?? 'Вложение').replace(/[\r\n]+/g, ' ').trim().slice(0, 80) || null;
      try {
        await this.notifications.send(chat.order.clientUserId, 'chat.reply.received', {
          orderId: chat.orderId,
          chatId,
          contractNumber: chat.order.contractNumber,
          preview,
        });
      } catch (err) {
        this.logger.warn(`chat.reply.received notify failed: ${(err as Error).message}`);
      }
    }

    return message;
  }

  async markRead(
    chatId: string,
    requester: AuthUser,
    upToMessageId: string,
  ): Promise<{ updated: number }> {
    await this.assertChatAccess(chatId, requester);
    const cursor = await this.prisma.message.findUnique({ where: { id: upToMessageId } });
    if (!cursor || cursor.chatId !== chatId) {
      throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Message not found' });
    }
    const result = await this.prisma.message.updateMany({
      where: {
        chatId,
        createdAt: { lte: cursor.createdAt },
        senderUserId: { not: requester.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async listAdminChats(args: ListAdminChatsArgs): Promise<AdminChatListResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where = args.has_unread
      ? { messages: { some: { senderRole: 'client' as MessageSenderRole, readAt: null } } }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.chat.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { id: true, contractNumber: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
          _count: {
            select: {
              messages: { where: { senderRole: 'client', readAt: null } },
            },
          },
        },
      }),
      this.prisma.chat.count({ where }),
    ]);

    return {
      rows: rows.map((r) => ({
        chat_id: r.id,
        order_id: r.orderId,
        contract_number: r.order.contractNumber,
        last_message_at: r.messages[0]?.createdAt ?? null,
        unread_count: r._count.messages,
      })),
      total,
      page,
      page_size: pageSize,
    };
  }
}
