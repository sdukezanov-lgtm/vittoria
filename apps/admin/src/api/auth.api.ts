import { apiFetch } from './client';
import type { AuthUser, RefreshResponse, VerifyCodeResponse } from './types';

export function requestCode(phone: string): Promise<{ retry_after_sec: number }> {
  return apiFetch('/auth/request-code', { method: 'POST', body: { phone } });
}

export function verifyCode(phone: string, code: string): Promise<VerifyCodeResponse> {
  return apiFetch('/auth/verify-code', { method: 'POST', body: { phone, code } });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  return apiFetch('/auth/refresh', { method: 'POST', body: { refresh_token: refreshToken } });
}

export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<AuthUser> {
  return apiFetch('/me');
}
