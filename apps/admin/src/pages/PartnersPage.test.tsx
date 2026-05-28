import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartnersPage } from './PartnersPage';
import * as usersApi from '../api/users.api';

vi.mock('../api/users.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <PartnersPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnersPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders partner rows', async () => {
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue({
      rows: [{ id: 'p1', phone: '+79991112233', role: 'partner', first_name: 'Иван', last_name: 'Петров', created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
    renderPage();
    expect(await screen.findByText('+79991112233')).toBeInTheDocument();
    expect(screen.getByText(/Иван Петров/)).toBeInTheDocument();
    expect(usersApi.listAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ role: 'partner' }));
  });

  it('creates a partner via the modal', async () => {
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    vi.mocked(usersApi.createAdminUser).mockResolvedValue({ id: 'p2', phone: '+79990000000', role: 'partner', first_name: null, last_name: null, created_at: '2026-05-29T00:00:00Z' });
    renderPage();
    await waitFor(() => expect(usersApi.listAdminUsers).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /создать партнёра/i }));
    await user.type(await screen.findByLabelText(/телефон/i), '+79990000000');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(usersApi.createAdminUser).toHaveBeenCalledWith(expect.objectContaining({ phone: '+79990000000', role: 'partner' })),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
