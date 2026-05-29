# SPA-3 Audit Log + Notification Templates (admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add admin screens for the audit log (filterable, paginated, with a before/after detail view) and for editing notification templates (title/body per event), consuming existing Plan 6 backend endpoints. No backend changes.

**Architecture:** Two HTTP-boundary modules (`audit.api.ts`, `templates.api.ts`); two pages (`AuditPage`, `TemplatesPage`) mirroring the existing admin pages (react-query + Mantine); routes + nav added. Tests mirror SPA-0/1/2 (MantineProvider + QueryClientProvider, mocked api).

**Tech Stack:** React 18 + TS, react-router v6, @tanstack/react-query v5, Mantine v7, vitest + RTL + user-event.

**Backend consumed (role admin, via `apiFetch`):**
- `GET /admin/audit-log?entity=&actor=&page=&page_size=` → `{ rows: AuditLogRow[], total, page, page_size }`, `AuditLogRow = { id, actor_user_id: string|null, action: string, entity: string, entity_id: string, before: unknown, after: unknown, created_at: string }`.
- `GET /admin/notification-templates` → `{ rows: NotificationTemplate[] }`, `NotificationTemplate = { event: string, title: string, body: string, updated_at: string }`.
- `PATCH /admin/notification-templates/:event` body `{ title?: string, body?: string }` → NotificationTemplate.

**Single-file test command:** `pnpm --filter @vittoria/admin exec vitest run <path-relative-to-apps/admin>`

---

### Task 1: audit.api.ts + templates.api.ts

**Files:**
- Create: `apps/admin/src/api/audit.api.ts`
- Create: `apps/admin/src/api/templates.api.ts`
- Test: `apps/admin/src/api/audit.api.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/api/audit.api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listAuditLog } from './audit.api';
import { listTemplates, updateTemplate } from './templates.api';

vi.mock('./client');

describe('audit.api + templates.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listAuditLog builds query string', async () => {
    await listAuditLog({ entity: 'Order', actor: 'u1', page: 2, page_size: 50 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/audit-log?entity=Order&actor=u1&page=2&page_size=50');
  });
  it('listAuditLog omits empty params', async () => {
    await listAuditLog();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/audit-log');
  });
  it('listTemplates GETs the collection', async () => {
    await listTemplates();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/notification-templates');
  });
  it('updateTemplate patches by event key', async () => {
    await updateTemplate('order.stage.changed', { title: 'T', body: 'B' });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/notification-templates/order.stage.changed', { method: 'PATCH', body: { title: 'T', body: 'B' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/api/audit.api.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/admin/src/api/audit.api.ts`:
```ts
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
```
`apps/admin/src/api/templates.api.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/api/audit.api.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/api/audit.api.ts apps/admin/src/api/templates.api.ts apps/admin/src/api/audit.api.test.ts
git commit -m "feat(admin): audit.api + templates.api clients"
```

---

### Task 2: AuditPage (list + entity filter + pagination + detail modal)

**Files:**
- Create: `apps/admin/src/pages/AuditPage.tsx`
- Test: `apps/admin/src/pages/AuditPage.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/pages/AuditPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditPage } from './AuditPage';
import * as auditApi from '../api/audit.api';

vi.mock('../api/audit.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <AuditPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('AuditPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders audit rows', async () => {
    vi.mocked(auditApi.listAuditLog).mockResolvedValue({
      rows: [{ id: 'a1', actor_user_id: 'u1', action: 'order.stage.changed', entity: 'Order', entity_id: 'o1', before: { stage: 'detailing' }, after: { stage: 'production' }, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 20,
    });
    renderPage();
    expect(await screen.findByText('order.stage.changed')).toBeInTheDocument();
    expect(screen.getByText('Order')).toBeInTheDocument();
  });

  it('filters by entity', async () => {
    vi.mocked(auditApi.listAuditLog).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 20 });
    renderPage();
    await waitFor(() => expect(auditApi.listAuditLog).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/сущность/i), 'Order');
    await waitFor(() =>
      expect(auditApi.listAuditLog).toHaveBeenLastCalledWith(expect.objectContaining({ entity: 'Order' })),
    );
  });

  it('opens the detail modal showing before/after', async () => {
    vi.mocked(auditApi.listAuditLog).mockResolvedValue({
      rows: [{ id: 'a1', actor_user_id: 'u1', action: 'order.stage.changed', entity: 'Order', entity_id: 'o1', before: { stage: 'detailing' }, after: { stage: 'production' }, created_at: '2026-05-28T00:00:00Z' }],
      total: 1, page: 1, page_size: 20,
    });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /подробнее/i }));
    expect(await screen.findByText(/production/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/pages/AuditPage.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** `apps/admin/src/pages/AuditPage.tsx`. Requirements (mirror `OrdersPage.tsx` for table + filter + pagination; use a Mantine `Modal` for details):
  - Local state: `entity` (string), `page` (number, start 1), `detail` (`AuditLogRow | null`).
  - Query: `useQuery({ queryKey: ['auditLog', { entity, page }], queryFn: () => listAuditLog({ entity: entity || undefined, page, page_size: 20 }), placeholderData: keepPreviousData })`.
  - `<Title order={3}>Аудит</Title>`.
  - A `TextInput` placeholder "Сущность (Order, User…)" bound to `entity`; on change set `entity` and reset `page` to 1.
  - Mantine `Table` columns: "Время" (`new Date(created_at).toLocaleString('ru-RU')`), "Действие" (`action`), "Сущность" (`entity`), "ID объекта" (`entity_id`), "Актор" (`actor_user_id ?? '—'`), "" (a Button "Подробнее" → set `detail = row`).
  - Loading `<Loader/>`; error `<Text c="red">Не удалось загрузить журнал</Text>`; empty `<Text c="dimmed">Записей нет</Text>`.
  - Pagination: `totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1`; render `<Pagination value={page} onChange={setPage} total={totalPages} />` when `totalPages > 1`.
  - Detail `Modal` (`opened={detail !== null}`, `onClose={() => setDetail(null)}`, title=`detail?.action`): show two labelled blocks "Было"/"Стало" each rendering `<Code block>{JSON.stringify(detail?.before ?? null, null, 2)}</Code>` and `...after...` (import `Code` from `@mantine/core`).
  - Import `listAuditLog, type AuditLogRow` from `../api/audit.api`.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/pages/AuditPage.test.tsx` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/AuditPage.tsx apps/admin/src/pages/AuditPage.test.tsx
git commit -m "feat(admin): AuditPage (filter, paginate, before/after detail)"
```

---

### Task 3: TemplatesPage (list + edit/save)

**Files:**
- Create: `apps/admin/src/pages/TemplatesPage.tsx`
- Test: `apps/admin/src/pages/TemplatesPage.test.tsx`

- [ ] **Step 1: Write the failing test** — `apps/admin/src/pages/TemplatesPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesPage } from './TemplatesPage';
import * as templatesApi from '../api/templates.api';

vi.mock('../api/templates.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <TemplatesPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('TemplatesPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders templates with title and body', async () => {
    vi.mocked(templatesApi.listTemplates).mockResolvedValue({
      rows: [{ event: 'order.stage.changed', title: 'Этап изменён', body: 'Ваш заказ перешёл на этап {{stage}}', updated_at: '2026-05-28T00:00:00Z' }],
    });
    renderPage();
    expect(await screen.findByDisplayValue('Этап изменён')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/перешёл на этап/)).toBeInTheDocument();
  });

  it('saves an edited template', async () => {
    vi.mocked(templatesApi.listTemplates).mockResolvedValue({
      rows: [{ event: 'order.stage.changed', title: 'Этап изменён', body: 'Текст', updated_at: '2026-05-28T00:00:00Z' }],
    });
    vi.mocked(templatesApi.updateTemplate).mockResolvedValue({ event: 'order.stage.changed', title: 'Новый', body: 'Текст', updated_at: '2026-05-29T00:00:00Z' });
    renderPage();
    const titleInput = await screen.findByDisplayValue('Этап изменён');
    const user = userEvent.setup();
    await user.clear(titleInput);
    await user.type(titleInput, 'Новый');
    await user.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(templatesApi.updateTemplate).toHaveBeenCalledWith('order.stage.changed', expect.objectContaining({ title: 'Новый' })),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/pages/TemplatesPage.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** `apps/admin/src/pages/TemplatesPage.tsx`. Requirements:
  - Query: `useQuery({ queryKey: ['templates'], queryFn: listTemplates })`.
  - `<Title order={3}>Шаблоны уведомлений</Title>`.
  - Render one editable card (`Paper withBorder p="md"`) per template row, in a `Stack`. Each card is its own child component `TemplateCard` (defined in the same file) so each owns its local edit state:
    - `TemplateCard({ template }: { template: NotificationTemplate })`.
    - Local state `title` (init `template.title`), `body` (init `template.body`).
    - Header `<Text fw={600}>{template.event}</Text>`.
    - `TextInput label="Заголовок"` bound to `title`; `Textarea label="Текст" autosize minRows={2}` bound to `body`.
    - `useMutation({ mutationFn: () => updateTemplate(template.event, { title, body }), onSuccess: invalidate ['templates'] + green toast "Шаблон сохранён", onError: red toast "Не удалось сохранить" })`.
    - Button "Сохранить" (`loading` while pending) → `mutation.mutate()`.
  - States: loading `<Loader/>`; error `<Text c="red">Не удалось загрузить шаблоны</Text>`; empty `<Text c="dimmed">Шаблонов нет</Text>`.
  - Imports: `listTemplates, updateTemplate, type NotificationTemplate` from `../api/templates.api`; Mantine `Title, Paper, Stack, Text, TextInput, Textarea, Button, Loader`; `useMutation, useQuery, useQueryClient`; `notifications`.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @vittoria/admin exec vitest run src/pages/TemplatesPage.test.tsx` → PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/admin/src/pages/TemplatesPage.tsx apps/admin/src/pages/TemplatesPage.test.tsx
git commit -m "feat(admin): TemplatesPage (edit notification templates)"
```

---

### Task 4: Routes + nav links

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/AppLayout.tsx`
- Test: `apps/admin/src/components/AppLayout.test.tsx` (extend)

- [ ] **Step 1: Extend the AppLayout test** — add inside the existing `describe('AppLayout', …)` block (keep existing tests):
```tsx
  it('shows Аудит and Шаблоны nav links', () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    renderLayout();
    expect(screen.getByText('Аудит')).toBeInTheDocument();
    expect(screen.getByText('Шаблоны')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @vittoria/admin exec vitest run src/components/AppLayout.test.tsx` → FAIL.

- [ ] **Step 3: Add nav links in `AppLayout.tsx`** — after the "Комиссии" `NavLink` inside `<AppShell.Navbar>`:
```tsx
        <NavLink component={RouterNavLink} to="/audit" label="Аудит" />
        <NavLink component={RouterNavLink} to="/templates" label="Шаблоны" />
```

- [ ] **Step 4: Add routes in `App.tsx`** — imports near other page imports:
```tsx
import { AuditPage } from './pages/AuditPage';
import { TemplatesPage } from './pages/TemplatesPage';
```
and inside the protected layout route block after `/commissions`:
```tsx
<Route path="/audit" element={<AuditPage />} />
<Route path="/templates" element={<TemplatesPage />} />
```

- [ ] **Step 5: Run the AppLayout test** — `pnpm --filter @vittoria/admin exec vitest run src/components/AppLayout.test.tsx` → PASS.

- [ ] **Step 6: Full admin gates** — `pnpm --filter @vittoria/admin test` (all green), `pnpm --filter @vittoria/admin build` (clean), `pnpm --filter @vittoria/admin lint` (clean).

- [ ] **Step 7: Commit**
```bash
git add apps/admin/src/App.tsx apps/admin/src/components/AppLayout.tsx apps/admin/src/components/AppLayout.test.tsx
git commit -m "feat(admin): wire /audit + /templates routes and nav"
```

---

## Self-Review

- Audit list + entity filter + pagination + before/after detail → Task 2 (GET /admin/audit-log). ✓
- Templates list + per-template edit/save → Task 3 (GET + PATCH /admin/notification-templates). ✓
- API boundary → Task 1. ✓
- Routes + nav → Task 4. ✓
- Types match backend reference (AuditLogRow, NotificationTemplate). ✓
- No backend changes. ✓
- Tests pin behavior for every task. ✓
