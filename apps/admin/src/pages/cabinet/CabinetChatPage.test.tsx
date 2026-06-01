import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CabinetChatPage } from './CabinetChatPage';

vi.mock('../../api/cabinet.api', () => ({
  getOrderChat: () => Promise.resolve({ id: 'c1', order_id: 'o1', created_at: '', unread_count: 0 }),
}));
vi.mock('../../components/chat/Conversation', () => ({
  Conversation: ({ chatId }: { chatId: string }) => <div>chat:{chatId}</div>,
}));

it('resolves the chat id then renders the conversation', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/cabinet/chat/o1']}>
      <Routes><Route path="/cabinet/chat/:id" element={<CabinetChatPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect(screen.getByText('chat:c1')).toBeInTheDocument());
});
