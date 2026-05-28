import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatsPage } from './ChatsPage';
import * as chatApi from '../api/chat.api';

vi.mock('../api/chat.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <ChatsPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('ChatsPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows a placeholder until a chat is selected, then the conversation', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [{ chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 0 }],
      total: 1, page: 1, page_size: 100,
    });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({
      rows: [{
        id: 'm1', chat_id: 'c1', sender_user_id: 'u1', sender_role: 'client',
        text: 'Привет от клиента', attachments: [], read_at: '2026-05-29T10:00:00Z',
        created_at: '2026-05-29T10:00:00Z',
      }],
    });
    renderPage();
    expect(screen.getByText('Выберите диалог слева')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByText('1024'));
    expect(await screen.findByText('Привет от клиента')).toBeInTheDocument();
  });
});
