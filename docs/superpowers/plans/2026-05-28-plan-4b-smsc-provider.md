# Plan 4b: Real SMS Provider (SMSC.ru) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить mock `DevSmsProvider` на реальный `SmscSmsProvider`, отправляющий SMS через SMSC.ru HTTP API (`POST /sys/send.php`, `fmt=3` JSON). Уведомления с `sms: true` в `CHANNEL_MATRIX` (сейчас `order.ready`) пойдут настоящими SMS.

**Architecture:** Существующая абстракция `SmsProvider` (DI-токен `SMS_PROVIDER`) — единственная точка подключения; `NotificationsProcessor` зависит только от интерфейса и не меняется. `SmsModule` переключается с `useClass: DevSmsProvider` на `useClass: SmscSmsProvider`. `DevSmsProvider` и mode-switch удаляются. Конфиг через `ConfigService<Env>`; в проде credentials обязательны (Zod refine).

**Tech Stack:** NestJS, `axios` (уже в проекте), `@nestjs/config` + Zod env schema, Jest (`jest.mock('axios')` — `nock` в проекте нет).

**Reference spec:** [docs/superpowers/specs/2026-05-28-plan-4b-smsc-provider-design.md](../specs/2026-05-28-plan-4b-smsc-provider-design.md)

**Prerequisites:**
- Plans 1–6 завершены. `main` на `10bd7b9` или позднее.
- Docker Desktop running (`pnpm dev:infra`).
- 88 unit + 79 e2e зелёные.

**Out of scope (per design §8):** FCM/APNs push (Plan 4c), SMS-fallback при push failure, маппинг SMSC error_code, status.php/баланс, MD5-пароль.

---

## File Structure

```
apps/api/src/config/
├── env.schema.ts                         ← MODIFY (+SMSC_* fields, +production refine)
└── __tests__/env.schema.spec.ts          ← MODIFY (+production-requires-credentials test)

apps/api/src/sms/
├── smsc-sms.provider.ts                  ← NEW (SmsProvider via SMSC.ru)
├── sms.module.ts                         ← MODIFY (useClass SmscSmsProvider)
├── dev-sms.provider.ts                   ← DELETE
└── __tests__/
    ├── smsc-sms.provider.spec.ts         ← NEW (jest.mock axios)
    └── dev-sms.provider.spec.ts          ← DELETE
```

No e2e changes — provider is unit-tested; existing notification e2e assert enqueue (not worker execution) and stay green.

---

## Task 1: Env Schema — SMSC config + production refine

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/__tests__/env.schema.spec.ts`

- [ ] **Step 1.1: Add failing test for production-requires-credentials**

Append to `apps/api/src/config/__tests__/env.schema.spec.ts` inside the existing `describe('envSchema', ...)` block (the `valid` fixture is already defined there with `NODE_ENV: 'development'`):

```typescript
  it('accepts production env with SMSC credentials', () => {
    const parsed = envSchema.parse({
      ...valid,
      NODE_ENV: 'production',
      SMSC_LOGIN: 'acme',
      SMSC_PASSWORD: 'secret',
    });
    expect(parsed.SMSC_LOGIN).toBe('acme');
  });

  it('rejects production env without SMSC credentials', () => {
    expect(() =>
      envSchema.parse({ ...valid, NODE_ENV: 'production' }),
    ).toThrow(/SMSC/);
  });

  it('allows empty SMSC credentials in development', () => {
    const parsed = envSchema.parse({ ...valid, NODE_ENV: 'development' });
    expect(parsed.SMSC_LOGIN).toBe('');
    expect(parsed.SMSC_BASE_URL).toBe('https://smsc.ru');
  });
```

- [ ] **Step 1.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- env.schema.spec.ts
```

Expected: the two new SMSC-field/refine tests fail (`SMSC_LOGIN` undefined; no refine yet).

- [ ] **Step 1.3: Add SMSC fields + refine to `apps/api/src/config/env.schema.ts`**

Read the file. Add the 4 fields inside the `z.object({ ... })` (after the last `AMOCRM_*` field, before the closing `})`):

```typescript
  SMSC_LOGIN: z.string().default(''),
  SMSC_PASSWORD: z.string().default(''),
  SMSC_SENDER: z.string().default(''),
  SMSC_BASE_URL: z.string().url().default('https://smsc.ru'),
```

Then wrap the object with a `.refine(...)`. Change:
```typescript
export const envSchema = z.object({
  ...
});

export type Env = z.infer<typeof envSchema>;
```
to:
```typescript
export const envSchema = z
  .object({
    ...
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || (env.SMSC_LOGIN !== '' && env.SMSC_PASSWORD !== ''),
    { message: 'SMSC_LOGIN and SMSC_PASSWORD are required when NODE_ENV=production' },
  );

export type Env = z.infer<typeof envSchema>;
```

(`z.infer` works through `ZodEffects` from `.refine`, so `Env` is unchanged. `envSchema.parse(...)` also works on `ZodEffects`. The config module's only usage is `.parse` — confirmed no `.shape`/`.partial` usage that `ZodEffects` would break.)

- [ ] **Step 1.4: Run, expect PASS**

```bash
pnpm --filter @vittoria/api test:unit -- env.schema.spec.ts
```

All env tests pass (existing 3 + new 3).

- [ ] **Step 1.5: Build clean**

```bash
pnpm --filter @vittoria/api build
```

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/src/config
git commit -m "feat(api): SMSC env config + production credential refine"
```

---

## Task 2: SmscSmsProvider (TDD via jest.mock axios)

**Files:**
- Create: `apps/api/src/sms/smsc-sms.provider.ts`
- Create: `apps/api/src/sms/__tests__/smsc-sms.provider.spec.ts`

- [ ] **Step 2.1: Failing unit test**

Create `apps/api/src/sms/__tests__/smsc-sms.provider.spec.ts`:

```typescript
import axios from 'axios';
import { SmscSmsProvider } from '../smsc-sms.provider';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    SMSC_LOGIN: 'acme',
    SMSC_PASSWORD: 'secret',
    SMSC_SENDER: '',
    SMSC_BASE_URL: 'https://smsc.test',
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

describe('SmscSmsProvider', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('posts to /sys/send.php and returns providerMessageId on success', async () => {
    mockedPost.mockResolvedValue({ data: { id: 12345, cnt: 1 } });
    const provider = new SmscSmsProvider(makeConfig());
    const res = await provider.send({ to: '+79991112233', text: 'Привет' });

    expect(res).toEqual({ providerMessageId: '12345' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toBe('https://smsc.test/sys/send.php');
    // body is URLSearchParams
    const params = body as URLSearchParams;
    expect(params.get('login')).toBe('acme');
    expect(params.get('psw')).toBe('secret');
    expect(params.get('phones')).toBe('+79991112233');
    expect(params.get('mes')).toBe('Привет');
    expect(params.get('fmt')).toBe('3');
    expect(params.get('charset')).toBe('utf-8');
  });

  it('omits sender when SMSC_SENDER is empty', async () => {
    mockedPost.mockResolvedValue({ data: { id: 1, cnt: 1 } });
    const provider = new SmscSmsProvider(makeConfig({ SMSC_SENDER: '' }));
    await provider.send({ to: '+79990000000', text: 'x' });
    const params = mockedPost.mock.calls[0][1] as URLSearchParams;
    expect(params.has('sender')).toBe(false);
  });

  it('includes sender when SMSC_SENDER is set', async () => {
    mockedPost.mockResolvedValue({ data: { id: 1, cnt: 1 } });
    const provider = new SmscSmsProvider(makeConfig({ SMSC_SENDER: 'VITTORIA' }));
    await provider.send({ to: '+79990000000', text: 'x' });
    const params = mockedPost.mock.calls[0][1] as URLSearchParams;
    expect(params.get('sender')).toBe('VITTORIA');
  });

  it('throws on SMSC error response', async () => {
    mockedPost.mockResolvedValue({ data: { error: 'authorize error', error_code: 2 } });
    const provider = new SmscSmsProvider(makeConfig());
    await expect(provider.send({ to: '+79990000000', text: 'x' })).rejects.toThrow(/2/);
  });

  it('propagates transport errors', async () => {
    mockedPost.mockRejectedValue(new Error('ETIMEDOUT'));
    const provider = new SmscSmsProvider(makeConfig());
    await expect(provider.send({ to: '+79990000000', text: 'x' })).rejects.toThrow(/ETIMEDOUT/);
  });
});
```

- [ ] **Step 2.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- smsc-sms.provider.spec.ts
```

Expected: module not found / `SmscSmsProvider` undefined.

- [ ] **Step 2.3: Implement `apps/api/src/sms/smsc-sms.provider.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Env } from '../config/env.schema';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

interface SmscResponse {
  id?: number;
  cnt?: number;
  error?: string;
  error_code?: number;
}

@Injectable()
export class SmscSmsProvider implements SmsProvider {
  private readonly logger = new Logger(SmscSmsProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const baseUrl = this.config.get('SMSC_BASE_URL', { infer: true }).replace(/\/$/, '');
    const sender = this.config.get('SMSC_SENDER', { infer: true });

    const params = new URLSearchParams();
    params.set('login', this.config.get('SMSC_LOGIN', { infer: true }));
    params.set('psw', this.config.get('SMSC_PASSWORD', { infer: true }));
    params.set('phones', message.to);
    params.set('mes', message.text);
    params.set('fmt', '3');
    params.set('charset', 'utf-8');
    if (sender) params.set('sender', sender);

    const res = await axios.post<SmscResponse>(`${baseUrl}/sys/send.php`, params, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = res.data;
    if (data.error || data.error_code) {
      this.logger.warn(`SMSC send failed: error_code=${data.error_code}`);
      throw new Error(`SMSC error ${data.error_code}: ${data.error ?? 'unknown'}`);
    }

    return { providerMessageId: String(data.id) };
  }
}
```

- [ ] **Step 2.4: Run, expect PASS** (5 tests).

```bash
pnpm --filter @vittoria/api test:unit -- smsc-sms.provider.spec.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/sms/smsc-sms.provider.ts apps/api/src/sms/__tests__/smsc-sms.provider.spec.ts
git commit -m "feat(api): SmscSmsProvider (SMSC.ru HTTP SMS sender)"
```

---

## Task 3: Wire SmsModule + delete DevSmsProvider

**Files:**
- Modify: `apps/api/src/sms/sms.module.ts`
- Delete: `apps/api/src/sms/dev-sms.provider.ts`
- Delete: `apps/api/src/sms/__tests__/dev-sms.provider.spec.ts`

- [ ] **Step 3.1: Replace `apps/api/src/sms/sms.module.ts`**

Full new content:

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

- [ ] **Step 3.2: Delete the dev provider + its spec**

```bash
rm apps/api/src/sms/dev-sms.provider.ts
rm apps/api/src/sms/__tests__/dev-sms.provider.spec.ts
```

- [ ] **Step 3.3: Confirm no dangling references**

Use the Grep tool: search `DevSmsProvider` and `dev-sms` across `apps/api/src` and `apps/api/test`. Expected: 0 matches. (Pre-task grep confirmed the only references were the module, the provider file, and its spec — all now removed/rewritten.)

- [ ] **Step 3.4: Lint + build clean**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

Build must be clean — no import of the deleted `dev-sms.provider`. `SmsModule` resolves `SmscSmsProvider`, which NestJS instantiates with the global `ConfigService`.

- [ ] **Step 3.5: Run full unit suite**

```bash
pnpm --filter @vittoria/api test:unit
```

Expected ~95 unit (88 prior + 3 new env + 5 new smsc − 1 deleted dev-sms test). The exact number isn't critical; what matters: all green, no reference to DevSmsProvider.

- [ ] **Step 3.6: Commit**

```bash
git add apps/api/src/sms
git commit -m "refactor(api): SmsModule uses SmscSmsProvider; remove DevSmsProvider"
```

---

## Task 4: Full Verification + Push

- [ ] **Step 4.1: Flush Redis + full suite from root**

```bash
docker exec infra-redis-1 redis-cli FLUSHALL
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All packages green. **Critical regression:** existing notification e2e (`notifications.e2e-spec.ts`, `chat-notifications.e2e-spec.ts`, `notification-templates.e2e-spec.ts`) must still pass — they assert job enqueue, not worker execution; removing `DevSmsProvider` and switching to `SmscSmsProvider` does not change enqueue behavior. If a worker asynchronously picks up an `order.ready` job, `SmscSmsProvider.send` will attempt a real HTTP POST with empty test credentials → error caught by `NotificationsProcessor` try/catch (warning log, job retry) → test does not fail.

- [ ] **Step 4.2: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 4.3: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions, confirm latest run green.

---

## Definition of Done

- [x] `SmscSmsProvider implements SmsProvider`: POST form-urlencoded to `{SMSC_BASE_URL}/sys/send.php`, `fmt=3`, returns `{providerMessageId}` or throws on error/transport-fail.
- [x] `SmsModule` uses `SmscSmsProvider`; `DevSmsProvider` + spec deleted; 0 dangling refs.
- [x] env: `SMSC_LOGIN/PASSWORD/SENDER/BASE_URL` + production refine (login/psw required when `NODE_ENV=production`).
- [x] Unit tests (≥5 SMSC via `jest.mock('axios')`: success, request body, sender on/off, SMSC error, transport error; +3 env tests).
- [x] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` green (Plan 4/5 notification regression intact).
- [x] GitHub Actions CI green.

After Plan 4b → **Plan 4c** (real push: FCM Android + APNs iOS).

---

**End of Plan 4b.**
