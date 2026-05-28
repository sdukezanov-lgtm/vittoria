import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderPage } from './OrderPage';
import * as ordersApi from '../api/orders.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/orders.api');

const order: OrderResponse = {
  id: 'o1', amocrm_deal_id: 1, contract_number: 'C-1', product_name: 'Кухня',
  total_amount: '100000.00', prepayment_amount: '50000.00', balance_due: '50000.00',
  current_stage: 'production', progress_percent: 40, service_phone: null,
  last_admin_comment: 'комментарий', partner_services: [],
  created_at: '2026-05-28T00:00:00Z', updated_at: '2026-05-28T00:00:00Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/orders/o1']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('OrderPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders order details', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValue(order);
    renderPage();
    expect(await screen.findByText('C-1')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByDisplayValue('комментарий')).toBeInTheDocument();
  });

  it('submits the edit form via updateProgress', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValue(order);
    vi.mocked(ordersApi.updateProgress).mockResolvedValue({ ...order, progress_percent: 60 });
    renderPage();
    await screen.findByText('C-1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(ordersApi.updateProgress).toHaveBeenCalledWith('o1', expect.objectContaining({ progress_percent: 40 })),
    );
  });
});
