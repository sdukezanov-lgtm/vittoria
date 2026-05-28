import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import * as authApi from '../api/auth.api';

vi.mock('../api/auth.api');

function Probe() {
  const { user, status, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.phone ?? 'none'}</span>
      <button onClick={() => void login('+79990000000', '1234')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  it('starts unauthenticated when no refresh token', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('login stores tokens + user and sets authenticated', async () => {
    vi.mocked(authApi.verifyCode).mockResolvedValue({
      access_token: 'a1',
      refresh_token: 'r1',
      user: { id: 'u1', phone: '+79990000000', role: 'admin' },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    await act(async () => {
      screen.getByText('login').click();
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('+79990000000');
    expect(localStorage.getItem('vittoria_refresh')).toBe('r1');
  });

  it('restores session on boot when refresh token present', async () => {
    localStorage.setItem('vittoria_refresh', 'r0');
    vi.mocked(authApi.refresh).mockResolvedValue({ access_token: 'a2', refresh_token: 'r2' });
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'admin' });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('+79991112233');
  });

  it('logout clears user + storage', async () => {
    localStorage.setItem('vittoria_refresh', 'r0');
    vi.mocked(authApi.refresh).mockResolvedValue({ access_token: 'a2', refresh_token: 'r2' });
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'admin' });
    vi.mocked(authApi.logout).mockResolvedValue();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await act(async () => {
      screen.getByText('logout').click();
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(localStorage.getItem('vittoria_refresh')).toBeNull();
  });
});
