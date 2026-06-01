import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OrderStatusSection } from './OrderStatusSection';

it('shows the current stage label and percent', () => {
  render(<MantineProvider><OrderStatusSection stage="production" percent={62} /></MantineProvider>);
  // Stage label appears twice (section subtitle + active step in the stepper).
  expect(screen.getAllByText('Производство изделия').length).toBeGreaterThan(0);
  expect(screen.getByText('Статус заказа')).toBeInTheDocument();
  expect(screen.getByText('62%')).toBeInTheDocument();
});
