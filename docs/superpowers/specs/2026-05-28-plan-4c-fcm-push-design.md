# Plan 4c: Real FCM Push Provider (Android) — Design

**Status:** Approved (2026-05-28)
**Predecessors:** Plan 4 (Notifications), Plan 4b (SMSC SMS provider — established the mode-switch pattern).
**Successor:** Plan 4d (real APNs iOS push — HTTP/2, ES256).

## 1. Goal

Заменить mock-поведение для Android-push на реальную отправку через FCM HTTP v1 API. Уведомления с `push: true` в `CHANNEL_MATRIX`, адресованные токенам с `platform: 'android'`, будут уходить настоящими push через FCM. iOS (APNs) — Plan 4d.

Реальных credentials (Firebase service account) пока нет — код пишется готовым к подключению (ключи из env/Lockbox в проде), тестируется через мок `axios` + сгенерированную в тесте RSA-пару. Default-режим `dev` сохраняет текущее поведение (`DevPushProvider`, лог).

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](2026-05-26-vittoria-home-mvp-design.md) — раздел 9 (notifications, FCM как push-провайдер для Android).

## 2. Architecture

Существующая абстракция `PushProvider` (`apps/api/src/notifications/push/push.types.ts`):
```typescript
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export interface PushMessage { token: string; platform: 'ios' | 'android'; title: string; body: string; data?: Record<string, string>; }
export interface PushSendResult { providerMessageId: string; }
export interface PushProvider { send(message: PushMessage): Promise<PushSendResult>; }
```

Расширяется mode-switch'ем (идентично `SMS_PROVIDER_MODE` из Plan 4b):
- `PushModule` → factory: `PUSH_PROVIDER_MODE=dev` (default) → `DevPushProvider`; `real` → `FcmPushProvider`.
- `FcmPushProvider implements PushProvider`, обрабатывает только `platform: 'android'`. Для `'ios'` → `throw new Error('iOS push not configured (Plan 4d)')`, которую `NotificationsProcessor` ловит в существующем per-token try/catch (warning, соседние токены/SMS не страдают).
- `FcmPushProvider` зависит от `FcmTokenService` (OAuth2-токен с in-memory кэшем) и шлёт `messages:send` через axios.

`NotificationsProcessor` НЕ меняется — зависит только от интерфейса `PushProvider`. Composite-роутер по платформам не вводится сейчас (YAGNI) — добавится в Plan 4d, когда появится второй backend (APNs).

```
NotificationsProcessor → PUSH_PROVIDER (token)
   ├─ dev  → DevPushProvider (log)
   └─ real → FcmPushProvider → FcmTokenService (OAuth2, cached) + axios → FCM v1
                              └─ platform=ios → throw (Plan 4d)
```

## 3. Configuration (env)

Расширяем `apps/api/src/config/env.schema.ts`:

```typescript
PUSH_PROVIDER_MODE: z.enum(['dev', 'real']).default('dev'),
FCM_PROJECT_ID: z.string().default(''),
FCM_CLIENT_EMAIL: z.string().default(''),
FCM_PRIVATE_KEY: z.string().default(''),
```

Refine (mode-based, как SMSC в 4b): при `PUSH_PROVIDER_MODE === 'real'` все три `FCM_*` обязаны быть непустыми, иначе приложение падает на старте с понятной ошибкой. В `dev` — не требуются.

`FCM_PRIVATE_KEY` хранит PEM с literal `\n`; при чтении разыменовывается `privateKey.replace(/\\n/g, '\n')` — стандарт для k8s/Lockbox secrets.

## 4. FcmTokenService (OAuth2 token + cache)

Новый `apps/api/src/notifications/push/fcm-token.service.ts`. In-memory кэш access_token до истечения.

**`getAccessToken(): Promise<string>`:**
1. Если в кэше валидный токен (с буфером 60с до expiry) — вернуть.
2. Иначе собрать и подписать JWT (RS256, `node:crypto`):
   - header `{ alg: 'RS256', typ: 'JWT' }`
   - claims `{ iss: FCM_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }`
   - подпись `crypto.createSign('RSA-SHA256').update(\`${b64url(header)}.${b64url(claims)}\`).sign(privateKey)` → base64url; JWT = `${signingInput}.${b64url(signature)}`
3. `POST https://oauth2.googleapis.com/token` (form-urlencoded): `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, `assertion=<jwt>` → `{ access_token, expires_in }`.
4. Кэшировать: `cachedToken = access_token`, `expiresAt = Date.now() + expires_in*1000`. Вернуть токен.

`FCM_PRIVATE_KEY` разыменовывается (`\\n`→`\n`). base64url = base64 с заменой `+/`→`-_` и удалением `=`.

## 5. FcmPushProvider

Новый `apps/api/src/notifications/push/fcm-push.provider.ts`, реализует `PushProvider`.

**`send(message: PushMessage): Promise<PushSendResult>`:**
1. `if (message.platform !== 'android') throw new Error('iOS push not configured (Plan 4d)')`.
2. `const token = await this.tokenService.getAccessToken()`.
3. `POST https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send`, header `Authorization: Bearer ${token}`, body:
   ```json
   {
     "message": {
       "token": "<device-token>",
       "notification": { "title": "<title>", "body": "<body>" },
       "data": { ...message.data }
     }
   }
   ```
   `data` опускается, если `message.data` пуст/undefined. FCM требует строковые значения — `PushMessage.data` уже `Record<string,string>`.
4. Успех: `{ name: 'projects/X/messages/Y' }` → `return { providerMessageId: res.data.name }`.
5. Ошибка (FCM error / non-2xx / транспорт) → пробросить.

`projectId` из `FCM_PROJECT_ID`. Без внутреннего retry (BullMQ покрывает). FCM error_code mapping (`UNREGISTERED` → удалять токен) — out of scope.

## 6. Module + Error Handling

`apps/api/src/notifications/push/push.module.ts` — factory по `PUSH_PROVIDER_MODE`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { DevPushProvider } from './dev-push.provider';
import { FcmTokenService } from './fcm-token.service';
import { FcmPushProvider } from './fcm-push.provider';
import { PUSH_PROVIDER } from './push.types';

@Module({
  providers: [
    DevPushProvider,
    FcmTokenService,
    FcmPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, DevPushProvider, FcmPushProvider],
      useFactory: (config: ConfigService<Env, true>, dev: DevPushProvider, fcm: FcmPushProvider) =>
        config.get('PUSH_PROVIDER_MODE', { infer: true }) === 'real' ? fcm : dev,
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
```

`DevPushProvider` сохраняется (default для test/dev). `FcmTokenService` инжектится в `FcmPushProvider` обычным DI; `ConfigService` глобальный.

**Error handling:** провайдер не делает внутренний retry. Все ошибки (iOS-платформа, OAuth2-fail, FCM-error, транспорт) → throw. `NotificationsProcessor` уже оборачивает `push.send` в per-token try/catch (warning, не роняет соседей) + BullMQ-ретраи джоба. Консистентно с 4b.

## 7. Testing

Через `jest.mock('axios')`. Для JWT-подписи генерим **настоящую** тестовую RSA-пару в тесте (`crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`) и кладём private key в мок-config — подпись реальная, без моканья `node:crypto`.

**`fcm-token.service.spec.ts`:**
- успех: `axios.post` (token endpoint) → `{ access_token: 'ya29.test', expires_in: 3600 }`; `getAccessToken()` возвращает токен; проверяем POST на `https://oauth2.googleapis.com/token` с `grant_type` = `urn:ietf:params:oauth:grant-type:jwt-bearer` и `assertion` = валидный 3-сегментный JWT (header.payload.signature).
- кэш: два вызова `getAccessToken()` → `axios.post` вызван ровно один раз (второй из кэша).
- транспортная/oauth ошибка → пробрасывается.

**`fcm-push.provider.spec.ts`** (мок `FcmTokenService` с `getAccessToken → 'test-token'`):
- android success: `axios.post` → `{ name: 'projects/p/messages/m1' }`; результат `{ providerMessageId: 'projects/p/messages/m1' }`; проверяем URL `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`, header `Authorization: Bearer test-token`, body `message.token/notification.title/notification.body/data`.
- ios → `send` бросает `/iOS push/`; `axios.post` НЕ вызван.
- FCM error response / транспортная ошибка → пробрасывается.

**`env.schema.spec.ts`:** default `PUSH_PROVIDER_MODE='dev'` + пустые FCM ok; `real` без FCM creds → throw `/FCM/`; `real` с creds → ok.

Минимум ~10 unit. Регресс: полный `pnpm test` зелёный (default dev → существующие push/notification e2e не задеты).

## 8. Out of Scope

- APNs (iOS) — Plan 4d (HTTP/2, ES256). iOS-токены в `real` mode бросают до 4d.
- FCM error_code mapping (`UNREGISTERED`/`NOT_FOUND` → удалять мёртвый токен из БД) — отдельно.
- Multicast / topic / condition messages; FCM `android`/`apns` config-блоки (priority, ttl) — только базовый `notification` + `data`.
- Retry сверх BullMQ; метрики доставки / open rates.
- Composite platform router — Plan 4d (когда добавится APNs backend).
- Локальный dev без FCM creds (по аналогии с 4b — push работает на `DevPushProvider`).

## 9. Definition of Done

- [ ] `FcmTokenService`: RS256 JWT (node:crypto) → OAuth2 token exchange → in-memory кэш до expiry.
- [ ] `FcmPushProvider implements PushProvider`: android → FCM `messages:send` (Bearer token), возвращает `providerMessageId` (FCM `name`); iOS → throw; ошибки пробрасываются.
- [ ] `PushModule` factory по `PUSH_PROVIDER_MODE` (dev|real, default dev); `DevPushProvider` сохранён.
- [ ] env: `PUSH_PROVIDER_MODE` + `FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` + refine на `real`.
- [ ] Unit ≥10 (token service, push provider, env) через `jest.mock('axios')` + реальная тестовая RSA-пара.
- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` зелёный (регресс не сломан).
- [ ] GitHub Actions CI зелёный.

После Plan 4c → **Plan 4d** (real APNs iOS push: HTTP/2 + ES256 + composite router).

## 10. Implementation Notes / Risks

- **JWT-подпись в тестах:** генерируем реальную RSA-пару (`crypto.generateKeyPairSync`) вместо моканья `node:crypto` — тест проверяет настоящую структуру JWT и не привязан к внутренностям crypto. Опционально можно verify подпись тестовым public key.
- **Token cache concurrency:** in-memory кэш в singleton-сервисе. Параллельные джобы могут одновременно увидеть истёкший токен и сделать 2 token-exchange — безвредно (оба валидны, последний перезапишет кэш). Для MVP приемлемо; mutex/in-flight-promise — оверкилл.
- **Prod defaults to dev (operational risk, by design):** `PUSH_PROVIDER_MODE` default `dev` — prod-деплой без `PUSH_PROVIDER_MODE=real` будет логировать push вместо отправки (refine не сработает, т.к. creds нужны только в `real`). Безопасный default (как `SMS_PROVIDER_MODE=dev`, `AMOCRM_CLIENT_MODE=mock`). Заметка для deploy-runbook: prod обязан выставить `PUSH_PROVIDER_MODE=real` + `FCM_*`.
- **`FCM_PRIVATE_KEY` security:** хранится в Lockbox, разыменование `\n` только в памяти, НЕ логируется. `FcmTokenService`/`FcmPushProvider` не логируют ключ/токен.
- **`axios.post` напрямую (не `axios.create`)** — один-два endpoint, чистый `jest.mock('axios')` (как 4b SMSC).
