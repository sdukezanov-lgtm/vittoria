import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CabinetHistoryPage } from './CabinetHistoryPage';

vi.mock('../../api/cabinet.api', () => ({
  getOrderHistory: () => Promise.resolve({ items: [
    { id: 'h1', stage: 'detailing', progress_percent: 20, comment: 'Готово', changed_at: '2026-05-01T10:00:00Z' },
  ] }),
}));

it('renders a stage history entry', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/cabinet/history/o1']}>
      <Routes><Route path="/cabinet/history/:id" element={<CabinetHistoryPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect(screen.getByText('Деталировка')).toBeInTheDocument());
});
