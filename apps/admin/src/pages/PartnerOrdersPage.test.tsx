import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PartnerOrdersPage } from './PartnerOrdersPage';
import * as partnerApi from '../api/partner.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/partner.api');

function order(over: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: 'o1', amocrm_deal_id: 1, contract_number: '1024', product_name: 'Кухня',
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
        <MemoryRouter><PartnerOrdersPage /></MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnerOrdersPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('renders partner order rows', async () => {
    vi.mocked(partnerApi.listPartnerOrders).mockResolvedValue({ items: [order({ contract_number: '1024' })] });
    renderPage();
    expect(await screen.findByText('1024')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByText('Производство изделия')).toBeInTheDocument();
  });
});
