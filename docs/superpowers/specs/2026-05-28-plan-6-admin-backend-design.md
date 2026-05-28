# Plan 6: Admin/Partner Backend Endpoints — Design

**Status:** Approved (2026-05-28)
**Predecessors:** Plans 1–5 (auth, AmoCRM sync, orders, notifications, chat).
**Successor:** Admin/Partner SPA (frontend) — separate plan, consumes these endpoints.

## 1. Goal

Доделать недостающие backend endpoints, на которые опирается будущая admin/partner SPA (spec раздел 10). Четыре части:

- **A. Admin users** — список и создание admin/partner пользователей.
- **B. Audit log viewer** — просмотр `audit_log` с фильтрами.
- **C. Partner commissions** — модель + admin CRUD + partner read.
- **D. DB-backed notification templates** — перевод hardcoded шаблонов (Plan 4) в БД с редактированием через admin endpoints («редактирование текстов без релиза», spec 10.1).

Части A, B, C независимы. Часть D инвазивна — затрагивает notifications subsystem (Plan 4), переводит `renderTemplate` с синхронной hardcoded-функции на async DB lookup.

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](2026-05-26-vittoria-home-mvp-design.md) — разделы 4 (БД), 7.6 (admin endpoints), 7.7 (partner), 9 (notifications), 10 (admin-панель).

## 2. Architecture

Расширяет существующие модули `apps/api/src` или добавляет новые, следуя паттерну Plans 3/5 (Controller + Service + Mapper/DTO, `@Roles` на контроллере, snake_case DTO):

| Часть | Модуль | Новая модель |
|---|---|---|
| A. Admin users | `users/` — новый `AdminUsersController` + методы в `UsersService` (или новый `AdminUsersService`) | нет (User) |
| B. Audit log | `audit/` — новый `AuditController` + метод в `AuditService` | нет (AuditLog) |
| C. Commissions | новый модуль `commissions/` | **PartnerCommission** |
| D. Templates | новая таблица + `TemplatesService` в `notifications/`, правка `NotificationsProcessor` + новый `NotificationTemplatesController` | **NotificationTemplate** |

Всё на существующем JWT + `RolesGuard`. Никаких новых auth-механизмов: admin/partner логинятся тем же SMS-OTP (телефон в БД, роль задана при создании через `POST /admin/users`).

## 3. Data Model

Две новые Prisma-модели.

```prisma
enum PayoutStatus {
  pending
  approved
  paid
}

model PartnerCommission {
  id            String       @id @default(uuid()) @db.Uuid
  orderId       String       @map("order_id") @db.Uuid
  partnerUserId String       @map("partner_user_id") @db.Uuid
  amount        Decimal      @db.Decimal(12, 2)
  payoutStatus  PayoutStatus @default(pending) @map("payout_status")
  paidAt        DateTime?    @map("paid_at")
  createdAt     DateTime     @default(now()) @map("created_at")

  order   Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  partner User  @relation("PartnerCommissions", fields: [partnerUserId], references: [id])

  @@index([partnerUserId])
  @@index([orderId])
  @@map("partner_commissions")
}

model NotificationTemplate {
  event     String   @id          // 'order.stage.changed' и т.д.
  title     String
  body      String                // с {{placeholder}}
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("notification_templates")
}
```

Связи:
- `Order.commissions PartnerCommission[]`
- `User.commissions PartnerCommission[] @relation("PartnerCommissions")` (явное имя — у User уже несколько связей с Order: `ClientOrders`, `PartnerOrders`)

`onDelete: Cascade` order→commission. Partner FK — default (RESTRICT).

**Seed дефолтных шаблонов:** миграция `NotificationTemplate` выполняет raw SQL `INSERT` для всех 4 событий с текущими текстами в `{{placeholder}}`-формате (см. §5). Гарантирует работу уведомлений сразу после миграции.

## 4. Endpoints

Префикс `/api/v1`. snake_case в телах и ответах.

### 4.A Admin users (`@Roles('admin')`)

| Метод | Путь | Тело/Query | Ответ |
|---|---|---|---|
| GET | `/admin/users?role=&page=&page_size=` | role фильтр (admin/partner/client), пагинация | `{ rows: UserResponse[], total, page, page_size }` |
| POST | `/admin/users` | `{ phone, role, first_name?, last_name? }` | `UserResponse` (201) |

POST правила:
- `phone` обязателен, уникален → 409 `USER_PHONE_EXISTS` при дубле.
- `role` ∈ `{admin, partner}` (НЕ `client` — клиенты создаются self-signup через SMS-OTP). Иначе 400.
- `UserResponse` = `{ id, phone, role, first_name, last_name, created_at }`.

### 4.B Audit log (`@Roles('admin')`)

| Метод | Путь | Ответ |
|---|---|---|
| GET | `/admin/audit-log?entity=&actor=&page=&page_size=` | `{ rows: AuditLogResponse[], total, page, page_size }` |

- Фильтры: `entity` (string), `actor` (actorUserId uuid). Сортировка `created_at DESC`.
- `AuditLogResponse` = `{ id, actor_user_id, action, entity, entity_id, before, after, created_at }`.

### 4.C Partner commissions

| Метод | Путь | Роль | Тело | Ответ |
|---|---|---|---|---|
| POST | `/admin/commissions` | admin | `{ order_id, partner_user_id, amount }` | `CommissionResponse` (201) |
| PATCH | `/admin/commissions/:id` | admin | `{ payout_status }` | `CommissionResponse` |
| GET | `/admin/commissions?partner_user_id=&payout_status=&page=&page_size=` | admin | — | paginated |
| GET | `/partner/commissions?payout_status=` | partner | — | только свои |

- POST валидирует: order существует (404 `ORDER_NOT_FOUND` если нет), partner существует и `role=partner` (400 `INVALID_PARTNER` иначе). `amount` > 0.
- PATCH: при `payout_status='paid'` → `paid_at=now()`; на `pending`/`approved` → `paid_at=null`. 404 если commission не найдена.
- `GET /partner/commissions` scoped по `partnerUserId === user.id`.
- `CommissionResponse` = `{ id, order_id, partner_user_id, amount, payout_status, paid_at, created_at }`. `amount` сериализуется как string (Decimal).

### 4.D Notification templates (`@Roles('admin')`)

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/admin/notification-templates` | — | `{ rows: TemplateResponse[] }` (все 4) |
| PATCH | `/admin/notification-templates/:event` | `{ title?, body? }` | `TemplateResponse` |

- `:event` валидируется против known `NotificationEvent` (404 `TEMPLATE_NOT_FOUND` если неизвестно).
- `TemplateResponse` = `{ event, title, body, updated_at }`.

## 5. Templates Refactor (часть D — ядро)

Сейчас [notifications.templates.ts](../../../apps/api/src/notifications/notifications.templates.ts) — синхронная `renderTemplate(event, data)` со switch и хардкод-строками. Перевод на DB-backed с разделением ответственности.

### 5.1 `substitute(text, vars)` — чистая функция

Заменяет `{{key}}` → `vars[key]`. Неизвестные плейсхолдеры → пустая строка (не оставлять `{{...}}` в push). Многократные вхождения поддерживаются. Юнит-тестируется отдельно.

### 5.2 `buildVars(event, payload)` — вычисление computed-значений

Остаётся в коде (не в шаблоне). Готовит `Record<string, string>`:
- `order` — `Заказ ${contractNumber}` или `Ваш заказ` (fallback из Plan 5).
- `stageLabel` — `STAGE_LABELS[stage]` (STAGE_LABELS остаётся в коде — это enum→человекочитаемое, не editable-текст).
- `percent` — строка процента.
- `previewTail` — для chat: ` ${preview}` либо `` (пусто). Так шаблон остаётся плоской подстановкой без условной логики.

### 5.3 `TemplatesService.render(event, vars)` — async

```typescript
@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  async render(event: NotificationEvent, vars: Record<string, string>): Promise<RenderedMessage> {
    const tpl = await this.prisma.notificationTemplate.findUnique({ where: { event } });
    if (!tpl) throw new Error(`notification template not found: ${event}`);
    return { title: substitute(tpl.title, vars), body: substitute(tpl.body, vars) };
  }
}
```

### 5.4 Seed-дефолты (в миграции)

| event | title | body |
|---|---|---|
| order.stage.changed | `VITTORIA HOME` | `{{order}}: новый этап — «{{stageLabel}}».` |
| order.progress.changed | `VITTORIA HOME` | `{{order}}: готовность {{percent}}%.` |
| order.ready | `VITTORIA HOME` | `{{order}} готов к передаче. Сервисный отдел свяжется с вами.` |
| chat.reply.received | `VITTORIA HOME` | `{{order}}: новый ответ от сервиса.{{previewTail}}` |

### 5.5 Изменение вызова

[notifications.processor.ts](../../../apps/api/src/notifications/jobs/notifications.processor.ts) вызывает `renderTemplate(event, data)` синхронно → меняется на `await this.templates.render(event, buildVars(event, data))`. Старая `renderTemplate` удаляется; её тесты заменяются тестами `substitute` + `buildVars` + `TemplatesService.render`. `TemplatesService` добавляется в `NotificationsModule` providers.

## 6. Authorization Matrix

| Endpoint | client | admin | partner |
|---|---|---|---|
| GET/POST /admin/users | 403 | ✅ | 403 |
| GET /admin/audit-log | 403 | ✅ | 403 |
| POST/PATCH/GET /admin/commissions | 403 | ✅ | 403 |
| GET /partner/commissions | 403 | 403 | ✅ (scoped) |
| GET/PATCH /admin/notification-templates | 403 | ✅ | 403 |

## 7. Testing

TDD (Jest unit + Testcontainers e2e).

### 7.1 Unit (≥ 10 новых)
- `substitute()` — подстановка, неизвестные ключи → пусто, многократные вхождения.
- `buildVars()` — корректные vars на каждое из 4 событий (order с/без contractNumber, stageLabel, percent, previewTail с/без preview).
- `TemplatesService.render` — мок Prisma, title/body подставлены, отсутствующий шаблон → throw.
- `CommissionsService` — создание (валидация partner role, amount>0), payout_status→paid выставляет paid_at, partner read scoping.
- `AdminUsersService` — создание (role≠client отклонён, дубль phone→конфликт).

### 7.2 E2E (≥ 12 новых, Testcontainers)
- `admin-users.e2e` — POST admin/partner ok; client-role → 400; дубль phone → 409; GET фильтр role; не-admin → 403.
- `admin-audit.e2e` — GET записи + фильтр по entity; не-admin → 403.
- `commissions.e2e` — admin POST → PATCH(paid) → paid_at выставлен; partner видит только свои; partner не видит чужие; не-partner на /partner/commissions → 403; POST с не-partner user_id → 400.
- `notification-templates.e2e` — GET все 4 (seed); PATCH меняет body; неизвестный event → 404; **регресс: admin PATCH order progress → notification job → worker рендерит из обновлённого шаблона**.

### 7.3 Регресс Plan 4
Существующие notification e2e должны остаться зелёными после перевода рендера на DB (seed гарантирует наличие шаблонов). Это явный критерий — прогнать полный e2e suite.

## 8. Out of Scope

- Frontend admin/partner SPA — следующий план.
- Admin user update/delete/деактивация (только list+create).
- Привязка partner→order через отдельный endpoint (commission.order_id задаётся напрямую в POST).
- WebSocket, Object Storage (Plan 5b).
- Шаблоны для будущих/несуществующих событий (только 4 текущих).
- Версионирование/история правок шаблонов.
- i18n шаблонов (только ru).
- In-memory кэш шаблонов (DB lookup на каждый dispatch — приемлемо для worker).

## 9. Definition of Done

- [ ] 2 новые Prisma-модели (`PartnerCommission`, `NotificationTemplate`) + миграции применены; seed 4 шаблонов выполнен.
- [ ] `GET/POST /admin/users` работают (role-валидация, 409 на дубль phone).
- [ ] `GET /admin/audit-log` с фильтрами entity/actor + пагинация.
- [ ] Commissions: `POST/PATCH/GET /admin/commissions` + `GET /partner/commissions` (scoped). paid→paid_at.
- [ ] `GET/PATCH /admin/notification-templates`.
- [ ] `renderTemplate` заменён на `TemplatesService.render` + `substitute` + `buildVars`; hardcoded строки удалены.
- [ ] Unit ≥ 10 новых, e2e ≥ 12 новых.
- [ ] Существующие notification e2e зелёные (регресс Plan 4).
- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` зелёный.
- [ ] GitHub Actions CI зелёный.

После Plan 6 — **Admin/Partner SPA** (frontend), потребляющая все эти endpoints + готовые orders/chat из Plans 3/5.

---

## 10. Implementation Notes / Risks

- **Decimal сериализация:** `amount` — Prisma `Decimal`. В JSON-ответе отдавать как string (`.toString()`), не как number (потеря точности). Mapper обязан это учитывать.
- **Templates lookup на каждый dispatch:** +1 SELECT в worker per notification. Приемлемо (не hot HTTP path). Если станет узким местом — in-memory cache в отдельном плане.
- **Регресс notifications:** перевод рендера на async DB — самый рискованный момент. `NotificationsProcessor.process` уже async, так что добавление `await` безопасно. Главный риск — забыть seed (тогда `render` бросит и job упадёт в retry). Миграция обязана сидить все 4 события.
- **`buildVars` размещение:** держать рядом с processor (или маленький helper-файл `notifications.vars.ts`), чтобы processor оставался тонким.
