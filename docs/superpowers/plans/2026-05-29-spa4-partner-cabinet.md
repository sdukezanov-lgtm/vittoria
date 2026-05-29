# SPA-4 Partner Cabinet (role=partner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the existing admin SPA role-aware so a user with role `partner` gets their own cabinet: read-only "Мои заказы" (list + detail), read-only "Мои вознаграждения" (commissions with status filter), and a "Профиль" (view phone/role, edit name). Partners must NOT see admin screens. Consumes existing `/partner/*` and `/me` endpoints. No backend changes.

**Architecture:** New `partner.api.ts` + `profile.api.ts` HTTP modules. New partner pages mirror the admin pages but read-only and against partner endpoints. A `PartnerLayout` (Mantine AppShell, partner nav) parallels `AppLayout`. A `RoleHome` component redirects "/" + unknown paths to the role's home. App routing gains a second role-gated block (`RoleGate allow={['partner']}`). `LoginPage`'s post-auth redirect becomes role-agnostic (→ "/", handled by `RoleHome`).

**Tech Stack:** React 18 + TS, react-router v6, @tanstack/react-query v5, Mantine v7, vitest + RTL + user-event.

**Backend consumed (role partner unless noted, via `apiFetch`):**
- `GET /partner/orders` → `{ items: OrderResponse[] }` (OrderResponse identical to admin; see `apps/admin/src/api/types.ts`).
- `GET /partner/orders/:id` → `OrderResponse`.
- `GET /partner/commissions?payout_status=` → `{ rows: Commission[] }` (Commission from `commissions.api.ts`).
- `GET /me` → `AuthUser` (`{ id, phone, role, first_name?, last_name? }`); `PATCH /me` body `{ first_name?, last_name?, city? }` → `AuthUser` (any authenticated role).

**Single-file test command:** `pnpm --filter @vittoria/admin exec vitest run <path-relative-to-apps/admin>`

---

### Task 1: partner.api.ts + profile.api.ts

**Files:**
- Create: `apps/admin/src/api/partner.api.ts`
- Create: `apps/admin/src/api/profile.api.ts`
- Test: `apps/admin/src/api/partner.api.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/api/partner.api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listPartnerOrders, getPartnerOrder, listPartnerCommissions } from './partner.api';
import { getProfile, updateProfile } from './profile.api';

vi.mock('./client');

describe('partner.api + profile.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listPartnerOrders GETs /partner/orders', async () => {
    await listPartnerOrders();
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/orders');
  });
  it('getPartnerOrder GETs by id', async () => {
    await getPartnerOrder('o1');
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/orders/o1');
  });
  it('listPartnerCommissions builds query', async () => {
    await listPartnerCommissions({ payout_status: 'paid' });
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/commissions?payout_status=paid');
  });
  it('listPartnerCommissions omits empty', async () => {
    await listPartnerCommissions();
    expect(client.apiFetch).toHaveBeenCalledWith('/partner/commissions');
  });
  it('getProfile GETs /me', async () => {
    await getProfile();
    expect(client.apiFetch).toHaveBeenCalledWith('/me');
  });
  it('updateProfile PATCHes /me', async () => {
    await updateProfile({ first_name: 'Иван', last_name: 'Петров' });
    expect(client.apiFetch).toHaveBeenCalledWith('/me', { method: 'PATCH', body: { first_name: 'Иван', last_name: 'Петров' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/api/partner.api.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `apps/admin/src/api/partner.api.ts`:
```ts
import { apiFetch } from './client';
import type { OrderResponse } from './types';
import type { Commission, PayoutStatus } from './commissions.api';

export function listPartnerOrders(): Promise<{ items: OrderResponse[] }> {
  return apiFetch('/partner/orders');
}

export function getPartnerOrder(id: string): Promise<OrderResponse> {
  return apiFetch(`/partner/orders/${id}`);
}

export function listPartnerCommissions(
  query: { payout_status?: PayoutStatus } = {},
): Promise<{ rows: Commission[] }> {
  const params = new URLSearchParams();
  if (query.payout_status) params.set('payout_status', query.payout_status);
  const qs = params.toString();
  return apiFetch(`/partner/commissions${qs ? `?${qs}` : ''}`);
}
```
`apps/admin/src/api/profile.api.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/api/partner.api.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/api/partner.api.ts apps/admin/src/api/profile.api.ts apps/admin/src/api/partner.api.test.ts
git commit -m "feat(admin): partner.api + profile.api clients"
```

---

### Task 2: PartnerOrdersPage + PartnerOrderPage (read-only)

**Files:**
- Create: `apps/admin/src/pages/PartnerOrdersPage.tsx`
- Create: `apps/admin/src/pages/PartnerOrderPage.tsx`
- Test: `apps/admin/src/pages/PartnerOrdersPage.test.tsx`
- Test: `apps/admin/src/pages/PartnerOrderPage.test.tsx`

- [ ] **Step 1: Write the failing tests.**
`apps/admin/src/pages/PartnerOrdersPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PartnerOrdersPage } from './PartnerOrdersPage';
import * as partnerApi from '../api/partner.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/partner.api');

function order(over: Partial<OrderResponse> = {}): OrderResponse {
  return {
    id: 'o1', amocrm_deal_id: 1, contract_number: '1024', product_name: 'Кухня',
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
        <MemoryRouter><PartnerOrdersPage /></MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnerOrdersPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('renders partner order rows', async () => {
    vi.mocked(partnerApi.listPartnerOrders).mockResolvedValue({ items: [order({ contract_number: '1024' })] });
    renderPage();
    expect(await screen.findByText('1024')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByText('Производство изделия')).toBeInTheDocument();
  });
});
```
`apps/admin/src/pages/PartnerOrderPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PartnerOrderPage } from './PartnerOrderPage';
import * as partnerApi from '../api/partner.api';
import type { OrderResponse } from '../api/types';

vi.mock('../api/partner.api');

const order: OrderResponse = {
  id: 'o1', amocrm_deal_id: 1, contract_number: '1024', product_name: 'Кухня',
  total_amount: '100000.00', prepayment_amount: '50000.00', balance_due: '50000.00',
  current_stage: 'production', progress_percent: 40, service_phone: null,
  last_admin_comment: 'комментарий', partner_services: [],
  created_at: '2026-05-28T00:00:00Z', updated_at: '2026-05-28T00:00:00Z',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/partner/orders/o1']}>
          <Routes><Route path="/partner/orders/:id" element={<PartnerOrderPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnerOrderPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('renders read-only order details (no save button)', async () => {
    vi.mocked(partnerApi.getPartnerOrder).mockResolvedValue(order);
    renderPage();
    expect(await screen.findByText('1024')).toBeInTheDocument();
    expect(screen.getByText('Кухня')).toBeInTheDocument();
    expect(screen.getByText('Производство изделия')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сохранить/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run both, expect FAIL** — `pnpm --filter @vittoria/admin exec vitest run src/pages/PartnerOrdersPage.test.tsx src/pages/PartnerOrderPage.test.tsx`.

- [ ] **Step 3: Implement.**
`apps/admin/src/pages/PartnerOrdersPage.tsx` — mirror `OrdersPage.tsx` but: query `['partnerOrders']` → `listPartnerOrders()`; Title "Мои заказы"; no search/filter/pagination (partner list is small); Table columns Договор / Изделие / Этап / % exactly like OrdersPage (use `STAGE_LABELS` from `../stageLabels`); row click → `navigate(`/partner/orders/${o.id}`)`; loading/error/empty ("Заказов нет") states. Data shape: `data?.items ?? []`.
`apps/admin/src/pages/PartnerOrderPage.tsx` — mirror the READ-ONLY part of `OrderPage.tsx`: `useParams` id; query `['partnerOrder', id]` → `getPartnerOrder(id)`; Title = `order.contract_number ?? 'Заказ'`; a `Paper` block showing Изделие / Стоимость / Предоплата / Остаток / Этап (`STAGE_LABELS[current_stage]`) / Готовность (`progress_percent%`) / Комментарий (`last_admin_comment ?? '—'`). NO edit form, NO "Сохранить" button, NO mutation. Loading `<Loader/>`; 404 → "Заказ не найден" (check `ApiError` status 404 via `error instanceof ApiError`); other error → "Ошибка загрузки".

- [ ] **Step 4: Run both, expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/PartnerOrdersPage.tsx apps/admin/src/pages/PartnerOrderPage.tsx apps/admin/src/pages/PartnerOrdersPage.test.tsx apps/admin/src/pages/PartnerOrderPage.test.tsx
git commit -m "feat(admin): partner orders list + read-only order detail"
```

---

### Task 3: PartnerCommissionsPage (read-only + filter)

**Files:**
- Create: `apps/admin/src/pages/PartnerCommissionsPage.tsx`
- Test: `apps/admin/src/pages/PartnerCommissionsPage.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/pages/PartnerCommissionsPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartnerCommissionsPage } from './PartnerCommissionsPage';
import * as partnerApi from '../api/partner.api';

vi.mock('../api/partner.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <PartnerCommissionsPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnerCommissionsPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('renders own commissions with amount and status label', async () => {
    vi.mocked(partnerApi.listPartnerCommissions).mockResolvedValue({
      rows: [{ id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'paid', paid_at: '2026-05-28T00:00:00Z', created_at: '2026-05-28T00:00:00Z' }],
    });
    renderPage();
    expect(await screen.findByText('5000.00')).toBeInTheDocument();
    expect(screen.getByText('Выплачено')).toBeInTheDocument();
  });
  it('filters by status', async () => {
    vi.mocked(partnerApi.listPartnerCommissions).mockResolvedValue({ rows: [] });
    renderPage();
    await waitFor(() => expect(partnerApi.listPartnerCommissions).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByPlaceholderText(/все статусы/i));
    await user.click(await screen.findByText('Выплачено'));
    await waitFor(() =>
      expect(partnerApi.listPartnerCommissions).toHaveBeenLastCalledWith(expect.objectContaining({ payout_status: 'paid' })),
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @vittoria/admin exec vitest run src/pages/PartnerCommissionsPage.test.tsx`.

- [ ] **Step 3: Implement** `apps/admin/src/pages/PartnerCommissionsPage.tsx`:
  - Title "Мои вознаграждения".
  - Local `statusFilter: PayoutStatus | null`; `Select` (placeholder "Все статусы", clearable, `comboboxProps={{ keepMounted: false }}`, data from `PAYOUT_STATUSES` with `PAYOUT_STATUS_LABELS`).
  - Query `['partnerCommissions', { statusFilter }]` → `listPartnerCommissions({ payout_status: statusFilter ?? undefined })`, `placeholderData: keepPreviousData`.
  - Table columns: "Сумма" (`row.amount`), "Статус" (`PAYOUT_STATUS_LABELS[row.payout_status]`), "Выплачено" (`row.paid_at ? new Date(row.paid_at).toLocaleDateString('ru-RU') : '—'`).
  - Loading/error/empty ("Не удалось загрузить" / "Вознаграждений нет").
  - Imports: `listPartnerCommissions` from `../api/partner.api`; `type PayoutStatus` from `../api/commissions.api`; `PAYOUT_STATUS_LABELS, PAYOUT_STATUSES` from `../payoutLabels`.

- [ ] **Step 4: Run, expect PASS (2 tests).**

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/PartnerCommissionsPage.tsx apps/admin/src/pages/PartnerCommissionsPage.test.tsx
git commit -m "feat(admin): partner commissions (read-only + status filter)"
```

---

### Task 4: ProfilePage (view + edit name)

**Files:**
- Create: `apps/admin/src/pages/ProfilePage.tsx`
- Test: `apps/admin/src/pages/ProfilePage.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/pages/ProfilePage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfilePage } from './ProfilePage';
import * as profileApi from '../api/profile.api';

vi.mock('../api/profile.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <ProfilePage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('shows phone and editable name, saves changes', async () => {
    vi.mocked(profileApi.getProfile).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'partner', first_name: 'Иван', last_name: 'Петров' });
    vi.mocked(profileApi.updateProfile).mockResolvedValue({ id: 'u1', phone: '+79991112233', role: 'partner', first_name: 'Пётр', last_name: 'Петров' });
    renderPage();
    expect(await screen.findByText('+79991112233')).toBeInTheDocument();
    const firstNameInput = await screen.findByDisplayValue('Иван');
    const user = userEvent.setup();
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Пётр');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(profileApi.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'Пётр' })),
    );
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @vittoria/admin exec vitest run src/pages/ProfilePage.test.tsx`.

- [ ] **Step 3: Implement** `apps/admin/src/pages/ProfilePage.tsx`:
  - Query `['profile']` → `getProfile()`.
  - Title "Профиль". `Paper withBorder p="md"` with a `Stack`.
  - Show phone read-only: `<Text><b>Телефон:</b> {data?.phone ?? '—'}</Text>`.
  - Editable name: local state `firstName`/`lastName` initialised from data via a `useEffect` on `data` (set when data arrives, like `OrderPage.tsx`); `TextInput label="Имя"` (firstName), `TextInput label="Фамилия"` (lastName).
  - `useMutation({ mutationFn: () => updateProfile({ first_name: firstName || undefined, last_name: lastName || undefined }), onSuccess: () => { notifications.show({ message: 'Профиль сохранён', color: 'green' }); void queryClient.invalidateQueries({ queryKey: ['profile'] }); }, onError: () => notifications.show({ message: 'Не удалось сохранить', color: 'red' }) })`.
  - Button "Сохранить" (`loading` while pending) → `mutation.mutate()`.
  - Loading `<Loader/>`; error `<Text c="red">Не удалось загрузить профиль</Text>`.
  - Imports: `getProfile, updateProfile` from `../api/profile.api`; Mantine `Title, Paper, Stack, Text, TextInput, Button, Loader`; react-query hooks; `notifications`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/ProfilePage.tsx apps/admin/src/pages/ProfilePage.test.tsx
git commit -m "feat(admin): ProfilePage (view phone, edit name)"
```

---

### Task 5: PartnerLayout + RoleHome + routing + role-aware login redirect

**Files:**
- Create: `apps/admin/src/components/PartnerLayout.tsx`
- Create: `apps/admin/src/auth/RoleHome.tsx`
- Create: `apps/admin/src/components/PartnerLayout.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/pages/LoginPage.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/components/PartnerLayout.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { PartnerLayout } from './PartnerLayout';
import { AuthContext, type AuthContextValue } from '../auth/useAuth';

function renderLayout() {
  const auth: AuthContextValue = {
    user: { id: 'u1', phone: '+79991112233', role: 'partner' },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
  };
  render(
    <MantineProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter><PartnerLayout /></MemoryRouter>
      </AuthContext.Provider>
    </MantineProvider>,
  );
}

describe('PartnerLayout', () => {
  it('shows the partner nav links', () => {
    renderLayout();
    expect(screen.getByText('Мои заказы')).toBeInTheDocument();
    expect(screen.getByText('Мои вознаграждения')).toBeInTheDocument();
    expect(screen.getByText('Профиль')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @vittoria/admin exec vitest run src/components/PartnerLayout.test.tsx`.

- [ ] **Step 3: Implement `apps/admin/src/components/PartnerLayout.tsx`** — copy the structure of `apps/admin/src/components/AppLayout.tsx` but: NO chat query/badge; navbar links are `Мои заказы`→`/partner/orders`, `Мои вознаграждения`→`/partner/commissions`, `Профиль`→`/partner/profile`; keep the header (VITTORIA HOME title, `user?.phone`, logout Button that calls `logout()` then `navigate('/login', { replace: true })`); `<AppShell.Main><Outlet /></AppShell.Main>`. Imports: Mantine `AppShell, Burger, Button, Group, NavLink, Text, Title`; `useDisclosure`; `NavLink as RouterNavLink, Outlet, useNavigate` from react-router-dom; `useAuth`.

- [ ] **Step 4: Implement `apps/admin/src/auth/RoleHome.tsx`:**
```tsx
import { Center, Loader } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export function RoleHome() {
  const { user, status } = useAuth();
  if (status === 'loading') {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={user.role === 'partner' ? '/partner/orders' : '/orders'} replace />;
}
```

- [ ] **Step 5: Update `apps/admin/src/App.tsx`** — READ it first. Add imports:
```tsx
import { PartnerLayout } from './components/PartnerLayout';
import { PartnerOrdersPage } from './pages/PartnerOrdersPage';
import { PartnerOrderPage } from './pages/PartnerOrderPage';
import { PartnerCommissionsPage } from './pages/PartnerCommissionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { RoleHome } from './auth/RoleHome';
```
Inside `<Routes>`: (a) REMOVE the admin block's `<Route index element={<Navigate to="/orders" replace />} />` line; (b) change the final catch-all from `<Route path="*" element={<Navigate to="/orders" replace />} />` to `<Route path="*" element={<RoleHome />} />`; (c) add a new gated block AFTER the admin block and BEFORE the catch-all:
```tsx
<Route
  element={
    <ProtectedRoute>
      <RoleGate allow={['partner']}>
        <PartnerLayout />
      </RoleGate>
    </ProtectedRoute>
  }
>
  <Route path="/partner/orders" element={<PartnerOrdersPage />} />
  <Route path="/partner/orders/:id" element={<PartnerOrderPage />} />
  <Route path="/partner/commissions" element={<PartnerCommissionsPage />} />
  <Route path="/partner/profile" element={<ProfilePage />} />
</Route>
```
Keep `Navigate` imported only if still used elsewhere; if the removal makes `Navigate` unused, remove it from the import to satisfy lint. (Check: after these edits `Navigate` is no longer used in App.tsx → remove it from the `react-router-dom` import.)

- [ ] **Step 6: Update `apps/admin/src/pages/LoginPage.tsx`** — READ it first. Change the authenticated redirect target from `/orders` to `/` so `RoleHome` routes by role: replace `return <Navigate to="/orders" replace />;` with `return <Navigate to="/" replace />;`. Do not change anything else.

- [ ] **Step 7: Run the PartnerLayout test** — `pnpm --filter @vittoria/admin exec vitest run src/components/PartnerLayout.test.tsx` → PASS.

- [ ] **Step 8: Full admin gates** — `pnpm --filter @vittoria/admin test` (all green; confirm App.test.tsx still passes — unauthenticated "/" → RoleHome → /login → LoginPage), `pnpm --filter @vittoria/admin build` (clean), `pnpm --filter @vittoria/admin lint` (clean, no unused `Navigate`).

- [ ] **Step 9: Commit**
```bash
git add apps/admin/src/components/PartnerLayout.tsx apps/admin/src/components/PartnerLayout.test.tsx apps/admin/src/auth/RoleHome.tsx apps/admin/src/App.tsx apps/admin/src/pages/LoginPage.tsx
git commit -m "feat(admin): partner cabinet routing (PartnerLayout, RoleHome, role-aware redirects)"
```

---

## Self-Review

- partner.api + profile.api → Task 1. ✓
- Read-only partner orders list + detail → Task 2. ✓
- Read-only partner commissions + filter → Task 3. ✓
- Profile view + edit name → Task 4. ✓
- Role-aware layout/routing (PartnerLayout, RoleHome, second RoleGate block, login redirect) → Task 5. ✓
- Partner cannot reach admin pages (admin routes gated `allow={['admin']}` → PlaceholderPage for partner; partner home via RoleHome). ✓
- Existing App.test (unauthenticated → login) preserved via RoleHome. ✓
- No backend changes. ✓
- Types reuse OrderResponse / Commission / PayoutStatus / AuthUser. ✓
