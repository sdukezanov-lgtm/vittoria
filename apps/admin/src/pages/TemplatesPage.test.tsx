import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesPage } from './TemplatesPage';
import * as templatesApi from '../api/templates.api';

vi.mock('../api/templates.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <TemplatesPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('TemplatesPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders templates with title and body', async () => {
    vi.mocked(templatesApi.listTemplates).mockResolvedValue({
      rows: [{ event: 'order.stage.changed', title: 'Этап изменён', body: 'Ваш заказ перешёл на этап {{stage}}', updated_at: '2026-05-28T00:00:00Z' }],
    });
    renderPage();
    expect(await screen.findByDisplayValue('Этап изменён')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/перешёл на этап/)).toBeInTheDocument();
  });

  it('saves an edited template', async () => {
    vi.mocked(templatesApi.listTemplates).mockResolvedValue({
      rows: [{ event: 'order.stage.changed', title: 'Этап изменён', body: 'Текст', updated_at: '2026-05-28T00:00:00Z' }],
    });
    vi.mocked(templatesApi.updateTemplate).mockResolvedValue({ event: 'order.stage.changed', title: 'Новый', body: 'Текст', updated_at: '2026-05-29T00:00:00Z' });
    renderPage();
    const titleInput = await screen.findByDisplayValue('Этап изменён');
    const user = userEvent.setup();
    await user.clear(titleInput);
    await user.type(titleInput, 'Новый');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(templatesApi.updateTemplate).toHaveBeenCalledWith('order.stage.changed', expect.objectContaining({ title: 'Новый' })),
    );
  });
});
