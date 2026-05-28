import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatList } from './ChatList';
import * as chatApi from '../../api/chat.api';

vi.mock('../../api/chat.api');

function renderList(onSelect = vi.fn(), selectedChatId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <ChatList selectedChatId={selectedChatId} onSelect={onSelect} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { onSelect };
}

describe('ChatList', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders rows with contract number and unread badge', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [{ chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 2 }],
      total: 1, page: 1, page_size: 100,
    });
    renderList();
    expect(await screen.findByText('1024')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onSelect with chat_id when a row is clicked', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [{ chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 0 }],
      total: 1, page: 1, page_size: 100,
    });
    const { onSelect } = renderList();
    const user = userEvent.setup();
    await user.click(await screen.findByText('1024'));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('re-queries with has_unread when the filter is toggled', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    renderList();
    await waitFor(() => expect(chatApi.listAdminChats).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/только непрочитанные/i));
    await waitFor(() =>
      expect(chatApi.listAdminChats).toHaveBeenLastCalledWith(expect.objectContaining({ has_unread: true })),
    );
  });
});
