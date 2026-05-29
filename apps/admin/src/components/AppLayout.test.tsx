import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { AuthContext, type AuthContextValue } from '../auth/useAuth';
import * as chatApi from '../api/chat.api';

vi.mock('../api/chat.api');

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    user: { id: 'u1', phone: '+79990000000', role: 'admin' },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
  };
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <AppLayout />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows the Чат nav link with a total unread badge', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [
        { chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 2 },
        { chat_id: 'c2', order_id: 'o2', contract_number: '1031', last_message_at: null, unread_count: 1 },
      ],
      total: 2, page: 1, page_size: 100,
    });
    renderLayout();
    expect(screen.getByText('Чат')).toBeInTheDocument();
    expect(screen.getByText('Заказы')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('shows Партнёры and Комиссии nav links', () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    renderLayout();
    expect(screen.getByText('Партнёры')).toBeInTheDocument();
    expect(screen.getByText('Комиссии')).toBeInTheDocument();
  });

  it('shows Аудит and Шаблоны nav links', () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    renderLayout();
    expect(screen.getByText('Аудит')).toBeInTheDocument();
    expect(screen.getByText('Шаблоны')).toBeInTheDocument();
  });
});
