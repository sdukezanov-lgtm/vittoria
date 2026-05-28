# SPA-1 Chat Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-pane "Чат" section to the admin SPA — a chat list (left) and a conversation view with a reply composer (right) — consuming the existing Plan 5 chat endpoints, with ~10s polling for live updates.

**Architecture:** New `chat.api.ts` HTTP boundary + a `relativeTime` util + small presentational components (`MessageBubble`, `MessageComposer`) + two stateful panes (`ChatList`, `Conversation`) wired by `ChatsPage`. react-query drives fetching/polling; the existing `apiFetch` handles auth. A nav entry with an unread badge is added to `AppLayout`. No backend changes.

**Tech Stack:** React 18 + TypeScript, Vite, react-router-dom v6, @tanstack/react-query v5, Mantine v7 (+ notifications), vitest + @testing-library/react + user-event.

---

## File Structure

Create:
- `apps/admin/src/api/chat.api.ts` — typed endpoint functions + types (`ChatMessage`, `AdminChatRow`, etc.). Only place that knows chat endpoint shapes.
- `apps/admin/src/utils/relativeTime.ts` — `formatRelativeTime(iso, now?)` → human "5 мин назад"; pure, deterministic.
- `apps/admin/src/components/chat/MessageBubble.tsx` — one message (role label, text, time, alignment). Presentational.
- `apps/admin/src/components/chat/MessageComposer.tsx` — textarea + "Отправить". Presentational + local input state.
- `apps/admin/src/components/chat/ChatList.tsx` — left pane: list, unread filter, selection, polling.
- `apps/admin/src/components/chat/Conversation.tsx` — right pane: messages, load-older, mark-read, send, polling.
- `apps/admin/src/pages/ChatsPage.tsx` — two-pane wiring; owns `selectedChatId`.

Modify:
- `apps/admin/src/App.tsx` — add `/chats` route inside the protected admin layout.
- `apps/admin/src/components/AppLayout.tsx` — add "Чат" nav link + unread badge.

Test files:
- `apps/admin/src/api/chat.api.test.ts`
- `apps/admin/src/utils/relativeTime.test.ts`
- `apps/admin/src/components/chat/MessageBubble.test.tsx`
- `apps/admin/src/components/chat/MessageComposer.test.tsx`
- `apps/admin/src/components/chat/ChatList.test.tsx`
- `apps/admin/src/components/chat/Conversation.test.tsx`
- `apps/admin/src/pages/ChatsPage.test.tsx`
- `apps/admin/src/components/AppLayout.test.tsx`

**Single-file test command (used throughout):**
`pnpm --filter @vittoria/admin exec vitest run <path-relative-to-apps/admin>`

---

### Task 1: chat.api.ts (HTTP boundary + types)

**Files:**
- Create: `apps/admin/src/api/chat.api.ts`
- Test: `apps/admin/src/api/chat.api.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/api/chat.api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as client from './client';
import { listAdminChats, listChatMessages, sendChatMessage, markChatRead } from './chat.api';

vi.mock('./client');

describe('chat.api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(client.apiFetch).mockResolvedValue(undefined as never);
  });

  it('listAdminChats builds the query string', async () => {
    await listAdminChats({ has_unread: true, page: 2, page_size: 100 });
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/chats?has_unread=true&page=2&page_size=100');
  });

  it('listAdminChats omits empty params', async () => {
    await listAdminChats();
    expect(client.apiFetch).toHaveBeenCalledWith('/admin/chats');
  });

  it('listChatMessages passes before + limit', async () => {
    await listChatMessages('c1', { before: 'm9', limit: 50 });
    expect(client.apiFetch).toHaveBeenCalledWith('/chats/c1/messages?before=m9&limit=50');
  });

  it('sendChatMessage posts the text', async () => {
    await sendChatMessage('c1', { text: 'привет' });
    expect(client.apiFetch).toHaveBeenCalledWith('/chats/c1/messages', { method: 'POST', body: { text: 'привет' } });
  });

  it('markChatRead patches up_to_message_id', async () => {
    await markChatRead('c1', { up_to_message_id: 'm9' });
    expect(client.apiFetch).toHaveBeenCalledWith('/chats/c1/read', { method: 'PATCH', body: { up_to_message_id: 'm9' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/api/chat.api.test.ts`
Expected: FAIL — cannot find module `./chat.api`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/api/chat.api.ts`:
```ts
import { apiFetch } from './client';

export type MessageSenderRole = 'client' | 'admin';

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_user_id: string;
  sender_role: MessageSenderRole;
  text: string | null;
  attachments: unknown[];
  read_at: string | null;
  created_at: string;
}

export interface AdminChatRow {
  chat_id: string;
  order_id: string;
  contract_number: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface AdminChatsResponse {
  rows: AdminChatRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListAdminChatsQuery {
  has_unread?: boolean;
  page?: number;
  page_size?: number;
}

export function listAdminChats(query: ListAdminChatsQuery = {}): Promise<AdminChatsResponse> {
  const params = new URLSearchParams();
  if (query.has_unread) params.set('has_unread', 'true');
  if (query.page) params.set('page', String(query.page));
  if (query.page_size) params.set('page_size', String(query.page_size));
  const qs = params.toString();
  return apiFetch(`/admin/chats${qs ? `?${qs}` : ''}`);
}

export interface ListMessagesQuery {
  before?: string;
  limit?: number;
}

export function listChatMessages(
  chatId: string,
  query: ListMessagesQuery = {},
): Promise<{ rows: ChatMessage[] }> {
  const params = new URLSearchParams();
  if (query.before) params.set('before', query.before);
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return apiFetch(`/chats/${chatId}/messages${qs ? `?${qs}` : ''}`);
}

export function sendChatMessage(chatId: string, body: { text: string }): Promise<ChatMessage> {
  return apiFetch(`/chats/${chatId}/messages`, { method: 'POST', body });
}

export function markChatRead(
  chatId: string,
  body: { up_to_message_id: string },
): Promise<{ updated: number }> {
  return apiFetch(`/chats/${chatId}/read`, { method: 'PATCH', body });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/api/chat.api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/api/chat.api.ts apps/admin/src/api/chat.api.test.ts
git commit -m "feat(admin): chat.api client (list/messages/send/read)"
```

---

### Task 2: relativeTime util

**Files:**
- Create: `apps/admin/src/utils/relativeTime.ts`
- Test: `apps/admin/src/utils/relativeTime.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/utils/relativeTime.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const now = new Date('2026-05-29T12:00:00Z');

describe('formatRelativeTime', () => {
  it('returns — for null', () => {
    expect(formatRelativeTime(null, now)).toBe('—');
  });
  it('returns "только что" under a minute', () => {
    expect(formatRelativeTime('2026-05-29T11:59:30Z', now)).toBe('только что');
  });
  it('returns minutes', () => {
    expect(formatRelativeTime('2026-05-29T11:55:00Z', now)).toBe('5 мин назад');
  });
  it('returns hours', () => {
    expect(formatRelativeTime('2026-05-29T09:00:00Z', now)).toBe('3 ч назад');
  });
  it('returns "вчера" for ~1 day', () => {
    expect(formatRelativeTime('2026-05-28T10:00:00Z', now)).toBe('вчера');
  });
  it('returns days', () => {
    expect(formatRelativeTime('2026-05-26T12:00:00Z', now)).toBe('3 дн назад');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/utils/relativeTime.test.ts`
Expected: FAIL — cannot find module `./relativeTime`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/utils/relativeTime.ts`:
```ts
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '—';
  const diffSec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return 'только что';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ч назад`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'вчера';
  return `${diffDay} дн назад`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/utils/relativeTime.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/utils/relativeTime.ts apps/admin/src/utils/relativeTime.test.ts
git commit -m "feat(admin): relativeTime util for chat list timestamps"
```

---

### Task 3: MessageBubble

**Files:**
- Create: `apps/admin/src/components/chat/MessageBubble.tsx`
- Test: `apps/admin/src/components/chat/MessageBubble.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/components/chat/MessageBubble.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../api/chat.api';

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1', chat_id: 'c1', sender_user_id: 'u1', sender_role: 'client',
    text: 'Привет', attachments: [], read_at: null, created_at: '2026-05-29T10:05:00Z', ...over,
  };
}

function renderBubble(m: ChatMessage) {
  render(<MantineProvider><MessageBubble message={m} /></MantineProvider>);
}

describe('MessageBubble', () => {
  it('renders a client message with the "Клиент" label and text', () => {
    renderBubble(msg());
    expect(screen.getByText('Клиент')).toBeInTheDocument();
    expect(screen.getByText('Привет')).toBeInTheDocument();
  });

  it('renders an admin message with the "Вы" label', () => {
    renderBubble(msg({ sender_role: 'admin', text: 'Здравствуйте' }));
    expect(screen.getByText('Вы')).toBeInTheDocument();
    expect(screen.getByText('Здравствуйте')).toBeInTheDocument();
  });

  it('renders a HH:MM timestamp', () => {
    renderBubble(msg());
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/MessageBubble.test.tsx`
Expected: FAIL — cannot find module `./MessageBubble`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/components/chat/MessageBubble.tsx`:
```tsx
import { Group, Paper, Text } from '@mantine/core';
import type { ChatMessage } from '../../api/chat.api';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isAdmin = message.sender_role === 'admin';
  return (
    <Group justify={isAdmin ? 'flex-end' : 'flex-start'} mb="xs">
      <Paper withBorder p="xs" maw="70%" bg={isAdmin ? 'blue.0' : 'gray.1'}>
        <Text size="xs" c="dimmed">{isAdmin ? 'Вы' : 'Клиент'}</Text>
        <Text style={{ whiteSpace: 'pre-wrap' }}>{message.text}</Text>
        <Text size="xs" c="dimmed" ta="right">{formatTime(message.created_at)}</Text>
      </Paper>
    </Group>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/MessageBubble.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/chat/MessageBubble.tsx apps/admin/src/components/chat/MessageBubble.test.tsx
git commit -m "feat(admin): MessageBubble component"
```

---

### Task 4: MessageComposer

**Files:**
- Create: `apps/admin/src/components/chat/MessageComposer.tsx`
- Test: `apps/admin/src/components/chat/MessageComposer.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/components/chat/MessageComposer.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MessageComposer } from './MessageComposer';

function renderComposer(onSend = vi.fn(), sending = false) {
  render(
    <MantineProvider>
      <MessageComposer onSend={onSend} sending={sending} />
    </MantineProvider>,
  );
  return { onSend };
}

describe('MessageComposer', () => {
  it('sends trimmed text and clears the input', async () => {
    const { onSend } = renderComposer();
    const user = userEvent.setup();
    const box = screen.getByPlaceholderText(/написать сообщение/i);
    await user.type(box, '  привет  ');
    await user.click(screen.getByRole('button', { name: /отправить/i }));
    expect(onSend).toHaveBeenCalledWith('привет');
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('disables the button when empty', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /отправить/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/MessageComposer.test.tsx`
Expected: FAIL — cannot find module `./MessageComposer`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/components/chat/MessageComposer.tsx`:
```tsx
import { useState } from 'react';
import { Button, Group, Textarea } from '@mantine/core';

export function MessageComposer({
  onSend,
  sending,
}: {
  onSend: (text: string) => void;
  sending: boolean;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };
  return (
    <Group align="flex-end" wrap="nowrap" mt="sm">
      <Textarea
        style={{ flex: 1 }}
        placeholder="Написать сообщение..."
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={1}
        maxRows={4}
      />
      <Button onClick={submit} loading={sending} disabled={!text.trim()}>
        Отправить
      </Button>
    </Group>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/MessageComposer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/chat/MessageComposer.tsx apps/admin/src/components/chat/MessageComposer.test.tsx
git commit -m "feat(admin): MessageComposer component"
```

---

### Task 5: ChatList (left pane)

**Files:**
- Create: `apps/admin/src/components/chat/ChatList.tsx`
- Test: `apps/admin/src/components/chat/ChatList.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/components/chat/ChatList.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatList } from './ChatList';
import * as chatApi from '../../api/chat.api';

vi.mock('../../api/chat.api');

function renderList(onSelect = vi.fn(), selectedChatId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <ChatList selectedChatId={selectedChatId} onSelect={onSelect} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return { onSelect };
}

describe('ChatList', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders rows with contract number and unread badge', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [{ chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 2 }],
      total: 1, page: 1, page_size: 100,
    });
    renderList();
    expect(await screen.findByText('1024')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onSelect with chat_id when a row is clicked', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [{ chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 0 }],
      total: 1, page: 1, page_size: 100,
    });
    const { onSelect } = renderList();
    const user = userEvent.setup();
    await user.click(await screen.findByText('1024'));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('re-queries with has_unread when the filter is toggled', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({ rows: [], total: 0, page: 1, page_size: 100 });
    renderList();
    await waitFor(() => expect(chatApi.listAdminChats).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/только непрочитанные/i));
    await waitFor(() =>
      expect(chatApi.listAdminChats).toHaveBeenLastCalledWith(expect.objectContaining({ has_unread: true })),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/ChatList.test.tsx`
Expected: FAIL — cannot find module `./ChatList`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/components/chat/ChatList.tsx`:
```tsx
import { useState } from 'react';
import { Badge, Checkbox, Loader, NavLink, Stack, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAdminChats } from '../../api/chat.api';
import { formatRelativeTime } from '../../utils/relativeTime';

export function ChatList({
  selectedChatId,
  onSelect,
}: {
  selectedChatId: string | null;
  onSelect: (chatId: string) => void;
}) {
  const [hasUnread, setHasUnread] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminChats', { hasUnread }],
    queryFn: () => listAdminChats({ has_unread: hasUnread, page: 1, page_size: 100 }),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  return (
    <Stack gap="xs">
      <Checkbox
        label="Только непрочитанные"
        checked={hasUnread}
        onChange={(e) => setHasUnread(e.currentTarget.checked)}
      />
      {isLoading && <Loader size="sm" />}
      {isError && <Text c="red" size="sm">Не удалось загрузить диалоги</Text>}
      {data && data.rows.length === 0 && <Text c="dimmed" size="sm">Нет диалогов</Text>}
      {data?.rows.map((r) => (
        <NavLink
          key={r.chat_id}
          active={r.chat_id === selectedChatId}
          onClick={() => onSelect(r.chat_id)}
          label={r.contract_number ?? '—'}
          description={formatRelativeTime(r.last_message_at)}
          rightSection={r.unread_count > 0 ? <Badge size="sm" circle>{r.unread_count}</Badge> : null}
        />
      ))}
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/ChatList.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/chat/ChatList.tsx apps/admin/src/components/chat/ChatList.test.tsx
git commit -m "feat(admin): ChatList pane (list, unread filter, selection, polling)"
```

---

### Task 6: Conversation (right pane)

**Files:**
- Create: `apps/admin/src/components/chat/Conversation.tsx`
- Test: `apps/admin/src/components/chat/Conversation.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/components/chat/Conversation.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Conversation } from './Conversation';
import * as chatApi from '../../api/chat.api';
import type { ChatMessage } from '../../api/chat.api';

vi.mock('../../api/chat.api');

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1', chat_id: 'c1', sender_user_id: 'u1', sender_role: 'client',
    text: 'текст', attachments: [], read_at: '2026-05-29T10:00:00Z',
    created_at: '2026-05-29T10:00:00Z', ...over,
  };
}

function renderConversation(chatId = 'c1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <Conversation chatId={chatId} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('Conversation', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('renders messages (already-read) from the API', async () => {
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({
      rows: [
        msg({ id: 'm2', sender_role: 'admin', text: 'ответ', created_at: '2026-05-29T10:05:00Z' }),
        msg({ id: 'm1', sender_role: 'client', text: 'вопрос', created_at: '2026-05-29T10:00:00Z' }),
      ],
    });
    renderConversation();
    expect(await screen.findByText('вопрос')).toBeInTheDocument();
    expect(screen.getByText('ответ')).toBeInTheDocument();
  });

  it('marks unread client messages read on open', async () => {
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({
      rows: [msg({ id: 'm9', sender_role: 'client', text: 'новое', read_at: null })],
    });
    vi.mocked(chatApi.markChatRead).mockResolvedValue({ updated: 1 });
    renderConversation();
    await screen.findByText('новое');
    await waitFor(() =>
      expect(chatApi.markChatRead).toHaveBeenCalledWith('c1', { up_to_message_id: 'm9' }),
    );
  });

  it('sends a message via the composer', async () => {
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({ rows: [] });
    vi.mocked(chatApi.sendChatMessage).mockResolvedValue(msg({ id: 'm3', sender_role: 'admin', text: 'привет' }));
    renderConversation();
    await waitFor(() => expect(chatApi.listChatMessages).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/написать сообщение/i), 'привет');
    await user.click(screen.getByRole('button', { name: /отправить/i }));
    await waitFor(() =>
      expect(chatApi.sendChatMessage).toHaveBeenCalledWith('c1', { text: 'привет' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/Conversation.test.tsx`
Expected: FAIL — cannot find module `./Conversation`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/components/chat/Conversation.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listChatMessages,
  markChatRead,
  sendChatMessage,
  type ChatMessage,
} from '../../api/chat.api';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';

const PAGE = 50;

export function Conversation({ chatId }: { chatId: string }) {
  const queryClient = useQueryClient();
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);
  const lastMarkedRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['chatMessages', chatId],
    queryFn: () => listChatMessages(chatId, { limit: PAGE }),
    refetchInterval: 10_000,
  });

  // Reset per-chat accumulated state when switching chats.
  useEffect(() => {
    setOlder([]);
    setNoMoreOlder(false);
    lastMarkedRef.current = null;
  }, [chatId]);

  const fresh = data?.rows ?? []; // newest-first

  // Merge older (asc) + fresh (reversed to asc), de-duped by id.
  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    for (const m of older) byId.set(m.id, m);
    for (const m of [...fresh].reverse()) byId.set(m.id, m);
    return Array.from(byId.values());
  }, [older, fresh]);

  // Mark incoming client messages read once per newest message.
  useEffect(() => {
    if (fresh.length === 0) return;
    const newest = fresh[0];
    const hasUnreadClient = fresh.some((m) => m.sender_role === 'client' && m.read_at === null);
    if (hasUnreadClient && lastMarkedRef.current !== newest.id) {
      lastMarkedRef.current = newest.id;
      markChatRead(chatId, { up_to_message_id: newest.id })
        .then(() => queryClient.invalidateQueries({ queryKey: ['adminChats'] }))
        .catch(() => undefined);
    }
  }, [fresh, chatId, queryClient]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: (text: string) => sendChatMessage(chatId, { text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chatMessages', chatId] });
      void queryClient.invalidateQueries({ queryKey: ['adminChats'] });
    },
    onError: () => notifications.show({ message: 'Не удалось отправить сообщение', color: 'red' }),
  });

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await listChatMessages(chatId, { before: oldest.id, limit: PAGE });
      if (res.rows.length < PAGE) setNoMoreOlder(true);
      const olderAsc = [...res.rows].reverse();
      setOlder((prev) => {
        const byId = new Map<string, ChatMessage>();
        for (const m of olderAsc) byId.set(m.id, m);
        for (const m of prev) byId.set(m.id, m);
        return Array.from(byId.values());
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  if (isLoading) return <Loader />;
  if (isError) return <Text c="red">Не удалось загрузить сообщения</Text>;

  return (
    <Stack h="100%" justify="space-between">
      <Box style={{ overflowY: 'auto', flex: 1 }}>
        {fresh.length === PAGE && !noMoreOlder && (
          <Button variant="subtle" size="xs" mb="xs" loading={loadingOlder} onClick={() => void loadOlder()}>
            Загрузить ещё
          </Button>
        )}
        {messages.length === 0 && <Text c="dimmed">Сообщений пока нет</Text>}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </Box>
      <MessageComposer onSend={(text) => sendMut.mutate(text)} sending={sendMut.isPending} />
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/chat/Conversation.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/chat/Conversation.tsx apps/admin/src/components/chat/Conversation.test.tsx
git commit -m "feat(admin): Conversation pane (messages, mark-read, send, load-older, polling)"
```

---

### Task 7: ChatsPage (two-pane wiring)

**Files:**
- Create: `apps/admin/src/pages/ChatsPage.tsx`
- Test: `apps/admin/src/pages/ChatsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/pages/ChatsPage.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatsPage } from './ChatsPage';
import * as chatApi from '../api/chat.api';

vi.mock('../api/chat.api');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MantineProvider>
      <Notifications />
      <QueryClientProvider client={client}>
        <ChatsPage />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('ChatsPage', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows a placeholder until a chat is selected, then the conversation', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [{ chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 0 }],
      total: 1, page: 1, page_size: 100,
    });
    vi.mocked(chatApi.listChatMessages).mockResolvedValue({
      rows: [{
        id: 'm1', chat_id: 'c1', sender_user_id: 'u1', sender_role: 'client',
        text: 'Привет от клиента', attachments: [], read_at: '2026-05-29T10:00:00Z',
        created_at: '2026-05-29T10:00:00Z',
      }],
    });
    renderPage();
    expect(screen.getByText('Выберите диалог слева')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByText('1024'));
    expect(await screen.findByText('Привет от клиента')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/pages/ChatsPage.test.tsx`
Expected: FAIL — cannot find module `./ChatsPage`.

- [ ] **Step 3: Write the implementation**

`apps/admin/src/pages/ChatsPage.tsx`:
```tsx
import { useState } from 'react';
import { Grid, Stack, Text, Title } from '@mantine/core';
import { ChatList } from '../components/chat/ChatList';
import { Conversation } from '../components/chat/Conversation';

export function ChatsPage() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  return (
    <Stack h="calc(100vh - 88px)">
      <Title order={3}>Чат</Title>
      <Grid style={{ flex: 1, minHeight: 0 }} gutter="md">
        <Grid.Col span={4} style={{ borderRight: '1px solid var(--mantine-color-gray-3)' }}>
          <ChatList selectedChatId={selectedChatId} onSelect={setSelectedChatId} />
        </Grid.Col>
        <Grid.Col span={8}>
          {selectedChatId ? (
            <Conversation chatId={selectedChatId} />
          ) : (
            <Text c="dimmed">Выберите диалог слева</Text>
          )}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/pages/ChatsPage.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/ChatsPage.tsx apps/admin/src/pages/ChatsPage.test.tsx
git commit -m "feat(admin): ChatsPage two-pane wiring"
```

---

### Task 8: Route + nav link with unread badge

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/AppLayout.tsx`
- Test: `apps/admin/src/components/AppLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/admin/src/components/AppLayout.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { AuthContext, type AuthContextValue } from '../auth/useAuth';
import * as chatApi from '../api/chat.api';

vi.mock('../api/chat.api');

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    user: { id: 'u1', phone: '+79990000000', role: 'admin' },
    status: 'authenticated',
    login: vi.fn(),
    logout: vi.fn(),
  };
  render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <AppLayout />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('shows the Чат nav link with a total unread badge', async () => {
    vi.mocked(chatApi.listAdminChats).mockResolvedValue({
      rows: [
        { chat_id: 'c1', order_id: 'o1', contract_number: '1024', last_message_at: null, unread_count: 2 },
        { chat_id: 'c2', order_id: 'o2', contract_number: '1031', last_message_at: null, unread_count: 1 },
      ],
      total: 2, page: 1, page_size: 100,
    });
    renderLayout();
    expect(screen.getByText('Чат')).toBeInTheDocument();
    expect(screen.getByText('Заказы')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/AppLayout.test.tsx`
Expected: FAIL — no "Чат" text / no badge (and AppLayout does not yet import chat.api).

- [ ] **Step 3: Modify AppLayout**

Replace the entire contents of `apps/admin/src/components/AppLayout.tsx` with:
```tsx
import { AppShell, Badge, Burger, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { NavLink as RouterNavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { listAdminChats } from '../api/chat.api';

export function AppLayout() {
  const [opened, { toggle }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: chats } = useQuery({
    queryKey: ['adminChats', { hasUnread: false }],
    queryFn: () => listAdminChats({ has_unread: false, page: 1, page_size: 100 }),
    refetchInterval: 10_000,
  });
  const totalUnread = chats?.rows.reduce((sum, r) => sum + r.unread_count, 0) ?? 0;

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
        <NavLink
          component={RouterNavLink}
          to="/chats"
          label="Чат"
          rightSection={totalUnread > 0 ? <Badge size="sm" circle>{totalUnread}</Badge> : null}
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

- [ ] **Step 4: Add the /chats route in App.tsx**

In `apps/admin/src/App.tsx`, add the import near the other page imports:
```tsx
import { ChatsPage } from './pages/ChatsPage';
```
Then, inside the protected layout `<Route element={...}>` block, add the `/chats` route next to the orders routes so it reads:
```tsx
<Route path="/orders" element={<OrdersPage />} />
<Route path="/orders/:id" element={<OrderPage />} />
<Route path="/chats" element={<ChatsPage />} />
<Route index element={<Navigate to="/orders" replace />} />
```

- [ ] **Step 5: Run the AppLayout test to verify it passes**

Run: `pnpm --filter @vittoria/admin exec vitest run src/components/AppLayout.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 6: Full admin gates**

Run: `pnpm --filter @vittoria/admin test`
Expected: all suites pass (existing 23 + new chat tests).
Run: `pnpm --filter @vittoria/admin build`
Expected: `tsc && vite build` clean.
Run: `pnpm --filter @vittoria/admin lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/App.tsx apps/admin/src/components/AppLayout.tsx apps/admin/src/components/AppLayout.test.tsx
git commit -m "feat(admin): wire /chats route + nav link with unread badge"
```

---

## Manual verification (after all tasks)

With the dev servers running (API on :3000, admin on :5173) and the admin logged in:
1. Click "Чат" in the left menu → the two-pane chat page opens at `/chats`.
2. The left list shows any chats by contract number (it will be empty until a client starts a chat — see note below).
3. To create test data: a chat row appears once a message exists for an order's chat. This can be seeded by inserting a `chats` row for an existing order and a `messages` row (sender_role `client`). The controller logic is already covered by tests; manual seeding is optional.
4. Select a chat → conversation loads on the right; type a reply and click "Отправить" → it appears as a blue right-aligned bubble; the list's timestamp updates.
5. Confirm unread badges appear for chats with unread client messages and clear when the chat is opened.

---

## Self-Review

**Spec coverage:**
- Nav item "Чат" + route `/chats` + unread badge → Task 8. ✓
- Two-pane layout → Task 7. ✓
- Chat list: contract / relative time / unread badge / "только непрочитанные" / polling → Task 5 (+ Task 2 util). ✓
- Conversation: messages oldest→newest, role styling, time, empty/error states, polling → Task 6 (+ Task 3 bubble). ✓
- Mark-read on open → Task 6. ✓
- Send reply + toast on error + invalidate list → Task 6 (+ Task 4 composer). ✓
- Load older → Task 6. ✓
- API boundary consuming the 4 endpoints → Task 1. ✓
- Tests mirroring SPA-0 patterns → every task. ✓
- No backend changes → confirmed (only `apps/admin/**` touched). ✓

**Placeholder scan:** No TBD/TODO; every code + test step has full content. ✓

**Type consistency:** `ChatMessage`, `AdminChatRow`, `AdminChatsResponse`, `listAdminChats`, `listChatMessages`, `sendChatMessage`, `markChatRead` defined in Task 1 and used identically in Tasks 5–8. `formatRelativeTime(iso, now?)` defined in Task 2, used in Task 5. Component props (`{ message }`, `{ onSend, sending }`, `{ selectedChatId, onSelect }`, `{ chatId }`) consistent between definition and call sites. `AuthContextValue` shape used in Task 8 matches SPA-0 usage (`user`, `status`, `login`, `logout`). ✓
