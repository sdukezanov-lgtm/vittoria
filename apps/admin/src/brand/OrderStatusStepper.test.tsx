import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { stepState, OrderStatusStepper } from './OrderStatusStepper';

it('classifies steps relative to the current stage', () => {
  // current = production (index 3): earlier done, this active, later upcoming
  expect(stepState('production', 'detailing')).toBe('done');
  expect(stepState('production', 'production')).toBe('active');
  expect(stepState('production', 'ready_for_delivery')).toBe('upcoming');
});

it('renders all 7 numbered steps', () => {
  render(<MantineProvider><OrderStatusStepper current="production" /></MantineProvider>);
  for (let n = 1; n <= 7; n++) expect(screen.getByText(String(n))).toBeInTheDocument();
});
