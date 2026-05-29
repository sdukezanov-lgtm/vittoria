import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommissionsPage } from './CommissionsPage';
import * as commissionsApi from '../api/commissions.api';
import * as usersApi from '../api/users.api';

vi.mock('../api/commissions.api');
vi.mock('../api/users.api');
vi.mock('../api/orders.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <CommissionsPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('CommissionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue({
      rows: [{ id: 'p1', phone: '+79991112233', role: 'partner', first_name: 'Иван', last_name: 'Петров', created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
  });

  it('renders commission rows with partner name, amount and status label', async () => {
    vi.mocked(commissionsApi.listCommissions).mockResolvedValue({
      rows: [{ id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'pending', paid_at: null, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
    renderPage();
    expect(await screen.findByText(/Иван Петров/)).toBeInTheDocument();
    expect(screen.getByText('5000.00')).toBeInTheDocument();
    expect(screen.getByText('Ожидает')).toBeInTheDocument();
  });

  it('changes a commission status', async () => {
    vi.mocked(commissionsApi.listCommissions).mockResolvedValue({
      rows: [{ id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'pending', paid_at: null, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
    vi.mocked(commissionsApi.updateCommissionStatus).mockResolvedValue({
      id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'approved', paid_at: null, created_at: '2026-05-28T00:00:00Z',
    });
    renderPage();
    await screen.findByText('Ожидает');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /одобрить/i }));
    await waitFor(() =>
      expect(commissionsApi.updateCommissionStatus).toHaveBeenCalledWith('c1', { payout_status: 'approved' }),
    );
  });
});
