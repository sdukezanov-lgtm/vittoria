# SPA-2 Partners & Commissions (admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add admin screens to manage partners (list + create) and partner commissions (list, filter, create, change payout status), consuming existing Plan 6 backend endpoints. No backend changes.

**Architecture:** Two new HTTP-boundary modules (`users.api.ts`, `commissions.api.ts`) mirroring `orders.api.ts`; two pages (`PartnersPage`, `CommissionsPage`) mirroring `OrdersPage` (react-query + Mantine Table/Modal); routes + nav added. Tests mirror SPA-0/SPA-1 (MantineProvider + QueryClientProvider, mocked api).

**Tech Stack:** React 18 + TS, react-router v6, @tanstack/react-query v5, Mantine v7, vitest + RTL + user-event.

**Backend consumed (all role admin, via `apiFetch`):**
- `GET /admin/users?role=&page=&page_size=` → `{ rows: UserResponse[], total, page, page_size }`, `UserResponse = { id, phone: string|null, role, first_name: string|null, last_name: string|null, created_at }`.
- `POST /admin/users` body `{ phone: '^\+7\d{10}$', role: 'admin'|'partner', first_name?, last_name? }` → UserResponse.
- `GET /admin/commissions?partner_user_id=&payout_status=&page=&page_size=` → `{ rows: CommissionResponse[], total, page, page_size }`, `CommissionResponse = { id, order_id, partner_user_id, amount: string, payout_status: 'pending'|'approved'|'paid', paid_at: string|null, created_at }`.
- `POST /admin/commissions` body `{ order_id, partner_user_id, amount: number }` → CommissionResponse.
- `PATCH /admin/commissions/:id` body `{ payout_status }` → CommissionResponse.
- (reuse) `GET /admin/orders?...` from `orders.api.ts` for the order picker.

**Single-file test command:** `pnpm --filter @vittoria/admin exec vitest run <path-relative-to-apps/admin>`

---

### Task 1: users.api.ts + commissions.api.ts + payout labels

**Files:**
- Create: `apps/admin/src/api/users.api.ts`
- Create: `apps/admin/src/api/commissions.api.ts`
- Create: `apps/admin/src/payoutLabels.ts`
- Test: `apps/admin/src/api/commissions.api.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/api/commissions.api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listCommissions, createCommission, updateCommissionStatus } from './commissions.api';
import { listAdminUsers, createAdminUser } from './users.api';

vi.mock('./client');

describe('commissions.api + users.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listCommissions builds query string', async () => {
    await listCommissions({ partner_user_id: 'p1', payout_status: 'paid', page: 2, page_size: 50 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions?partner_user_id=p1&payout_status=paid&page=2&page_size=50');
  });
  it('listCommissions omits empty params', async () => {
    await listCommissions();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions');
  });
  it('createCommission posts body', async () => {
    await createCommission({ order_id: 'o1', partner_user_id: 'p1', amount: 5000 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions', { method: 'POST', body: { order_id: 'o1', partner_user_id: 'p1', amount: 5000 } });
  });
  it('updateCommissionStatus patches', async () => {
    await updateCommissionStatus('c1', { payout_status: 'approved' });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/commissions/c1', { method: 'PATCH', body: { payout_status: 'approved' } });
  });
  it('listAdminUsers builds query string', async () => {
    await listAdminUsers({ role: 'partner', page: 1, page_size: 100 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/users?role=partner&page=1&page_size=100');
  });
  it('createAdminUser posts body', async () => {
    await createAdminUser({ phone: '+79990000000', role: 'partner', first_name: 'Иван' });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/users', { method: 'POST', body: { phone: '+79990000000', role: 'partner', first_name: 'Иван' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/api/commissions.api.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/admin/src/api/users.api.ts`:
```ts
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
```
`apps/admin/src/api/commissions.api.ts`:
```ts
import { apiFetch } from './client';

export type PayoutStatus = 'pending' | 'approved' | 'paid';

export interface Commission {
  id: string;
  order_id: string;
  partner_user_id: string;
  amount: string;
  payout_status: PayoutStatus;
  paid_at: string | null;
  created_at: string;
}

export interface CommissionsResponse {
  rows: Commission[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListCommissionsQuery {
  partner_user_id?: string;
  payout_status?: PayoutStatus;
  page?: number;
  page_size?: number;
}

export function listCommissions(query: ListCommissionsQuery = {}): Promise<CommissionsResponse> {
  const params = new URLSearchParams();
  if (query.partner_user_id) params.set('partner_user_id', query.partner_user_id);
  if (query.payout_status) params.set('payout_status', query.payout_status);
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/commissions${qs ? `?${qs}` : ''}`);
}

export interface CreateCommissionBody {
  order_id: string;
  partner_user_id: string;
  amount: number;
}

export function createCommission(body: CreateCommissionBody): Promise<Commission> {
  return apiFetch('/admin/commissions', { method: 'POST', body });
}

export function updateCommissionStatus(
  id: string,
  body: { payout_status: PayoutStatus },
): Promise<Commission> {
  return apiFetch(`/admin/commissions/${id}`, { method: 'PATCH', body });
}
```
`apps/admin/src/payoutLabels.ts`:
```ts
import type { PayoutStatus } from './api/commissions.api';

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  paid: 'Выплачено',
};

export const PAYOUT_STATUSES: PayoutStatus[] = ['pending', 'approved', 'paid'];
```

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/api/commissions.api.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/api/users.api.ts apps/admin/src/api/commissions.api.ts apps/admin/src/payoutLabels.ts apps/admin/src/api/commissions.api.test.ts
git commit -m "feat(admin): users.api + commissions.api clients + payout labels"
```

---

### Task 2: PartnersPage (list + create)

**Files:**
- Create: `apps/admin/src/pages/PartnersPage.tsx`
- Test: `apps/admin/src/pages/PartnersPage.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/pages/PartnersPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PartnersPage } from './PartnersPage';
import * as usersApi from '../api/users.api';

vi.mock('../api/users.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <PartnersPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('PartnersPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders partner rows', async () => {
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue({
      rows: [{ id: 'p1', phone: '+79991112233', role: 'partner', first_name: 'Иван', last_name: 'Петров', created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
    renderPage();
    expect(await screen.findByText('+79991112233')).toBeInTheDocument();
    expect(screen.getByText(/Иван Петров/)).toBeInTheDocument();
    expect(usersApi.listAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ role: 'partner' }));
  });

  it('creates a partner via the modal', async () => {
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    vi.mocked(usersApi.createAdminUser).mockResolvedValue({ id: 'p2', phone: '+79990000000', role: 'partner', first_name: null, last_name: null, created_at: '2026-05-29T00:00:00Z' });
    renderPage();
    await waitFor(() => expect(usersApi.listAdminUsers).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /создать партнёра/i }));
    await user.type(await screen.findByLabelText(/телефон/i), '+79990000000');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(usersApi.createAdminUser).toHaveBeenCalledWith(expect.objectContaining({ phone: '+79990000000', role: 'partner' })),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/pages/PartnersPage.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** `apps/admin/src/pages/PartnersPage.tsx`. Requirements (mirror `OrdersPage.tsx` for the table + react-query, and use a Mantine `Modal` + `useDisclosure` for the create form):
  - `useQuery({ queryKey: ['adminUsers', { role: 'partner' }], queryFn: () => listAdminUsers({ role: 'partner', page: 1, page_size: 100 }) })`.
  - Title "Партнёры"; a "Создать партнёра" Button that opens a Modal.
  - Table columns: "Имя" (`[first_name, last_name].filter(Boolean).join(' ') || '—'`), "Телефон" (`phone ?? '—'`), "Создан" (date `new Date(created_at).toLocaleDateString('ru-RU')`).
  - Loading → `<Loader/>`; error → red "Не удалось загрузить партнёров"; empty → dimmed "Партнёров пока нет".
  - Modal form fields: `TextInput label="Телефон"` (placeholder +79990000000), `TextInput label="Имя"` (first_name), `TextInput label="Фамилия"` (last_name). Validate phone with `/^\+7\d{10}$/`; show inline error "Телефон в формате +7XXXXXXXXXX" if invalid; do not submit.
  - Submit (Button "Сохранить", `loading` while pending) → `useMutation` calling `createAdminUser({ phone, role: 'partner', first_name: first || undefined, last_name: last || undefined })`; onSuccess: close modal, reset fields, `invalidateQueries(['adminUsers'])`, toast `notifications.show({ message: 'Партнёр создан', color: 'green' })`; onError: toast `{ message: 'Не удалось создать партнёра', color: 'red' }`.
  - Import `listAdminUsers`, `createAdminUser` from `../api/users.api`.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/pages/PartnersPage.test.tsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/PartnersPage.tsx apps/admin/src/pages/PartnersPage.test.tsx
git commit -m "feat(admin): PartnersPage (list + create partner)"
```

---

### Task 3: CommissionsPage (list + filter + create + status change)

**Files:**
- Create: `apps/admin/src/pages/CommissionsPage.tsx`
- Test: `apps/admin/src/pages/CommissionsPage.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/pages/CommissionsPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommissionsPage } from './CommissionsPage';
import * as commissionsApi from '../api/commissions.api';
import * as usersApi from '../api/users.api';

vi.mock('../api/commissions.api');
vi.mock('../api/users.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <CommissionsPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('CommissionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(usersApi.listAdminUsers).mockResolvedValue({
      rows: [{ id: 'p1', phone: '+79991112233', role: 'partner', first_name: 'Иван', last_name: 'Петров', created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
  });

  it('renders commission rows with partner name, amount and status label', async () => {
    vi.mocked(commissionsApi.listCommissions).mockResolvedValue({
      rows: [{ id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'pending', paid_at: null, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
    renderPage();
    expect(await screen.findByText(/Иван Петров/)).toBeInTheDocument();
    expect(screen.getByText('5000.00')).toBeInTheDocument();
    expect(screen.getByText('Ожидает')).toBeInTheDocument();
  });

  it('changes a commission status', async () => {
    vi.mocked(commissionsApi.listCommissions).mockResolvedValue({
      rows: [{ id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'pending', paid_at: null, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 100,
    });
    vi.mocked(commissionsApi.updateCommissionStatus).mockResolvedValue({
      id: 'c1', order_id: 'o1', partner_user_id: 'p1', amount: '5000.00', payout_status: 'approved', paid_at: null, created_at: '2026-05-28T00:00:00Z',
    });
    renderPage();
    await screen.findByText('Ожидает');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /одобрить/i }));
    await waitFor(() =>
      expect(commissionsApi.updateCommissionStatus).toHaveBeenCalledWith('c1', { payout_status: 'approved' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/pages/CommissionsPage.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** `apps/admin/src/pages/CommissionsPage.tsx`. Requirements:
  - Imports: `listCommissions, createCommission, updateCommissionStatus, type PayoutStatus, type Commission` from `../api/commissions.api`; `listAdminUsers` from `../api/users.api`; `listOrders` from `../api/orders.api`; `PAYOUT_STATUS_LABELS, PAYOUT_STATUSES` from `../payoutLabels`; Mantine + react-query + notifications.
  - Title "Комиссии".
  - Partners query `['adminUsers', { role: 'partner' }]` → `listAdminUsers({ role: 'partner', page: 1, page_size: 100 })`; build `partnerName(id)` = `[first_name,last_name].filter(Boolean).join(' ') || phone || id`.
  - A filter `Select` (label/placeholder "Все статусы", clearable) over `PAYOUT_STATUSES` (option label from `PAYOUT_STATUS_LABELS`) → local `statusFilter` state.
  - Commissions query `['commissions', { statusFilter }]` → `listCommissions({ payout_status: statusFilter ?? undefined, page: 1, page_size: 100 })`, `placeholderData: keepPreviousData`.
  - Table columns: "Партнёр" (`partnerName(row.partner_user_id)`), "Сумма" (`row.amount`), "Статус" (`PAYOUT_STATUS_LABELS[row.payout_status]`), "Действия".
  - Status-change `useMutation` calling `updateCommissionStatus(id, { payout_status })`; onSuccess invalidate `['commissions']` + toast "Статус обновлён"; onError toast "Не удалось обновить статус". In the Действия cell: show a Button "Одобрить" when status==='pending' (sets 'approved'), a Button "Выплачено" when status==='approved' (sets 'paid'); nothing when 'paid'.
  - "Создать комиссию" Button → Modal with: `Select label="Партнёр"` (data from partners query: value=id, label=partnerName), `Select label="Заказ"` (data from an orders query `['orders']`→`listOrders({ page:1, page_size:100 })`, value=order.id, label=`order.contract_number ?? order.id`), `NumberInput label="Сумма"` (min 1). Submit → `createCommission({ order_id, partner_user_id, amount })`; onSuccess close+reset+invalidate `['commissions']`+toast "Комиссия создана"; onError toast "Не удалось создать комиссию". Disable submit until partner+order+amount set.
  - Loading/error/empty states like other pages ("Не удалось загрузить комиссии" / "Комиссий пока нет").

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/pages/CommissionsPage.test.tsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/CommissionsPage.tsx apps/admin/src/pages/CommissionsPage.test.tsx
git commit -m "feat(admin): CommissionsPage (list, filter, create, status change)"
```

---

### Task 4: Routes + nav links

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/AppLayout.tsx`
- Test: `apps/admin/src/components/AppLayout.test.tsx` (extend)

- [ ] **Step 1: Extend the AppLayout test** — add this test inside the existing `describe('AppLayout', …)` block in `apps/admin/src/components/AppLayout.test.tsx` (keep the existing test; the existing file already mocks `../api/chat.api` and sets up `renderLayout`):
```tsx
  it('shows Партнёры and Комиссии nav links', () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    renderLayout();
    expect(screen.getByText('Партнёры')).toBeInTheDocument();
    expect(screen.getByText('Комиссии')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/components/AppLayout.test.tsx` → FAIL (no "Партнёры").

- [ ] **Step 3: Add nav links in `AppLayout.tsx`** — after the existing "Чат" `NavLink`, add inside `<AppShell.Navbar>`:
```tsx
        <NavLink component={RouterNavLink} to="/partners" label="Партнёры" />
        <NavLink component={RouterNavLink} to="/commissions" label="Комиссии" />
```

- [ ] **Step 4: Add routes in `App.tsx`** — add imports near the other page imports:
```tsx
import { PartnersPage } from './pages/PartnersPage';
import { CommissionsPage } from './pages/CommissionsPage';
```
and inside the protected layout route block, after the `/chats` route:
```tsx
<Route path="/partners" element={<PartnersPage />} />
<Route path="/commissions" element={<CommissionsPage />} />
```

- [ ] **Step 5: Run the AppLayout test** — `pnpm --filter @vittoria/admin exec vitest run src/components/AppLayout.test.tsx` → PASS.

- [ ] **Step 6: Full admin gates** — `pnpm --filter @vittoria/admin test` (all green), `pnpm --filter @vittoria/admin build` (clean), `pnpm --filter @vittoria/admin lint` (clean).

- [ ] **Step 7: Commit**
```bash
git add apps/admin/src/App.tsx apps/admin/src/components/AppLayout.tsx apps/admin/src/components/AppLayout.test.tsx
git commit -m "feat(admin): wire /partners + /commissions routes and nav"
```

---

## Self-Review

- Partners list + create → Task 2 (consumes GET/POST /admin/users). ✓
- Commissions list + filter + create + status change → Task 3 (GET/POST/PATCH /admin/commissions, order/partner pickers). ✓
- API boundary + labels → Task 1. ✓
- Routes + nav → Task 4. ✓
- Types match backend reference (UserResponse, CommissionResponse, PayoutStatus pending/approved/paid). ✓
- No backend changes. ✓
- Tests pin behavior for every task (api url-building, list render, create, status change, nav). ✓
