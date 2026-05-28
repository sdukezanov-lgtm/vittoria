import { apiFetch } from './client';
import type { AuthUser, RefreshResponse, VerifyCodeResponse } from './types';

export function requestCode(phone: string): Promise<{ retry_after_sec: number }> {
  return apiFetch('/auth/request-code', { method: 'POST', body: { phone }, skipAuthRetry: true });
}

export function verifyCode(phone: string, code: string): Promise<VerifyCodeResponse> {
  return apiFetch('/auth/verify-code', { method: 'POST', body: { phone, code }, skipAuthRetry: true });
}

export function refresh(refreshToken: string): Promise<RefreshResponse> {
  // skipAuthRetry: a 401 here means the refresh token is invalid — must NOT recurse into another refresh.
  return apiFetch('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    skipAuthRetry: true,
  });
}

export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<AuthUser> {
  return apiFetch('/me');
}
