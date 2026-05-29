import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { PartnerLayout } from './PartnerLayout';
import { AuthContext, type AuthContextValue } from '../auth/useAuth';

function renderLayout() {
  const auth: AuthContextValue = {
    user: { id: 'u1', phone: '+79991112233', role: 'partner' },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
  };
  render(
    <MantineProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter><PartnerLayout /></MemoryRouter>
      </AuthContext.Provider>
    </MantineProvider>,
  );
}

describe('PartnerLayout', () => {
  it('shows the partner nav links', () => {
    renderLayout();
    expect(screen.getByText('Мои заказы')).toBeInTheDocument();
    expect(screen.getByText('Мои вознаграждения')).toBeInTheDocument();
    expect(screen.getByText('Профиль')).toBeInTheDocument();
  });
});
