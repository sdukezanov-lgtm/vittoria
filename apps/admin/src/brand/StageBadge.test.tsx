import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { STAGE_COLOR } from './stageColors';
import { StageBadge } from './StageBadge';
import { STAGES } from '../stageLabels';

it('has a color for every stage', () => {
  for (const s of STAGES) expect(STAGE_COLOR[s]).toBeTruthy();
});

it('renders the stage label', () => {
  render(<MantineProvider><StageBadge stage="production" /></MantineProvider>);
  expect(screen.getByText('Производство изделия')).toBeInTheDocument();
});
