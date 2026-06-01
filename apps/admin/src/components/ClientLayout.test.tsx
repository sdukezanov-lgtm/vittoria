import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClientLayout } from './ClientLayout';

vi.mock('../api/cabinet.api', () => ({
  getServiceContact: () => Promise.resolve({ phone: '+7 (495) 120-00-20', hours: '9:00–21:00' }),
}));

it('renders the brand header', () => {
  render(
    <MantineProvider><QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/cabinet']}>
        <Routes><Route element={<ClientLayout />}><Route path="/cabinet" element={<div>inner</div>} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider></MantineProvider>,
  );
  expect(screen.getByText('VITTORIA')).toBeInTheDocument();
  expect(screen.getByText('inner')).toBeInTheDocument();
});
