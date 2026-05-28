# SPA-1 Chat Inbox — Design

**Date:** 2026-05-29
**Sub-project:** SPA-1 (Admin SPA, after SPA-0 Foundation + Orders)
**Goal:** Add a "Чат" section to the admin SPA where a manager sees per-order conversations with clients, reads incoming messages, and replies. Consumes the chat endpoints already built in Plan 5 — no backend changes.

---

## Scope

In scope:
- New nav item "Чат" in the sidebar with an unread badge, route `/chats`.
- Single page, two-pane layout: chat list (left) + conversation (right).
- Auto-refresh via polling (~10s) for both the list and the open conversation.
- Send a reply; mark incoming messages read on open; load older messages.

Out of scope (explicitly):
- No backend changes. The admin chat-list endpoint does not return client name or a last-message text preview, so the list shows contract number + last-activity time + unread count only. Adding name/preview is a possible later backend enhancement.
- No WebSockets/real-time push to the browser — polling only.
- No attachments UI (messages carry an `attachments` array in the API, but sending attachments is not part of this sub-project; existing attachments, if any, are not rendered beyond text).

---

## Backend endpoints consumed (already exist)

All under base `http://localhost:3000/api/v1` (configurable via `VITE_API_BASE_URL`). All require admin auth (Bearer token, handled by the existing `apiFetch`).

1. `GET /admin/chats?has_unread=&page=&page_size=` →
   ```
   {
     rows: Array<{
       chat_id: string;
       order_id: string;
       contract_number: string | null;
       last_message_at: string | null;   // ISO
       unread_count: number;              // unread client messages
     }>;
     total: number; page: number; page_size: number;
   }
   ```
2. `GET /chats/:id/messages?before=&limit=` →
   ```
   { rows: Array<MessageResponse> }   // newest-first (createdAt desc)
   ```
   where `MessageResponse = { id, chat_id, sender_user_id, sender_role: 'client'|'admin', text: string|null, attachments: unknown[], read_at: string|null, created_at: string }`.
   `before` is a message id cursor (returns messages older than it). `limit` default 50.
3. `POST /chats/:id/messages` body `{ text: string }` → returns the created `MessageResponse`.
   (Side effect: when an admin sends, the backend notifies the client — nothing for the SPA to do.)
4. `PATCH /chats/:id/read` body `{ up_to_message_id: string }` → `{ updated: number }`.
   Marks client messages up to and including that message as read.

---

## Files

Create:
- `apps/admin/src/api/chat.api.ts` — typed client functions: `listAdminChats`, `listChatMessages`, `sendChatMessage`, `markChatRead`. Response/argument types live here (or extend `api/types.ts`).
- `apps/admin/src/pages/ChatsPage.tsx` — the two-pane page. Owns `selectedChatId` state and the "only unread" toggle. Composes the list and conversation panes.
- `apps/admin/src/components/chat/ChatList.tsx` — left pane: renders rows, unread toggle, handles selection, polls.
- `apps/admin/src/components/chat/Conversation.tsx` — right pane: message list (oldest→newest), "load older" button, composer; polls; triggers mark-read.
- `apps/admin/src/components/chat/MessageBubble.tsx` — one message (alignment + color by `sender_role`, time).
- `apps/admin/src/components/chat/MessageComposer.tsx` — textarea + "Отправить" button; disabled while empty/sending.

Modify:
- `apps/admin/src/App.tsx` — add routes `/chats` (inside the protected admin layout).
- `apps/admin/src/components/AppLayout.tsx` — add the "Чат" `NavLink` with an unread badge.

Test files (vitest + @testing-library/react), mirroring the SPA-0 style:
- `apps/admin/src/pages/ChatsPage.test.tsx`
- `apps/admin/src/components/chat/ChatList.test.tsx`
- `apps/admin/src/components/chat/Conversation.test.tsx`

---

## Data flow & behavior

**Chat list (left):**
- react-query key `['adminChats', { hasUnread }]`, `queryFn: () => listAdminChats({ has_unread: hasUnread, page: 1, page_size: 100 })`, `refetchInterval: 10_000`, `placeholderData: keepPreviousData`.
- Each row: contract number (`contract_number ?? '—'`), relative last-activity time from `last_message_at` (e.g. "5 мин назад"; if null → "—"), unread badge when `unread_count > 0`.
- "☑ Только непрочитанные" toggle flips `hasUnread` (resets nothing else).
- Row click sets `selectedChatId`.
- Empty: "Нет диалогов". Error: "Не удалось загрузить диалоги".

**Conversation (right):**
- When `selectedChatId` is null → placeholder "Выберите диалог слева".
- react-query key `['chatMessages', chatId]`, `queryFn` loads newest page (`listChatMessages(chatId, { limit: 50 })`), `refetchInterval: 10_000`.
- API returns newest-first; render reversed (oldest at top, newest at bottom). Auto-scroll to bottom on new messages / on open.
- "Загрузить ещё" button at the top: when a full page (== limit) was returned, allow loading older via `before = oldestLoadedMessageId`. Older pages are accumulated in component state (kept simple: a local array merged with the query's freshest page, de-duped by id; newest page always comes from react-query so polling stays live).
- Bubbles: `sender_role === 'admin'` → right-aligned, blue; `client` → left-aligned, grey. Show `created_at` as HH:MM.
- Empty (chat selected, no messages): "Сообщений пока нет".
- Error: "Не удалось загрузить сообщения".

**Mark read:**
- When a conversation is open and the freshest loaded page contains unread client messages, call `markChatRead(chatId, { up_to_message_id: newestMessageId })` once per new newest-message, then invalidate `['adminChats']` so the list badge + nav badge update. Avoid redundant calls (track the last message id we marked).

**Send:**
- Composer submit → `sendChatMessage(chatId, { text })`. On success: clear input, invalidate `['chatMessages', chatId]` and `['adminChats']` (so the list's last-activity updates). On error: Mantine toast "Не удалось отправить сообщение". Button shows loading; empty/whitespace text is not sent.

**Nav unread badge:**
- Sum of `unread_count` over the `['adminChats', { hasUnread:false }]` rows (page_size 100). Shown next to "Чат" when > 0. Updates via the same 10s polling / invalidations.

---

## Error handling summary

- List/messages load failure → inline red text in the relevant pane.
- Send failure → Mantine notification (toast), input preserved.
- All network calls go through the existing `apiFetch` (auth, refresh, single-flight already handled).

---

## Testing plan

Use the established SPA-0 patterns (Mantine provider + react-query provider wrappers, `setupTests.ts` matchMedia/ResizeObserver mocks, mocked `chat.api`).

- **ChatList:** renders rows with contract + unread badge; clicking a row invokes the selection callback; "только непрочитанные" toggle calls `listAdminChats` with `has_unread: true`.
- **Conversation:** given a selected chat, renders messages oldest→newest with correct alignment by role; submitting the composer calls `sendChatMessage` with the typed text and refetches; on open with unread client messages, calls `markChatRead` with the newest message id; empty state shown when no messages.
- **ChatsPage:** integration — selecting a chat in the list shows its conversation on the right.
- Polling intervals are configured but not asserted via timers (kept deterministic by mocking the api module and asserting calls/render, not timing).

Gates before done: `vitest run` green, `tsc && vite build` clean, `eslint` clean (admin). Manual: log into the running admin, open "Чат", verify list/selection/send against the live dev API.

---

## Units & responsibilities (clarity check)

- `chat.api.ts` — the only place that knows endpoint shapes; pure functions returning typed data.
- `ChatList` — knows how to display/filter/select chats; depends on `chat.api` + selection callback prop.
- `Conversation` — knows how to display one chat's messages, mark read, send; depends on `chat.api` + `chatId` prop.
- `MessageBubble` / `MessageComposer` — dumb presentational units; depend only on props.
- `ChatsPage` — wires list selection ↔ conversation; owns `selectedChatId`.
- `AppLayout` — adds the nav entry + badge; depends on the list query for the count.

Each unit is independently testable with `chat.api` mocked.
