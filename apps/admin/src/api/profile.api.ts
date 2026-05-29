import { apiFetch } from './client';
import type { AuthUser } from './types';

export interface UpdateProfileBody {
  first_name?: string;
  last_name?: string;
  city?: string;
}

export function getProfile(): Promise<AuthUser> {
  return apiFetch('/me');
}

export function updateProfile(body: UpdateProfileBody): Promise<AuthUser> {
  return apiFetch('/me', { method: 'PATCH', body });
}
