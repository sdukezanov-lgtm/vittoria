import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Conversation } from './Conversation';
import * as chatApi from '../../api/chat.api';
import type { ChatMessage } from '../../api/chat.api';

vi.mock('../../api/chat.api');

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1', chat_id: 'c1', sender_user_id: 'u1', sender_role: 'client',
    text: 'текст', attachments: [], read_at: '2026-05-29T10:00:00Z',
    created_at: '2026-05-29T10:00:00Z', ...over,
  };
}

function renderConversation(chatId = 'c1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <Conversation chatId={chatId} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('Conversation', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders messages (already-read) from the API', async () => {
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({
      rows: [
        msg({ id: 'm2', sender_role: 'admin', text: 'ответ', created_at: '2026-05-29T10:05:00Z' }),
        msg({ id: 'm1', sender_role: 'client', text: 'вопрос', created_at: '2026-05-29T10:00:00Z' }),
      ],
    });
    renderConversation();
    expect(await screen.findByText('вопрос')).toBeInTheDocument();
    expect(screen.getByText('ответ')).toBeInTheDocument();
  });

  it('marks unread client messages read on open', async () => {
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({
      rows: [msg({ id: 'm9', sender_role: 'client', text: 'новое', read_at: null })],
    });
    vi.mocked(chatApi.markChatRead).mockResolvedValue({ updated: 1 });
    renderConversation();
    await screen.findByText('новое');
    await waitFor(() =>
      expect(chatApi.markChatRead).toHaveBeenCalledWith('c1', { up_to_message_id: 'm9' }),
    );
  });

  it('sends a message via the composer', async () => {
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({ rows: [] });
    vi.mocked(chatApi.sendChatMessage).mockResolvedValue(msg({ id: 'm3', sender_role: 'admin', text: 'привет' }));
    renderConversation();
    await waitFor(() => expect(chatApi.listChatMessages).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/написать сообщение/i), 'привет');
    await user.click(screen.getByRole('button', { name: /отправить/i }));
    await waitFor(() =>
      expect(chatApi.sendChatMessage).toHaveBeenCalledWith('c1', { text: 'привет' }),
    );
  });
});
