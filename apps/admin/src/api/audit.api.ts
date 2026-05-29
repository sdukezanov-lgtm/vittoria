import { apiFetch } from './client';

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

export interface AuditLogResponse {
  rows: AuditLogRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListAuditLogQuery {
  entity?: string;
  actor?: string;
  page?: number;
  page_size?: number;
}

export function listAuditLog(query: ListAuditLogQuery = {}): Promise<AuditLogResponse> {
  const params = new URLSearchParams();
  if (query.entity) params.set('entity', query.entity);
  if (query.actor) params.set('actor', query.actor);
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/audit-log${qs ? `?${qs}` : ''}`);
}
