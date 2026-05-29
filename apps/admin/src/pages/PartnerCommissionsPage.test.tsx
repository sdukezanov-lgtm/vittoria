import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartnerCommissionsPage } from './PartnerCommissionsPage';
import * as partnerApi from '../api/partner.api';

vi.mock('../api/partner.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <PartnerCommissionsPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnerCommissionsPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('renders own commissions with amount and status label', async () => {
    vi.mocked(partnerApi.listPartnerCommissions).mockResolvedValue({
      rows: [{ id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'paid', paid_at: '2026-05-28T00:00:00Z', created_at: '2026-05-28T00:00:00Z' }],
    });
    renderPage();
    expect(await screen.findByText('5000.00')).toBeInTheDocument();
    expect(screen.getByText('Выплачено')).toBeInTheDocument();
  });
  it('filters by status', async () => {
    vi.mocked(partnerApi.listPartnerCommissions).mockResolvedValue({ rows: [] });
    renderPage();
    await waitFor(() => expect(partnerApi.listPartnerCommissions).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByPlaceholderText(/все статусы/i));
    await user.click(await screen.findByText('Выплачено'));
    await waitFor(() =>
      expect(partnerApi.listPartnerCommissions).toHaveBeenLastCalledWith(expect.objectContaining({ payout_status: 'paid' })),
    );
  });
});
