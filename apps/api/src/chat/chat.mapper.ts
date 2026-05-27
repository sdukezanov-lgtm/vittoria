import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';

export interface MessageResponse {
  id: string;
  chat_id: string;
  sender_user_id: string;
  sender_role: 'client' | 'admin';
  text: string | null;
  attachments: unknown[];
  read_at: string | null;
  created_at: string;
}

@Injectable()
export class ChatMapper {
  toMessageResponse(m: Message): MessageResponse {
    return {
      id: m.id,
      chat_id: m.chatId,
      sender_user_id: m.senderUserId,
      sender_role: m.senderRole,
      text: m.text,
      attachments: Array.isArray(m.attachments) ? (m.attachments as unknown[]) : [],
      read_at: m.readAt ? m.readAt.toISOString() : null,
      created_at: m.createdAt.toISOString(),
    };
  }
}
