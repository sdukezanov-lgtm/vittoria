import { apiFetch } from './client';
import type { UserRole } from './types';

export interface AdminUser {
  id: string;
  phone: string | null;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

export interface AdminUsersResponse {
  rows: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListAdminUsersQuery {
  role?: UserRole;
  page?: number;
  page_size?: number;
}

export function listAdminUsers(query: ListAdminUsersQuery = {}): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (query.role) params.set('role', query.role);
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/users${qs ? `?${qs}` : ''}`);
}

export interface CreateAdminUserBody {
  phone: string;
  role: 'admin' | 'partner';
  first_name?: string;
  last_name?: string;
}

export function createAdminUser(body: CreateAdminUserBody): Promise<AdminUser> {
  return apiFetch('/admin/users', { method: 'POST', body });
}
