import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleGate } from './RoleGate';
import { AuthContext, type AuthContextValue } from './useAuth';

function renderWithAuth(value: AuthContextValue, initialPath = '/') {
  return render(
    <MantineProvider>
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RoleGate allow={['admin']}>
                    <div>secret</div>
                  </RoleGate>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </MantineProvider>,
  );
}

const base: AuthContextValue = { user: null, status: 'unauthenticated', login: vi.fn(), logout: vi.fn() };

describe('ProtectedRoute + RoleGate', () => {
  it('redirects to /login when unauthenticated', () => {
    renderWithAuth(base);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('shows a loader while status is loading', () => {
    renderWithAuth({ ...base, status: 'loading' });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('renders children for admin', () => {
    renderWithAuth({ ...base, status: 'authenticated', user: { id: 'u', phone: 'p', role: 'admin' } });
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('shows placeholder for partner (role not allowed)', () => {
    renderWithAuth({ ...base, status: 'authenticated', user: { id: 'u', phone: 'p', role: 'partner' } });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText(/в разработке/i)).toBeInTheDocument();
  });
});
