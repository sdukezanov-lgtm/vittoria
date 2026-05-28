import { apiFetch } from './client';

export type PayoutStatus = 'pending' | 'approved' | 'paid';

export interface Commission {
  id: string;
  order_id: string;
  partner_user_id: string;
  amount: string;
  payout_status: PayoutStatus;
  paid_at: string | null;
  created_at: string;
}

export interface CommissionsResponse {
  rows: Commission[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListCommissionsQuery {
  partner_user_id?: string;
  payout_status?: PayoutStatus;
  page?: number;
  page_size?: number;
}

export function listCommissions(query: ListCommissionsQuery = {}): Promise<CommissionsResponse> {
  const params = new URLSearchParams();
  if (query.partner_user_id) params.set('partner_user_id', query.partner_user_id);
  if (query.payout_status) params.set('payout_status', query.payout_status);
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/commissions${qs ? `?${qs}` : ''}`);
}

export interface CreateCommissionBody {
  order_id: string;
  partner_user_id: string;
  amount: number;
}

export function createCommission(body: CreateCommissionBody): Promise<Commission> {
  return apiFetch('/admin/commissions', { method: 'POST', body });
}

export function updateCommissionStatus(
  id: string,
  body: { payout_status: PayoutStatus },
): Promise<Commission> {
  return apiFetch(`/admin/commissions/${id}`, { method: 'PATCH', body });
}
