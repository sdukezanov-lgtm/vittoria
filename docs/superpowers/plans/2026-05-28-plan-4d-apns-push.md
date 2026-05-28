# Plan 4d: Real APNs iOS Push + Composite Router — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реальная отправка iOS-push через APNs (HTTP/2 provider-token) + composite-роутер: android→FCM (4c), ios→APNs. После 4d push-подсистема работает на обе платформы в `PUSH_PROVIDER_MODE=real`.

**Architecture:** `ApnsHttp2Client` (тонкая обёртка над `node:http2`, не юнит-тест) + `ApnsTokenService` (ES256 JWT via node:crypto + кэш) + `ApnsPushProvider` (ios). `CompositePushProvider` роутит по платформе. `PushModule` factory `real` → composite. `NotificationsProcessor` не меняется.

**Tech Stack:** NestJS, `node:http2` (встроенный, без новых зависимостей), `node:crypto` (ES256, `dsaEncoding: 'ieee-p1363'`), `@nestjs/config` + Zod, Jest (мок инжектируемого клиента + сгенерированная EC-пара).

**Reference spec:** [docs/superpowers/specs/2026-05-28-plan-4d-apns-push-design.md](../specs/2026-05-28-plan-4d-apns-push-design.md)

**Prerequisites:**
- Plans 1–6 + 4b + 4c завершены. `main` на `93b7776` или позднее.
- Docker Desktop running (`pnpm dev:infra`) для e2e регресса.
- ~107 unit + 79 e2e зелёные.

**Out of scope (per design §10):** APNs reason→token cleanup, HTTP/2 pooling, collapse-id/priority/voip, юнит-тест ApnsHttp2Client, dev без creds.

---

## File Structure

```
apps/api/src/config/
├── env.schema.ts                              ← MODIFY (+APNS_*, replace 4c FCM refine with combined FCM+APNS)
└── __tests__/env.schema.spec.ts               ← MODIFY (+APNS real-mode tests)

apps/api/src/notifications/push/
├── apns-token.service.ts                       ← NEW (ES256 JWT + cache)
├── apns-http2.client.ts                        ← NEW (node:http2 wrapper, not unit-tested)
├── apns-push.provider.ts                       ← NEW (PushProvider via APNs, ios)
├── composite-push.provider.ts                  ← NEW (routes ios→apns / android→fcm)
├── push.module.ts                              ← MODIFY (factory real → composite)
├── fcm-push.provider.ts                        ← unchanged (composite injects it)
└── __tests__/
    ├── apns-token.service.spec.ts              ← NEW (EC keypair, ES256)
    ├── apns-push.provider.spec.ts              ← NEW (mock http2 client + token)
    └── composite-push.provider.spec.ts         ← NEW (routing)
```

No e2e changes — providers unit-tested; existing notification e2e run in default `dev` mode and stay green.

---

## Task 1: Env Schema — APNS config + combined real refine

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/__tests__/env.schema.spec.ts`

- [ ] **Step 1.1: Add failing tests**

Append to `apps/api/src/config/__tests__/env.schema.spec.ts` inside the `describe('envSchema', ...)` block. NOTE: the existing 4c test `'accepts real push mode with FCM credentials'` (FCM-only) will now FAIL because real mode will require APNS too — UPDATE that existing test to include APNS creds, and add the new APNS-missing test.

First, UPDATE the existing `'accepts real push mode with FCM credentials'` test to add APNS fields to its parse input:
```typescript
  it('accepts real push mode with FCM + APNS credentials', () => {
    const parsed = envSchema.parse({
      ...valid,
      PUSH_PROVIDER_MODE: 'real',
      FCM_PROJECT_ID: 'proj',
      FCM_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
      APNS_KEY_ID: 'KEY123',
      APNS_TEAM_ID: 'TEAM123',
      APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nec\\n-----END PRIVATE KEY-----\\n',
      APNS_BUNDLE_ID: 'app.vittoria.client',
    });
    expect(parsed.PUSH_PROVIDER_MODE).toBe('real');
    expect(parsed.APNS_BUNDLE_ID).toBe('app.vittoria.client');
    expect(parsed.APNS_USE_SANDBOX).toBe(false);
  });
```

Then add a new test for real mode missing APNS (FCM present):
```typescript
  it('rejects real push mode with FCM but missing APNS credentials', () => {
    expect(() =>
      envSchema.parse({
        ...valid,
        PUSH_PROVIDER_MODE: 'real',
        FCM_PROJECT_ID: 'proj',
        FCM_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
        FCM_PRIVATE_KEY: 'key',
      }),
    ).toThrow(/APNS/);
  });

  it('defaults APNS_USE_SANDBOX to false and APNS fields to empty', () => {
    const parsed = envSchema.parse({ ...valid });
    expect(parsed.APNS_USE_SANDBOX).toBe(false);
    expect(parsed.APNS_KEY_ID).toBe('');
  });
```

The existing `'rejects real push mode without FCM credentials'` test stays valid (no FCM → still throws). Keep it.

- [ ] **Step 1.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- env.schema.spec.ts
```

Expected: new APNS tests fail (fields undefined; refine not updated); the renamed real-mode test fails (APNS required but old refine doesn't check it / fields missing from schema).

- [ ] **Step 1.3: Add APNS fields + replace FCM refine in `apps/api/src/config/env.schema.ts`**

Add the 5 APNS fields INSIDE the object, after the `FCM_PRIVATE_KEY` line:
```typescript
  APNS_KEY_ID: z.string().default(''),
  APNS_TEAM_ID: z.string().default(''),
  APNS_PRIVATE_KEY: z.string().default(''),
  APNS_BUNDLE_ID: z.string().default(''),
  APNS_USE_SANDBOX: z.coerce.boolean().default(false),
```

Then REPLACE the existing FCM-only refine (the second `.refine(...)`) with a combined one. The file currently ends:
```typescript
  .refine(
    (env) =>
      env.PUSH_PROVIDER_MODE !== 'real' ||
      (env.FCM_PROJECT_ID !== '' && env.FCM_CLIENT_EMAIL !== '' && env.FCM_PRIVATE_KEY !== ''),
    { message: 'FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY are required when PUSH_PROVIDER_MODE=real' },
  );
```
Replace that second refine with:
```typescript
  .refine(
    (env) =>
      env.PUSH_PROVIDER_MODE !== 'real' ||
      (env.FCM_PROJECT_ID !== '' &&
        env.FCM_CLIENT_EMAIL !== '' &&
        env.FCM_PRIVATE_KEY !== '' &&
        env.APNS_KEY_ID !== '' &&
        env.APNS_TEAM_ID !== '' &&
        env.APNS_PRIVATE_KEY !== '' &&
        env.APNS_BUNDLE_ID !== ''),
    { message: 'FCM_* and APNS_* are required when PUSH_PROVIDER_MODE=real' },
  );
```
(The SMSC refine — the first `.refine` — stays untouched.) `export type Env = z.infer<typeof envSchema>;` stays unchanged.

- [ ] **Step 1.4: Run, expect PASS**

```bash
pnpm --filter @vittoria/api test:unit -- env.schema.spec.ts
```

All env tests pass (the message regex `/FCM/` in the existing `'rejects real push mode without FCM credentials'` test still matches the combined message `FCM_* and APNS_* ...`; `/APNS/` matches the new test).

- [ ] **Step 1.5: Build clean**

```bash
pnpm --filter @vittoria/api build
```

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/src/config
git commit -m "feat(api): APNS env config + combined FCM/APNS real-mode refine"
```

---

## Task 2: ApnsTokenService (ES256 JWT + cache)

**Files:**
- Create: `apps/api/src/notifications/push/apns-token.service.ts`
- Create: `apps/api/src/notifications/push/__tests__/apns-token.service.spec.ts`

- [ ] **Step 2.1: Failing unit test**

Create `apps/api/src/notifications/push/__tests__/apns-token.service.spec.ts`:

```typescript
import { generateKeyPairSync } from 'node:crypto';
import { ApnsTokenService } from '../apns-token.service';

// Real EC P-256 keypair so ES256 signing actually works (no crypto mocking).
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM456',
    APNS_PRIVATE_KEY: privatePem,
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

describe('ApnsTokenService.getProviderToken', () => {
  it('builds an ES256 JWT with kid header and iss/iat claims', () => {
    const svc = new ApnsTokenService(makeConfig());
    const token = svc.getProviderToken();
    const [headerSeg, claimsSeg, sigSeg] = token.split('.');
    expect([headerSeg, claimsSeg, sigSeg]).toHaveLength(3);

    const header = decodeSegment(headerSeg);
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });

    const claims = decodeSegment(claimsSeg);
    expect(claims.iss).toBe('TEAM456');
    expect(typeof claims.iat).toBe('number');
  });

  it('caches the token (same token on second call within window)', () => {
    const svc = new ApnsTokenService(makeConfig());
    const t1 = svc.getProviderToken();
    const t2 = svc.getProviderToken();
    // ES256 (ECDSA) signatures are non-deterministic — identical tokens prove the cache,
    // not coincidental re-signing.
    expect(t1).toBe(t2);
  });
});
```

- [ ] **Step 2.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- apns-token.service.spec.ts
```

- [ ] **Step 2.3: Implement `apps/api/src/notifications/push/apns-token.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'node:crypto';
import type { Env } from '../../config/env.schema';

const CACHE_TTL_MS = 50 * 60 * 1000; // refresh well under APNs' 60-min limit

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

@Injectable()
export class ApnsTokenService {
  private cachedToken: string | null = null;
  private issuedAt = 0;

  constructor(private readonly config: ConfigService<Env, true>) {}

  getProviderToken(): string {
    if (this.cachedToken && Date.now() - this.issuedAt < CACHE_TTL_MS) {
      return this.cachedToken;
    }

    const keyId = this.config.get('APNS_KEY_ID', { infer: true });
    const teamId = this.config.get('APNS_TEAM_ID', { infer: true });
    const privateKey = this.config.get('APNS_PRIVATE_KEY', { infer: true }).replace(/\\n/g, '\n');

    const nowSec = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iss: teamId, iat: nowSec }));
    const signingInput = `${header}.${claims}`;
    // dsaEncoding 'ieee-p1363' => raw 64-byte R||S signature (JOSE/ES256), NOT DER.
    const signature = base64url(
      sign('SHA256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' }),
    );

    this.cachedToken = `${signingInput}.${signature}`;
    this.issuedAt = Date.now();
    return this.cachedToken;
  }
}
```

- [ ] **Step 2.4: Run, expect PASS** (2 tests).

```bash
pnpm --filter @vittoria/api test:unit -- apns-token.service.spec.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/notifications/push/apns-token.service.ts apps/api/src/notifications/push/__tests__/apns-token.service.spec.ts
git commit -m "feat(api): ApnsTokenService (ES256 provider-token JWT with cache)"
```

---

## Task 3: ApnsHttp2Client (node:http2 wrapper)

**Files:**
- Create: `apps/api/src/notifications/push/apns-http2.client.ts`

No unit test (thin transport wrapper requiring a TLS+HTTP/2 server; covered by manual verification with real keys, like `AmocrmHttpClient`).

- [ ] **Step 3.1: Implement `apps/api/src/notifications/push/apns-http2.client.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import * as http2 from 'node:http2';

export interface ApnsHttp2Response {
  status: number;
  apnsId: string | null;
  body: string;
}

@Injectable()
export class ApnsHttp2Client {
  async post(
    host: string,
    deviceToken: string,
    headers: Record<string, string>,
    body: object,
  ): Promise<ApnsHttp2Response> {
    return new Promise<ApnsHttp2Response>((resolve, reject) => {
      const session = http2.connect(`https://${host}`);
      session.on('error', reject);

      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        ...headers,
      });

      let status = 0;
      let apnsId: string | null = null;
      const chunks: Buffer[] = [];

      req.on('response', (resHeaders) => {
        status = Number(resHeaders[':status']);
        const id = resHeaders['apns-id'];
        apnsId = typeof id === 'string' ? id : null;
      });
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('error', (err) => {
        session.close();
        reject(err);
      });
      req.on('end', () => {
        session.close();
        resolve({ status, apnsId, body: Buffer.concat(chunks).toString('utf8') });
      });

      req.end(JSON.stringify(body));
    });
  }
}
```

- [ ] **Step 3.2: Lint + build clean**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

- [ ] **Step 3.3: Commit**

```bash
git add apps/api/src/notifications/push/apns-http2.client.ts
git commit -m "feat(api): ApnsHttp2Client (node:http2 POST to APNs)"
```

---

## Task 4: ApnsPushProvider

**Files:**
- Create: `apps/api/src/notifications/push/apns-push.provider.ts`
- Create: `apps/api/src/notifications/push/__tests__/apns-push.provider.spec.ts`

- [ ] **Step 4.1: Failing unit test**

Create `apps/api/src/notifications/push/__tests__/apns-push.provider.spec.ts`:

```typescript
import { ApnsPushProvider } from '../apns-push.provider';

function makeConfig(overrides: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    APNS_BUNDLE_ID: 'app.vittoria.client',
    APNS_USE_SANDBOX: false,
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

function makeTokenService() {
  return { getProviderToken: jest.fn().mockReturnValue('tok') } as never;
}

function makeHttp2(response: { status: number; apnsId: string | null; body: string }) {
  return { post: jest.fn().mockResolvedValue(response) };
}

describe('ApnsPushProvider.send', () => {
  it('sends an ios push to prod host and returns apnsId', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'apns-1', body: '' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    const res = await provider.send({
      token: 'ios-device',
      platform: 'ios',
      title: 'VITTORIA HOME',
      body: 'Заказ готов',
      data: { event: 'order.ready', orderId: 'o1' },
    });

    expect(res).toEqual({ providerMessageId: 'apns-1' });
    expect(http2.post).toHaveBeenCalledTimes(1);
    const [host, deviceToken, headers, payload] = http2.post.mock.calls[0];
    expect(host).toBe('api.push.apple.com');
    expect(deviceToken).toBe('ios-device');
    expect(headers.authorization).toBe('bearer tok');
    expect(headers['apns-topic']).toBe('app.vittoria.client');
    expect(headers['apns-push-type']).toBe('alert');
    expect(payload.aps.alert).toEqual({ title: 'VITTORIA HOME', body: 'Заказ готов' });
    expect(payload.event).toBe('order.ready');
    expect(payload.orderId).toBe('o1');
  });

  it('uses sandbox host when APNS_USE_SANDBOX is true', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'apns-2', body: '' });
    const provider = new ApnsPushProvider(
      makeConfig({ APNS_USE_SANDBOX: true }),
      makeTokenService(),
      http2 as never,
    );
    await provider.send({ token: 't', platform: 'ios', title: 'x', body: 'y' });
    expect(http2.post.mock.calls[0][0]).toBe('api.sandbox.push.apple.com');
  });

  it('omits custom data when message.data is empty (only aps)', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'a', body: '' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    await provider.send({ token: 't', platform: 'ios', title: 'x', body: 'y' });
    const payload = http2.post.mock.calls[0][3];
    expect(Object.keys(payload)).toEqual(['aps']);
  });

  it('throws for android platform without calling http2', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'a', body: '' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    await expect(
      provider.send({ token: 't', platform: 'android', title: 'x', body: 'y' }),
    ).rejects.toThrow(/iOS only/);
    expect(http2.post).not.toHaveBeenCalled();
  });

  it('throws with APNs reason on non-200 status', async () => {
    const http2 = makeHttp2({ status: 400, apnsId: null, body: '{"reason":"BadDeviceToken"}' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    await expect(
      provider.send({ token: 't', platform: 'ios', title: 'x', body: 'y' }),
    ).rejects.toThrow(/BadDeviceToken/);
  });
});
```

- [ ] **Step 4.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- apns-push.provider.spec.ts
```

- [ ] **Step 4.3: Implement `apps/api/src/notifications/push/apns-push.provider.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { ApnsTokenService } from './apns-token.service';
import { ApnsHttp2Client } from './apns-http2.client';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

interface ApnsErrorBody {
  reason?: string;
}

@Injectable()
export class ApnsPushProvider implements PushProvider {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: ApnsTokenService,
    private readonly http2: ApnsHttp2Client,
  ) {}

  async send(message: PushMessage): Promise<PushSendResult> {
    if (message.platform !== 'ios') {
      throw new Error('APNs handles iOS only');
    }

    const useSandbox = this.config.get('APNS_USE_SANDBOX', { infer: true });
    const host = useSandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const bundleId = this.config.get('APNS_BUNDLE_ID', { infer: true });
    const token = this.tokenService.getProviderToken();

    const headers: Record<string, string> = {
      authorization: `bearer ${token}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
    };

    const payload: Record<string, unknown> = {
      aps: { alert: { title: message.title, body: message.body } },
    };
    if (message.data && Object.keys(message.data).length > 0) {
      Object.assign(payload, message.data);
    }

    const res = await this.http2.post(host, message.token, headers, payload);

    if (res.status !== 200) {
      let reason = 'unknown';
      try {
        reason = (JSON.parse(res.body) as ApnsErrorBody).reason ?? 'unknown';
      } catch {
        reason = res.body || 'unknown';
      }
      throw new Error(`APNs ${res.status}: ${reason}`);
    }

    return { providerMessageId: res.apnsId ?? '' };
  }
}
```

- [ ] **Step 4.4: Run, expect PASS** (5 tests).

```bash
pnpm --filter @vittoria/api test:unit -- apns-push.provider.spec.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/notifications/push/apns-push.provider.ts apps/api/src/notifications/push/__tests__/apns-push.provider.spec.ts
git commit -m "feat(api): ApnsPushProvider (APNs HTTP/2 alert push for iOS)"
```

---

## Task 5: CompositePushProvider + PushModule factory

**Files:**
- Create: `apps/api/src/notifications/push/composite-push.provider.ts`
- Create: `apps/api/src/notifications/push/__tests__/composite-push.provider.spec.ts`
- Modify: `apps/api/src/notifications/push/push.module.ts`

- [ ] **Step 5.1: Failing unit test**

Create `apps/api/src/notifications/push/__tests__/composite-push.provider.spec.ts`:

```typescript
import { CompositePushProvider } from '../composite-push.provider';
import type { PushMessage } from '../push.types';

function makeProvider(id: string) {
  return { send: jest.fn().mockResolvedValue({ providerMessageId: id }) };
}

const base: Omit<PushMessage, 'platform'> = { token: 't', title: 'x', body: 'y' };

describe('CompositePushProvider.send', () => {
  it('routes ios to apns', async () => {
    const fcm = makeProvider('fcm');
    const apns = makeProvider('apns');
    const composite = new CompositePushProvider(fcm as never, apns as never);
    const res = await composite.send({ ...base, platform: 'ios' });
    expect(res.providerMessageId).toBe('apns');
    expect(apns.send).toHaveBeenCalledTimes(1);
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('routes android to fcm', async () => {
    const fcm = makeProvider('fcm');
    const apns = makeProvider('apns');
    const composite = new CompositePushProvider(fcm as never, apns as never);
    const res = await composite.send({ ...base, platform: 'android' });
    expect(res.providerMessageId).toBe('fcm');
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(apns.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- composite-push.provider.spec.ts
```

- [ ] **Step 5.3: Implement `apps/api/src/notifications/push/composite-push.provider.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { FcmPushProvider } from './fcm-push.provider';
import { ApnsPushProvider } from './apns-push.provider';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

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

- [ ] **Step 5.4: Run, expect PASS** (2 tests).

```bash
pnpm --filter @vittoria/api test:unit -- composite-push.provider.spec.ts
```

- [ ] **Step 5.5: Update `apps/api/src/notifications/push/push.module.ts`**

Full new content:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { DevPushProvider } from './dev-push.provider';
import { FcmTokenService } from './fcm-token.service';
import { FcmPushProvider } from './fcm-push.provider';
import { ApnsTokenService } from './apns-token.service';
import { ApnsHttp2Client } from './apns-http2.client';
import { ApnsPushProvider } from './apns-push.provider';
import { CompositePushProvider } from './composite-push.provider';
import { PUSH_PROVIDER } from './push.types';

@Module({
  providers: [
    DevPushProvider,
    FcmTokenService,
    FcmPushProvider,
    ApnsTokenService,
    ApnsHttp2Client,
    ApnsPushProvider,
    CompositePushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, DevPushProvider, CompositePushProvider],
      useFactory: (config: ConfigService<Env, true>, dev: DevPushProvider, composite: CompositePushProvider) =>
        config.get('PUSH_PROVIDER_MODE', { infer: true }) === 'real' ? composite : dev,
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
```

- [ ] **Step 5.6: Lint + build clean**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

Build must be clean — DI resolves: `CompositePushProvider` needs `FcmPushProvider` + `ApnsPushProvider`; `ApnsPushProvider` needs `ConfigService` + `ApnsTokenService` + `ApnsHttp2Client`; all registered. Default `dev` → `DevPushProvider` unchanged.

- [ ] **Step 5.7: Run full unit suite**

```bash
pnpm --filter @vittoria/api test:unit
```

Expected ~119 unit (107 prior + 3 env + 2 token + 5 push + 2 composite). All green.

- [ ] **Step 5.8: Commit**

```bash
git add apps/api/src/notifications/push
git commit -m "feat(api): CompositePushProvider + PushModule routes ios→APNs/android→FCM in real mode"
```

---

## Task 6: Full Verification + Push

- [ ] **Step 6.1: Clean infra + full suite from root**

```bash
pnpm dev:infra
docker exec infra-redis-1 redis-cli FLUSHALL
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All packages green. **Critical regression:** existing notification e2e run in default `dev` mode (no `PUSH_PROVIDER_MODE` set) → `DevPushProvider`, so push behavior is unchanged; the composite/APNs code is only reached in `real` mode. If `prisma.e2e-spec.ts` shows a `Connection is closed` teardown flake, it's the known BullMQ↔ioredis teardown race (not a regression) — rerun on clean infra (`pnpm dev:infra:down && pnpm dev:infra`) to confirm green.

- [ ] **Step 6.2: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 6.3: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions, confirm latest run green.

---

## Definition of Done

- [x] env: `APNS_KEY_ID/TEAM_ID/PRIVATE_KEY/BUNDLE_ID/USE_SANDBOX` + combined refine (real → FCM_* AND APNS_*).
- [x] `ApnsTokenService`: ES256 JWT (node:crypto `dsaEncoding: 'ieee-p1363'`) + cache (~50 min).
- [x] `ApnsHttp2Client`: node:http2 POST /3/device/{token} → status/apnsId/body.
- [x] `ApnsPushProvider`: ios → APNs (bearer, apns-topic, alert); android → throw; non-200 → throw with reason; sandbox/prod host by flag.
- [x] `CompositePushProvider`: ios → apns, android → fcm.
- [x] `PushModule` factory `real` → composite; default dev → DevPushProvider.
- [x] Unit ≥12 (env 3, token 2, push 5, composite 2) via mocked client + generated EC keypair.
- [x] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` green (4/4b/4c regression intact).
- [x] GitHub Actions CI green.

Deploy-runbook note: prod `PUSH_PROVIDER_MODE=real` now requires both `FCM_*` and `APNS_*` (`.p8` key, key_id, team_id, bundle_id); `APNS_USE_SANDBOX` per environment.

After Plan 4d the push subsystem is complete (both platforms). Next: **Admin/Partner SPA** (frontend).

---

**End of Plan 4d.**
