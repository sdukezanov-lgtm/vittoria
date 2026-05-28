import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listAdminChats, listChatMessages, sendChatMessage, markChatRead } from './chat.api';

vi.mock('./client');

describe('chat.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listAdminChats builds the query string', async () => {
    await listAdminChats({ has_unread: true, page: 2, page_size: 100 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/chats?has_unread=true&page=2&page_size=100');
  });

  it('listAdminChats omits empty params', async () => {
    await listAdminChats();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/chats');
  });

  it('listChatMessages passes before + limit', async () => {
    await listChatMessages('c1', { before: 'm9', limit: 50 });
    expect(client.apiFetch).toHaveBeenCalledWith('/chats/c1/messages?before=m9&limit=50');
  });

  it('sendChatMessage posts the text', async () => {
    await sendChatMessage('c1', { text: 'привет' });
    expect(client.apiFetch).toHaveBeenCalledWith('/chats/c1/messages', { method: 'POST', body: { text: 'привет' } });
  });

  it('markChatRead patches up_to_message_id', async () => {
    await markChatRead('c1', { up_to_message_id: 'm9' });
    expect(client.apiFetch).toHaveBeenCalledWith('/chats/c1/read', { method: 'PATCH', body: { up_to_message_id: 'm9' } });
  });
});
