import { apiFetch } from './client';
import type { OrderResponse, OrderStage } from './types';

export interface StageHistoryItem {
  id: string;
  stage: OrderStage;
  progress_percent: number;
  comment: string | null;
  changed_at: string;
}

export interface OrderChatRef {
  id: string;
  order_id: string;
  created_at: string;
  unread_count: number;
}

export interface ServiceContact {
  phone: string;
  hours: string;
}

// NOTE: client list endpoint returns { items } (no pagination), unlike /admin/orders.
export function listMyOrders(): Promise<{ items: OrderResponse[] }> {
  return apiFetch('/orders');
}

export function getMyOrder(id: string): Promise<OrderResponse> {
  return apiFetch(`/orders/${id}`);
}

export function getOrderHistory(id: string): Promise<{ items: StageHistoryItem[] }> {
  return apiFetch(`/orders/${id}/history`);
}

export function getOrderChat(id: string): Promise<OrderChatRef> {
  return apiFetch(`/orders/${id}/chat`);
}

export function getServiceContact(): Promise<ServiceContact> {
  return apiFetch('/service/contact');
}
