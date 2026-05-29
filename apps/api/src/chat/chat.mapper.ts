import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { StorageService } from '../storage/storage.service';

export interface MessageResponse {
  id: string;
  chat_id: string;
  sender_user_id: string;
  sender_role: 'client' | 'admin';
  text: string | null;
  attachments: Array<{ object_key: string; mime: string; size: number; url: string }>;
  read_at: string | null;
  created_at: string;
}

@Injectable()
export class ChatMapper {
  constructor(private readonly storage: StorageService) {}

  async toMessageResponse(m: Message): Promise<MessageResponse> {
    const raw = Array.isArray(m.attachments)
      ? (m.attachments as Array<{ object_key: string; mime: string; size: number }>)
      : [];
    const attachments = await Promise.all(
      raw.map(async (a) => ({ ...a, url: await this.storage.getPresignedUrl(a.object_key) })),
    );
    return {
      id: m.id,
      chat_id: m.chatId,
      sender_user_id: m.senderUserId,
      sender_role: m.senderRole,
      text: m.text,
      attachments,
      read_at: m.readAt ? m.readAt.toISOString() : null,
      created_at: m.createdAt.toISOString(),
    };
  }
}
