import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Logo } from './Logo';

it('renders the VITTORIA HOME wordmark with optional tagline', () => {
  render(<MantineProvider><Logo tagline /></MantineProvider>);
  expect(screen.getByText('VITTORIA')).toBeInTheDocument();
  expect(screen.getByText('HOME')).toBeInTheDocument();
  expect(screen.getByText(/СЕРВИС, КОТОРОМУ ДОВЕРЯЮТ/i)).toBeInTheDocument();
});
