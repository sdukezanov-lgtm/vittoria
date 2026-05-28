import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrdersPage } from './OrdersPage';
import * as ordersApi from '../api/orders.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/orders.api');

function makeOrder(over: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: 'o1', amocrm_deal_id: 1, contract_number: 'C-1', product_name: 'Кухня',
    total_amount: null, prepayment_amount: null, balance_due: null,
    current_stage: 'production', progress_percent: 40, service_phone: null,
    last_admin_comment: null, partner_services: [], created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z', ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <OrdersPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('OrdersPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders order rows from listOrders', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue({
      items: [makeOrder({ contract_number: 'C-100' })], page: 1, page_size: 20, total: 1,
    });
    renderPage();
    expect(await screen.findByText('C-100')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByText('Производство изделия')).toBeInTheDocument();
  });

  it('re-queries with search term', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue({ items: [], page: 1, page_size: 20, total: 0 });
    renderPage();
    await waitFor(() => expect(ordersApi.listOrders).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/поиск/i), 'кухня');
    await waitFor(() =>
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'кухня' })),
    );
  });
});
