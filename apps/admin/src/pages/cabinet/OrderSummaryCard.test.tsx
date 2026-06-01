import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OrderSummaryCard } from './OrderSummaryCard';
import type { OrderResponse } from '../../api/types';

const order = {
  id: 'o1', amocrm_deal_id: 1, contract_number: 'VH-2024-0715', product_name: 'Кухня Римини',
  total_amount: '1 250 000', prepayment_amount: '375 000', balance_due: '875 000',
  current_stage: 'production', progress_percent: 62, service_phone: null, last_admin_comment: null,
  partner_services: [], created_at: '', updated_at: '',
} as unknown as OrderResponse;

it('shows contract number, product, status and finances', () => {
  render(<MantineProvider><OrderSummaryCard order={order} /></MantineProvider>);
  expect(screen.getByText('VH-2024-0715')).toBeInTheDocument();
  expect(screen.getByText('Кухня Римини')).toBeInTheDocument();
  expect(screen.getByText(/Действующий/)).toBeInTheDocument();
  expect(screen.getByText(/1 250 000/)).toBeInTheDocument();
});
