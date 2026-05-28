import { apiFetch } from './client';

export type MessageSenderRole = 'client' | 'admin';

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_user_id: string;
  sender_role: MessageSenderRole;
  text: string | null;
  attachments: unknown[];
  read_at: string | null;
  created_at: string;
}

export interface AdminChatRow {
  chat_id: string;
  order_id: string;
  contract_number: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface AdminChatsResponse {
  rows: AdminChatRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListAdminChatsQuery {
  has_unread?: boolean;
  page?: number;
  page_size?: number;
}

export function listAdminChats(query: ListAdminChatsQuery = {}): Promise<AdminChatsResponse> {
  const params = new URLSearchParams();
  if (query.has_unread) params.set('has_unread', 'true');
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/chats${qs ? `?${qs}` : ''}`);
}

export interface ListMessagesQuery {
  before?: string;
  limit?: number;
}

export function listChatMessages(
  chatId: string,
  query: ListMessagesQuery = {},
): Promise<{ rows: ChatMessage[] }> {
  const params = new URLSearchParams();
  if (query.before) params.set('before', query.before);
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiFetch(`/chats/${chatId}/messages${qs ? `?${qs}` : ''}`);
}

export function sendChatMessage(chatId: string, body: { text: string }): Promise<ChatMessage> {
  return apiFetch(`/chats/${chatId}/messages`, { method: 'POST', body });
}

export function markChatRead(
  chatId: string,
  body: { up_to_message_id: string },
): Promise<{ updated: number }> {
  return apiFetch(`/chats/${chatId}/read`, { method: 'PATCH', body });
}
