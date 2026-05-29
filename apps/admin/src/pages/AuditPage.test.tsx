import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditPage } from './AuditPage';
import * as auditApi from '../api/audit.api';

vi.mock('../api/audit.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <AuditPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('AuditPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders audit rows', async () => {
    vi.mocked(auditApi.listAuditLog).mockResolvedValue({
      rows: [{ id: 'a1', actor_user_id: 'u1', action: 'order.stage.changed', entity: 'Order', entity_id: 'o1', before: { stage: 'detailing' }, after: { stage: 'production' }, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 20,
    });
    renderPage();
    expect(await screen.findByText('order.stage.changed')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
  });

  it('filters by entity', async () => {
    vi.mocked(auditApi.listAuditLog).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 20 });
    renderPage();
    await waitFor(() => expect(auditApi.listAuditLog).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/сущность/i), 'Order');
    await waitFor(() =>
      expect(auditApi.listAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ entity: 'Order' })),
    );
  });

  it('opens the detail modal showing before/after', async () => {
    vi.mocked(auditApi.listAuditLog).mockResolvedValue({
      rows: [{ id: 'a1', actor_user_id: 'u1', action: 'order.stage.changed', entity: 'Order', entity_id: 'o1', before: { stage: 'detailing' }, after: { stage: 'production' }, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 20,
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /подробнее/i }));
    expect(await screen.findByText(/production/)).toBeInTheDocument();
  });
});
