# Plan 4c: Real FCM Push Provider (Android) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реальная отправка Android-push через FCM HTTP v1. Уведомления с `push: true` для токенов `platform: 'android'` уходят через FCM (`POST /v1/projects/{id}/messages:send`, OAuth2 Bearer). iOS остаётся на Plan 4d.

**Architecture:** Существующая абстракция `PushProvider` (токен `PUSH_PROVIDER`) расширяется mode-switch'ем (как `SMS_PROVIDER_MODE` в 4b): `PushModule` factory отдаёт `DevPushProvider` (default `dev`) или `FcmPushProvider` (`real`). `FcmPushProvider` шлёт через axios, берёт OAuth2-токен из `FcmTokenService` (RS256 JWT через `node:crypto` → token exchange → in-memory кэш). iOS-токены бросают (Plan 4d). `NotificationsProcessor` не меняется.

**Tech Stack:** NestJS, `axios` (есть), `node:crypto` (RS256 JWT, без новых зависимостей), `@nestjs/config` + Zod, Jest (`jest.mock('axios')` + сгенерированная RSA-пара).

**Reference spec:** [docs/superpowers/specs/2026-05-28-plan-4c-fcm-push-design.md](../specs/2026-05-28-plan-4c-fcm-push-design.md)

**Prerequisites:**
- Plans 1–6 + 4b завершены. `main` на `167323e` или позднее.
- Docker Desktop running (`pnpm dev:infra`) для e2e регресса.
- 97 unit + 79 e2e зелёные.

**Out of scope (per design §8):** APNs/iOS (Plan 4d), FCM error_code→token cleanup, multicast/topic, composite router, dev без creds.

---

## File Structure

```
apps/api/src/config/
├── env.schema.ts                              ← MODIFY (+PUSH_PROVIDER_MODE, +FCM_* , +real refine)
└── __tests__/env.schema.spec.ts               ← MODIFY (+push mode tests)

apps/api/src/notifications/push/
├── fcm-token.service.ts                        ← NEW (RS256 JWT → OAuth2 token + cache)
├── fcm-push.provider.ts                        ← NEW (PushProvider via FCM v1)
├── push.module.ts                              ← MODIFY (factory dev|real)
├── dev-push.provider.ts                        ← unchanged (kept as dev default)
└── __tests__/
    ├── fcm-token.service.spec.ts               ← NEW (jest.mock axios + real RSA pair)
    └── fcm-push.provider.spec.ts               ← NEW (jest.mock axios, mock token service)
```

No e2e changes — providers unit-tested; existing notification e2e run in default `dev` mode (DevPushProvider) and stay green.

---

## Task 1: Env Schema — PUSH_PROVIDER_MODE + FCM config

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/__tests__/env.schema.spec.ts`

- [ ] **Step 1.1: Add failing tests**

Append to `apps/api/src/config/__tests__/env.schema.spec.ts` inside the existing `describe('envSchema', ...)` block (the `valid` fixture is defined there with `NODE_ENV: 'development'`):

```typescript
  it('defaults PUSH_PROVIDER_MODE to dev with empty FCM credentials', () => {
    const parsed = envSchema.parse({ ...valid });
    expect(parsed.PUSH_PROVIDER_MODE).toBe('dev');
    expect(parsed.FCM_PROJECT_ID).toBe('');
  });

  it('accepts real push mode with FCM credentials', () => {
    const parsed = envSchema.parse({
      ...valid,
      PUSH_PROVIDER_MODE: 'real',
      FCM_PROJECT_ID: 'proj',
      FCM_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    expect(parsed.PUSH_PROVIDER_MODE).toBe('real');
    expect(parsed.FCM_PROJECT_ID).toBe('proj');
  });

  it('rejects real push mode without FCM credentials', () => {
    expect(() =>
      envSchema.parse({ ...valid, PUSH_PROVIDER_MODE: 'real' }),
    ).toThrow(/FCM/);
  });
```

- [ ] **Step 1.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- env.schema.spec.ts
```

- [ ] **Step 1.3: Add fields + refine to `apps/api/src/config/env.schema.ts`**

Read the file. It currently ends with the SMSC block + a single `.refine(...)` for SMSC (from Plan 4b):

```typescript
  SMS_PROVIDER_MODE: z.enum(['dev', 'smsc']).default('dev'),
  SMSC_LOGIN: z.string().default(''),
  SMSC_PASSWORD: z.string().default(''),
  SMSC_SENDER: z.string().default(''),
  SMSC_BASE_URL: z.string().url().default('https://smsc.ru'),
})
  .refine(
    (env) => env.SMS_PROVIDER_MODE !== 'smsc' || (env.SMSC_LOGIN !== '' && env.SMSC_PASSWORD !== ''),
    { message: 'SMSC_LOGIN and SMSC_PASSWORD are required when SMS_PROVIDER_MODE=smsc' },
  );
```

Add the 4 push fields INSIDE the object (after the SMSC fields, before the closing `})`):

```typescript
  PUSH_PROVIDER_MODE: z.enum(['dev', 'real']).default('dev'),
  FCM_PROJECT_ID: z.string().default(''),
  FCM_CLIENT_EMAIL: z.string().default(''),
  FCM_PRIVATE_KEY: z.string().default(''),
```

Then add a SECOND chained `.refine(...)` after the existing SMSC refine (chaining `.refine` on `ZodEffects` is supported and keeps `z.infer` working):

```typescript
})
  .refine(
    (env) => env.SMS_PROVIDER_MODE !== 'smsc' || (env.SMSC_LOGIN !== '' && env.SMSC_PASSWORD !== ''),
    { message: 'SMSC_LOGIN and SMSC_PASSWORD are required when SMS_PROVIDER_MODE=smsc' },
  )
  .refine(
    (env) =>
      env.PUSH_PROVIDER_MODE !== 'real' ||
      (env.FCM_PROJECT_ID !== '' && env.FCM_CLIENT_EMAIL !== '' && env.FCM_PRIVATE_KEY !== ''),
    { message: 'FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY are required when PUSH_PROVIDER_MODE=real' },
  );
```

`export type Env = z.infer<typeof envSchema>;` stays unchanged.

- [ ] **Step 1.4: Run, expect PASS**

```bash
pnpm --filter @vittoria/api test:unit -- env.schema.spec.ts
```

All env tests pass (existing + 3 new).

- [ ] **Step 1.5: Build clean**

```bash
pnpm --filter @vittoria/api build
```

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/src/config
git commit -m "feat(api): PUSH_PROVIDER_MODE + FCM env config with real-mode refine"
```

---

## Task 2: FcmTokenService (RS256 JWT → OAuth2 token + cache)

**Files:**
- Create: `apps/api/src/notifications/push/fcm-token.service.ts`
- Create: `apps/api/src/notifications/push/__tests__/fcm-token.service.spec.ts`

- [ ] **Step 2.1: Failing unit test**

Create `apps/api/src/notifications/push/__tests__/fcm-token.service.spec.ts`:

```typescript
import axios from 'axios';
import { generateKeyPairSync } from 'node:crypto';
import { FcmTokenService } from '../fcm-token.service';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

// Generate a real RSA keypair so JWT signing actually works (no crypto mocking).
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    FCM_PROJECT_ID: 'proj',
    FCM_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: privatePem,
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

describe('FcmTokenService.getAccessToken', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('signs a JWT and exchanges it for an access token', async () => {
    mockedPost.mockResolvedValue({ data: { access_token: 'ya29.test', expires_in: 3600 } });
    const svc = new FcmTokenService(makeConfig());
    const token = await svc.getAccessToken();

    expect(token).toBe('ya29.test');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const params = body as URLSearchParams;
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = params.get('assertion') as string;
    // JWT has 3 dot-separated segments
    expect(assertion.split('.')).toHaveLength(3);
  });

  it('caches the token across calls (one token exchange)', async () => {
    mockedPost.mockResolvedValue({ data: { access_token: 'ya29.cached', expires_in: 3600 } });
    const svc = new FcmTokenService(makeConfig());
    const t1 = await svc.getAccessToken();
    const t2 = await svc.getAccessToken();
    expect(t1).toBe('ya29.cached');
    expect(t2).toBe('ya29.cached');
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('propagates token-exchange transport errors', async () => {
    mockedPost.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new FcmTokenService(makeConfig());
    await expect(svc.getAccessToken()).rejects.toThrow(/ECONNREFUSED/);
  });
});
```

- [ ] **Step 2.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- fcm-token.service.spec.ts
```

- [ ] **Step 2.3: Implement `apps/api/src/notifications/push/fcm-token.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';
import axios from 'axios';
import type { Env } from '../../config/env.schema';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const EXPIRY_BUFFER_MS = 60_000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class FcmTokenService {
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.expiresAt - EXPIRY_BUFFER_MS) {
      return this.cachedToken;
    }

    const clientEmail = this.config.get('FCM_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FCM_PRIVATE_KEY', { infer: true }).replace(/\\n/g, '\n');

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
    );
    const signingInput = `${header}.${claims}`;
    const signature = base64url(createSign('RSA-SHA256').update(signingInput).sign(privateKey));
    const jwt = `${signingInput}.${signature}`;

    const params = new URLSearchParams();
    params.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.set('assertion', jwt);

    const res = await axios.post<TokenResponse>(TOKEN_URL, params, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.cachedToken = res.data.access_token;
    this.expiresAt = Date.now() + res.data.expires_in * 1000;
    return this.cachedToken;
  }
}
```

- [ ] **Step 2.4: Run, expect PASS** (3 tests).

```bash
pnpm --filter @vittoria/api test:unit -- fcm-token.service.spec.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/notifications/push/fcm-token.service.ts apps/api/src/notifications/push/__tests__/fcm-token.service.spec.ts
git commit -m "feat(api): FcmTokenService (RS256 JWT -> OAuth2 token with cache)"
```

---

## Task 3: FcmPushProvider

**Files:**
- Create: `apps/api/src/notifications/push/fcm-push.provider.ts`
- Create: `apps/api/src/notifications/push/__tests__/fcm-push.provider.spec.ts`

- [ ] **Step 3.1: Failing unit test**

Create `apps/api/src/notifications/push/__tests__/fcm-push.provider.spec.ts`:

```typescript
import axios from 'axios';
import { FcmPushProvider } from '../fcm-push.provider';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    FCM_PROJECT_ID: 'proj',
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

function makeTokenService() {
  return { getAccessToken: jest.fn().mockResolvedValue('test-token') } as never;
}

describe('FcmPushProvider.send', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('sends an android push and returns providerMessageId', async () => {
    mockedPost.mockResolvedValue({ data: { name: 'projects/proj/messages/m1' } });
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    const res = await provider.send({
      token: 'device-abc',
      platform: 'android',
      title: 'VITTORIA HOME',
      body: 'Заказ готов',
      data: { event: 'order.ready', orderId: 'o1' },
    });

    expect(res).toEqual({ providerMessageId: 'projects/proj/messages/m1' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = mockedPost.mock.calls[0];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/proj/messages:send');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
    expect(body.message.token).toBe('device-abc');
    expect(body.message.notification).toEqual({ title: 'VITTORIA HOME', body: 'Заказ готов' });
    expect(body.message.data).toEqual({ event: 'order.ready', orderId: 'o1' });
  });

  it('omits data when message.data is empty', async () => {
    mockedPost.mockResolvedValue({ data: { name: 'projects/proj/messages/m2' } });
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    await provider.send({ token: 'device-abc', platform: 'android', title: 't', body: 'b' });
    const body = mockedPost.mock.calls[0][1];
    expect(body.message.data).toBeUndefined();
  });

  it('throws for ios platform without calling FCM', async () => {
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    await expect(
      provider.send({ token: 'apns-tok', platform: 'ios', title: 't', body: 'b' }),
    ).rejects.toThrow(/iOS push/);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('propagates FCM transport errors', async () => {
    mockedPost.mockRejectedValue(new Error('FCM 503'));
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    await expect(
      provider.send({ token: 'device-abc', platform: 'android', title: 't', body: 'b' }),
    ).rejects.toThrow(/FCM 503/);
  });
});
```

- [ ] **Step 3.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- fcm-push.provider.spec.ts
```

- [ ] **Step 3.3: Implement `apps/api/src/notifications/push/fcm-push.provider.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Env } from '../../config/env.schema';
import { FcmTokenService } from './fcm-token.service';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

interface FcmSendResponse {
  name: string;
}

@Injectable()
export class FcmPushProvider implements PushProvider {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: FcmTokenService,
  ) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    if (message.platform !== 'android') {
      throw new Error('iOS push not configured (Plan 4d)');
    }

    const projectId = this.config.get('FCM_PROJECT_ID', { infer: true });
    const accessToken = await this.tokenService.getAccessToken();

    const fcmMessage: {
      token: string;
      notification: { title: string; body: string };
      data?: Record<string, string>;
    } = {
      token: message.token,
      notification: { title: message.title, body: message.body },
    };
    if (message.data && Object.keys(message.data).length > 0) {
      fcmMessage.data = message.data;
    }

    const res = await axios.post<FcmSendResponse>(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      { message: fcmMessage },
      {
        timeout: 10_000,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      },
    );

    return { providerMessageId: res.data.name };
  }
}
```

- [ ] **Step 3.4: Run, expect PASS** (4 tests).

```bash
pnpm --filter @vittoria/api test:unit -- fcm-push.provider.spec.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/notifications/push/fcm-push.provider.ts apps/api/src/notifications/push/__tests__/fcm-push.provider.spec.ts
git commit -m "feat(api): FcmPushProvider (FCM v1 messages:send for Android)"
```

---

## Task 4: PushModule factory (dev|real)

**Files:**
- Modify: `apps/api/src/notifications/push/push.module.ts`

- [ ] **Step 4.1: Replace `apps/api/src/notifications/push/push.module.ts`**

Full new content:

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

- [ ] **Step 4.2: Lint + build clean**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

Build must be clean. `DevPushProvider` remains the default (no `PUSH_PROVIDER_MODE` set → `dev`). `FcmPushProvider` resolves with `ConfigService` + `FcmTokenService` injected.

- [ ] **Step 4.3: Run full unit suite**

```bash
pnpm --filter @vittoria/api test:unit
```

Expected ~107 unit (97 prior + 3 env + 3 token + 4 push). All green.

- [ ] **Step 4.4: Commit**

```bash
git add apps/api/src/notifications/push/push.module.ts
git commit -m "feat(api): PushModule factory selects FcmPushProvider when PUSH_PROVIDER_MODE=real"
```

---

## Task 5: Full Verification + Push

- [ ] **Step 5.1: Flush Redis + full suite from root**

```bash
docker exec infra-redis-1 redis-cli FLUSHALL
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All packages green. **Critical regression:** existing notification e2e (`notifications.e2e-spec.ts`, `chat-notifications.e2e-spec.ts`, `notification-templates.e2e-spec.ts`) must still pass — they run in default `dev` mode (no `PUSH_PROVIDER_MODE` set), so `DevPushProvider` is used exactly as before. The `PushModule` factory change does not alter dev behavior.

- [ ] **Step 5.2: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 5.3: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions, confirm latest run green.

---

## Definition of Done

- [x] `FcmTokenService`: RS256 JWT (node:crypto) → OAuth2 token exchange → in-memory cache (60s buffer).
- [x] `FcmPushProvider implements PushProvider`: android → FCM `messages:send` (Bearer token), returns `providerMessageId` (FCM `name`); iOS → throws; errors propagate.
- [x] `PushModule` factory by `PUSH_PROVIDER_MODE` (dev|real, default dev); `DevPushProvider` kept.
- [x] env: `PUSH_PROVIDER_MODE` + `FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` + real-mode refine.
- [x] Unit ≥10 (3 env + 3 token + 4 push) via `jest.mock('axios')` + generated RSA keypair.
- [x] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` green (Plan 4/4b regression intact).
- [x] GitHub Actions CI green.

Deploy-runbook note: prod must set `PUSH_PROVIDER_MODE=real` + `FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` (safe default is `dev`).

After Plan 4c → **Plan 4d** (real APNs iOS push: HTTP/2 + ES256 + composite router).

---

**End of Plan 4c.**
