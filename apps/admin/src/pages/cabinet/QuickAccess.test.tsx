import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { QuickAccess } from './QuickAccess';

it('renders chat and history shortcuts', () => {
  render(<MantineProvider><MemoryRouter><QuickAccess orderId="o1" /></MemoryRouter></MantineProvider>);
  expect(screen.getByText('Чат с сервисом')).toBeInTheDocument();
  expect(screen.getByText('История этапов')).toBeInTheDocument();
});
