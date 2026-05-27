# Plan 5: Chat (REST-only MVP) — Design

**Status:** Approved (2026-05-28)
**Predecessor:** Plan 4 (Notifications) — `chat.reply.received` deferred to here.
**Successors:** Plan 5b (WebSocket + attachments + Object Storage), Plan 4b (real push/SMS providers).

## 1. Goal

Дать клиенту и admin'у канал двусторонней переписки внутри заказа. MVP — REST-only с client-polling, без WebSocket и вложений. Admin отвечает в админ-панели, клиент получает push-уведомление на устройство.

Закрывает спецификации раздел 7.4 (Chat client) и часть 7.6 (admin chats), оставляя WS (раздел 8) и Object Storage (раздел 6.7) на Plan 5b.

## 2. Architecture

Новый `ChatModule` параллельно с `OrdersModule`. `ChatService` напрямую инжектит `NotificationsService` (через export `NotificationsModule`) — без event-emitter, так как fan-out не нужен.

`NotificationsService` расширяется новым event-типом `chat.reply.received` (push only, non-critical).

```
┌──────────────────┐       ┌─────────────────────┐
│ ChatController   │──────▶│ ChatService         │
│ (client routes)  │       │                     │
└──────────────────┘       │  • findOrCreate     │
                           │  • listMessages     │
┌──────────────────┐       │  • sendMessage ─────┼───▶ NotificationsService.send
│ AdminChats       │──────▶│  • markRead         │     (if senderRole=admin)
│ Controller       │       │  • listAdminChats   │
└──────────────────┘       └─────────────────────┘
                                     │
                                     ▼
                              PrismaService
```

## 3. Data Model

Две новые Prisma-модели + миграция:

```prisma
model Chat {
  id        String   @id @default(uuid()) @db.Uuid
  orderId   String   @unique @map("order_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  order    Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  messages Message[]

  @@map("chats")
}

enum MessageSenderRole {
  client
  admin
}

model Message {
  id           String            @id @default(uuid()) @db.Uuid
  chatId       String            @map("chat_id") @db.Uuid
  senderUserId String            @map("sender_user_id") @db.Uuid
  senderRole   MessageSenderRole @map("sender_role")
  text         String?
  attachments  Json              @default("[]")
  readAt       DateTime?         @map("read_at")
  redactedAt   DateTime?         @map("redacted_at")
  createdAt    DateTime          @default(now()) @map("created_at")

  chat   Chat @relation(fields: [chatId], references: [id], onDelete: Cascade)
  sender User @relation(fields: [senderUserId], references: [id])

  @@index([chatId, createdAt(sort: Desc)])
  @@map("messages")
}
```

Связи на `Order` и `User`:
- `Order.chat: Chat?` (1:0..1)
- `User.sentMessages: Message[]`

**Forward-compatibility:**
- `attachments` jsonb default `[]` — поле есть в схеме сразу, чтобы Plan 5b/Object Storage не делал breaking migration. В MVP всегда `[]`.
- `redactedAt` готов для 152-ФЗ анонимизации (DELETE /me) — текущий план туда не лезет.

`onDelete: Cascade` от Order → Chat → Message: удаление заказа подчищает чат и сообщения (требуется для 152-ФЗ).

**Read semantics:** `read_at` на сообщении = момент, когда **получатель** (не отправитель) его прочитал. Поле NULL = ещё непрочитано. UPDATE происходит только через `PATCH /chats/:id/read` (см. ниже).

## 4. REST API

Префикс `/api/v1`. Авторизация — существующий JWT + `RolesGuard`.

### 4.1 Client routes (роли: `client`, `admin`)

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/orders/:id/chat` | — | `ChatResponse` |
| GET | `/chats/:id/messages?before=<uuid>&limit=50` | — | `{ rows: MessageResponse[] }` |
| POST | `/chats/:id/messages` | `{ text: string }` | `MessageResponse` (HTTP 201) |
| PATCH | `/chats/:id/read` | `{ up_to_message_id: string }` | `{ updated: number }` |

**`GET /orders/:id/chat`** — upsert. Если чата нет, создаёт. Возвращает:
```json
{ "id": "uuid", "order_id": "uuid", "created_at": "ISO", "unread_count": 3 }
```
`unread_count` = сообщений в чате с `read_at IS NULL` и `sender_user_id != requester_id`.

**`GET /chats/:id/messages`** — курсорная пагинация. `before` — id сообщения, до которого (исключительно) запрашиваем. `limit` clamp 1..100, default 50. Порядок ответа: `created_at DESC` (новые сверху). Ответ:
```json
{ "rows": [MessageResponse, ...] }
```

**`POST /chats/:id/messages`** — `text` required в MVP, max 4000 символов, валидация через class-validator. `senderRole` ставится по auth (client → client, admin → admin). Возвращает созданное сообщение. Side-effect: если sender=admin → `NotificationsService.send(chat.order.clientUserId, 'chat.reply.received', payload)` (см. §5).

**`PATCH /chats/:id/read`** — body `{ up_to_message_id: uuid }`. Реализация:
1. SELECT `created_at` сообщения по `id = up_to_message_id` и `chat_id = $chat_id` (404 если не найдено).
2. UPDATE messages SET `read_at = NOW()` WHERE `chat_id = $chat_id AND created_at <= $boundary AND sender_user_id != $requester_id AND read_at IS NULL`.

UUIDv4 не сортируется хронологически, поэтому переход через `created_at` обязателен. Возвращает `{ "updated": <count> }`.

### 4.2 Admin route

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/admin/chats?has_unread=true&page=&page_size=` | `AdminChatListResponse` |

Параметры: `has_unread` (boolean, default false), `page` (1+, default 1), `page_size` (1..100, default 20). Сортировка: чаты с unread сверху, потом по `last_message_at DESC`.

```json
{ "rows": [AdminChatListItem, ...], "total": 42, "page": 1, "page_size": 20 }
```

### 4.3 Authorization matrix

| Endpoint | client | admin | partner |
|---|---|---|---|
| GET /orders/:id/chat | owner-only (иначе 404) | ok | 403 |
| GET /chats/:id/messages | owner of chat.order (иначе 404) | ok | 403 |
| POST /chats/:id/messages | owner of chat.order | ok | 403 |
| PATCH /chats/:id/read | owner of chat.order | ok | 403 |
| GET /admin/chats | 403 | ok | 403 |

Использовать паттерн "404 при mismatch ownership" (как в Plan 3) — чтобы не утекало существование чужого чата.

### 4.4 Response shapes (snake_case)

`MessageResponse`:
```json
{
  "id": "uuid",
  "chat_id": "uuid",
  "sender_user_id": "uuid",
  "sender_role": "client" | "admin",
  "text": "string | null",
  "attachments": [],
  "read_at": "ISO | null",
  "created_at": "ISO"
}
```

`ChatResponse`: см. выше.

`AdminChatListItem`:
```json
{
  "chat_id": "uuid",
  "order_id": "uuid",
  "contract_number": "string | null",
  "last_message_at": "ISO | null",
  "unread_count": 7
}
```

## 5. Notification Integration

### 5.1 Новый event

В `notifications.types.ts`:

```typescript
type NotificationEvent =
  | 'order.stage.changed'
  | 'order.progress.changed'
  | 'order.ready'
  | 'chat.reply.received';   // NEW

interface ChatReplyReceivedPayload {
  orderId: string;
  chatId: string;
  contractNumber: string | null;
  preview: string | null;
}
```

`CHANNEL_MATRIX['chat.reply.received'] = { push: true, sms: false, critical: false }`.

### 5.2 Шаблон

В `notifications.templates.ts`:
```
title: "VITTORIA HOME"
body:  "Заказ ${contractNumber ?? 'без номера'}: новый ответ от сервиса. ${preview}"
```

`preview` = первые 80 символов `text` (sanitized: убрать переводы строк), null если text = null.

### 5.3 Dedup

Существующий `NotificationsDedupService` уже generic. Ключ: `notif:dedup:${userId}:chat.reply.received:${chatId}` (entity = chatId). 60 сек — admin burst из 5 сообщений генерирует 1 push.

### 5.4 Quiet hours

`critical=false` → admin-ответ в 23:00 откладывается до 09:00 MSK (через существующий `deferUntilMorning`). Соответствует UX-политике.

### 5.5 Failure isolation

`ChatService.sendMessage` не должен ронять POST при сбое push. Pattern:
```typescript
if (senderRole === 'admin') {
  try {
    await this.notifications.send(clientUserId, 'chat.reply.received', payload);
  } catch (err) {
    this.logger.warn(`chat.reply.received notify failed: ${err.message}`);
  }
}
```

## 6. File Structure

```
apps/api/src/chat/
├── chat.module.ts
├── chat.service.ts
├── chat.controller.ts             # client routes
├── admin-chats.controller.ts      # admin routes
├── chat.mapper.ts                 # → snake_case DTOs
├── dto/
│   ├── send-message.dto.ts
│   ├── mark-read.dto.ts
│   ├── list-messages.query.dto.ts
│   └── list-admin-chats.query.dto.ts
└── __tests__/
    └── chat.service.spec.ts

apps/api/src/notifications/
├── notifications.types.ts         # +chat.reply.received
└── notifications.templates.ts     # +chat template

apps/api/prisma/
├── schema.prisma                  # +Chat, Message, MessageSenderRole, relations
└── migrations/<ts>_add_chat/
    └── migration.sql

apps/api/test/
├── chat.e2e-spec.ts
└── chat-notifications.e2e-spec.ts
```

## 7. Testing

### 7.1 Unit (`chat.service.spec.ts`)

- `findOrCreateForOrder` создаёт чат, повторный вызов возвращает существующий
- `sendMessage(admin)` вызывает `NotificationsService.send` с правильным preview
- `sendMessage(client)` НЕ вызывает notifications
- `sendMessage(admin)` НЕ падает, если `notifications.send` throws
- `markRead` не трогает свои сообщения (where `sender_user_id != me`)
- `listMessages` применяет cursor `before` через перевод в `created_at`

Минимум: 6 тестов.

### 7.2 E2E (`chat.e2e-spec.ts`)

- GET /orders/:id/chat: client owner ok; чужой client → 404; partner → 403; повторный вызов идемпотентен (тот же chat.id)
- POST /chats/:id/messages: client пишет, admin пишет, обе видны в GET
- POST с пустым text → 400
- GET /chats/:id/messages с `before=<message_id>` возвращает только сообщения старше указанного (по `created_at`)
- PATCH /chats/:id/read метит только чужие сообщения, повторный noop
- GET /admin/chats?has_unread=true возвращает только чаты с непрочитанными client-сообщениями
- GET /admin/chats как client → 403

Минимум: 8 тестов.

### 7.3 E2E (`chat-notifications.e2e-spec.ts`)

- admin POST → BullMQ `notifications` queue получает job с `event=chat.reply.received`
- client POST → очередь пуста
- 2 admin POST подряд на один чат → 1 job в очереди (dedup 60s)

Минимум: 3 теста.

## 8. Out of Scope

- WebSocket / Socket.IO / Redis adapter — Plan 5b
- Object Storage / attachments upload — Plan 5b
- SMS-fallback при failure push в чате — Plan 4b (нужны реальные провайдеры)
- AmoCRM-sync сообщений как notes — отдельный плана нет, по требованию
- Typing-индикатор, presence — Plan 5b (требует WS)
- Push admin'у при client-сообщении — отдельная задача (требует push-tokens у админов и UX-решений по batching)
- 152-ФЗ анонимизация (DELETE /me) — отдельный план
- DB-backed editable шаблоны уведомлений — Plan 6 (admin SPA)
- OpenAPI Swagger setup — текущий проект ещё не использует @nestjs/swagger

## 9. Definition of Done

- [ ] Prisma модели Chat/Message + миграция применена локально
- [ ] 5 endpoints работают, валидация через class-validator
- [ ] ChatService покрыт unit-тестами (минимум 6)
- [ ] E2E покрывает все 5 routes (минимум 8 тестов в chat.e2e-spec.ts)
- [ ] E2E покрывает полный путь admin POST → notification queue (минимум 3 в chat-notifications.e2e-spec.ts)
- [ ] `chat.reply.received` шаблон рендерится с preview (≤80 символов)
- [ ] Dedup 60s работает (e2e подтверждает)
- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` зелёный
- [ ] GitHub Actions CI зелёный

## 10. Implementation Notes / Risks

- **Cursor pagination через UUID:** UUIDv4 не сортируется хронологически. Курсор `before=<message_id>` транслируется через lookup `created_at`: +1 SELECT на запрос. Для MVP приемлемо; при росте на Plan 5b/6 можно мигрировать на UUIDv7 или sequential id без изменения API.
- **N+1 в `GET /admin/chats`:** `unread_count` считается через `prisma.chat.findMany({ include: { _count: { select: { messages: { where: { senderRole: 'client', readAt: null } } } } } })` — один SQL с подзапросом per chat. Если на 50+ чатах будет медленно — переписать на raw SQL с одним GROUP BY. Проверить вручную на seed-данных.
- **Concurrency на read_at:** Два одновременных PATCH /read могут гонять. Atomic UPDATE с `WHERE read_at IS NULL` решает (только первый запишет, второй получит `updated: 0`).
