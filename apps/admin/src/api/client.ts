const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface AuthHandlers {
  getAccessToken: () => string | null;
  refresh: () => Promise<string>; // resolves to the new access token; rejects on failure
  onAuthFail: () => void;
}

let handlers: AuthHandlers = {
  getAccessToken: () => null,
  refresh: () => Promise.reject(new Error('no refresh handler')),
  onAuthFail: () => {},
};

export function setAuthHandlers(h: AuthHandlers): void {
  handlers = h;
}

// Single-flight the refresh: the server rotates and revokes the refresh token on
// every call, so concurrent 401s must share ONE refresh — otherwise the losers
// send an already-revoked token, get 401, and the user is logged out mid-session.
let inFlightRefresh: Promise<string> | null = null;

function refreshOnce(): Promise<string> {
  if (!inFlightRefresh) {
    inFlightRefresh = handlers.refresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  // Skip the 401-refresh-retry. Set for the auth endpoints themselves
  // (e.g. /auth/refresh) so a 401 there cannot recursively trigger another refresh.
  skipAuthRetry?: boolean;
}

async function doFetch(path: string, opts: FetchOpts, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function parseError(res: Response): Promise<ApiError> {
  let code: string | null = null;
  let message = `HTTP ${res.status}`;
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    code = data.error?.code ?? null;
    message = data.error?.message ?? message;
  } catch {
    // non-JSON body
  }
  return new ApiError(res.status, code, message);
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  let res = await doFetch(path, opts, handlers.getAccessToken());

  if (res.status === 401 && !opts.skipAuthRetry) {
    try {
      const newToken = await refreshOnce();
      res = await doFetch(path, opts, newToken);
    } catch {
      handlers.onAuthFail();
      throw new ApiError(401, 'UNAUTHORIZED', 'session expired');
    }
    if (res.status === 401) {
      handlers.onAuthFail();
      throw new ApiError(401, 'UNAUTHORIZED', 'session expired');
    }
  }

  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
