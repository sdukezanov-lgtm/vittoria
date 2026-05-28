# Plan 7: Admin SPA — Foundation + Orders — Design

**Status:** Approved (2026-05-28)
**Predecessors:** Plans 3 (orders API), 5 (chat), 6 (admin/partner endpoints) — backend fully ready.
**Part of:** Admin/Partner SPA, decomposed into sub-projects (this is the first).

## 0. SPA decomposition (context)

The full admin/partner SPA (spec §10: 6 admin + 4 partner screens) is too large for one plan. Decomposed:

- **SPA-0 Foundation + Orders** (this spec) — scaffold (router, API client + auth, SMS-OTP login, protected/role routes, layout) + orders dashboard + order card (edit stage/%/comment).
- **SPA-1 Chat Inbox** — chat list + dialog + send (spec §10 UX priority).
- **SPA-2 Partners/Commissions** — admin users CRUD + commissions + partner cabinet.
- **SPA-3 Audit + Templates** — audit-log viewer + notification-template editor.

Each is its own spec → plan → implementation cycle. Backend for all of them is already done (Plans 3/5/6).

## 1. Goal

Build the foundation of the admin SPA and the first working feature: an admin logs in via SMS-OTP and manages orders (list with filter/search/pagination, open a card, edit stage/progress/comment). Establishes the patterns (auth, API client, routing, UI) every later sub-project reuses.

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](2026-05-26-vittoria-home-mvp-design.md) — §10.1 (admin screens), §7.1 (auth), §7.6 (admin orders).

## 2. Current state

`apps/admin` is an empty Vite + React 18 scaffold (`App.tsx` renders only `<h1>`). Present: `react`, `react-dom`, `vite`, `vitest`, `@testing-library/*`. Absent: router, HTTP client, state management, UI library, auth. This plan adds them.

API base: backend serves under `/api/v1` (e.g. `POST /api/v1/auth/request-code`). Dev API URL configured via Vite env (`VITE_API_BASE_URL`, default `http://localhost:3000/api/v1`).

## 3. Tech Stack (chosen)

| Layer | Choice | Rationale |
|---|---|---|
| Router | `react-router-dom` v6 | standard; protected/nested routes |
| Server-state | `@tanstack/react-query` v5 | cache, loading/error, refetch, invalidation — removes manual fetch state |
| HTTP | thin `fetch` wrapper (`apiFetch`) with auth + 401-refresh | no heavy dependency; full control |
| Auth-state | React Context (`AuthProvider`) | access token in memory + refresh token in `localStorage` |
| UI | `Mantine` v7 (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`) | ready AppShell/Table/forms/inputs/toasts — fast, consistent admin UI |
| Tests | `vitest` + `@testing-library/react` (present) + mocked api layer | no new test deps; mock the `api/` functions, not HTTP |

New runtime deps: `react-router-dom`, `@tanstack/react-query`, `@mantine/core`, `@mantine/hooks`, `@mantine/notifications`. (Mantine peer: `@emotion` is bundled in v7 core — no separate emotion install needed for v7.)

## 4. Architecture

```
apps/admin/src/
├── api/
│   ├── client.ts          — apiFetch(path, opts): adds Bearer, on 401 refreshes once + retries; throws ApiError
│   ├── auth.api.ts        — requestCode, verifyCode, refresh, logout, getMe
│   ├── orders.api.ts      — listOrders(query), getOrder(id), updateProgress(id, body)
│   └── types.ts           — response DTO types (snake_case, mirrors backend)
├── auth/
│   ├── AuthProvider.tsx   — context: { user, accessToken, login, logout, status }
│   ├── useAuth.ts         — hook
│   ├── ProtectedRoute.tsx — redirect to /login if no session
│   └── RoleGate.tsx       — render children only for allowed roles; else fallback
├── components/
│   ├── AppLayout.tsx      — Mantine AppShell (nav: Orders; user menu: logout)
│   └── PlaceholderPage.tsx— "Раздел в разработке" (for partner / not-yet-built)
├── pages/
│   ├── LoginPage.tsx      — SMS-OTP two-step (phone → code)
│   ├── OrdersPage.tsx     — table + filter (stage) + search + pagination
│   └── OrderPage.tsx      — read-only details + edit form (stage/%/comment)
├── App.tsx                — providers (QueryClientProvider, MantineProvider, AuthProvider) + Routes
└── main.tsx               — entry
```

**Responsibility split:** `api/` is the only place that touches HTTP. `auth/` owns session lifecycle. `pages/` compose `api/` (via React Query) + Mantine UI. No business logic in components beyond view concerns.

## 5. Auth flow (SMS-OTP)

1. **LoginPage step 1:** phone input → `POST /auth/request-code { phone }` → `{ retry_after_sec }`. Show "code sent", advance to step 2. On `429` show rate-limit message.
2. **LoginPage step 2:** 4-digit code → `POST /auth/verify-code { phone, code }` → `{ access_token, refresh_token, ... }`. On invalid code show error.
3. After verify: store access token in `AuthProvider` memory, refresh token in `localStorage` (`vittoria_refresh`). Call `GET /me` → `{ id, phone, role, first_name, last_name }`; store user in context.
4. **`apiFetch`:** attaches `Authorization: Bearer <access>`. On `401`: call `POST /auth/refresh { refresh_token }` once → new `{ access_token, refresh_token }`, update store, retry the original request once. If refresh fails (or no refresh token) → `logout()` (clear store + localStorage) and surface an auth error (caller/route redirects to `/login`).
5. **Boot:** on app load, if `localStorage` has a refresh token, attempt `refresh` → `getMe` to restore session (show a loading state until resolved). No refresh token → unauthenticated.
6. **ProtectedRoute:** unauthenticated → `<Navigate to="/login" />`. **RoleGate:** this sub-project targets `admin`; `partner` (and any non-admin) sees `PlaceholderPage` ("Раздел в разработке") — the partner cabinet is SPA-2. `logout` → `POST /auth/logout` (best-effort) + clear + redirect.

## 6. Screens

### 6.1 LoginPage (`/login`)
Two-step Mantine form. Step 1: phone (`+7XXXXXXXXXX` validation). Step 2: code (4 digits). Errors: invalid phone (client), `429` rate-limit, invalid/expired code (`400`). "Назад" to re-enter phone.

### 6.2 OrdersPage (`/orders`, default authed route)
Mantine `Table`. Columns: contract number, product name, current stage (human label), progress %, updated_at. Controls: text search (contract/product), stage `Select` (7 stages + "all"), pagination (page/page_size). Data via React Query: `GET /admin/orders?search=&stage=&page=&page_size=` → `{ items, page, page_size, total }`. Loading skeleton + empty state. Row click → `/orders/:id`.

### 6.3 OrderPage (`/orders/:id`)
React Query `GET /admin/orders/:id`. Read-only block: contract, client, product, total/prepayment/balance, current stage + % + last admin comment, partner services (if any). Edit form (Mantine): stage `Select`, progress `NumberInput` (0–100), comment `Textarea` → `PATCH /admin/orders/:id/progress { stage, progress_percent, comment }`. On success: invalidate the order + orders-list queries, `@mantine/notifications` success toast. On error: error toast. 404 → "Заказ не найден".

## 7. Stage labels

The 7 `order_stage` enum values map to Russian labels (mirror backend `STAGE_LABELS`): `preparation_for_production`→"Подготовка для производства", `detailing`→"Деталировка", `materials_arrival`→"Поступление материалов на склад", `production`→"Производство изделия", `transfer_to_warehouse`→"Передача готового изделия на склад", `completeness_check`→"Проверка комплектности товара", `ready_for_delivery`→"Готовность к передаче клиенту". Defined once in `api/types.ts` (or a `constants` file) and reused by table + selects.

## 8. Testing

`vitest` + `@testing-library/react`. Mock the `api/` module functions (not HTTP) so tests are deterministic and fast. React Query in tests uses a fresh `QueryClient` with retries disabled.

- **`apiFetch`** (`api/client.ts`): adds Bearer header; on 401 calls refresh once and retries; on second 401 / failed refresh triggers logout path. (Mock `fetch` here specifically, since this unit IS the HTTP boundary.)
- **`AuthProvider`/`useAuth`**: `login` stores tokens + user; `logout` clears memory + localStorage; boot restores session when refresh token present.
- **`ProtectedRoute`**: no session → redirects to `/login`. **`RoleGate`**: admin → children; partner → placeholder.
- **`LoginPage`**: phone→code happy path advances steps and calls verify; invalid code shows error; 429 shows rate-limit.
- **`OrdersPage`**: renders rows from mocked `listOrders`; changing search/stage/page re-invokes `listOrders` with updated query.
- **`OrderPage`**: renders details from mocked `getOrder`; submitting the form calls `updateProgress` with form values; success shows toast.

Minimum: ~10 component/unit tests.

## 9. Out of Scope

- Chat Inbox (SPA-1), Partners/Commissions + partner cabinet (SPA-2), Audit/Templates (SPA-3).
- Real-time/WebSocket (not in backend), file upload.
- E2E (Playwright) — component tests suffice for MVP; final manual testing of the whole project is deferred per project plan.
- i18n framework — Russian strings inline/constants for now.
- Token storage hardening (httpOnly cookies) — localStorage refresh token is acceptable for MVP admin tool; revisit at security review.

## 10. Definition of Done

- [ ] New deps installed (`react-router-dom`, `@tanstack/react-query`, `@mantine/core`, `@mantine/hooks`, `@mantine/notifications`); `App.tsx` wires QueryClientProvider + MantineProvider + AuthProvider + Routes.
- [ ] `apiFetch` with Bearer + single 401-refresh-retry + logout-on-fail.
- [ ] SMS-OTP login (request→verify→tokens→/me), session restore on boot, logout.
- [ ] ProtectedRoute + RoleGate (admin focus; partner → placeholder).
- [ ] OrdersPage (search/stage-filter/pagination) + OrderPage (edit stage/%/comment with toast + query invalidation).
- [ ] ~10 vitest tests per §8 green.
- [ ] `pnpm --filter @vittoria/admin lint && pnpm --filter @vittoria/admin test && pnpm --filter @vittoria/admin build` all pass.
- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` (whole monorepo) green; CI green.

After SPA-0: **SPA-1 Chat Inbox**.

## 11. Implementation Notes / Risks

- **Verify exact auth response shape** during planning: read `apps/api/src/auth/auth.controller.ts` for the precise `verify-code`/`refresh` response fields (`access_token`/`refresh_token` naming) and `GET /me` shape — the API types must match exactly.
- **`/admin/orders` response shape:** `AdminListResponse = { items, page, page_size, total }` (from Plan 3 admin-orders controller). `OrderResponse` is snake_case. Mirror precisely in `api/types.ts`.
- **Refresh-retry recursion:** guard `apiFetch` so a 401 from the refresh call itself does NOT re-trigger refresh (infinite loop). Use a flag / dedicated non-retrying refresh call.
- **Mantine v7 setup:** requires `@mantine/core/styles.css` import and `<MantineProvider>` at root. Notifications need `<Notifications />` mounted + its CSS.
- **CORS:** backend must allow the admin origin in dev — verify backend CORS config permits `http://localhost:5173` (Vite default). If not, note it for a backend tweak (out of scope here but flag).
- **Vite env:** `VITE_API_BASE_URL` — add to admin `.env`/`.env.example` (or default in code). `.env*` files are permission-guarded; document the var, default in code to `http://localhost:3000/api/v1`.
