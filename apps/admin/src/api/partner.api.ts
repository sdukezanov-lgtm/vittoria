import { apiFetch } from './client';
import type { OrderResponse } from './types';
import type { Commission, PayoutStatus } from './commissions.api';

export function listPartnerOrders(): Promise<{ items: OrderResponse[] }> {
  return apiFetch('/partner/orders');
}

export function getPartnerOrder(id: string): Promise<OrderResponse> {
  return apiFetch(`/partner/orders/${id}`);
}

export function listPartnerCommissions(
  query: { payout_status?: PayoutStatus } = {},
): Promise<{ rows: Commission[] }> {
  const params = new URLSearchParams();
  if (query.payout_status) params.set('payout_status', query.payout_status);
  const qs = params.toString();
  return apiFetch(`/partner/commissions${qs ? `?${qs}` : ''}`);
}
