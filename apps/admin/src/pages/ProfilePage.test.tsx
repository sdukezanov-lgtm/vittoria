import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';
import * as profileApi from '../api/profile.api';

vi.mock('../api/profile.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <ProfilePage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('shows phone and editable name, saves changes', async () => {
    vi.mocked(profileApi.getProfile).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'partner', first_name: 'Иван', last_name: 'Петров' });
    vi.mocked(profileApi.updateProfile).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'partner', first_name: 'Пётр', last_name: 'Петров' });
    renderPage();
    expect(await screen.findByText('+79991112233')).toBeInTheDocument();
    const firstNameInput = await screen.findByDisplayValue('Иван');
    const user = userEvent.setup();
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Пётр');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(profileApi.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Пётр' })),
    );
  });
});
