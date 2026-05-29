import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PartnerOrderPage } from './PartnerOrderPage';
import * as partnerApi from '../api/partner.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/partner.api');

const order: OrderResponse = {
  id: 'o1', amocrm_deal_id: 1, contract_number: '1024', product_name: 'Кухня',
  total_amount: '100000.00', prepayment_amount: '50000.00', balance_due: '50000.00',
  current_stage: 'production', progress_percent: 40, service_phone: null,
  last_admin_comment: 'комментарий', partner_services: [],
  created_at: '2026-05-28T00:00:00Z', updated_at: '2026-05-28T00:00:00Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/partner/orders/o1']}>
          <Routes><Route path="/partner/orders/:id" element={<PartnerOrderPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnerOrderPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('renders read-only order details (no save button)', async () => {
    vi.mocked(partnerApi.getPartnerOrder).mockResolvedValue(order);
    renderPage();
    expect(await screen.findByText('1024')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByText('Производство изделия')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сохранить/i })).not.toBeInTheDocument();
  });
});
