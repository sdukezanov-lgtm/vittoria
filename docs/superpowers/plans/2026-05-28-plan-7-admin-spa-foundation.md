# Plan 7: Admin SPA — Foundation + Orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin SPA foundation (router, API client with auth+refresh, SMS-OTP login, role-gated routes, Mantine layout) plus the first feature: orders dashboard (filter/search/pagination) and order card (edit stage/%/comment).

**Architecture:** Vite + React 18 SPA. `api/client.ts` is the only HTTP boundary (module-level auth handlers registered by `AuthProvider`, single 401-refresh-retry). React Query for server state. React Router v6 with `ProtectedRoute` + `RoleGate` (admin focus; partner → placeholder). Mantine v7 UI. Tests via vitest + testing-library, mocking the `api/` layer (and `fetch` directly only for the client unit).

**Tech Stack:** React 18, TypeScript, Vite, `react-router-dom` v6, `@tanstack/react-query` v5, `@mantine/core`+`@mantine/hooks`+`@mantine/notifications` v7, vitest + @testing-library/react.

**Reference spec:** [docs/superpowers/specs/2026-05-28-plan-7-admin-spa-foundation-design.md](../specs/2026-05-28-plan-7-admin-spa-foundation-design.md)

**Verified backend contracts (from source):**
- `POST /api/v1/auth/request-code { phone }` → `{ retry_after_sec }` (200; 429 if rate-limited)
- `POST /api/v1/auth/verify-code { phone, code, device_info? }` → `{ access_token, refresh_token, user: { id, phone, role } }` (200)
- `POST /api/v1/auth/refresh { refresh_token }` → `{ access_token, refresh_token }` (200; NO user)
- `POST /api/v1/auth/logout` → 204 (requires Bearer)
- `GET /api/v1/me` → `{ id, phone, role, first_name, last_name, consent_accepted_at }`
- `GET /api/v1/admin/orders?search=&stage=&page=&page_size=` → `{ items: OrderResponse[], page, page_size, total }`
- `GET /api/v1/admin/orders/:id` → `OrderResponse`
- `PATCH /api/v1/admin/orders/:id/progress { stage?, progress_percent?, comment? }` → `OrderResponse`
- `OrderResponse = { id, amocrm_deal_id, contract_number, product_name, total_amount, prepayment_amount, balance_due, current_stage, progress_percent, service_phone, last_admin_comment, partner_services, created_at, updated_at }` (money fields are string|null)

**Prerequisites:**
- Plans 1–6 + 4b/4c/4d done. `main` on `f654438` or later.
- Backend running (`pnpm dev:infra` + api) only needed for manual smoke; tests mock the api layer.

**Out of scope:** Chat Inbox (SPA-1), Partners/Commissions (SPA-2), Audit/Templates (SPA-3), WebSocket, file upload, Playwright E2E.

---

## File Structure

```
apps/admin/
├── package.json                          ← MODIFY (+deps)
├── .env.example                          ← (documented in code; permission-guarded, skip if blocked)
└── src/
    ├── main.tsx                          ← unchanged
    ├── App.tsx                           ← REPLACE (providers + routes)
    ├── App.test.tsx                      ← REPLACE (smoke: renders login when unauthenticated)
    ├── stageLabels.ts                    ← NEW (OrderStage → ru label map + STAGES array)
    ├── api/
    │   ├── types.ts                      ← NEW (response DTO types)
    │   ├── client.ts                     ← NEW (apiFetch + setAuthHandlers + ApiError)
    │   ├── auth.api.ts                   ← NEW (requestCode/verifyCode/refresh/logout/getMe)
    │   └── orders.api.ts                 ← NEW (listOrders/getOrder/updateProgress)
    ├── auth/
    │   ├── AuthProvider.tsx              ← NEW
    │   ├── useAuth.ts                    ← NEW
    │   ├── ProtectedRoute.tsx            ← NEW
    │   └── RoleGate.tsx                  ← NEW
    ├── components/
    │   ├── AppLayout.tsx                 ← NEW (Mantine AppShell)
    │   └── PlaceholderPage.tsx           ← NEW
    └── pages/
        ├── LoginPage.tsx                 ← NEW
        ├── OrdersPage.tsx                ← NEW
        └── OrderPage.tsx                 ← NEW
    └── __tests__/                        ← NEW (test files colocated or here)
```

Tests are colocated as `*.test.tsx`/`*.test.ts` next to each unit (matches existing `App.test.tsx` convention).

---

## Task 1: Dependencies

**Files:**
- Modify: `apps/admin/package.json`

(App.tsx and App.test.tsx are NOT touched here — `App.tsx` is rewritten in Task 9 once all modules exist, so the app keeps compiling task-to-task. Task 1 is only dependency install.)

- [ ] **Step 1.1: Add deps to `apps/admin/package.json`**

Add to `dependencies` (alongside the existing `react`/`react-dom`):
```json
    "react-router-dom": "^6.26.0",
    "@tanstack/react-query": "^5.51.0",
    "@mantine/core": "^7.12.0",
    "@mantine/hooks": "^7.12.0",
    "@mantine/notifications": "^7.12.0"
```

- [ ] **Step 1.2: Install from repo root**

```bash
pnpm install
```

- [ ] **Step 1.3: Verify existing test still green + build clean**

```bash
pnpm --filter @vittoria/admin test
pnpm --filter @vittoria/admin build
```

Existing `App.test.tsx` (the `<h1>` smoke test) still passes; build clean. (App.tsx is unchanged in this task.)

- [ ] **Step 1.4: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): add router, react-query, mantine deps"
```

---

## Task 2: API types + client (apiFetch with 401-refresh)

**Files:**
- Create: `apps/admin/src/api/types.ts`
- Create: `apps/admin/src/api/client.ts`
- Create: `apps/admin/src/api/client.test.ts`

- [ ] **Step 2.1: Create `apps/admin/src/api/types.ts`**

```typescript
export type OrderStage =
  | 'preparation_for_production'
  | 'detailing'
  | 'materials_arrival'
  | 'production'
  | 'transfer_to_warehouse'
  | 'completeness_check'
  | 'ready_for_delivery';

export type UserRole = 'client' | 'admin' | 'partner';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  first_name?: string | null;
  last_name?: string | null;
}

export interface VerifyCodeResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; phone: string; role: UserRole };
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface PartnerServiceItem {
  type: string;
  label?: string;
  date?: string;
  price?: number;
}

export interface OrderResponse {
  id: string;
  amocrm_deal_id: number;
  contract_number: string | null;
  product_name: string | null;
  total_amount: string | null;
  prepayment_amount: string | null;
  balance_due: string | null;
  current_stage: OrderStage;
  progress_percent: number;
  service_phone: string | null;
  last_admin_comment: string | null;
  partner_services: PartnerServiceItem[];
  created_at: string;
  updated_at: string;
}

export interface OrdersListResponse {
  items: OrderResponse[];
  page: number;
  page_size: number;
  total: number;
}
```

- [ ] **Step 2.2: Failing test `apps/admin/src/api/client.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiFetch, setAuthHandlers, ApiError } from './client';

function mockFetchOnce(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    setAuthHandlers({
      getAccessToken: () => 'access-1',
      refresh: vi.fn(),
      onAuthFail: vi.fn(),
    });
    vi.restoreAllMocks();
  });

  it('attaches Bearer token and returns parsed json on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await apiFetch('/x');
    expect(res).toEqual({ ok: true });
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    const refresh = vi.fn().mockResolvedValue('access-2');
    setAuthHandlers({ getAccessToken: () => 'access-1', refresh, onAuthFail: vi.fn() });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchOnce(401, { error: { code: 'UNAUTHORIZED' } }))
      .mockResolvedValueOnce(mockFetchOnce(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await apiFetch('/x');
    expect(res).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondOpts] = fetchMock.mock.calls[1];
    expect((secondOpts.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
  });

  it('on second 401 after refresh calls onAuthFail and throws ApiError', async () => {
    const onAuthFail = vi.fn();
    setAuthHandlers({ getAccessToken: () => 'access-1', refresh: vi.fn().mockResolvedValue('access-2'), onAuthFail });
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(401, { error: { code: 'UNAUTHORIZED' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
    expect(onAuthFail).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with status on non-401 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchOnce(429, { error: { code: 'RATE' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 429 });
  });
});
```

- [ ] **Step 2.3: Run, expect FAIL**

```bash
pnpm --filter @vittoria/admin test -- client.test.ts
```

- [ ] **Step 2.4: Implement `apps/admin/src/api/client.ts`**

```typescript
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

interface FetchOpts {
  method?: string;
  body?: unknown;
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

  if (res.status === 401) {
    try {
      const newToken = await handlers.refresh();
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
```

- [ ] **Step 2.5: Run, expect PASS** (4 tests).

```bash
pnpm --filter @vittoria/admin test -- client.test.ts
```

- [ ] **Step 2.6: Commit**

```bash
git add apps/admin/src/api
git commit -m "feat(admin): apiFetch client with 401-refresh-retry + response types"
```

---

## Task 3: Auth + Orders endpoint functions

**Files:**
- Create: `apps/admin/src/api/auth.api.ts`
- Create: `apps/admin/src/api/orders.api.ts`
- Create: `apps/admin/src/stageLabels.ts`

- [ ] **Step 3.1: Create `apps/admin/src/api/auth.api.ts`**

```typescript
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
```

- [ ] **Step 3.2: Create `apps/admin/src/api/orders.api.ts`**

```typescript
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
```

- [ ] **Step 3.3: Create `apps/admin/src/stageLabels.ts`**

```typescript
import type { OrderStage } from './api/types';

export const STAGE_LABELS: Record<OrderStage, string> = {
  preparation_for_production: 'Подготовка для производства',
  detailing: 'Деталировка',
  materials_arrival: 'Поступление материалов на склад',
  production: 'Производство изделия',
  transfer_to_warehouse: 'Передача готового изделия на склад',
  completeness_check: 'Проверка комплектности товара',
  ready_for_delivery: 'Готовность к передаче клиенту',
};

export const STAGES: OrderStage[] = [
  'preparation_for_production',
  'detailing',
  'materials_arrival',
  'production',
  'transfer_to_warehouse',
  'completeness_check',
  'ready_for_delivery',
];
```

- [ ] **Step 3.4: Lint + build clean**

```bash
pnpm --filter @vittoria/admin lint
pnpm --filter @vittoria/admin build
```

(These thin endpoint wrappers are exercised by page tests in later tasks; no dedicated test file here.)

- [ ] **Step 3.5: Commit**

```bash
git add apps/admin/src/api apps/admin/src/stageLabels.ts
git commit -m "feat(admin): auth + orders endpoint functions + stage labels"
```

---

## Task 4: AuthProvider + useAuth (+ boot restore)

**Files:**
- Create: `apps/admin/src/auth/AuthProvider.tsx`
- Create: `apps/admin/src/auth/useAuth.ts`
- Create: `apps/admin/src/auth/AuthProvider.test.tsx`

- [ ] **Step 4.1: Failing test `apps/admin/src/auth/AuthProvider.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import * as authApi from '../api/auth.api';

vi.mock('../api/auth.api');

function Probe() {
  const { user, status, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.phone ?? 'none'}</span>
      <button onClick={() => void login('+79990000000', '1234')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
  });

  it('starts unauthenticated when no refresh token', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('login stores tokens + user and sets authenticated', async () => {
    vi.mocked(authApi.verifyCode).mockResolvedValue({
      access_token: 'a1',
      refresh_token: 'r1',
      user: { id: 'u1', phone: '+79990000000', role: 'admin' },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    await act(async () => {
      screen.getByText('login').click();
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('+79990000000');
    expect(localStorage.getItem('vittoria_refresh')).toBe('r1');
  });

  it('restores session on boot when refresh token present', async () => {
    localStorage.setItem('vittoria_refresh', 'r0');
    vi.mocked(authApi.refresh).mockResolvedValue({ access_token: 'a2', refresh_token: 'r2' });
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'admin' });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('+79991112233');
  });

  it('logout clears user + storage', async () => {
    localStorage.setItem('vittoria_refresh', 'r0');
    vi.mocked(authApi.refresh).mockResolvedValue({ access_token: 'a2', refresh_token: 'r2' });
    vi.mocked(authApi.getMe).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'admin' });
    vi.mocked(authApi.logout).mockResolvedValue();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await act(async () => {
      screen.getByText('logout').click();
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(localStorage.getItem('vittoria_refresh')).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/admin test -- AuthProvider.test.tsx
```

- [ ] **Step 4.3: Create `apps/admin/src/auth/useAuth.ts`**

```typescript
import { createContext, useContext } from 'react';
import type { AuthUser } from '../api/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4.4: Create `apps/admin/src/auth/AuthProvider.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { setAuthHandlers } from '../api/client';
import { getMe, logout as logoutApi, refresh as refreshApi, verifyCode } from '../api/auth.api';
import type { AuthUser } from '../api/types';
import { AuthContext, type AuthStatus } from './useAuth';

const REFRESH_KEY = 'vittoria_refresh';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const accessTokenRef = useRef<string | null>(null);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Register handlers for apiFetch (token access, refresh, auth-fail).
  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      refresh: async () => {
        const rt = localStorage.getItem(REFRESH_KEY);
        if (!rt) throw new Error('no refresh token');
        const res = await refreshApi(rt);
        accessTokenRef.current = res.access_token;
        localStorage.setItem(REFRESH_KEY, res.refresh_token);
        return res.access_token;
      },
      onAuthFail: () => clearSession(),
    });
  }, [clearSession]);

  // Boot: restore session if a refresh token exists.
  useEffect(() => {
    const rt = localStorage.getItem(REFRESH_KEY);
    if (!rt) {
      setStatus('unauthenticated');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await refreshApi(rt);
        accessTokenRef.current = res.access_token;
        localStorage.setItem(REFRESH_KEY, res.refresh_token);
        const me = await getMe();
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (phone: string, code: string) => {
    const res = await verifyCode(phone, code);
    accessTokenRef.current = res.access_token;
    localStorage.setItem(REFRESH_KEY, res.refresh_token);
    setUser({ id: res.user.id, phone: res.user.phone, role: res.user.role });
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // best-effort
    }
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
  );
}
```

- [ ] **Step 4.5: Run, expect PASS** (4 tests).

```bash
pnpm --filter @vittoria/admin test -- AuthProvider.test.tsx
```

- [ ] **Step 4.6: Commit**

```bash
git add apps/admin/src/auth
git commit -m "feat(admin): AuthProvider (SMS-OTP login, boot restore, logout)"
```

---

## Task 5: Routing guards + Layout

**Files:**
- Create: `apps/admin/src/auth/ProtectedRoute.tsx`
- Create: `apps/admin/src/auth/RoleGate.tsx`
- Create: `apps/admin/src/components/AppLayout.tsx`
- Create: `apps/admin/src/components/PlaceholderPage.tsx`
- Create: `apps/admin/src/auth/guards.test.tsx`

- [ ] **Step 5.1: Failing test `apps/admin/src/auth/guards.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleGate } from './RoleGate';
import { AuthContext, type AuthContextValue } from './useAuth';

function renderWithAuth(value: AuthContextValue, initialPath = '/') {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RoleGate allow={['admin']}>
                  <div>secret</div>
                </RoleGate>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const base: AuthContextValue = { user: null, status: 'unauthenticated', login: vi.fn(), logout: vi.fn() };

describe('ProtectedRoute + RoleGate', () => {
  it('redirects to /login when unauthenticated', () => {
    renderWithAuth(base);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('shows a loader while status is loading', () => {
    renderWithAuth({ ...base, status: 'loading' });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('renders children for admin', () => {
    renderWithAuth({ ...base, status: 'authenticated', user: { id: 'u', phone: 'p', role: 'admin' } });
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('shows placeholder for partner (role not allowed)', () => {
    renderWithAuth({ ...base, status: 'authenticated', user: { id: 'u', phone: 'p', role: 'partner' } });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText(/в разработке/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/admin test -- guards.test.tsx
```

- [ ] **Step 5.3: Create `apps/admin/src/components/PlaceholderPage.tsx`**

```tsx
import { Center, Text } from '@mantine/core';

export function PlaceholderPage({ message = 'Раздел в разработке' }: { message?: string }) {
  return (
    <Center h="100%" mih={200}>
      <Text c="dimmed">{message}</Text>
    </Center>
  );
}
```

- [ ] **Step 5.4: Create `apps/admin/src/auth/ProtectedRoute.tsx`**

```tsx
import { Center, Loader } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 5.5: Create `apps/admin/src/auth/RoleGate.tsx`**

```tsx
import type { UserRole } from '../api/types';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { useAuth } from './useAuth';

export function RoleGate({ allow, children }: { allow: UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) {
    return <PlaceholderPage />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 5.6: Create `apps/admin/src/components/AppLayout.tsx`**

```tsx
import { AppShell, Burger, Group, NavLink, Title, Button, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

export function AppLayout() {
  const [opened, { toggle }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>VITTORIA HOME</Title>
          </Group>
          <Group>
            <Text size="sm" c="dimmed">{user?.phone}</Text>
            <Button variant="subtle" size="xs" onClick={() => void handleLogout()}>
              Выход
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <NavLink component={RouterNavLink} to="/orders" label="Заказы" />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

- [ ] **Step 5.7: Run, expect PASS** (4 tests).

```bash
pnpm --filter @vittoria/admin test -- guards.test.tsx
```

(AppLayout is exercised indirectly; its render is verified at app-wiring smoke in Task 9.)

- [ ] **Step 5.8: Lint + build, commit**

```bash
pnpm --filter @vittoria/admin lint
git add apps/admin/src/auth apps/admin/src/components
git commit -m "feat(admin): ProtectedRoute + RoleGate + AppLayout + placeholder"
```

---

## Task 6: LoginPage (SMS-OTP)

**Files:**
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Create: `apps/admin/src/pages/LoginPage.test.tsx`

- [ ] **Step 6.1: Failing test `apps/admin/src/pages/LoginPage.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { AuthContext, type AuthContextValue } from '../auth/useAuth';
import * as authApi from '../api/auth.api';

vi.mock('../api/auth.api');

function setup(login = vi.fn().mockResolvedValue(undefined)) {
  const value: AuthContextValue = { user: null, status: 'unauthenticated', login, logout: vi.fn() };
  render(
    <MantineProvider>
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </MantineProvider>,
  );
  return { login };
}

describe('LoginPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requests code then verifies via login', async () => {
    vi.mocked(authApi.requestCode).mockResolvedValue({ retry_after_sec: 60 });
    const { login } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/телефон/i), '+79990000000');
    await user.click(screen.getByRole('button', { name: /получить код/i }));

    await waitFor(() => expect(authApi.requestCode).toHaveBeenCalledWith('+79990000000'));
    // step 2: code input appears
    await user.type(await screen.findByLabelText(/код/i), '1234');
    await user.click(screen.getByRole('button', { name: /войти/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('+79990000000', '1234'));
  });

  it('shows an error when login (verify) fails', async () => {
    vi.mocked(authApi.requestCode).mockResolvedValue({ retry_after_sec: 60 });
    const login = vi.fn().mockRejectedValue(new Error('bad code'));
    setup(login);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/телефон/i), '+79990000000');
    await user.click(screen.getByRole('button', { name: /получить код/i }));
    await user.type(await screen.findByLabelText(/код/i), '0000');
    await user.click(screen.getByRole('button', { name: /войти/i }));

    expect(await screen.findByText(/неверный код/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/admin test -- LoginPage.test.tsx
```

- [ ] **Step 6.3: Implement `apps/admin/src/pages/LoginPage.tsx`**

```tsx
import { useState } from 'react';
import { Button, Center, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { requestCode } from '../api/auth.api';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') {
    navigate('/orders', { replace: true });
  }

  const onRequestCode = async () => {
    setError(null);
    if (!/^\+7\d{10}$/.test(phone)) {
      setError('Введите телефон в формате +7XXXXXXXXXX');
      return;
    }
    setBusy(true);
    try {
      await requestCode(phone);
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'Слишком много попыток, подождите' : 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      await login(phone, code);
      navigate('/orders', { replace: true });
    } catch {
      setError('Неверный код');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center h="100vh">
      <Paper withBorder p="xl" w={360}>
        <Stack>
          <Title order={3}>VITTORIA HOME</Title>
          {step === 'phone' ? (
            <>
              <TextInput
                label="Телефон"
                placeholder="+79990000000"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
              <Button loading={busy} onClick={() => void onRequestCode()}>
                Получить код
              </Button>
            </>
          ) : (
            <>
              <TextInput
                label="Код из SMS"
                placeholder="1234"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
              />
              <Button loading={busy} onClick={() => void onVerify()}>
                Войти
              </Button>
              <Button variant="subtle" size="xs" onClick={() => { setStep('phone'); setError(null); }}>
                Назад
              </Button>
            </>
          )}
          {error && <Text c="red" size="sm">{error}</Text>}
        </Stack>
      </Paper>
    </Center>
  );
}
```

- [ ] **Step 6.4: Run, expect PASS** (2 tests).

```bash
pnpm --filter @vittoria/admin test -- LoginPage.test.tsx
```

- [ ] **Step 6.5: Lint + commit**

```bash
pnpm --filter @vittoria/admin lint
git add apps/admin/src/pages/LoginPage.tsx apps/admin/src/pages/LoginPage.test.tsx
git commit -m "feat(admin): LoginPage SMS-OTP two-step"
```

---

## Task 7: OrdersPage (list/filter/search/pagination)

**Files:**
- Create: `apps/admin/src/pages/OrdersPage.tsx`
- Create: `apps/admin/src/pages/OrdersPage.test.tsx`

- [ ] **Step 7.1: Failing test `apps/admin/src/pages/OrdersPage.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OrdersPage } from './OrdersPage';
import * as ordersApi from '../api/orders.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/orders.api');

function makeOrder(over: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: 'o1', amocrm_deal_id: 1, contract_number: 'C-1', product_name: 'Кухня',
    total_amount: null, prepayment_amount: null, balance_due: null,
    current_stage: 'production', progress_percent: 40, service_phone: null,
    last_admin_comment: null, partner_services: [], created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z', ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <OrdersPage />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('OrdersPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders order rows from listOrders', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue({
      items: [makeOrder({ contract_number: 'C-100' })], page: 1, page_size: 20, total: 1,
    });
    renderPage();
    expect(await screen.findByText('C-100')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByText('Производство изделия')).toBeInTheDocument();
  });

  it('re-queries with search term', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue({ items: [], page: 1, page_size: 20, total: 0 });
    renderPage();
    await waitFor(() => expect(ordersApi.listOrders).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/поиск/i), 'кухня');
    await waitFor(() =>
      expect(ordersApi.listOrders).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'кухня' })),
    );
  });
});
```

- [ ] **Step 7.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/admin test -- OrdersPage.test.tsx
```

- [ ] **Step 7.3: Implement `apps/admin/src/pages/OrdersPage.tsx`**

```tsx
import { useState } from 'react';
import { Group, Loader, Pagination, Select, Table, Text, TextInput, Title, Stack } from '@mantine/core';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listOrders } from '../api/orders.api';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS, STAGES } from '../stageLabels';

const PAGE_SIZE = 20;

export function OrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<OrderStage | null>(null);
  const [page, setPage] = useState(1);

  const query = { search: search || undefined, stage: stage ?? undefined, page, page_size: PAGE_SIZE };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders', query],
    queryFn: () => listOrders(query),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Stack>
      <Title order={3}>Заказы</Title>
      <Group>
        <TextInput
          placeholder="Поиск по договору/изделию"
          value={search}
          onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
          w={280}
        />
        <Select
          placeholder="Все этапы"
          clearable
          data={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
          value={stage}
          onChange={(v) => { setStage((v as OrderStage) ?? null); setPage(1); }}
          w={260}
        />
      </Group>

      {isLoading && <Loader />}
      {isError && <Text c="red">Не удалось загрузить заказы</Text>}
      {data && data.items.length === 0 && <Text c="dimmed">Заказов не найдено</Text>}

      {data && data.items.length > 0 && (
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Договор</Table.Th>
              <Table.Th>Изделие</Table.Th>
              <Table.Th>Этап</Table.Th>
              <Table.Th>%</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.items.map((o) => (
              <Table.Tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${o.id}`)}>
                <Table.Td>{o.contract_number ?? '—'}</Table.Td>
                <Table.Td>{o.product_name ?? '—'}</Table.Td>
                <Table.Td>{STAGE_LABELS[o.current_stage]}</Table.Td>
                <Table.Td>{o.progress_percent}%</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {data && totalPages > 1 && <Pagination value={page} onChange={setPage} total={totalPages} />}
    </Stack>
  );
}
```

- [ ] **Step 7.4: Run, expect PASS** (2 tests).

```bash
pnpm --filter @vittoria/admin test -- OrdersPage.test.tsx
```

- [ ] **Step 7.5: Lint + commit**

```bash
pnpm --filter @vittoria/admin lint
git add apps/admin/src/pages/OrdersPage.tsx apps/admin/src/pages/OrdersPage.test.tsx
git commit -m "feat(admin): OrdersPage (table, search, stage filter, pagination)"
```

---

## Task 8: OrderPage (details + edit form)

**Files:**
- Create: `apps/admin/src/pages/OrderPage.tsx`
- Create: `apps/admin/src/pages/OrderPage.test.tsx`

- [ ] **Step 8.1: Failing test `apps/admin/src/pages/OrderPage.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OrderPage } from './OrderPage';
import * as ordersApi from '../api/orders.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/orders.api');

const order: OrderResponse = {
  id: 'o1', amocrm_deal_id: 1, contract_number: 'C-1', product_name: 'Кухня',
  total_amount: '100000.00', prepayment_amount: '50000.00', balance_due: '50000.00',
  current_stage: 'production', progress_percent: 40, service_phone: null,
  last_admin_comment: 'комментарий', partner_services: [],
  created_at: '2026-05-28T00:00:00Z', updated_at: '2026-05-28T00:00:00Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/orders/o1']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('OrderPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('renders order details', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValue(order);
    renderPage();
    expect(await screen.findByText('C-1')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByDisplayValue('комментарий')).toBeInTheDocument();
  });

  it('submits the edit form via updateProgress', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValue(order);
    vi.mocked(ordersApi.updateProgress).mockResolvedValue({ ...order, progress_percent: 60 });
    renderPage();
    await screen.findByText('C-1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(ordersApi.updateProgress).toHaveBeenCalledWith('o1', expect.objectContaining({ progress_percent: 40 })),
    );
  });
});
```

- [ ] **Step 8.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/admin test -- OrderPage.test.tsx
```

- [ ] **Step 8.3: Implement `apps/admin/src/pages/OrderPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button, Group, Loader, NumberInput, Paper, Select, Stack, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getOrder, updateProgress } from '../api/orders.api';
import { ApiError } from '../api/client';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS, STAGES } from '../stageLabels';

export function OrderPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
  });

  const [stage, setStage] = useState<OrderStage | null>(null);
  const [percent, setPercent] = useState<number>(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (order) {
      setStage(order.current_stage);
      setPercent(order.progress_percent);
      setComment(order.last_admin_comment ?? '');
    }
  }, [order]);

  const mutation = useMutation({
    mutationFn: () =>
      updateProgress(id, {
        stage: stage ?? undefined,
        progress_percent: percent,
        comment: comment || undefined,
      }),
    onSuccess: () => {
      notifications.show({ message: 'Сохранено', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['order', id] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => {
      notifications.show({ message: 'Ошибка сохранения', color: 'red' });
    },
  });

  if (isLoading) return <Loader />;
  if (isError) {
    const msg = error instanceof ApiError && error.status === 404 ? 'Заказ не найден' : 'Ошибка загрузки';
    return <Text c="red">{msg}</Text>;
  }
  if (!order) return null;

  return (
    <Stack>
      <Title order={3}>{order.contract_number ?? 'Заказ'}</Title>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text><b>Изделие:</b> {order.product_name ?? '—'}</Text>
          <Text><b>Стоимость:</b> {order.total_amount ?? '—'}</Text>
          <Text><b>Предоплата:</b> {order.prepayment_amount ?? '—'}</Text>
          <Text><b>Остаток:</b> {order.balance_due ?? '—'}</Text>
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Stack>
          <Title order={5}>Обновить статус</Title>
          <Select
            label="Этап"
            data={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
            value={stage}
            onChange={(v) => setStage((v as OrderStage) ?? null)}
          />
          <NumberInput label="Готовность %" min={0} max={100} value={percent} onChange={(v) => setPercent(Number(v) || 0)} />
          <Textarea label="Комментарий" value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={2} />
          <Group>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
```

- [ ] **Step 8.4: Run, expect PASS** (2 tests).

```bash
pnpm --filter @vittoria/admin test -- OrderPage.test.tsx
```

- [ ] **Step 8.5: Lint + commit**

```bash
pnpm --filter @vittoria/admin lint
git add apps/admin/src/pages/OrderPage.tsx apps/admin/src/pages/OrderPage.test.tsx
git commit -m "feat(admin): OrderPage (details + edit stage/percent/comment)"
```

---

## Task 9: Wire App.tsx + full verification + push

**Files:**
- Replace: `apps/admin/src/App.tsx`
- Replace: `apps/admin/src/App.test.tsx`

- [ ] **Step 9.1: Replace `apps/admin/src/App.tsx`** (all modules now exist)

```tsx
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleGate } from './auth/RoleGate';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderPage } from './pages/OrderPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <RoleGate allow={['admin']}>
                      <AppLayout />
                    </RoleGate>
                  </ProtectedRoute>
                }
              >
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/orders/:id" element={<OrderPage />} />
                <Route index element={<Navigate to="/orders" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/orders" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </MantineProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 9.2: Replace `apps/admin/src/App.test.tsx`** (smoke: unauthenticated → login)

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('shows the login screen when unauthenticated', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('VITTORIA HOME')).toBeInTheDocument());
    expect(screen.getByLabelText(/телефон/i)).toBeInTheDocument();
  });
});
```

Note: App uses `BrowserRouter`; jsdom default URL is `/` → redirects to `/orders` → ProtectedRoute (unauthenticated) → `/login`. The login form renders. No network calls happen (no refresh token in cleared localStorage).

- [ ] **Step 9.3: Run admin lint + test + build**

```bash
pnpm --filter @vittoria/admin lint
pnpm --filter @vittoria/admin test
pnpm --filter @vittoria/admin build
```

All green. Test totals: client (4) + AuthProvider (4) + guards (4) + LoginPage (2) + OrdersPage (2) + OrderPage (2) + App smoke (1) = ~19.

- [ ] **Step 9.4: Full monorepo verification**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All packages green (api unchanged: 119 unit + 79 e2e; admin new tests; shared-types).

- [ ] **Step 9.5: Commit + push**

```bash
git add apps/admin/src/App.tsx apps/admin/src/App.test.tsx
git commit -m "feat(admin): wire App router + providers; smoke test"
git push origin main
```

- [ ] **Step 9.6: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions, confirm green.

---

## Definition of Done

- [x] Deps (router, react-query, mantine) installed; App wires QueryClient + Mantine + AuthProvider + Routes.
- [x] `apiFetch` with Bearer + single 401-refresh-retry + onAuthFail; ApiError with status/code.
- [x] SMS-OTP login (request→verify→tokens→user), boot session restore (refresh→getMe), logout.
- [x] ProtectedRoute (loader/redirect) + RoleGate (admin → app, partner → placeholder).
- [x] OrdersPage (search/stage-filter/pagination) + OrderPage (edit stage/%/comment, toast, query invalidation).
- [x] ~19 vitest tests green; admin lint + build clean.
- [x] Monorepo `pnpm install --frozen-lockfile && pnpm lint && pnpm test` green; CI green.

After SPA-0 → **SPA-1 Chat Inbox**.

---

## Manual smoke (optional, deferred to final project testing)

With backend running (`pnpm dev:infra` + `pnpm --filter @vittoria/api dev`) and `pnpm --filter @vittoria/admin dev`: open `http://localhost:5173`, log in as an admin (seed an admin user + SMS-OTP via api logs), see orders, open a card, change stage/% → toast, list reflects update. (CORS: backend must allow `http://localhost:5173`; if blocked, add it to api CORS config — out of scope here, flag for SPA integration.)

---

**End of Plan 7 (SPA-0).**
