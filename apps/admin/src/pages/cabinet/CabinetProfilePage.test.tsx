import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CabinetProfilePage } from './CabinetProfilePage';

vi.mock('../../api/profile.api', () => ({
  getProfile: () => Promise.resolve({ id: 'u1', phone: '+79991234567', role: 'client', first_name: 'Иван', last_name: 'П' }),
  updateProfile: () => Promise.resolve({ id: 'u1', phone: '+79991234567', role: 'client' }),
}));
const logout = vi.fn();
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ logout }) }));

it('loads the profile', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <CabinetProfilePage />
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Иван'));
  expect(screen.getByText('Выйти')).toBeInTheDocument();
});
