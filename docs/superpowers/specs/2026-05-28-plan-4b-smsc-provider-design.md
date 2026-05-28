# Plan 4b: Real SMS Provider (SMSC.ru) — Design

**Status:** Approved (2026-05-28)
**Predecessor:** Plan 4 (Notifications) — deferred real SMS/push providers here.
**Successor:** Plan 4c (real push: FCM Android + APNs iOS).

## 1. Goal

Заменить mock `DevSmsProvider` на реальный HTTP-клиент к SMSC.ru. Уведомления, у которых в `CHANNEL_MATRIX` указан `sms: true` (сейчас — `order.ready`), будут отправляться настоящими SMS через SMSC.ru API. FCM/APNs (push) остаются на Plan 4c.

Реальных credentials пока нет — код пишется готовым к подключению (ключи подставляются из env / Yandex Lockbox в проде), тестируется через мок `axios`.

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](2026-05-26-vittoria-home-mvp-design.md) — раздел 9 (notifications, SMSC.ru как SMS-провайдер).

## 2. Architecture

Существующая абстракция `SmsProvider` (`apps/api/src/sms/sms.types.ts`) уже готова к расширению:
```typescript
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
export interface SmsMessage { to: string; text: string; }
export interface SmsSendResult { providerMessageId: string; }
export interface SmsProvider { send(message: SmsMessage): Promise<SmsSendResult>; }
```

**Решение:** один провайдер — `SmscSmsProvider`. `DevSmsProvider` и mode-switch НЕ используются (удаляются). `SmsModule` переключается с `useClass: DevSmsProvider` на `useClass: SmscSmsProvider`. Потребитель (`NotificationsProcessor`) зависит только от интерфейса `SmsProvider` — не меняется.

```
NotificationsProcessor → SMS_PROVIDER (token) → SmscSmsProvider → axios.post → SMSC.ru
```

## 3. Configuration (env)

Расширяем `apps/api/src/config/env.schema.ts`:

```typescript
SMSC_LOGIN: z.string().default(''),
SMSC_PASSWORD: z.string().default(''),
SMSC_SENDER: z.string().default(''),       // имя отправителя, опц.
SMSC_BASE_URL: z.string().url().default('https://smsc.ru'),
```

Плюс схемный `.refine()`: при `NODE_ENV === 'production'` поля `SMSC_LOGIN` и `SMSC_PASSWORD` обязаны быть непустыми (иначе приложение падает на старте с понятной ошибкой). В `development`/`test` они не требуются (тесты мокают `axios`; локально SMS-канал просто не используется).

`SMSC_SENDER` опционален всегда — если пусто, параметр `sender` не передаётся, SMSC использует имя по умолчанию. `SMSC_BASE_URL` вынесён для тестируемости и переопределения.

**Нет** `SMS_PROVIDER_MODE` — провайдер единственный.

## 4. SmscSmsProvider

Новый файл `apps/api/src/sms/smsc-sms.provider.ts`, реализующий `SmsProvider`.

**Запрос:** `POST {SMSC_BASE_URL}/sys/send.php`, `Content-Type: application/x-www-form-urlencoded`, поля:

| param | value |
|---|---|
| `login` | `SMSC_LOGIN` |
| `psw` | `SMSC_PASSWORD` |
| `phones` | `message.to` |
| `mes` | `message.text` |
| `fmt` | `3` (ответ в JSON) |
| `charset` | `utf-8` |
| `sender` | `SMSC_SENDER` — только если непустой |

Транспорт — `axios.post(url, body, { timeout: 10_000, headers })`, где `body` — `URLSearchParams` (form-urlencoded). `ConfigService<Env>` инжектится для чтения login/psw/sender/baseUrl.

**Ответ SMSC (`fmt=3` = JSON):**
- Успех: `{ "id": 12345, "cnt": 1 }` → `return { providerMessageId: String(id) }`.
- Ошибка: `{ "error": "...", "error_code": N }` → `throw new Error(\`SMSC error ${error_code}: ${error}\`)`.

`providerMessageId` нормализуется в string (SMSC отдаёт числовой `id`).

## 5. Error Handling

`SmscSmsProvider.send` бросает `Error` в двух случаях:
1. SMSC вернул `{error, error_code}` → `Error("SMSC error N: <text>")` (логируется `error_code`).
2. Транспортная ошибка (axios timeout / non-2xx / сеть) → пробрасывается.

Никакого внутреннего retry в провайдере. `NotificationsProcessor` уже оборачивает `sms.send` в try/catch (логирует warning, не роняет push-часть), а job в очереди `notifications` имеет BullMQ-ретраи (3 попытки, exponential backoff). Провайдер честно сообщает об ошибке — инфраструктура решает.

Маппинг отдельных `error_code` (логин=2, нет денег=5, плохой номер=7 → не retryable) — out of scope: для MVP любой `error_code` трактуется одинаково (throw → retry → fail с логом).

## 6. Module + Provider Registration

`apps/api/src/sms/sms.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SmscSmsProvider } from './smsc-sms.provider';
import { SMS_PROVIDER } from './sms.types';

@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      useClass: SmscSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
```

**Удаляются:**
- `apps/api/src/sms/dev-sms.provider.ts`
- `apps/api/src/sms/__tests__/dev-sms.provider.spec.ts`

`ConfigService` глобальный (уже так в проекте) — `SmscSmsProvider` получает его инъекцией без доп. импортов в `SmsModule`.

## 7. Testing

**Unit (`apps/api/src/sms/__tests__/smsc-sms.provider.spec.ts`)** — через `jest.mock('axios')` (в проекте нет `nock`; AmoCRM http-клиент использует `axios` напрямую — следуем тому же стилю, мокая `axios.post`):

- **успех:** `axios.post` → `{ data: { id: 12345, cnt: 1 } }`; `send` возвращает `{ providerMessageId: '12345' }`.
- **тело запроса:** `axios.post` вызван с URL `{baseUrl}/sys/send.php` и form-телом, содержащим `login`, `psw`, `phones`, `mes`, `fmt=3`, `charset=utf-8`; `sender` присутствует только когда `SMSC_SENDER` задан (два под-кейса: с sender и без).
- **ошибка SMSC:** `axios.post` → `{ data: { error: 'denied', error_code: 2 } }`; `send` бросает `Error`, текст содержит `2`.
- **транспортная ошибка:** `axios.post` reject → `send` пробрасывает.

Провайдер строится с мок-`ConfigService` (фейковые login/psw/sender/baseUrl), как в существующих unit-тестах (`{ get: (k) => map[k] }`).

Минимум: 5 unit-тестов.

**Регресс:** полный `pnpm test` остаётся зелёным. Существующие notification e2e (Plan 4/5) проверяют **enqueue** job, не worker-execution (оно flaky и не тестируется) → не ломаются удалением `DevSmsProvider`. Если worker асинхронно подхватит `order.ready` job, `SmscSmsProvider.send` сделает HTTP-вызов с тестовыми/пустыми credentials → ошибка поймана `NotificationsProcessor` try/catch (warning-лог, job retry) → тест на enqueue не падает. Удаляемый `dev-sms.provider.spec.ts` уходит вместе с провайдером.

## 8. Out of Scope

- FCM (Android) / APNs (iOS) реальные push — Plan 4c (HTTP/2, OAuth2, ES256 JWT).
- SMS-fallback при неудаче push в течение 5 мин — отдельно (требует push provider error semantics).
- Маппинг отдельных SMSC `error_code` на retryable/fatal — единый throw для MVP.
- Статусы доставки (SMSC `status.php`), баланс, отчёты о доставке.
- Множественные номера в одном запросе, шаблоны SMSC, отложенная отправка.
- Локальный dev без credentials (по решению — SMS просто не работает локально, не мокается).
- MD5-хэш пароля (используется plain `psw` через POST-тело, не в URL).

## 9. Definition of Done

- [ ] `SmscSmsProvider implements SmsProvider`: POST form-urlencoded к `{SMSC_BASE_URL}/sys/send.php`, `fmt=3` JSON, возвращает `{providerMessageId}` или бросает на error/transport-fail.
- [ ] `SmsModule` использует `SmscSmsProvider` (`DevSmsProvider` + спек удалены).
- [ ] env: `SMSC_LOGIN/PASSWORD/SENDER/BASE_URL` + refine на `NODE_ENV=production`.
- [ ] Unit-тесты через `jest.mock('axios')` (≥5): успех, тело запроса (с/без sender), SMSC-ошибка, транспортная ошибка.
- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` зелёный (регресс Plan 4/5 не сломан).
- [ ] GitHub Actions CI зелёный.

После Plan 4b → **Plan 4c** (real push: FCM + APNs).

## 10. Implementation Notes / Risks

- **Нет `nock`:** unit-тесты мокают `axios` через `jest.mock('axios')`. Чтобы это работало чисто, `SmscSmsProvider` вызывает `axios.post(...)` напрямую (не через `axios.create()` instance) — один endpoint, instance не нужен. Это упрощает мок (`(axios.post as jest.Mock).mockResolvedValue(...)`).
- **e2e и реальные сетевые вызовы:** в CI worker может подхватить `order.ready` job и дёрнуть SMSC с пустыми credentials. Вызов завершится ошибкой, пойманной в processor try/catch — тест не падает, но в логах будет warning. Если это окажется шумным/флейки в CI, в test-окружении можно выставить `SMSC_BASE_URL` на неразрешимый хост — но это добавляется только при реальной проблеме (YAGNI).
- **Безопасность:** `psw` идёт в POST-теле (form-urlencoded), не в URL — не попадает в access-логи. `SmscSmsProvider` НЕ логирует `psw`. При логировании ошибок логируется только `error_code`/текст, не credentials.
- **Кодировка:** `charset=utf-8` обязателен — тексты уведомлений на русском.
