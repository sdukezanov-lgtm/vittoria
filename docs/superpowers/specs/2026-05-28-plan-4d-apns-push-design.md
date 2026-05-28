# Plan 4d: Real APNs iOS Push + Composite Router — Design

**Status:** Approved (2026-05-28)
**Predecessors:** Plan 4 (Notifications), 4b (SMSC SMS), 4c (FCM Android push — mode-switch + token-cache pattern).
**Completes:** the notifications push subsystem (both platforms real).

## 1. Goal

Реальная отправка iOS-push через APNs (HTTP/2 provider-token), и composite-роутер, направляющий android→FCM (4c) и ios→APNs. После 4d уведомления с `push: true` уходят настоящими push на обе платформы (в `PUSH_PROVIDER_MODE=real`).

Реальных credentials (Apple .p8 key) пока нет — код готов к подключению (ключи из env/Lockbox в проде), тестируется через мок инжектируемого `ApnsHttp2Client` + сгенерированную в тесте EC-пару. Default `dev` сохраняет `DevPushProvider`.

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](2026-05-26-vittoria-home-mvp-design.md) — раздел 9 (APNs для iOS).

## 2. Architecture

После 4c: `PushModule` factory `real` → `FcmPushProvider` (android; бросает на ios). 4d вводит APNs + composite:

- `ApnsHttp2Client` — тонкая обёртка над `node:http2`: `post(deviceToken, headers, jsonBody) → { status, apnsId, body }`. Открывает HTTP/2-сессию к APNs-хосту, шлёт `POST /3/device/{deviceToken}`, читает ответ, закрывает сессию. **Не** юнит-тестируется (как `AmocrmHttpClient`); покрывается ручной проверкой с реальными ключами.
- `ApnsTokenService` — ES256 provider-token JWT (node:crypto) с in-memory кэшем (как `FcmTokenService`).
- `ApnsPushProvider implements PushProvider` — ios → строит APNs-запрос, шлёт через `ApnsHttp2Client`; android → throw (defensive; composite не направит android сюда).
- `CompositePushProvider implements PushProvider` — `send(message)`: `message.platform === 'ios' ? apns.send(message) : fcm.send(message)`.
- `PushModule` factory: `real` → `CompositePushProvider`, `dev` → `DevPushProvider`. Регистрируются `DevPushProvider`, `FcmTokenService`, `FcmPushProvider`, `ApnsHttp2Client`, `ApnsTokenService`, `ApnsPushProvider`, `CompositePushProvider`.

`FcmPushProvider` ios-guard остаётся (defensive). `NotificationsProcessor` не меняется.

```
real mode: PUSH_PROVIDER → CompositePushProvider
   ├─ android → FcmPushProvider → FCM v1 (4c)
   └─ ios     → ApnsPushProvider → ApnsTokenService (ES256) + ApnsHttp2Client → APNs HTTP/2
```

## 3. Configuration (env)

Расширяем `env.schema.ts` (после `FCM_*`):

```typescript
APNS_KEY_ID: z.string().default(''),                  // kid (JWT header)
APNS_TEAM_ID: z.string().default(''),                 // iss (JWT claims)
APNS_PRIVATE_KEY: z.string().default(''),             // .p8 EC P-256 PEM (literal \n)
APNS_BUNDLE_ID: z.string().default(''),               // apns-topic header
APNS_USE_SANDBOX: z.coerce.boolean().default(false),  // prod host by default
```

**Refine из 4c заменяется** на единый, требующий при `PUSH_PROVIDER_MODE=real` обоих наборов:
```typescript
.refine(
  (env) =>
    env.PUSH_PROVIDER_MODE !== 'real' ||
    (env.FCM_PROJECT_ID !== '' && env.FCM_CLIENT_EMAIL !== '' && env.FCM_PRIVATE_KEY !== '' &&
     env.APNS_KEY_ID !== '' && env.APNS_TEAM_ID !== '' && env.APNS_PRIVATE_KEY !== '' && env.APNS_BUNDLE_ID !== ''),
  { message: 'FCM_* and APNS_* are required when PUSH_PROVIDER_MODE=real' },
)
```
(SMSC refine не трогаем — он отдельный.)

`APNS_USE_SANDBOX=true` → хост `api.sandbox.push.apple.com`, иначе `api.push.apple.com`. `APNS_PRIVATE_KEY` разыменовывается `\\n`→`\n`. `APNS_BASE_URL` не вводим (хост по флагу; в тестах клиент мокается).

## 4. ApnsTokenService (ES256 JWT + cache)

Новый `apps/api/src/notifications/push/apns-token.service.ts`. In-memory кэш provider-token.

**`getProviderToken(): string`** (синхронный — подпись быстрая, без HTTP; кэш по времени):
1. Если кэш валиден (моложе 50 минут — Apple допускает reuse до 60 мин, берём буфер) — вернуть.
2. Иначе собрать и подписать JWT (ES256):
   - header `{ alg: 'ES256', kid: APNS_KEY_ID, typ: 'JWT' }`
   - claims `{ iss: APNS_TEAM_ID, iat: nowSec }`
   - `signingInput = base64url(header) + '.' + base64url(claims)`
   - **подпись (важно):** `crypto.sign('SHA256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' })` → base64url. `dsaEncoding: 'ieee-p1363'` обязателен — даёт raw 64-байтную R‖S подпись (JOSE-формат); без него node выдаёт DER, который APNs отвергнет.
   - `token = signingInput + '.' + base64url(signature)`
3. Кэшировать token + `issuedAt = Date.now()`. Вернуть.

`APNS_PRIVATE_KEY` разыменовывается. Кэш по `issuedAt` (а не expiry — у APNs JWT нет exp; refresh каждые ~50 мин). base64url как в FCM.

## 5. ApnsHttp2Client (node:http2 wrapper)

Новый `apps/api/src/notifications/push/apns-http2.client.ts`. Тонкая обёртка, не юнит-тест.

**`post(host: string, deviceToken: string, headers: Record<string,string>, body: object): Promise<{ status: number; apnsId: string | null; body: string }>`:**
- `const session = http2.connect(\`https://${host}\`)`
- `const req = session.request({ ':method': 'POST', ':path': \`/3/device/${deviceToken}\`, ...headers })`
- записать `JSON.stringify(body)`, `req.end()`
- собрать ответные headers (`:status`, `apns-id`) и тело (data chunks)
- закрыть session (`session.close()`) в finally
- вернуть `{ status, apnsId, body }`
- на `session.on('error')` / `req.on('error')` → reject

Конструктор без зависимостей (stateless). Инжектируется в `ApnsPushProvider` обычным DI. Per-call session (без пула) — для MVP приемлемо; connection pooling — out of scope.

## 6. ApnsPushProvider

Новый `apps/api/src/notifications/push/apns-push.provider.ts`, реализует `PushProvider`.

**`send(message: PushMessage): Promise<PushSendResult>`:**
1. `if (message.platform !== 'ios') throw new Error('APNs handles iOS only')` (defensive).
2. `const host = APNS_USE_SANDBOX ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'`.
3. `const token = this.tokenService.getProviderToken()`.
4. headers: `{ authorization: \`bearer ${token}\`, 'apns-topic': APNS_BUNDLE_ID, 'apns-push-type': 'alert' }`.
5. body: `{ aps: { alert: { title: message.title, body: message.body } }, ...message.data }` (custom data на верхнем уровне рядом с `aps`; если `message.data` пуст — только `aps`).
6. `const res = await this.http2.post(host, message.token, headers, body)`.
7. Успех (`status === 200`): `return { providerMessageId: res.apnsId ?? '' }`.
8. Ошибка (`status !== 200`): распарсить `body` (`{ reason: '...' }`), `throw new Error(\`APNs ${status}: ${reason}\`)`.

## 7. CompositePushProvider + Module

`apps/api/src/notifications/push/composite-push.provider.ts`:
```typescript
@Injectable()
export class CompositePushProvider implements PushProvider {
  constructor(
    private readonly fcm: FcmPushProvider,
    private readonly apns: ApnsPushProvider,
  ) {}

  send(message: PushMessage): Promise<PushSendResult> {
    return message.platform === 'ios' ? this.apns.send(message) : this.fcm.send(message);
  }
}
```

`push.module.ts` factory:
```typescript
providers: [
  DevPushProvider,
  FcmTokenService, FcmPushProvider,
  ApnsHttp2Client, ApnsTokenService, ApnsPushProvider,
  CompositePushProvider,
  {
    provide: PUSH_PROVIDER,
    inject: [ConfigService, DevPushProvider, CompositePushProvider],
    useFactory: (config, dev, composite) =>
      config.get('PUSH_PROVIDER_MODE', { infer: true }) === 'real' ? composite : dev,
  },
],
exports: [PUSH_PROVIDER],
```

## 8. Error Handling

Все ошибки (non-200 APNs, transport, неверная платформа) → throw. `NotificationsProcessor` ловит per-token (warning, не роняет соседние токены) + BullMQ-ретраи. APNs `reason` (`BadDeviceToken`, `Unregistered`, …) → token cleanup — out of scope (единый throw для MVP, как FCM error_code). Консистентно с 4b/4c.

## 9. Testing

`jest.mock` инжектируемых зависимостей (не `node:http2` напрямую).

**`apns-token.service.spec.ts`** (реальная EC-пара через `crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })`):
- подпись: `getProviderToken()` возвращает 3-сегментный JWT; header декодируется в `{alg:'ES256', kid, typ:'JWT'}`; claims `{iss, iat}`.
- кэш: два вызова в пределах окна → один и тот же токен, подпись считается один раз (шпион на `crypto.sign` или сравнение идентичности с фиксированным временем через `jest.useFakeTimers`).
- (опц.) подпись verify реальным public key — подтверждает ieee-p1363 формат.

**`apns-push.provider.spec.ts`** (мок `ApnsHttp2Client` + мок `ApnsTokenService` → `'tok'`, мок config):
- ios success: `http2.post` → `{ status: 200, apnsId: 'apns-1', body: '' }`; результат `{ providerMessageId: 'apns-1' }`; проверяем host (sandbox/prod по флагу), headers (`authorization: bearer tok`, `apns-topic`, `apns-push-type: alert`), body `{ aps: { alert: { title, body } } }` + кастомные data при наличии.
- sandbox toggle: `APNS_USE_SANDBOX=true` → host `api.sandbox.push.apple.com`.
- data omission: пустой `message.data` → тело только `{ aps }`.
- android → throw (`/iOS only/`), `http2.post` не вызван.
- APNs error: `{ status: 400, body: '{"reason":"BadDeviceToken"}' }` → throw `/BadDeviceToken/`.

**`composite-push.provider.spec.ts`** (мок fcm + apns):
- ios → `apns.send` вызван, `fcm.send` нет.
- android → `fcm.send` вызван, `apns.send` нет.

**`env.schema.spec.ts`:** `real` без APNS (но с FCM) → throw `/APNS/` (или совместное сообщение); `real` с полным набором → ok; default dev → ok.

Минимум ~12 unit. Регресс: полный `pnpm test` зелёный (default dev → существующие e2e не задеты).

## 10. Out of Scope

- APNs `reason`-маппинг → token cleanup (`Unregistered`/`BadDeviceToken` → удалять токен) — отдельно.
- HTTP/2 connection pooling / session reuse — per-call session для MVP.
- APNs collapse-id, priority, expiration, background/voip push-types — только `alert`.
- Юнит-тест `ApnsHttp2Client` (тонкая обёртка, как `AmocrmHttpClient` — не тестируется).
- Локальный dev без APNS creds (default dev → DevPushProvider).

## 11. Definition of Done

- [ ] env: `APNS_KEY_ID/TEAM_ID/PRIVATE_KEY/BUNDLE_ID/USE_SANDBOX` + единый refine (real → FCM_* AND APNS_*).
- [ ] `ApnsTokenService`: ES256 JWT (node:crypto `dsaEncoding: 'ieee-p1363'`) + in-memory cache (~50 мин).
- [ ] `ApnsHttp2Client`: node:http2 POST /3/device/{token}, возвращает status/apnsId/body.
- [ ] `ApnsPushProvider implements PushProvider`: ios → APNs (bearer token, apns-topic, alert); android → throw; non-200 → throw with reason.
- [ ] `CompositePushProvider`: ios → apns, android → fcm.
- [ ] `PushModule` factory `real` → composite (dev → DevPushProvider).
- [ ] Unit ≥12 (token, push, composite, env) via mocked client + generated EC keypair.
- [ ] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` зелёный (регресс 4/4b/4c intact).
- [ ] GitHub Actions CI зелёный.

Deploy-runbook note: prod `PUSH_PROVIDER_MODE=real` теперь требует и `FCM_*`, и `APNS_*` (key .p8, key_id, team_id, bundle_id), `APNS_USE_SANDBOX` по окружению.

После 4d push-подсистема завершена (обе платформы). Далее — Admin/Partner SPA (frontend).

## 12. Implementation Notes / Risks

- **ES256 `dsaEncoding: 'ieee-p1363'` — критично.** Без него `crypto.sign` отдаёт DER-подпись, APNs её отвергает (`InvalidProviderToken`). Тест подписи через реальную EC-пару ловит это.
- **`ApnsHttp2Client` не юнит-тестируется** — риск, что транспорт сломан, остаётся до ручной проверки с реальными ключами. Провайдер-логика и токен полностью покрыты unit. Приемлемо (так же `AmocrmHttpClient`).
- **Per-call HTTP/2 session** — каждый push открывает/закрывает сессию. Неэффективно при высокой нагрузке, но просто и безопасно для MVP. Pooling — отдельный план при необходимости.
- **Prod defaults to dev** — как 4b/4c, prod должен явно выставить `PUSH_PROVIDER_MODE=real` + полный набор кред (deploy-runbook).
- **`.env.example`** — защищён permission, не редактируется инструментами; провайдер-vars (SMSC/FCM/APNS) документируются вручную при настройке деплоя.
