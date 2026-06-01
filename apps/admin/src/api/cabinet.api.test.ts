import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.fn();
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { listMyOrders, getOrderHistory, getOrderChat, getServiceContact } from './cabinet.api';

beforeEach(() => apiFetch.mockReset().mockResolvedValue({}));

describe('cabinet api targets the client endpoints', () => {
  it('lists my orders', async () => { await listMyOrders(); expect(apiFetch).toHaveBeenCalledWith('/orders'); });
  it('gets stage history', async () => { await getOrderHistory('o1'); expect(apiFetch).toHaveBeenCalledWith('/orders/o1/history'); });
  it('gets the order chat ref', async () => { await getOrderChat('o1'); expect(apiFetch).toHaveBeenCalledWith('/orders/o1/chat'); });
  it('gets the service contact', async () => { await getServiceContact(); expect(apiFetch).toHaveBeenCalledWith('/service/contact'); });
});
