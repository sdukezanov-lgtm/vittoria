# Backend Gap A: /service/contact + SMS.ru fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) Add `GET /service/contact` returning the service phone/hours from config. (2) Add an SMS.ru provider used as an automatic fallback when SMSC.ru send fails (spec §7.5, decision #7).

**Architecture:** New `ServiceModule` (config-driven controller). SMS: a new `SmsRuProvider` + a `FallbackSmsProvider` wrapper (try primary → on error try fallback), wired in the existing `SmsModule` factory. New env vars with safe defaults.

**Tech Stack:** NestJS 10, TypeScript, Jest unit tests, axios.

**Single-file test command:** `pnpm --filter @vittoria/api exec jest <pattern>`

---

### Task 1: SMS.ru provider + fallback wrapper

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/sms/smsru-sms.provider.ts`
- Create: `apps/api/src/sms/fallback-sms.provider.ts`
- Modify: `apps/api/src/sms/sms.module.ts`
- Test: `apps/api/src/sms/__tests__/smsru-sms.provider.spec.ts`
- Test: `apps/api/src/sms/__tests__/fallback-sms.provider.spec.ts`

- [ ] **Step 1: Add env vars.** In `apps/api/src/config/env.schema.ts`, add inside the `z.object({ … })` (next to the SMSC_* lines):
```ts
  SMS_RU_API_ID: z.string().default(''),
  SMS_RU_BASE_URL: z.string().url().default('https://sms.ru'),
```

- [ ] **Step 2: Write the failing tests.**
`apps/api/src/sms/__tests__/smsru-sms.provider.spec.ts`:
```ts
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SmsRuProvider } from '../smsru-sms.provider';

jest.mock('axios');

function configStub(): ConfigService {
  const values: Record<string, string> = { SMS_RU_API_ID: 'api-123', SMS_RU_BASE_URL: 'https://sms.ru' };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('SmsRuProvider', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sends and returns the sms_id on status OK', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { status: 'OK', status_code: 100, sms: { '79990000000': { status: 'OK', status_code: 100, sms_id: 'X-1' } } },
    });
    const provider = new SmsRuProvider(configStub());
    const res = await provider.send({ to: '79990000000', text: 'hi' });
    expect(res.providerMessageId).toBe('X-1');
    const [url] = (axios.post as jest.Mock).mock.calls[0];
    expect(url).toContain('https://sms.ru/sms/send');
  });

  it('throws on ERROR status', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { status: 'ERROR', status_code: 200, status_text: 'bad' } });
    const provider = new SmsRuProvider(configStub());
    await expect(provider.send({ to: '79990000000', text: 'hi' })).rejects.toThrow(/SMS\.ru/);
  });
});
```
`apps/api/src/sms/__tests__/fallback-sms.provider.spec.ts`:
```ts
import { FallbackSmsProvider } from '../fallback-sms.provider';
import type { SmsProvider } from '../sms.types';

function provider(impl: SmsProvider['send']): SmsProvider {
  return { send: impl };
}

describe('FallbackSmsProvider', () => {
  it('uses the primary when it succeeds (fallback not called)', async () => {
    const fallbackSend = jest.fn();
    const sut = new FallbackSmsProvider(
      provider(async () => ({ providerMessageId: 'p-1' })),
      provider(fallbackSend),
    );
    const res = await sut.send({ to: '79990000000', text: 'hi' });
    expect(res.providerMessageId).toBe('p-1');
    expect(fallbackSend).not.toHaveBeenCalled();
  });

  it('falls back when the primary throws', async () => {
    const sut = new FallbackSmsProvider(
      provider(async () => { throw new Error('primary down'); }),
      provider(async () => ({ providerMessageId: 'f-1' })),
    );
    const res = await sut.send({ to: '79990000000', text: 'hi' });
    expect(res.providerMessageId).toBe('f-1');
  });

  it('rethrows when both fail', async () => {
    const sut = new FallbackSmsProvider(
      provider(async () => { throw new Error('primary down'); }),
      provider(async () => { throw new Error('fallback down'); }),
    );
    await expect(sut.send({ to: '79990000000', text: 'hi' })).rejects.toThrow(/fallback down/);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `pnpm --filter @vittoria/api exec jest sms/__tests__/smsru sms/__tests__/fallback`.

- [ ] **Step 4: Implement.**
`apps/api/src/sms/smsru-sms.provider.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { Env } from '../config/env.schema';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

interface SmsRuResponse {
  status?: string;
  status_code?: number;
  status_text?: string;
  sms?: Record<string, { status?: string; sms_id?: string }>;
}

@Injectable()
export class SmsRuProvider implements SmsProvider {
  private readonly logger = new Logger(SmsRuProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const baseUrl = this.config.get('SMS_RU_BASE_URL', { infer: true }).replace(/\/$/, '');
    const params = new URLSearchParams();
    params.set('api_id', this.config.get('SMS_RU_API_ID', { infer: true }));
    params.set('to', message.to);
    params.set('msg', message.text);
    params.set('json', '1');

    const res = await axios.post<SmsRuResponse>(`${baseUrl}/sms/send`, params, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = res.data;
    if (data.status !== 'OK') {
      this.logger.warn(`SMS.ru send failed: status_code=${data.status_code}`);
      throw new Error(`SMS.ru error ${data.status_code}: ${data.status_text ?? 'unknown'}`);
    }
    const first = data.sms ? Object.values(data.sms)[0] : undefined;
    return { providerMessageId: first?.sms_id ?? 'smsru-unknown' };
  }
}
```
`apps/api/src/sms/fallback-sms.provider.ts`:
```ts
import { Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

/** Tries the primary provider; on failure, falls back to the secondary. */
export class FallbackSmsProvider implements SmsProvider {
  private readonly logger = new Logger(FallbackSmsProvider.name);

  constructor(
    private readonly primary: SmsProvider,
    private readonly fallback: SmsProvider,
  ) {}

  async send(message: SmsMessage): Promise<SmsSendResult> {
    try {
      return await this.primary.send(message);
    } catch (err) {
      this.logger.warn(`primary SMS failed, falling back: ${(err as Error).message}`);
      return this.fallback.send(message);
    }
  }
}
```

- [ ] **Step 5: Wire the module.** Replace `apps/api/src/sms/sms.module.ts` with:
```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { DevSmsProvider } from './dev-sms.provider';
import { SmscSmsProvider } from './smsc-sms.provider';
import { SmsRuProvider } from './smsru-sms.provider';
import { FallbackSmsProvider } from './fallback-sms.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms.types';

@Module({
  providers: [
    DevSmsProvider,
    SmscSmsProvider,
    SmsRuProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, DevSmsProvider, SmscSmsProvider, SmsRuProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        dev: DevSmsProvider,
        smsc: SmscSmsProvider,
        smsru: SmsRuProvider,
      ): SmsProvider => {
        if (config.get('SMS_PROVIDER_MODE', { infer: true }) !== 'smsc') return dev;
        if (config.get('SMS_RU_API_ID', { infer: true })) return new FallbackSmsProvider(smsc, smsru);
        return smsc;
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
```

- [ ] **Step 6: Run, expect PASS** — `pnpm --filter @vittoria/api exec jest sms/__tests__/smsru sms/__tests__/fallback`.

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/config/env.schema.ts apps/api/src/sms/smsru-sms.provider.ts apps/api/src/sms/fallback-sms.provider.ts apps/api/src/sms/sms.module.ts apps/api/src/sms/__tests__/smsru-sms.provider.spec.ts apps/api/src/sms/__tests__/fallback-sms.provider.spec.ts
git commit -m "feat(api): SMS.ru provider + SMSC->SMS.ru fallback"
```

---

### Task 2: GET /service/contact

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/service/service.controller.ts`
- Create: `apps/api/src/service/service.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/service/__tests__/service.controller.spec.ts`

- [ ] **Step 1: Add env vars.** In `apps/api/src/config/env.schema.ts`, add inside the `z.object`:
```ts
  SERVICE_CONTACT_PHONE: z.string().default('+78000000000'),
  SERVICE_CONTACT_HOURS: z.string().default('Пн–Пт 9:00–18:00'),
```

- [ ] **Step 2: Write the failing test** — `apps/api/src/service/__tests__/service.controller.spec.ts`:
```ts
import { ConfigService } from '@nestjs/config';
import { ServiceController } from '../service.controller';

describe('ServiceController', () => {
  it('returns the configured service contact', () => {
    const values: Record<string, string> = { SERVICE_CONTACT_PHONE: '+79990001122', SERVICE_CONTACT_HOURS: 'Пн–Пт' };
    const config = { get: (k: string) => values[k] } as unknown as ConfigService;
    const controller = new ServiceController(config);
    expect(controller.contact()).toEqual({ phone: '+79990001122', hours: 'Пн–Пт' });
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `pnpm --filter @vittoria/api exec jest service/__tests__/service.controller`.

- [ ] **Step 4: Implement.**
`apps/api/src/service/service.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../common/decorators/roles.decorator';
import type { Env } from '../config/env.schema';

@Controller('service')
@Roles('client', 'admin', 'partner')
export class ServiceController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get('contact')
  contact(): { phone: string; hours: string } {
    return {
      phone: this.config.get('SERVICE_CONTACT_PHONE', { infer: true }),
      hours: this.config.get('SERVICE_CONTACT_HOURS', { infer: true }),
    };
  }
}
```
`apps/api/src/service/service.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';

@Module({
  controllers: [ServiceController],
})
export class ServiceModule {}
```

- [ ] **Step 5: Register the module.** In `apps/api/src/app.module.ts`, add the import `import { ServiceModule } from './service/service.module';` and add `ServiceModule,` to the `imports` array (e.g. after `HealthModule,`).

- [ ] **Step 6: Run, expect PASS** — `pnpm --filter @vittoria/api exec jest service/__tests__/service.controller`.

- [ ] **Step 7: Full backend gates** — `pnpm --filter @vittoria/api test:unit` (all pass), `pnpm --filter @vittoria/api build` (clean), `pnpm --filter @vittoria/api lint` (clean).

- [ ] **Step 8: Commit**
```bash
git add apps/api/src/config/env.schema.ts apps/api/src/service/service.controller.ts apps/api/src/service/service.module.ts apps/api/src/app.module.ts apps/api/src/service/__tests__/service.controller.spec.ts
git commit -m "feat(api): GET /service/contact (config-driven service phone/hours)"
```

---

## Self-Review

- SMS.ru provider (axios, json=1, sms_id) → Task 1. ✓
- SMSC→SMS.ru fallback on failure → Task 1 (FallbackSmsProvider + factory). ✓
- Fallback only active in `smsc` mode when `SMS_RU_API_ID` set; dev mode unchanged (safe default) → Task 1. ✓
- `GET /service/contact` config-driven → Task 2. ✓
- env vars all have safe defaults (no broken parse) → both tasks. ✓
- Unit tests pin behavior; e2e suite must stay green (Task 2 Step 7). ✓
