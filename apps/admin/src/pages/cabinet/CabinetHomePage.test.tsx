import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CabinetHomePage } from './CabinetHomePage';

vi.mock('../../api/cabinet.api', () => ({
  listMyOrders: () => Promise.resolve({ items: [{
    id: 'o1', amocrm_deal_id: 1, contract_number: 'VH-2024-0715', product_name: 'Кухня Римини',
    total_amount: '1 250 000', prepayment_amount: '375 000', balance_due: '875 000',
    current_stage: 'production', progress_percent: 62, service_phone: null, last_admin_comment: null,
    partner_services: [], created_at: '', updated_at: '',
  }] }),
}));

it('renders the order home once loaded', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><CabinetHomePage /></MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect(screen.getByText('VH-2024-0715')).toBeInTheDocument());
  expect(screen.getByText('Статус заказа')).toBeInTheDocument();
});
