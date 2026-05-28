import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { AuthContext, type AuthContextValue } from '../auth/useAuth';
import * as authApi from '../api/auth.api';

vi.mock('../api/auth.api');

function setup(login = vi.fn().mockResolvedValue(undefined)) {
  const value: AuthContextValue = { user: null, status: 'unauthenticated', login, logout: vi.fn() };
  render(
    <MantineProvider>
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </MantineProvider>,
  );
  return { login };
}

describe('LoginPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requests code then verifies via login', async () => {
    vi.mocked(authApi.requestCode).mockResolvedValue({ retry_after_sec: 60 });
    const { login } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/телефон/i), '+79990000000');
    await user.click(screen.getByRole('button', { name: /получить код/i }));

    await waitFor(() => expect(authApi.requestCode).toHaveBeenCalledWith('+79990000000'));
    await user.type(await screen.findByLabelText(/код/i), '1234');
    await user.click(screen.getByRole('button', { name: /войти/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('+79990000000', '1234'));
  });

  it('shows an error when login (verify) fails', async () => {
    vi.mocked(authApi.requestCode).mockResolvedValue({ retry_after_sec: 60 });
    const login = vi.fn().mockRejectedValue(new Error('bad code'));
    setup(login);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/телефон/i), '+79990000000');
    await user.click(screen.getByRole('button', { name: /получить код/i }));
    await user.type(await screen.findByLabelText(/код/i), '0000');
    await user.click(screen.getByRole('button', { name: /войти/i }));

    expect(await screen.findByText(/неверный код/i)).toBeInTheDocument();
  });
});
