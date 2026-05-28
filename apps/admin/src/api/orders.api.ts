import { apiFetch } from './client';
import type { OrderResponse, OrdersListResponse, OrderStage } from './types';

export interface ListOrdersQuery {
  search?: string;
  stage?: OrderStage;
  page?: number;
  page_size?: number;
}

export function listOrders(query: ListOrdersQuery): Promise<OrdersListResponse> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.stage) params.set('stage', query.stage);
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/orders${qs ? `?${qs}` : ''}`);
}

export function getOrder(id: string): Promise<OrderResponse> {
  return apiFetch(`/admin/orders/${id}`);
}

export interface UpdateProgressBody {
  stage?: OrderStage;
  progress_percent?: number;
  comment?: string;
}

export function updateProgress(id: string, body: UpdateProgressBody): Promise<OrderResponse> {
  return apiFetch(`/admin/orders/${id}/progress`, { method: 'PATCH', body });
}
