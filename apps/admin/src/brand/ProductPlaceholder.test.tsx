import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ProductPlaceholder } from './ProductPlaceholder';

it('renders a labelled placeholder region', () => {
  const { getByLabelText } = render(
    <MantineProvider><ProductPlaceholder /></MantineProvider>,
  );
  expect(getByLabelText('Фото изделия')).toBeInTheDocument();
});
