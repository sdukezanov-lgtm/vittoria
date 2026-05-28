import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listCommissions, createCommission, updateCommissionStatus } from './commissions.api';
import { listAdminUsers, createAdminUser } from './users.api';

vi.mock('./client');

describe('commissions.api + users.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listCommissions builds query string', async () => {
    await listCommissions({ partner_user_id: 'p1', payout_status: 'paid', page: 2, page_size: 50 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions?partner_user_id=p1&payout_status=paid&page=2&page_size=50');
  });
  it('listCommissions omits empty params', async () => {
    await listCommissions();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions');
  });
  it('createCommission posts body', async () => {
    await createCommission({ order_id: 'o1', partner_user_id: 'p1', amount: 5000 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions', { method: 'POST', body: { order_id: 'o1', partner_user_id: 'p1', amount: 5000 } });
  });
  it('updateCommissionStatus patches', async () => {
    await updateCommissionStatus('c1', { payout_status: 'approved' });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions/c1', { method: 'PATCH', body: { payout_status: 'approved' } });
  });
  it('listAdminUsers builds query string', async () => {
    await listAdminUsers({ role: 'partner', page: 1, page_size: 100 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/users?role=partner&page=1&page_size=100');
  });
  it('createAdminUser posts body', async () => {
    await createAdminUser({ phone: '+79990000000', role: 'partner', first_name: 'Иван' });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/users', { method: 'POST', body: { phone: '+79990000000', role: 'partner', first_name: 'Иван' } });
  });
});
