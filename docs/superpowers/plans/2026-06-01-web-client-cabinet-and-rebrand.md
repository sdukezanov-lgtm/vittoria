# Web Client Cabinet + Web Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser client cabinet (login → home → stage history → chat → profile) styled per reference 1, and restyle the existing admin/partner web panel per reference 2, in the new beige-gold VITTORIA HOME brand — without touching backend, API, or business logic.

**Architecture:** Extend the existing `apps/admin` SPA. Add a single Mantine brand theme applied app-wide (recolors admin automatically). Add a `client` role with its own `ClientLayout` and pages under `/cabinet/*`, built on the existing auth + a new client-facing API module that calls the already-existing client endpoints (`/orders`, `/orders/:id/history`, `/orders/:id/chat`, `/service/contact`, `/me`). Reuse the existing `Conversation` chat component.

**Tech Stack:** React 18, TypeScript, Vite, Mantine 7, @tanstack/react-query, react-router-dom 6, Vitest + @testing-library/react.

**Note on visual fidelity:** Exact pixel/color/spacing tuning happens live on `localhost` with the owner. Tasks below lock in structure, data wiring, and logic (TDD where there's logic); cosmetic polish is expected to iterate after the first localhost preview.

---

## File Structure

**Brand foundation (new):**
- `apps/admin/src/theme.ts` — Mantine brand theme (colors, fonts, radius, primaryColor).
- `apps/admin/index.html` — add web-font `<link>`s (Cormorant Garamond + Inter). *(modify)*
- `apps/admin/src/brand/Logo.tsx` — "VITTORIA HOME" wordmark (gold "HOME", optional tagline).
- `apps/admin/src/brand/stageColors.ts` — per-stage color map + helper.
- `apps/admin/src/brand/StageBadge.tsx` — colored stage badge.
- `apps/admin/src/brand/OrderStatusStepper.tsx` — 7-step horizontal stepper.
- `apps/admin/src/brand/orderStatus.ts` — derive "Действующий"/"Завершён" + active flag.
- `apps/admin/src/brand/ProductPlaceholder.tsx` — gradient placeholder for the missing product photo.

**Client API (new):**
- `apps/admin/src/api/cabinet.api.ts` — client endpoints (orders/history/chat-ref/service contact).

**Client cabinet pages (new):**
- `apps/admin/src/components/ClientLayout.tsx` — branded header shell + `<Outlet/>`.
- `apps/admin/src/pages/cabinet/OrderSummaryCard.tsx` — contract card (№, product, status, photo, finances).
- `apps/admin/src/pages/cabinet/OrderStatusSection.tsx` — "Статус заказа" + percent + stepper.
- `apps/admin/src/pages/cabinet/QuickAccess.tsx` — quick-access cards.
- `apps/admin/src/pages/cabinet/CabinetHomePage.tsx` — assembles the home screen.
- `apps/admin/src/pages/cabinet/CabinetHistoryPage.tsx` — stage history timeline.
- `apps/admin/src/pages/cabinet/CabinetChatPage.tsx` — resolves chat id, renders `Conversation`.
- `apps/admin/src/pages/cabinet/CabinetProfilePage.tsx` — profile + logout.

**Wiring + admin restyle (modify):**
- `apps/admin/src/App.tsx` — apply theme; add client routes.
- `apps/admin/src/auth/RoleHome.tsx` — route `client` → `/cabinet`.
- `apps/admin/src/pages/LoginPage.tsx` — brand the login screen.
- `apps/admin/src/components/AppLayout.tsx` — brand admin header/nav.
- `apps/admin/src/pages/OrdersPage.tsx` — stage badges + progress bars in the table.

---

## Phase A — Brand foundation

### Task 1: Mantine brand theme

**Files:**
- Create: `apps/admin/src/theme.ts`
- Test: `apps/admin/src/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/src/theme.test.ts
import { describe, it, expect } from 'vitest';
import { theme, BRAND } from './theme';

describe('brand theme', () => {
  it('uses gold as the primary color with a full 10-shade scale', () => {
    expect(theme.primaryColor).toBe('gold');
    expect(theme.colors?.gold).toHaveLength(10);
  });
  it('exposes brand tokens used across pages', () => {
    expect(BRAND.gold).toMatch(/^#/);
    expect(BRAND.graphite).toMatch(/^#/);
    expect(BRAND.bg).toMatch(/^#/);
    expect(BRAND.green).toMatch(/^#/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- theme`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Implement the theme**

```ts
// apps/admin/src/theme.ts
import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Single source of truth for non-Mantine-scale brand colors used inline.
export const BRAND = {
  graphite: '#2B2B2B', // text + "VITTORIA" wordmark
  gold: '#B08D57',     // accent: "HOME", progress, active stage, primary buttons
  goldSoft: '#E9DCC6', // gold tint backgrounds
  bg: '#F6F3EE',       // warm page background
  surface: '#FFFFFF',  // cards
  green: '#4F8A5B',    // prepayment / "Действующий" / 100%
} as const;

const gold: MantineColorsTuple = [
  '#faf6ef', '#efe6d6', '#e0cdab', '#d2b37e', '#c69d5b',
  '#bf9047', '#b08d57', '#9a7942', '#8a6b39', '#79592b',
];

export const theme = createTheme({
  primaryColor: 'gold',
  primaryShade: 6,
  colors: { gold },
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, sans-serif',
  headings: { fontFamily: '"Cormorant Garamond", Georgia, serif', fontWeight: '600' },
});
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- theme`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/theme.ts apps/admin/src/theme.test.ts
git commit -m "feat(admin): brand theme tokens (beige-gold)"
```

### Task 2: Load web fonts + apply theme app-wide

**Files:**
- Modify: `apps/admin/index.html`
- Modify: `apps/admin/src/App.tsx`

- [ ] **Step 1: Add font links to index.html**

Inside `<head>` of `apps/admin/index.html`, add:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 2: Apply the theme + page background in App.tsx**

In `apps/admin/src/App.tsx`: import `{ theme, BRAND }` from `./theme`, pass `theme={theme}` to the existing `<MantineProvider>`, and add `withGlobalClasses` is not needed — instead set the body background. Replace `<MantineProvider>` opening tag with:

```tsx
<MantineProvider theme={theme}>
```

Then, immediately after the existing `import '@mantine/notifications/styles.css';` line, add a one-line global style import file:

```tsx
// apps/admin/src/App.tsx  (add near other imports)
import './global.css';
```

Create `apps/admin/src/global.css`:

```css
:root { background: #F6F3EE; }
body { background: #F6F3EE; margin: 0; }
```

- [ ] **Step 3: Verify the app still builds and tests pass**

Run: `pnpm --filter @vittoria/admin test` then `pnpm --filter @vittoria/admin build`
Expected: existing tests PASS, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/index.html apps/admin/src/App.tsx apps/admin/src/global.css
git commit -m "feat(admin): load brand fonts and apply theme app-wide"
```

### Task 3: Logo wordmark component

**Files:**
- Create: `apps/admin/src/brand/Logo.tsx`
- Test: `apps/admin/src/brand/Logo.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/brand/Logo.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Logo } from './Logo';

it('renders the VITTORIA HOME wordmark with optional tagline', () => {
  render(<MantineProvider><Logo tagline /></MantineProvider>);
  expect(screen.getByText('VITTORIA')).toBeInTheDocument();
  expect(screen.getByText('HOME')).toBeInTheDocument();
  expect(screen.getByText(/СЕРВИС, КОТОРОМУ ДОВЕРЯЮТ/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- Logo`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Logo**

```tsx
// apps/admin/src/brand/Logo.tsx
import { Box, Text } from '@mantine/core';
import { BRAND } from '../theme';

export function Logo({ size = 28, tagline = false }: { size?: number; tagline?: boolean }) {
  return (
    <Box>
      <Text
        component="span"
        style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: size, fontWeight: 700, letterSpacing: 1 }}
      >
        <Text component="span" inherit c={BRAND.graphite}>VITTORIA </Text>
        <Text component="span" inherit c={BRAND.gold}>HOME</Text>
      </Text>
      {tagline && (
        <Text size="9px" c="dimmed" style={{ letterSpacing: 2 }}>СЕРВИС, КОТОРОМУ ДОВЕРЯЮТ</Text>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- Logo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/brand/Logo.tsx apps/admin/src/brand/Logo.test.tsx
git commit -m "feat(admin): brand Logo wordmark"
```

### Task 4: Stage colors + StageBadge

**Files:**
- Create: `apps/admin/src/brand/stageColors.ts`
- Create: `apps/admin/src/brand/StageBadge.tsx`
- Test: `apps/admin/src/brand/StageBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/brand/StageBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { STAGE_COLOR } from './stageColors';
import { StageBadge } from './StageBadge';
import { STAGES } from '../stageLabels';

it('has a color for every stage', () => {
  for (const s of STAGES) expect(STAGE_COLOR[s]).toBeTruthy();
});

it('renders the stage label', () => {
  render(<MantineProvider><StageBadge stage="production" /></MantineProvider>);
  expect(screen.getByText('Производство изделия')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- StageBadge`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement stageColors + StageBadge**

```ts
// apps/admin/src/brand/stageColors.ts
import type { OrderStage } from '../api/types';

// Mantine color names for stage badges (mirrors reference 2's varied chips).
export const STAGE_COLOR: Record<OrderStage, string> = {
  preparation_for_production: 'gray',
  detailing: 'blue',
  materials_arrival: 'cyan',
  production: 'gold',
  transfer_to_warehouse: 'grape',
  completeness_check: 'orange',
  ready_for_delivery: 'green',
};
```

```tsx
// apps/admin/src/brand/StageBadge.tsx
import { Badge } from '@mantine/core';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS } from '../stageLabels';
import { STAGE_COLOR } from './stageColors';

export function StageBadge({ stage }: { stage: OrderStage }) {
  return (
    <Badge color={STAGE_COLOR[stage]} variant="light" radius="sm">
      {STAGE_LABELS[stage]}
    </Badge>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- StageBadge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/brand/stageColors.ts apps/admin/src/brand/StageBadge.tsx apps/admin/src/brand/StageBadge.test.tsx
git commit -m "feat(admin): stage color map and StageBadge"
```

### Task 5: Order status helper (active flag + label)

**Files:**
- Create: `apps/admin/src/brand/orderStatus.ts`
- Test: `apps/admin/src/brand/orderStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/src/brand/orderStatus.test.ts
import { describe, it, expect } from 'vitest';
import { isActive, statusLabel } from './orderStatus';

describe('order status', () => {
  it('is active until ready_for_delivery is reached', () => {
    expect(isActive('production')).toBe(true);
    expect(isActive('ready_for_delivery')).toBe(false);
  });
  it('maps to a Russian label', () => {
    expect(statusLabel('production')).toBe('Действующий');
    expect(statusLabel('ready_for_delivery')).toBe('Завершён');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- orderStatus`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/brand/orderStatus.ts
import type { OrderStage } from '../api/types';

export function isActive(stage: OrderStage): boolean {
  return stage !== 'ready_for_delivery';
}

export function statusLabel(stage: OrderStage): string {
  return isActive(stage) ? 'Действующий' : 'Завершён';
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- orderStatus`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/brand/orderStatus.ts apps/admin/src/brand/orderStatus.test.ts
git commit -m "feat(admin): order active-status helper"
```

### Task 6: 7-step status stepper

**Files:**
- Create: `apps/admin/src/brand/OrderStatusStepper.tsx`
- Test: `apps/admin/src/brand/OrderStatusStepper.test.tsx`

- [ ] **Step 1: Write the failing test (pure logic + render)**

```tsx
// apps/admin/src/brand/OrderStatusStepper.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { stepState, OrderStatusStepper } from './OrderStatusStepper';

it('classifies steps relative to the current stage', () => {
  // current = production (index 3): earlier done, this active, later upcoming
  expect(stepState('production', 'detailing')).toBe('done');
  expect(stepState('production', 'production')).toBe('active');
  expect(stepState('production', 'ready_for_delivery')).toBe('upcoming');
});

it('renders all 7 numbered steps', () => {
  render(<MantineProvider><OrderStatusStepper current="production" /></MantineProvider>);
  for (let n = 1; n <= 7; n++) expect(screen.getByText(String(n))).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- OrderStatusStepper`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/brand/OrderStatusStepper.tsx
import { Box, Group, Stack, Text } from '@mantine/core';
import type { OrderStage } from '../api/types';
import { STAGE_LABELS, STAGES } from '../stageLabels';
import { BRAND } from '../theme';

export type StepState = 'done' | 'active' | 'upcoming';

export function stepState(current: OrderStage, step: OrderStage): StepState {
  const ci = STAGES.indexOf(current);
  const si = STAGES.indexOf(step);
  if (si < ci) return 'done';
  if (si === ci) return 'active';
  return 'upcoming';
}

export function OrderStatusStepper({ current }: { current: OrderStage }) {
  return (
    <Group align="flex-start" gap={0} wrap="nowrap" style={{ overflowX: 'auto' }}>
      {STAGES.map((s, i) => {
        const state = stepState(current, s);
        const filled = state === 'done' || state === 'active';
        return (
          <Stack key={s} gap={4} align="center" style={{ flex: 1, minWidth: 96 }}>
            <Box
              style={{
                width: 32, height: 32, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? BRAND.gold : '#E5E1D8',
                color: filled ? '#fff' : '#8A8578', fontWeight: 600,
              }}
            >
              {i + 1}
            </Box>
            <Text size="10px" ta="center" c={state === 'active' ? BRAND.graphite : 'dimmed'}
              fw={state === 'active' ? 600 : 400}>
              {STAGE_LABELS[s]}
            </Text>
          </Stack>
        );
      })}
    </Group>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- OrderStatusStepper`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/brand/OrderStatusStepper.tsx apps/admin/src/brand/OrderStatusStepper.test.tsx
git commit -m "feat(admin): 7-step order status stepper"
```

### Task 7: Product photo placeholder

**Files:**
- Create: `apps/admin/src/brand/ProductPlaceholder.tsx`
- Test: `apps/admin/src/brand/ProductPlaceholder.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/brand/ProductPlaceholder.test.tsx
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ProductPlaceholder } from './ProductPlaceholder';

it('renders a labelled placeholder region', () => {
  const { getByLabelText } = render(
    <MantineProvider><ProductPlaceholder /></MantineProvider>,
  );
  expect(getByLabelText('Фото изделия')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- ProductPlaceholder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (no external asset — gradient + icon)**

```tsx
// apps/admin/src/brand/ProductPlaceholder.tsx
import { Box } from '@mantine/core';
import { BRAND } from '../theme';

// Stand-in for the (not-yet-available) real product photo.
export function ProductPlaceholder({ height = 180 }: { height?: number }) {
  return (
    <Box
      role="img"
      aria-label="Фото изделия"
      style={{
        height, borderRadius: 12,
        background: `linear-gradient(135deg, ${BRAND.goldSoft}, ${BRAND.bg})`,
      }}
    />
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- ProductPlaceholder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/brand/ProductPlaceholder.tsx apps/admin/src/brand/ProductPlaceholder.test.tsx
git commit -m "feat(admin): product photo placeholder"
```

---

## Phase B — Client API module

### Task 8: Client cabinet API

**Files:**
- Create: `apps/admin/src/api/cabinet.api.ts`
- Test: `apps/admin/src/api/cabinet.api.test.ts`

- [ ] **Step 1: Write the failing test (mock apiFetch, assert paths)**

```ts
// apps/admin/src/api/cabinet.api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.fn();
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { listMyOrders, getOrderHistory, getOrderChat, getServiceContact } from './cabinet.api';

beforeEach(() => apiFetch.mockReset().mockResolvedValue({}));

describe('cabinet api targets the client endpoints', () => {
  it('lists my orders', async () => { await listMyOrders(); expect(apiFetch).toHaveBeenCalledWith('/orders'); });
  it('gets stage history', async () => { await getOrderHistory('o1'); expect(apiFetch).toHaveBeenCalledWith('/orders/o1/history'); });
  it('gets the order chat ref', async () => { await getOrderChat('o1'); expect(apiFetch).toHaveBeenCalledWith('/orders/o1/chat'); });
  it('gets the service contact', async () => { await getServiceContact(); expect(apiFetch).toHaveBeenCalledWith('/service/contact'); });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- cabinet.api`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/admin/src/api/cabinet.api.ts
import { apiFetch } from './client';
import type { OrderResponse, OrderStage } from './types';

export interface StageHistoryItem {
  id: string;
  stage: OrderStage;
  progress_percent: number;
  comment: string | null;
  changed_at: string;
}

export interface OrderChatRef {
  id: string;
  order_id: string;
  created_at: string;
  unread_count: number;
}

export interface ServiceContact {
  phone: string;
  hours: string;
}

// NOTE: client list endpoint returns { items } (no pagination), unlike /admin/orders.
export function listMyOrders(): Promise<{ items: OrderResponse[] }> {
  return apiFetch('/orders');
}

export function getMyOrder(id: string): Promise<OrderResponse> {
  return apiFetch(`/orders/${id}`);
}

export function getOrderHistory(id: string): Promise<{ items: StageHistoryItem[] }> {
  return apiFetch(`/orders/${id}/history`);
}

export function getOrderChat(id: string): Promise<OrderChatRef> {
  return apiFetch(`/orders/${id}/chat`);
}

export function getServiceContact(): Promise<ServiceContact> {
  return apiFetch('/service/contact');
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- cabinet.api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/api/cabinet.api.ts apps/admin/src/api/cabinet.api.test.ts
git commit -m "feat(admin): client cabinet API module"
```

---

## Phase C — Client cabinet pages

### Task 9: ClientLayout (branded shell)

**Files:**
- Create: `apps/admin/src/components/ClientLayout.tsx`
- Test: `apps/admin/src/components/ClientLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/components/ClientLayout.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ClientLayout } from './ClientLayout';

vi.mock('../api/cabinet.api', () => ({
  getServiceContact: () => Promise.resolve({ phone: '+7 (495) 120-00-20', hours: '9:00–21:00' }),
}));

it('renders the brand header', () => {
  render(
    <MantineProvider><QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/cabinet']}>
        <Routes><Route element={<ClientLayout />}><Route path="/cabinet" element={<div>inner</div>} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider></MantineProvider>,
  );
  expect(screen.getByText('VITTORIA')).toBeInTheDocument();
  expect(screen.getByText('inner')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- ClientLayout`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/components/ClientLayout.tsx
import { Anchor, Box, Container, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { getServiceContact } from '../api/cabinet.api';
import { Logo } from '../brand/Logo';
import { BRAND } from '../theme';

export function ClientLayout() {
  const { data: contact } = useQuery({ queryKey: ['serviceContact'], queryFn: getServiceContact });
  return (
    <Box style={{ minHeight: '100vh', background: BRAND.bg }}>
      <Paper shadow="xs" px="md" py="sm" radius={0}>
        <Container size="lg">
          <Group justify="space-between">
            <Logo size={26} tagline />
            {contact && (
              <Group gap="xs">
                <ThemeIcon variant="light" radius="xl" size="lg" color="gold">☎</ThemeIcon>
                <Box>
                  <Text size="xs" c="dimmed">Сервисный отдел</Text>
                  <Anchor href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} fw={600} c={BRAND.graphite}>
                    {contact.phone}
                  </Anchor>
                </Box>
              </Group>
            )}
          </Group>
        </Container>
      </Paper>
      <Container size="lg" py="lg">
        <Outlet />
      </Container>
    </Box>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- ClientLayout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/ClientLayout.tsx apps/admin/src/components/ClientLayout.test.tsx
git commit -m "feat(admin): client cabinet branded layout"
```

### Task 10: OrderSummaryCard

**Files:**
- Create: `apps/admin/src/pages/cabinet/OrderSummaryCard.tsx`
- Test: `apps/admin/src/pages/cabinet/OrderSummaryCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/OrderSummaryCard.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OrderSummaryCard } from './OrderSummaryCard';
import type { OrderResponse } from '../../api/types';

const order = {
  id: 'o1', amocrm_deal_id: 1, contract_number: 'VH-2024-0715', product_name: 'Кухня Римини',
  total_amount: '1 250 000', prepayment_amount: '375 000', balance_due: '875 000',
  current_stage: 'production', progress_percent: 62, service_phone: null, last_admin_comment: null,
  partner_services: [], created_at: '', updated_at: '',
} as unknown as OrderResponse;

it('shows contract number, product, status and finances', () => {
  render(<MantineProvider><OrderSummaryCard order={order} /></MantineProvider>);
  expect(screen.getByText('VH-2024-0715')).toBeInTheDocument();
  expect(screen.getByText('Кухня Римини')).toBeInTheDocument();
  expect(screen.getByText('Действующий')).toBeInTheDocument();
  expect(screen.getByText(/1 250 000/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- OrderSummaryCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/OrderSummaryCard.tsx
import { Badge, Card, Grid, Group, Stack, Text, Title } from '@mantine/core';
import type { OrderResponse } from '../../api/types';
import { ProductPlaceholder } from '../../brand/ProductPlaceholder';
import { isActive, statusLabel } from '../../brand/orderStatus';
import { BRAND } from '../../theme';

function money(v: string | null) { return v ? `${v} ₽` : '—'; }

export function OrderSummaryCard({ order }: { order: OrderResponse }) {
  return (
    <Card withBorder radius="lg" p="lg" bg={BRAND.surface}>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, sm: 7 }}>
          <Stack gap={6}>
            <Text size="sm" c="dimmed">Договор №</Text>
            <Title order={2} c={BRAND.graphite}>{order.contract_number ?? '—'}</Title>
            {order.product_name && <Text fw={600} size="lg">{order.product_name}</Text>}
            <Badge color={isActive(order.current_stage) ? 'green' : 'gray'} variant="light" w="fit-content">
              ● {statusLabel(order.current_stage)}
            </Badge>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <ProductPlaceholder />
        </Grid.Col>
      </Grid>
      <Group justify="space-between" mt="lg" grow>
        <Stack gap={2}><Text size="sm" c="dimmed">Стоимость заказа</Text><Text fw={700}>{money(order.total_amount)}</Text></Stack>
        <Stack gap={2}><Text size="sm" c="dimmed">Предоплата</Text><Text fw={700} c={BRAND.green}>{money(order.prepayment_amount)}</Text></Stack>
        <Stack gap={2}><Text size="sm" c="dimmed">Остаток к оплате</Text><Text fw={700}>{money(order.balance_due)}</Text></Stack>
      </Group>
    </Card>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- OrderSummaryCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/OrderSummaryCard.tsx apps/admin/src/pages/cabinet/OrderSummaryCard.test.tsx
git commit -m "feat(cabinet): order summary card"
```

### Task 11: OrderStatusSection

**Files:**
- Create: `apps/admin/src/pages/cabinet/OrderStatusSection.tsx`
- Test: `apps/admin/src/pages/cabinet/OrderStatusSection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/OrderStatusSection.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OrderStatusSection } from './OrderStatusSection';

it('shows the current stage label and percent', () => {
  render(<MantineProvider><OrderStatusSection stage="production" percent={62} /></MantineProvider>);
  expect(screen.getByText('Производство изделия')).toBeInTheDocument();
  expect(screen.getByText('62%')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- OrderStatusSection`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/OrderStatusSection.tsx
import { Card, Group, Progress, Stack, Text, Title } from '@mantine/core';
import type { OrderStage } from '../../api/types';
import { STAGE_LABELS } from '../../stageLabels';
import { OrderStatusStepper } from '../../brand/OrderStatusStepper';
import { BRAND } from '../../theme';

export function OrderStatusSection({ stage, percent }: { stage: OrderStage; percent: number }) {
  return (
    <Card withBorder radius="lg" p="lg" bg={BRAND.surface}>
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Title order={3}>Статус заказа</Title>
          <Text c="dimmed">{STAGE_LABELS[stage]}</Text>
        </Stack>
        <Stack gap={0} align="flex-end">
          <Text size="sm" c="dimmed">Готовность</Text>
          <Text fw={700} c={BRAND.gold} style={{ fontSize: 32, lineHeight: 1 }}>{percent}%</Text>
        </Stack>
      </Group>
      <Progress value={percent} color="gold" size="lg" radius="xl" my="md" />
      <OrderStatusStepper current={stage} />
    </Card>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- OrderStatusSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/OrderStatusSection.tsx apps/admin/src/pages/cabinet/OrderStatusSection.test.tsx
git commit -m "feat(cabinet): order status section with stepper"
```

### Task 12: QuickAccess

**Files:**
- Create: `apps/admin/src/pages/cabinet/QuickAccess.tsx`
- Test: `apps/admin/src/pages/cabinet/QuickAccess.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/QuickAccess.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router-dom';
import { QuickAccess } from './QuickAccess';

it('renders chat and history shortcuts', () => {
  render(<MantineProvider><MemoryRouter><QuickAccess orderId="o1" /></MemoryRouter></MantineProvider>);
  expect(screen.getByText('Чат с сервисом')).toBeInTheDocument();
  expect(screen.getByText('История этапов')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- QuickAccess`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/QuickAccess.tsx
import { Card, SimpleGrid, Text, Title } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

function Tile({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Card withBorder radius="lg" p="lg" style={{ cursor: 'pointer' }} onClick={onClick}>
      <Text fw={600}>{title}</Text>
    </Card>
  );
}

export function QuickAccess({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  return (
    <div>
      <Title order={4} my="sm">Быстрый доступ</Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Tile title="Чат с сервисом" onClick={() => navigate(`/cabinet/chat/${orderId}`)} />
        <Tile title="История этапов" onClick={() => navigate(`/cabinet/history/${orderId}`)} />
        <Tile title="Профиль" onClick={() => navigate('/cabinet/profile')} />
      </SimpleGrid>
    </div>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- QuickAccess`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/QuickAccess.tsx apps/admin/src/pages/cabinet/QuickAccess.test.tsx
git commit -m "feat(cabinet): quick access tiles"
```

### Task 13: CabinetHomePage (assembly)

**Files:**
- Create: `apps/admin/src/pages/cabinet/CabinetHomePage.tsx`
- Test: `apps/admin/src/pages/cabinet/CabinetHomePage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/CabinetHomePage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CabinetHomePage } from './CabinetHomePage';

vi.mock('../../api/cabinet.api', () => ({
  listMyOrders: () => Promise.resolve({ items: [{
    id: 'o1', amocrm_deal_id: 1, contract_number: 'VH-2024-0715', product_name: 'Кухня Римини',
    total_amount: '1 250 000', prepayment_amount: '375 000', balance_due: '875 000',
    current_stage: 'production', progress_percent: 62, service_phone: null, last_admin_comment: null,
    partner_services: [], created_at: '', updated_at: '',
  }] }),
}));

it('renders the order home once loaded', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><CabinetHomePage /></MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect(screen.getByText('VH-2024-0715')).toBeInTheDocument());
  expect(screen.getByText('Статус заказа')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- CabinetHomePage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/CabinetHomePage.tsx
import { useState } from 'react';
import { Chip, Group, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { listMyOrders } from '../../api/cabinet.api';
import { OrderSummaryCard } from './OrderSummaryCard';
import { OrderStatusSection } from './OrderStatusSection';
import { QuickAccess } from './QuickAccess';

export function CabinetHomePage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['myOrders'], queryFn: listMyOrders });
  const [selected, setSelected] = useState(0);

  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить заказы</Text>;
  const orders = data?.items ?? [];
  if (orders.length === 0) return <Text c="dimmed">Заказов нет</Text>;
  const order = orders[Math.min(selected, orders.length - 1)];

  return (
    <Stack gap="lg">
      {orders.length > 1 && (
        <Group>
          {orders.map((o, i) => (
            <Chip key={o.id} checked={i === selected} onClick={() => setSelected(i)}>
              {o.contract_number ?? o.product_name ?? `Заказ ${i + 1}`}
            </Chip>
          ))}
        </Group>
      )}
      <OrderSummaryCard order={order} />
      <OrderStatusSection stage={order.current_stage} percent={order.progress_percent} />
      <QuickAccess orderId={order.id} />
    </Stack>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- CabinetHomePage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/CabinetHomePage.tsx apps/admin/src/pages/cabinet/CabinetHomePage.test.tsx
git commit -m "feat(cabinet): home page assembly"
```

### Task 14: CabinetHistoryPage

**Files:**
- Create: `apps/admin/src/pages/cabinet/CabinetHistoryPage.tsx`
- Test: `apps/admin/src/pages/cabinet/CabinetHistoryPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/CabinetHistoryPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CabinetHistoryPage } from './CabinetHistoryPage';

vi.mock('../../api/cabinet.api', () => ({
  getOrderHistory: () => Promise.resolve({ items: [
    { id: 'h1', stage: 'detailing', progress_percent: 20, comment: 'Готово', changed_at: '2026-05-01T10:00:00Z' },
  ] }),
}));

it('renders a stage history entry', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/cabinet/history/o1']}>
      <Routes><Route path="/cabinet/history/:id" element={<CabinetHistoryPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect(screen.getByText('Деталировка')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- CabinetHistoryPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/CabinetHistoryPage.tsx
import { Card, Loader, Text, Timeline, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getOrderHistory } from '../../api/cabinet.api';
import { STAGE_LABELS } from '../../stageLabels';

export function CabinetHistoryPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orderHistory', id], queryFn: () => getOrderHistory(id),
  });
  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить историю</Text>;
  const items = data?.items ?? [];
  return (
    <Card withBorder radius="lg" p="lg">
      <Title order={3} mb="md">История этапов</Title>
      {items.length === 0 ? <Text c="dimmed">Изменений пока нет</Text> : (
        <Timeline active={items.length} bulletSize={18} lineWidth={2} color="gold">
          {items.map((h) => (
            <Timeline.Item key={h.id} title={STAGE_LABELS[h.stage]}>
              <Text size="sm" c="dimmed">{new Date(h.changed_at).toLocaleString('ru-RU')} · {h.progress_percent}%</Text>
              {h.comment && <Text size="sm">{h.comment}</Text>}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- CabinetHistoryPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/CabinetHistoryPage.tsx apps/admin/src/pages/cabinet/CabinetHistoryPage.test.tsx
git commit -m "feat(cabinet): stage history timeline"
```

### Task 15: CabinetChatPage (reuse Conversation)

**Files:**
- Create: `apps/admin/src/pages/cabinet/CabinetChatPage.tsx`
- Test: `apps/admin/src/pages/cabinet/CabinetChatPage.test.tsx`

> Known limitation (out of design scope): the reused `Conversation` marks *client* messages read (admin-side semantics). In the client cabinet the read-marker is cosmetically off; chat display + sending work. Functional read-state for the client is a separate backend/logic task, not part of this design-only work.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/CabinetChatPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CabinetChatPage } from './CabinetChatPage';

vi.mock('../../api/cabinet.api', () => ({
  getOrderChat: () => Promise.resolve({ id: 'c1', order_id: 'o1', created_at: '', unread_count: 0 }),
}));
vi.mock('../../components/chat/Conversation', () => ({
  Conversation: ({ chatId }: { chatId: string }) => <div>chat:{chatId}</div>,
}));

it('resolves the chat id then renders the conversation', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/cabinet/chat/o1']}>
      <Routes><Route path="/cabinet/chat/:id" element={<CabinetChatPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect(screen.getByText('chat:c1')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- CabinetChatPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/CabinetChatPage.tsx
import { Card, Loader, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getOrderChat } from '../../api/cabinet.api';
import { Conversation } from '../../components/chat/Conversation';

export function CabinetChatPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orderChat', id], queryFn: () => getOrderChat(id),
  });
  if (isLoading) return <Loader />;
  if (isError || !data) return <Text c="red">Не удалось открыть чат</Text>;
  return (
    <Card withBorder radius="lg" p="lg" style={{ height: '70vh' }}>
      <Title order={3} mb="md">Чат с сервисом</Title>
      <Conversation chatId={data.id} />
    </Card>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- CabinetChatPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/CabinetChatPage.tsx apps/admin/src/pages/cabinet/CabinetChatPage.test.tsx
git commit -m "feat(cabinet): chat page reusing Conversation"
```

### Task 16: CabinetProfilePage

**Files:**
- Create: `apps/admin/src/pages/cabinet/CabinetProfilePage.tsx`
- Test: `apps/admin/src/pages/cabinet/CabinetProfilePage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/admin/src/pages/cabinet/CabinetProfilePage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CabinetProfilePage } from './CabinetProfilePage';

vi.mock('../../api/profile.api', () => ({
  getProfile: () => Promise.resolve({ id: 'u1', phone: '+79991234567', role: 'client', first_name: 'Иван', last_name: 'П' }),
  updateProfile: () => Promise.resolve({ id: 'u1', phone: '+79991234567', role: 'client' }),
}));
const logout = vi.fn();
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ logout }) }));

it('loads the profile', async () => {
  render(<MantineProvider><QueryClientProvider client={new QueryClient()}>
    <CabinetProfilePage />
  </QueryClientProvider></MantineProvider>);
  await waitFor(() => expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Иван'));
  expect(screen.getByText('Выйти')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @vittoria/admin test -- CabinetProfilePage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// apps/admin/src/pages/cabinet/CabinetProfilePage.tsx
import { useEffect, useState } from 'react';
import { Button, Card, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getProfile, updateProfile } from '../../api/profile.api';
import { useAuth } from '../../auth/useAuth';

export function CabinetProfilePage() {
  const qc = useQueryClient();
  const { logout } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  useEffect(() => { if (data) { setFirstName(data.first_name ?? ''); setLastName(data.last_name ?? ''); } }, [data]);

  const mut = useMutation({
    mutationFn: () => updateProfile({ first_name: firstName || undefined, last_name: lastName || undefined }),
    onSuccess: () => { notifications.show({ message: 'Профиль сохранён', color: 'green' }); void qc.invalidateQueries({ queryKey: ['profile'] }); },
    onError: () => notifications.show({ message: 'Не удалось сохранить', color: 'red' }),
  });

  if (isLoading) return <Loader />;
  return (
    <Card withBorder radius="lg" p="lg" maw={520}>
      <Title order={3} mb="md">Профиль</Title>
      <Stack>
        <TextInput label="Имя" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} />
        <TextInput label="Фамилия" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} />
        <Text size="sm" c="dimmed">{data?.phone}</Text>
        <Group justify="space-between">
          <Button loading={mut.isPending} onClick={() => mut.mutate()}>Сохранить</Button>
          <Button variant="subtle" color="gray" onClick={() => void logout()}>Выйти</Button>
        </Group>
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @vittoria/admin test -- CabinetProfilePage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/cabinet/CabinetProfilePage.tsx apps/admin/src/pages/cabinet/CabinetProfilePage.test.tsx
git commit -m "feat(cabinet): profile page"
```

---

## Phase D — Wiring (routes + roles)

### Task 17: Route the client role to the cabinet

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/auth/RoleHome.tsx`
- Test: `apps/admin/src/auth/RoleHome.test.tsx` (create if absent)

- [ ] **Step 1: Update RoleHome to send clients to /cabinet**

In `apps/admin/src/auth/RoleHome.tsx`, replace the final return with:

```tsx
  const to = user.role === 'partner' ? '/partner/orders' : user.role === 'client' ? '/cabinet' : '/orders';
  return <Navigate to={to} replace />;
```

- [ ] **Step 2: Add client routes in App.tsx**

In `apps/admin/src/App.tsx`, add imports:

```tsx
import { ClientLayout } from './components/ClientLayout';
import { CabinetHomePage } from './pages/cabinet/CabinetHomePage';
import { CabinetHistoryPage } from './pages/cabinet/CabinetHistoryPage';
import { CabinetChatPage } from './pages/cabinet/CabinetChatPage';
import { CabinetProfilePage } from './pages/cabinet/CabinetProfilePage';
```

Add this `<Route>` block alongside the existing admin/partner blocks (inside `<Routes>`):

```tsx
<Route
  element={
    <ProtectedRoute>
      <RoleGate allow={['client']}>
        <ClientLayout />
      </RoleGate>
    </ProtectedRoute>
  }
>
  <Route path="/cabinet" element={<CabinetHomePage />} />
  <Route path="/cabinet/history/:id" element={<CabinetHistoryPage />} />
  <Route path="/cabinet/chat/:id" element={<CabinetChatPage />} />
  <Route path="/cabinet/profile" element={<CabinetProfilePage />} />
</Route>
```

- [ ] **Step 3: Write/extend the RoleHome test**

```tsx
// apps/admin/src/auth/RoleHome.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoleHome } from './RoleHome';

vi.mock('./useAuth', () => ({ useAuth: () => ({ status: 'authenticated', user: { role: 'client' } }) }));

it('redirects a client to the cabinet', () => {
  render(<MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/" element={<RoleHome />} />
      <Route path="/cabinet" element={<div>cabinet</div>} />
    </Routes>
  </MemoryRouter>);
  expect(screen.getByText('cabinet')).toBeInTheDocument();
});
```

- [ ] **Step 4: Run the full suite + build**

Run: `pnpm --filter @vittoria/admin test` then `pnpm --filter @vittoria/admin build`
Expected: all PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/App.tsx apps/admin/src/auth/RoleHome.tsx apps/admin/src/auth/RoleHome.test.tsx
git commit -m "feat(admin): wire client cabinet routes + role redirect"
```

---

## Phase E — Admin/partner restyle

### Task 18: Brand the login screen

**Files:**
- Modify: `apps/admin/src/pages/LoginPage.tsx`

- [ ] **Step 1: Replace the plain title with the Logo and a branded Paper**

In `apps/admin/src/pages/LoginPage.tsx`: import `{ Logo }` from `../brand/Logo`, replace `<Title order={3}>VITTORIA HOME</Title>` with `<Logo size={30} tagline />`, and add `radius="lg"` + `shadow="sm"` to the `<Paper>`.

- [ ] **Step 2: Run the existing login test**

Run: `pnpm --filter @vittoria/admin test -- LoginPage`
Expected: PASS (the test keys off inputs/buttons, not the title — if it asserts the title text, update it to query the Logo's `VITTORIA` text).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/LoginPage.tsx apps/admin/src/pages/LoginPage.test.tsx
git commit -m "feat(admin): brand the login screen"
```

### Task 19: Brand the admin layout

**Files:**
- Modify: `apps/admin/src/components/AppLayout.tsx`

- [ ] **Step 1: Swap the title for the Logo**

In `apps/admin/src/components/AppLayout.tsx`: import `{ Logo }` from `../brand/Logo`, replace `<Title order={4}>VITTORIA HOME</Title>` with `<Logo size={22} />`. Keep all NavLinks and logic unchanged.

- [ ] **Step 2: Run the existing layout test + build**

Run: `pnpm --filter @vittoria/admin test -- AppLayout` then `pnpm --filter @vittoria/admin build`
Expected: PASS. If `AppLayout.test.tsx` asserts the title text, update it to assert `VITTORIA`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/AppLayout.tsx apps/admin/src/components/AppLayout.test.tsx
git commit -m "feat(admin): brand the admin layout header"
```

### Task 20: Stage badges + progress bars in the orders table

**Files:**
- Modify: `apps/admin/src/pages/OrdersPage.tsx`

- [ ] **Step 1: Replace plain stage/percent cells**

In `apps/admin/src/pages/OrdersPage.tsx`: import `{ StageBadge }` from `../brand/StageBadge` and `{ Progress, Group }` from `@mantine/core` (extend the existing import). Replace the two `<Table.Td>` cells for stage and percent with:

```tsx
<Table.Td><StageBadge stage={o.current_stage} /></Table.Td>
<Table.Td>
  <Group gap="xs" wrap="nowrap" w={140}>
    <Progress value={o.progress_percent} color="gold" radius="xl" style={{ flex: 1 }} />
    <Text size="sm" w={36} ta="right">{o.progress_percent}%</Text>
  </Group>
</Table.Td>
```

- [ ] **Step 2: Run the existing orders test + build**

Run: `pnpm --filter @vittoria/admin test -- OrdersPage` then `pnpm --filter @vittoria/admin build`
Expected: PASS. If the test asserts the plain stage text, it still matches (StageBadge renders `STAGE_LABELS[...]`).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/pages/OrdersPage.tsx apps/admin/src/pages/OrdersPage.test.tsx
git commit -m "feat(admin): stage badges and progress bars in orders table"
```

---

## Phase F — Verify + preview

### Task 21: Full suite, lint, build, localhost preview

- [ ] **Step 1: Run the full admin suite**

Run: `pnpm --filter @vittoria/admin test`
Expected: all tests PASS.

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm --filter @vittoria/admin lint` and `pnpm --filter @vittoria/admin build`
Expected: no lint errors; `tsc && vite build` succeed.

- [ ] **Step 3: Start the stack for the live preview**

Run (separate terminals / background):
```
pnpm dev:infra
pnpm --filter @vittoria/api prisma:migrate:deploy   # first run only
pnpm dev:api      # :3000
pnpm dev:admin    # :5173
```

- [ ] **Step 4: Manual visual check on http://localhost:5173**

- Log in as the test client `+79991234567` (code printed in the API console: `[DEV-SMS] ... HOME: XXXX`).
- Confirm: cabinet home matches reference 1 (logo + service block, contract card with placeholder photo, finances, status section with percent + 7-step stepper, quick-access).
- Log in as admin `+79990000000` and confirm the panel matches reference 2 (logo, stage badges, progress bars).
- Note any color/spacing tweaks; iterate live with the owner.

- [ ] **Step 5: Hand off the preview link to the owner**

Send `http://localhost:5173` and the test logins; collect visual feedback.

---

## Self-Review notes (author)

- **Spec coverage:** brand tokens (T1–2), client cabinet login/home/history/chat/profile (T9–17), admin restyle (T18–20), photo placeholder (T7), localhost acceptance (T21). All spec §4–§8 items mapped.
- **No backend changes:** every task touches only `apps/admin`. Confirmed.
- **Type consistency:** `OrderStage`, `OrderResponse` reused from `api/types.ts`; `listMyOrders` returns `{ items }`; helpers `isActive`/`statusLabel`/`stepState`/`STAGE_COLOR` referenced consistently across tasks.
- **Known limitation logged:** client chat read-marker (T15) — cosmetic, out of design scope.
