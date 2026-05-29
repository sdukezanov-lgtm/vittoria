import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listPartnerOrders, getPartnerOrder, listPartnerCommissions } from './partner.api';
import { getProfile, updateProfile } from './profile.api';

vi.mock('./client');

describe('partner.api + profile.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listPartnerOrders GETs /partner/orders', async () => {
    await listPartnerOrders();
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/orders');
  });
  it('getPartnerOrder GETs by id', async () => {
    await getPartnerOrder('o1');
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/orders/o1');
  });
  it('listPartnerCommissions builds query', async () => {
    await listPartnerCommissions({ payout_status: 'paid' });
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/commissions?payout_status=paid');
  });
  it('listPartnerCommissions omits empty', async () => {
    await listPartnerCommissions();
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/commissions');
  });
  it('getProfile GETs /me', async () => {
    await getProfile();
    expect(client.apiFetch).toHaveBeenCalledWith('/me');
  });
  it('updateProfile PATCHes /me', async () => {
    await updateProfile({ first_name: 'Иван', last_name: 'Петров' });
    expect(client.apiFetch).toHaveBeenCalledWith('/me', { method: 'PATCH', body: { first_name: 'Иван', last_name: 'Петров' } });
  });
});
