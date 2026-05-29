import { apiFetch } from './client';

export interface NotificationTemplate {
  event: string;
  title: string;
  body: string;
  updated_at: string;
}

export function listTemplates(): Promise<{ rows: NotificationTemplate[] }> {
  return apiFetch('/admin/notification-templates');
}

export function updateTemplate(
  event: string,
  body: { title?: string; body?: string },
): Promise<NotificationTemplate> {
  return apiFetch(`/admin/notification-templates/${event}`, { method: 'PATCH', body });
}
