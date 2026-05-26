# VITTORIA HOME — Дизайн MVP

**Дата:** 2026-05-26
**Статус:** Утверждён к реализации
**Источник требований:** `instr.md`
**Фаза:** 1 из 2 (MVP — ядро снижения тревожности клиента)

---

## 1. Цель проекта

VITTORIA HOME — сервисное приложение для клиентов мебельной компании, которое:
- показывает клиенту этап и процент готовности заказа,
- даёт быстрый канал связи с сервисным отделом,
- отображает финансовую информацию по договору,
- предоставляет интерфейсы для сотрудников сервиса и партнёров-дизайнеров.

**Главная задача MVP:** снизить тревожность клиента после подписания договора и сделать сервис компании прозрачным.

**Что НЕ входит в MVP (фаза 2, отдельная спека):**
- Помощь с домом (партнёры-исполнители)
- Чек-лист новосёла
- Система рекомендаций с бонусами
- Раздел будущих дозаказов
- Отзывы и интеграция с внешними площадками

---

## 2. Технологический стек

| Слой | Технология |
|---|---|
| iOS | Swift 5.9+, SwiftUI, Combine, MVVM |
| Android | Kotlin, Jetpack Compose, Coroutines/Flow, MVVM |
| Backend | Node.js 20 LTS, NestJS, TypeScript |
| ORM | Prisma 5 |
| БД | PostgreSQL 16 (Managed Yandex Cloud) |
| Кэш/очереди | Redis 7 + BullMQ |
| Real-time | Socket.IO + Redis adapter |
| Web (admin + partner) | React 18, TypeScript, Vite, shadcn-ui, TanStack Query |
| Object storage | Yandex Object Storage (S3-совместимый) |
| Push | FCM (Android) + APNs (iOS) |
| SMS | SMSC.ru (основной) + SMS.ru (резерв) |
| Hosting | Yandex Cloud Managed Kubernetes |
| Monitoring | Sentry, Prometheus, Grafana, Yandex Cloud Logging |
| CI/CD | GitHub Actions, Fastlane (iOS), Gradle (Android) |

---

## 3. Архитектура верхнего уровня

```
┌─────────────────────┐    ┌────────────────────┐
│   iOS App (Swift)   │    │ Android App        │
│     SwiftUI         │    │ Jetpack Compose    │
└──────────┬──────────┘    └──────────┬─────────┘
           │                          │
           │   HTTPS REST + WSS       │
           └───────────┬──────────────┘
                       ▼
         ┌─────────────────────────────┐
         │   API Gateway (NestJS)      │
         │   • Auth (SMS JWT)          │
         │   • REST modules            │
         │   • WebSocket (chat)        │
         └──────┬───────────────┬──────┘
                │               │
       ┌────────▼─────┐   ┌─────▼────────┐
       │ PostgreSQL   │   │  Redis       │
       │ (БД-зеркало) │   │  (кэш, очередь│
       └──────┬───────┘   │   pub/sub)    │
              │           └───────┬──────┘
              │                   │
       ┌──────▼───────────────────▼──────┐
       │  AmoCRM Sync Worker              │
       │  • Webhook listener              │
       │  • Periodic pull (failsafe)      │
       │  • Push changes back             │
       └──────────────┬───────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  AmoCRM API   │  ← источник истины
              └───────────────┘

       ┌─────────────────────────────────┐
       │  Web Admin/Partner Panel (React)│
       │  • role: admin / partner        │
       └─────────────────────────────────┘
```

**Принципы:**
- Один backend (NestJS-монолит, модули по доменам) — без микросервисов в MVP.
- AmoCRM — источник истины по сделкам/контактам/этапам; собственная БД — для чата, push-токенов, истории, кэша.
- WebSocket для чата, REST для остального.
- Фоновые задачи — BullMQ на Redis.

**Модули NestJS:**
`auth`, `users`, `orders`, `chat`, `notifications`, `amocrm-sync`, `partners`, `admin`, `audit`, `health`.

---

## 4. Доменная модель (PostgreSQL)

```sql
-- Пользователи (клиенты, админы, партнёры)
users
  id uuid PK
  phone varchar UNIQUE
  role enum('client','admin','partner')
  first_name varchar
  last_name varchar
  amocrm_contact_id int NULL UNIQUE
  consent_accepted_at timestamp NULL
  last_login_at timestamp NULL
  created_at, updated_at

clients_profiles
  user_id uuid PK/FK
  city varchar NULL
  address text NULL
  referral_code varchar UNIQUE

partners_profiles
  user_id uuid PK/FK
  company_name varchar
  payment_details jsonb
  default_commission_rate decimal(5,2)

-- Заказы (зеркало сделок AmoCRM)
orders
  id uuid PK
  amocrm_deal_id int UNIQUE     -- ключ синхронизации
  contract_number varchar
  client_user_id uuid FK→users
  partner_user_id uuid FK→users NULL
  product_name varchar
  total_amount decimal(12,2)
  prepayment_amount decimal(12,2)
  balance_due decimal(12,2)
  current_stage enum(7 стадий)
  progress_percent int CHECK (0..100)
  service_phone varchar
  partner_services jsonb        -- прогноз доставки/подъёма/сборки
  last_admin_comment text NULL
  amocrm_synced_at timestamp
  version int DEFAULT 0
  created_at, updated_at

order_stage_history
  id uuid PK
  order_id uuid FK
  stage enum
  progress_percent int
  comment text NULL
  changed_by_user_id uuid FK→users
  changed_at timestamp

-- Чат
chats
  id uuid PK
  order_id uuid FK UNIQUE       -- 1:1 с заказом
  created_at

messages
  id uuid PK
  chat_id uuid FK
  sender_user_id uuid FK→users
  sender_role enum('client','admin')
  text text NULL
  attachments jsonb             -- [{object_key, mime, size}]
  read_at timestamp NULL
  redacted_at timestamp NULL    -- 152-ФЗ: при анонимизации
  created_at

-- Уведомления
push_tokens
  id uuid PK
  user_id uuid FK
  platform enum('ios','android')
  token varchar
  device_id varchar
  updated_at
  UNIQUE(user_id, device_id)

-- Партнёрская часть
partner_commissions
  id uuid PK
  order_id uuid FK
  partner_user_id uuid FK
  amount decimal(12,2)
  payout_status enum('pending','approved','paid')
  paid_at timestamp NULL
  created_at

-- Auth
auth_codes
  id uuid PK
  phone varchar
  code_hash varchar             -- bcrypt
  attempts int DEFAULT 0
  expires_at timestamp
  created_at
  INDEX (phone, created_at DESC)

sessions
  id uuid PK
  user_id uuid FK
  refresh_token_hash varchar
  device_info jsonb
  revoked_at timestamp NULL
  expires_at timestamp
  created_at

-- Compliance
audit_log
  id uuid PK
  actor_user_id uuid FK NULL
  action varchar                -- 'order.stage.changed', ...
  entity varchar
  entity_id varchar
  before jsonb
  after jsonb
  request_id varchar
  created_at

-- Idempotency (Redis SET с TTL 24ч)
amocrm_event_ids:{event_id}
```

**Стадии заказа (enum `order_stage`):**
1. `preparation_for_production` — Подготовка для производства
2. `detailing` — Деталировка
3. `materials_arrival` — Поступление материалов на склад
4. `production` — Производство изделия
5. `transfer_to_warehouse` — Передача готового изделия на склад
6. `completeness_check` — Проверка комплектности товара
7. `ready_for_delivery` — Готовность к передаче клиенту

---

## 5. Интеграция с AmoCRM

### 5.1 Кастомные поля AmoCRM (фиксируется в `amocrm-fields.md`)

**Поля сделки:**
- `vittoria_stage` (select, 7 значений)
- `vittoria_progress` (число 0–100)
- `vittoria_admin_comment` (текст)
- `vittoria_prepayment` (число)
- `vittoria_partner_user_id` (число — внутренний ID партнёра в нашей БД)
- `vittoria_partner_services` (текст, JSON)

**Поля контакта:** `phone`, `name` (стандартные).

### 5.2 Входящий поток (AmoCRM → наш backend)

```
1. AmoCRM шлёт webhook (deals:add | deals:update | contacts:update) на
   POST /api/v1/amocrm/webhooks
2. Backend валидирует HMAC-подпись + IP whitelist
3. Идемпотентность: проверка event_id в Redis (SET с TTL 24ч)
4. Событие кладётся в очередь BullMQ 'amocrm-inbound'
5. Worker:
   - GET /api/v4/leads/{id}
   - GET /api/v4/contacts/{id}
   - upsert users по phone
   - upsert orders по amocrm_deal_id
   - читает кастомные поля
   - пишет audit_log
   - если order создан впервые — триггерит SMS со ссылкой на стор
```

### 5.3 Исходящий поток (наш backend → AmoCRM)

```
1. Сотрудник в admin-панели: PATCH /api/v1/admin/orders/:id/progress
2. Backend:
   - UPDATE orders, INSERT order_stage_history, INSERT audit_log
   - INC orders.version
   - enqueue 'amocrm-outbound' { order_id, version }
   - enqueue 'notify-client' { order_id, event_type }
3. Worker amocrm-outbound: PATCH custom fields сделки в AmoCRM
4. Worker notify-client: push + SMS-fallback
```

### 5.4 Failsafe pull

- Cron каждые 15 минут (BullMQ repeat): GET `/api/v4/leads?filter[updated_at][from]=<last_sync>`.
- Догоняет потерянные webhook'и.
- Метрика `amocrm_sync_lag_seconds` в Grafana, алерт при > 600 сек.

### 5.5 Разрешение конфликтов

При исходящей sync, если в момент PATCH AmoCRM прислал webhook новее (`updated_at` AmoCRM > наш `amocrm_synced_at`):
- наши изменения побеждают (мы — инициатор);
- worker перезаписывает поля AmoCRM значениями из нашей БД;
- инцидент логируется в `audit_log` с пометкой `conflict_resolved`.

---

## 6. Авторизация и безопасность

### 6.1 Клиент (SMS OTP)

```
POST /api/v1/auth/request-code  { phone }
  • phone должен существовать в users (создаётся через AmoCRM webhook)
  • rate-limit: 1 запрос/мин на номер, 5/час на IP
  • code = 4 цифры, TTL 5 мин, bcrypt в auth_codes
  → 200 { retry_after_sec: 60 }

POST /api/v1/auth/verify-code  { phone, code, device_info }
  • max 5 попыток на код
  • после успеха код инвалидируется
  → 200 { access_token (15m), refresh_token (30d), user }

POST /api/v1/auth/refresh  { refresh_token }
  • ротация refresh при каждом вызове
  → 200 { access_token, refresh_token }
```

### 6.2 Admin / Partner

- Email + пароль (Argon2id) + опционально TOTP 2FA.
- Создаются вручную суперадмином, нет открытой регистрации.
- Те же refresh/access токены, разные `role` в claims.

### 6.3 JWT

- HS256, claims: `sub`, `role`, `exp`, `jti`.
- Access — в `Authorization: Bearer …`.
- Refresh — httpOnly cookie (web), Keychain (iOS), EncryptedSharedPreferences (Android).

### 6.4 RBAC

- NestJS guards: `@Roles('admin')`, `@Roles('partner')`, `@Roles('client')`.
- `OwnershipGuard` проверяет, что клиент видит только свои `orders`, партнёр — только свои (`partner_user_id = me`).

### 6.5 152-ФЗ и ПДн

- Вся инфраструктура в Yandex Cloud (РФ).
- Шифрование at rest (диски Y.Cloud), in transit (TLS 1.3, HSTS).
- При первом входе клиента — экран согласия → `users.consent_accepted_at`.
- `DELETE /api/v1/me` → анонимизация: `phone = NULL`, имя = "Удалённый пользователь", `messages.text = NULL` + `messages.redacted_at = now()`, фото клиента в чате удаляются из Object Storage по ключу.
- Логи без PII: пишем `user_id`, не `phone`/имя.

### 6.6 Защита от атак

- Rate limiting (express-rate-limit + Redis) на auth и upload endpoint.
- CORS whitelist (только домен admin-панели).
- CSRF (csurf) для web.
- Webhook AmoCRM: HMAC + IP whitelist.
- Upload файлов: проверка mime по magic bytes, max 10 MB, антивирус ClamAV в фоне.
- SQL: только параметризованные запросы (TypeORM/Prisma).
- Секреты: Yandex Lockbox, никогда в git.

### 6.7 Хранение файлов из чата

- Yandex Object Storage, bucket private.
- Доступ через presigned URL (TTL 10 мин).
- В БД — только `object_key`, не публичный URL.

---

## 7. REST API (префикс `/api/v1`)

### 7.1 Auth (public)
```
POST   /auth/request-code
POST   /auth/verify-code
POST   /auth/refresh
POST   /auth/logout
```

### 7.2 Profile (client)
```
GET    /me
PATCH  /me
DELETE /me                       (анонимизация 152-ФЗ)
POST   /me/consent
POST   /me/push-tokens
DELETE /me/push-tokens/:id
```

### 7.3 Orders (client)
```
GET    /orders
GET    /orders/:id
GET    /orders/:id/history
GET    /orders/:id/partner-services
```

### 7.4 Chat (client)
```
GET    /orders/:id/chat
GET    /chats/:id/messages?before=<message_id>&limit=50
POST   /chats/:id/messages       { text?, attachment_ids? }
POST   /chats/:id/attachments    (multipart) → { attachment_id, object_key }
PATCH  /chats/:id/read           { up_to_message_id }
```

### 7.5 Service
```
GET    /service/contact
```

### 7.6 Admin (role: admin)
```
GET    /admin/orders?status=&search=&page=
GET    /admin/orders/:id
PATCH  /admin/orders/:id/progress    { stage, percent, comment? }
GET    /admin/chats?has_unread=true
POST   /admin/chats/:id/messages
GET    /admin/users
POST   /admin/users                   (создание admin/partner)
GET    /admin/audit-log?entity=&actor=
```

### 7.7 Partner (role: partner)
```
GET    /partner/orders
GET    /partner/orders/:id
GET    /partner/commissions
```

### 7.8 AmoCRM webhooks (internal)
```
POST   /amocrm/webhooks
```

### 7.9 Health
```
GET    /healthz
GET    /readyz
```

### 7.10 Формат ошибок
```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Заказ не найден",
    "details": {}
  },
  "request_id": "uuid"
}
```

### 7.11 Версионирование
URL prefix `/v1`. Breaking changes — только в `/v2`. В MVP — только v1.

### 7.12 OpenAPI
Автогенерация через NestJS Swagger, `/api/docs` за basic-auth в проде.

---

## 8. WebSocket (чат)

```
URL: wss://api.vittoria.app/ws
Handshake: ?access_token=…  (валидируется при connect)

Сервер → клиент:
  • message.new       { chat_id, message }
  • message.read      { chat_id, message_ids, by_user_id }
  • order.updated     { order_id, fields_changed: [...] }
  • typing            { chat_id, user_id, is_typing }

Клиент → сервер:
  • subscribe         { chat_ids: [...] }
  • typing            { chat_id, is_typing }
  • ping              каждые 30 сек

Реализация: Socket.IO + Redis adapter (для горизонтального масштабирования).
Fallback: long-polling REST /chats/:id/messages?since=<message_id>.
```

---

## 9. Уведомления

| Событие | Push | SMS | In-app |
|---|---|---|---|
| Создание заказа (первичное приглашение) | — | ✓ со ссылкой на стор | — |
| Смена этапа | ✓ | ✓ при failure push в 5 мин | ✓ |
| Изменение % > 10 пунктов | ✓ | — | ✓ |
| Новый ответ сервиса в чате | ✓ | ✓ при failure | ✓ |
| Готовность к передаче | ✓ | ✓ всегда | ✓ |

**Реализация:**
- `NotificationService.send(userId, eventType, payload)` — единая точка входа.
- Очередь BullMQ `notifications`, retry 3 раза с exponential backoff.
- Push: FCM (Android), APNs (iOS) через единую обёртку `PushProvider`.
- SMS: интерфейс `SmsProvider` с реализациями SMSC.ru и SMS.ru, переключение конфигом.
- Шаблоны сообщений хранятся в БД, редактируются в admin-панели.
- Тихие часы: 22:00–09:00 — push откладываются, SMS только для критичных.
- Дедупликация: повторный push о смене % в течение 60 сек подавляется (Redis SET).

---

## 10. Admin-панель и партнёрский кабинет

### 10.1 Admin (role: admin)

Экраны:
1. **Дашборд** — список активных заказов, фильтр по этапу, поиск, индикатор непрочитанных чатов.
2. **Карточка заказа** — read-only данные сделки + редактируемые: этап, %, комментарий. Кнопка "Сохранить" → sync AmoCRM + уведомления.
3. **Чаты (Inbox)** — список непрочитанных сверху, время ожидания, превью; справа открытый диалог.
4. **Партнёры** — список, создание, привязка к сделкам, ставка комиссии.
5. **Аудит** — `audit_log` с фильтрами.
6. **Шаблоны уведомлений** — редактирование текстов без релиза.

UX-приоритет: Inbox-паттерн (как Intercom) — главная функция MVP это закрывать вопросы клиентов.

### 10.2 Partner (role: partner)

Экраны (тот же SPA, layout для роли):
1. **Мои клиенты** — заказы, где `partner_user_id = me`. Read-only.
2. **Карточка заказа** — данные сделки + статус, без редактирования.
3. **Мои вознаграждения** — `partner_commissions` с фильтром по статусу.
4. **Профиль** — реквизиты для выплат.

Партнёр НЕ видит чужих клиентов, НЕ пишет в клиентские чаты, НЕ меняет статусы.

### 10.3 Прогноз партнёрских услуг

Формат `orders.partner_services` (jsonb):
```json
[
  { "type": "delivery", "label": "Доставка", "date": "2026-06-15", "price": 5000 },
  { "type": "lifting",  "label": "Подъём",   "date": "2026-06-15", "price": 3000 },
  { "type": "assembly", "label": "Сборка",   "date": "2026-06-16", "price": 8000 }
]
```
Заполняется админом в карточке заказа или подтягивается из AmoCRM custom field `vittoria_partner_services`. Клиент видит read-only на главном экране.

---

## 11. Мобильные приложения

### 11.1 Экраны клиента (iOS + Android)

1. **Onboarding / Auth**
   - Ввод телефона → запрос кода
   - Ввод кода (4 цифры, авто-detect SMS на iOS/Android)
   - Согласие на ПДн (один раз)
2. **Главный экран**
   - Карточка заказа: номер договора, изделие
   - Финансы: стоимость, предоплата, остаток
   - Статус: текущий этап + прогресс-бар (%)
   - Комментарий админа (если есть)
   - Прогноз партнёрских услуг
   - Кнопка "Чат с сервисом"
   - Телефон сервиса (tap → набор номера)
3. **История этапов**
   - Таймлайн всех 7 этапов с датами перехода и комментариями
4. **Чат**
   - Список сообщений (пагинация cursor)
   - Отправка текста + до 5 фото
   - Индикатор "В среднем отвечаем в течение 2 часов"
   - Typing-индикатор
5. **Профиль**
   - Имя, телефон, город
   - Управление push-уведомлениями
   - Выход
   - Удаление аккаунта

### 11.2 Архитектура клиентских приложений

- **iOS:** SwiftUI + Combine, MVVM, координатор-навигация, URLSession + Alamofire опционально.
- **Android:** Jetpack Compose + Coroutines/Flow, MVVM, Hilt (DI), Retrofit + OkHttp.
- **Общий API-контракт:** генерация моделей из OpenAPI через `openapi-generator` (Swift + Kotlin).
- **Локальный кэш:** последний полученный `orders.list` и метаданные чата для offline-первого запуска (SwiftData / Room).
- **WebSocket клиент:** Starscream (iOS), OkHttp-WS (Android).

---

## 12. Инфраструктура

### 12.1 Окружения
- `dev` — Docker Compose (postgres, redis, minio, mailhog).
- `staging` — Yandex Cloud, отдельный кластер, тестовая AmoCRM-копия.
- `production` — Yandex Cloud, продовая AmoCRM.

### 12.2 Yandex Cloud
- **Compute:** Managed Kubernetes (1 master, 2–3 worker).
- **БД:** Managed PostgreSQL 16 (HA, 2 ноды, daily backup, retention 30 дней).
- **Redis:** Managed Redis.
- **Storage:** Object Storage (фото чата, бэкапы).
- **Secrets:** Lockbox.
- **DNS:** `api.vittoria.app`, `admin.vittoria.app`.
- **TLS:** Let's Encrypt через cert-manager.

### 12.3 Helm-чарты
- `vittoria-api` (NestJS API + WebSocket)
- `vittoria-worker` (BullMQ sync + notifications)
- `vittoria-admin` (статика React за nginx)

### 12.4 CI/CD (GitHub Actions)
```
pull_request:
  lint → unit tests → integration tests → docker build

push main:
  + image push → deploy staging

tag v*:
  + Fastlane (iOS TestFlight) → Gradle (Google Play Internal)
  + deploy production (manual approval)
```

### 12.5 Мобильная сборка
- iOS: Fastlane + match, CI на macOS-runner.
- Android: Gradle + signing key из CI secrets, CI на Linux.

---

## 13. Тестирование

| Слой | Что | Инструменты | Покрытие |
|---|---|---|---|
| Backend unit | сервисы, мапперы | Jest | ≥ 70% |
| Backend integration | контроллеры + БД | Jest + Testcontainers | критичные сценарии |
| AmoCRM sync | webhook ↔ БД ↔ AmoCRM | Jest + nock | 100% сценариев |
| Mobile unit | view models | XCTest, JUnit | ≥ 60% |
| Mobile UI snapshot | главные экраны | iOSSnapshotTestCase, Paparazzi | главные экраны |
| E2E smoke | критичные пути | Ручной по чек-листу + Detox | перед релизом |

**Критичные сценарии E2E:**
1. SMS-вход → главный экран показывает заказ.
2. Admin меняет этап → клиент получает push.
3. Клиент пишет в чат → admin видит → отвечает → клиент получает push.
4. Webhook AmoCRM создаёт нового клиента → SMS со ссылкой приходит.
5. Удаление аккаунта → данные анонимизированы, токены отозваны.

---

## 14. Мониторинг

- **Sentry:** backend + iOS + Android + admin.
- **Метрики (Prometheus + Grafana):** RPS, latency p50/p95/p99, error rate, BullMQ queue depth, AmoCRM sync lag, активные WebSocket-соединения.
- **Логи:** Yandex Cloud Logging, structured JSON, без PII.
- **Алёрты (Telegram-канал команды):**
  - 5xx > 1% за 5 мин
  - AmoCRM sync lag > 10 мин
  - Webhook fail rate > 5%
  - БД connection pool > 80%
  - Длина очереди BullMQ > 1000

---

## 15. План выкатки MVP (3–4 месяца)

- **Месяц 1:** backend ядро (auth, users, orders, AmoCRM sync), минимальная admin-панель.
- **Месяц 2:** мобильные приложения (auth, главный экран, статус, профиль), партнёрский кабинет.
- **Месяц 3:** чат (REST + WS), уведомления (push + SMS), прогноз услуг, интеграционное тестирование.
- **Месяц 4:** closed beta (10–20 клиентов), исправления, релиз в App Store и Google Play.

---

## 16. Принятые архитектурные решения

| # | Решение | Альтернативы | Обоснование |
|---|---|---|---|
| 1 | Нативные iOS + Android | RN/Flutter, PWA | Долгосрочный UX, отсутствие compromis на push |
| 2 | NestJS-монолит | Микросервисы | YAGNI для MVP, модули в монолите достаточны |
| 3 | AmoCRM — источник истины | Своя БД primary, двусторонняя | Сотрудники продолжают работать в CRM |
| 4 | Единая web-панель admin+partner | Два SPA | Минимум кода и инфраструктуры |
| 5 | Yandex Cloud | AWS, on-premise | 152-ФЗ, близость к SMS/push провайдерам |
| 6 | Socket.IO + Redis adapter | Centrifugo, чистый WS | Готовый клиент для Node + горизонтальное масштабирование |
| 7 | SMSC.ru + SMS.ru (резерв) | Один провайдер | Устойчивость доставки кода |
| 8 | Скоуп MVP только "ядро" | Все 11 модулей | Быстрее запуск, меньше рисков, фаза 2 отдельной спекой |

---

## 17. Открытые вопросы для фазы 2

Не входят в реализацию MVP, но фиксируем для следующей итерации:
- Партнёрская сеть исполнителей ("Помощь с домом"): модель данных, биллинг.
- Чек-лист новосёла: какие пункты, кто настраивает, генерируются ли по типу заказа.
- Бонусная программа: начисление, списание, обналичивание.
- Раздел дозаказов: как преобразуется в lead в AmoCRM.
- Интеграция с площадками отзывов (Яндекс, Google, 2GIS).

---

**Конец спецификации.**
