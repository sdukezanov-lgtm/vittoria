import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listAuditLog } from './audit.api';
import { listTemplates, updateTemplate } from './templates.api';

vi.mock('./client');

describe('audit.api + templates.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listAuditLog builds query string', async () => {
    await listAuditLog({ entity: 'Order', actor: 'u1', page: 2, page_size: 50 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/audit-log?entity=Order&actor=u1&page=2&page_size=50');
  });
  it('listAuditLog omits empty params', async () => {
    await listAuditLog();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/audit-log');
  });
  it('listTemplates GETs the collection', async () => {
    await listTemplates();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/notification-templates');
  });
  it('updateTemplate patches by event key', async () => {
    await updateTemplate('order.stage.changed', { title: 'T', body: 'B' });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/notification-templates/order.stage.changed', { method: 'PATCH', body: { title: 'T', body: 'B' } });
  });
});
