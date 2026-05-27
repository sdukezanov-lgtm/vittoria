# Plan 4: Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin changes order stage or progress, the client device receives a push notification (and SMS for the critical "ready for delivery" event). Closes the spec's central UX promise: the client always knows what's happening with their order without calling the company.

**Architecture:** A `NotificationService` exposes a single `send(userId, event, payload)` entry point. Internally it enqueues jobs to a BullMQ `notifications` queue. A worker fans the job out to mocked-provider implementations of push (`PushProvider`) and SMS (`SmsProvider` — already exists from Plan 1). The OrdersService emits an in-process event (`@nestjs/event-emitter`) on `order.progress.updated`; a handler in the notifications module subscribes and calls `send`. Dedup via Redis SET-NX (60s sliding window). Quiet hours (22:00–09:00 Moscow time) defer non-critical push jobs to 09:00 via BullMQ delayed jobs. Real FCM/APNs/SMSC.ru providers are out of scope (Plan 4b when credentials are available).

**Tech Stack:**
- New dep: `@nestjs/event-emitter` (~14 KB)
- Reuses BullMQ (Plan 2 Task 6), PrismaService, RedisService, AuditService, OrdersService
- Templates: hardcoded TypeScript constants for Plan 4 (no DB table yet — YAGNI; will move to DB in Plan 6 web admin when content editing is needed)

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](../specs/2026-05-26-vittoria-home-mvp-design.md) — sections 4 (push_tokens schema), 7.2 (`/me/push-tokens` endpoints), 9 (notification strategy table), 11.5 (chat event — not in scope here).

**Out of scope (later plans / external):**
- Real FCM (Android) / APNs (iOS) / SMSC.ru providers — Plan 4b, requires credentials and a Firebase project / Apple developer account / SMSC.ru contract.
- Chat events (`chat.reply.received`) — Plan 5 (Chat).
- "Initial onboarding SMS" on order creation (link to App Store / Google Play) — handled in Plan 4b once real SMS is wired (no point sending with a mock).
- DB-backed editable notification templates — Plan 6 web admin.
- Push notification stats / open rates dashboards — operational, deferred.
- Per-user notification preferences (mute, channel toggles) — Plan 5 or later.

**Notification matrix for Plan 4** (subset of spec section 9 that we can implement without real-channel SMS fallback logic):

| Event | Push | SMS | Critical (bypass quiet hours)? |
|---|---|---|---|
| `order.stage.changed` | yes | no | no |
| `order.progress.changed` (delta ≥ 10) | yes | no | no |
| `order.ready` (stage = `ready_for_delivery`) | yes | yes | yes |

"SMS fallback when push fails within 5 minutes" — deliberately deferred to Plan 4b. It requires real push provider error semantics (FCM `NotRegistered`, APNs reply tokens) which don't exist in mock mode.

**Prerequisites for execution:**
- Plans 1, 2, 3 complete. `main` is `859ef25` or later.
- Docker Desktop running (`pnpm dev:infra` — postgres + redis).
- 31 unit + 42 e2e tests green.

---

## File Structure

After this plan completes, two new directories appear:

```
apps/api/src/notifications/
├── notifications.module.ts                ← NEW
├── notifications.service.ts               ← NEW (send entrypoint)
├── notifications.types.ts                 ← NEW (event names, payloads, channel matrix)
├── notifications.templates.ts             ← NEW (hardcoded message bodies)
├── notifications.dedup.service.ts         ← NEW (Redis SET NX 60s)
├── notifications.quiet-hours.ts           ← NEW (pure function: is-quiet, defer-until)
├── push/
│   ├── push.types.ts                      ← NEW (PushProvider, PushMessage)
│   ├── dev-push.provider.ts               ← NEW (logs to console)
│   └── push.module.ts                     ← NEW
├── jobs/
│   └── notifications.processor.ts         ← NEW (BullMQ worker)
├── listeners/
│   └── order-progress.listener.ts         ← NEW (event-emitter subscriber)
├── push-tokens.controller.ts              ← NEW (/me/push-tokens)
├── dto/
│   ├── register-push-token.dto.ts         ← NEW
│   └── notification-payload.dto.ts        ← NEW (typed event payloads)
└── __tests__/
    ├── notifications.service.spec.ts      ← NEW
    ├── notifications.dedup.service.spec.ts← NEW
    ├── notifications.quiet-hours.spec.ts  ← NEW
    └── dev-push.provider.spec.ts          ← NEW

apps/api/src/orders/
└── orders.service.ts                      ← MODIFY: emit 'order.progress.updated' event

apps/api/prisma/
└── migrations/<ts>_add_push_tokens/
    └── migration.sql                      ← NEW
```

Test e2e files:
```
apps/api/test/
├── push-tokens.e2e-spec.ts                ← NEW
└── notifications.e2e-spec.ts              ← NEW (full PATCH→push pipeline)
```

**Responsibility split:**
- `notifications.service.ts` — the public API. Only it touches the queue. Knows about events and templates.
- `push/` — provider abstraction. Adding FCM later means adding a new file here without touching service.
- `jobs/` — BullMQ workers, isolated from HTTP layer.
- `listeners/` — adapter between domain events and notification dispatch. Keeps `orders.service.ts` ignorant of notifications.
- `push-tokens.controller.ts` — sits in notifications module because token lifecycle is part of notifications, not user profile.

---

## Task 1: Prisma Migration — PushToken Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_push_tokens/migration.sql`

- [ ] **Step 1.1: Add `PushPlatform` enum and `PushToken` model**

Read `apps/api/prisma/schema.prisma`. Add before `model AuditLog`:

```prisma
enum PushPlatform {
  ios
  android
}

model PushToken {
  id         String       @id @default(uuid()) @db.Uuid
  userId     String       @map("user_id") @db.Uuid
  platform   PushPlatform
  token      String
  deviceId   String       @map("device_id")
  createdAt  DateTime     @default(now()) @map("created_at")
  updatedAt  DateTime     @updatedAt @map("updated_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, deviceId])
  @@index([userId])
  @@map("push_tokens")
}
```

- [ ] **Step 1.2: Add the relation to `User` model**

In the `model User { ... }` block, add (next to existing relations like `authCodes`, `sessions`, `clientOrders`, `partnerOrders`):
```prisma
  pushTokens   PushToken[]
```

- [ ] **Step 1.3: Format and migrate**

```bash
cd apps/api && pnpm exec prisma format && pnpm exec prisma migrate dev --name add_push_tokens && cd ../..
```

Expected: `apps/api/prisma/migrations/<ts>_add_push_tokens/migration.sql` created, schema applied, Prisma Client regenerated.

- [ ] **Step 1.4: Verify build clean**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add PushToken Prisma model + migration"
```

---

## Task 2: Notification Types + Templates + Quiet-Hours Helper

**Files:**
- Create: `apps/api/src/notifications/notifications.types.ts`
- Create: `apps/api/src/notifications/notifications.templates.ts`
- Create: `apps/api/src/notifications/notifications.quiet-hours.ts`
- Create: `apps/api/src/notifications/__tests__/notifications.quiet-hours.spec.ts`

- [ ] **Step 2.1: Create `apps/api/src/notifications/notifications.types.ts`**

```typescript
export type NotificationEvent =
  | 'order.stage.changed'
  | 'order.progress.changed'
  | 'order.ready';

export interface OrderStageChangedPayload {
  orderId: string;
  contractNumber: string | null;
  productName: string | null;
  newStage: string;
  oldStage: string;
}

export interface OrderProgressChangedPayload {
  orderId: string;
  contractNumber: string | null;
  productName: string | null;
  newPercent: number;
  oldPercent: number;
}

export interface OrderReadyPayload {
  orderId: string;
  contractNumber: string | null;
  productName: string | null;
}

export type NotificationPayload =
  | { event: 'order.stage.changed'; data: OrderStageChangedPayload }
  | { event: 'order.progress.changed'; data: OrderProgressChangedPayload }
  | { event: 'order.ready'; data: OrderReadyPayload };

export interface ChannelMatrixEntry {
  push: boolean;
  sms: boolean;
  critical: boolean;
}

export const CHANNEL_MATRIX: Record<NotificationEvent, ChannelMatrixEntry> = {
  'order.stage.changed': { push: true, sms: false, critical: false },
  'order.progress.changed': { push: true, sms: false, critical: false },
  'order.ready': { push: true, sms: true, critical: true },
};
```

- [ ] **Step 2.2: Create `apps/api/src/notifications/notifications.templates.ts`**

```typescript
import type {
  NotificationEvent,
  OrderProgressChangedPayload,
  OrderReadyPayload,
  OrderStageChangedPayload,
} from './notifications.types';

const STAGE_LABELS: Record<string, string> = {
  preparation_for_production: 'Подготовка для производства',
  detailing: 'Деталировка',
  materials_arrival: 'Поступление материалов на склад',
  production: 'Производство изделия',
  transfer_to_warehouse: 'Передача готового изделия на склад',
  completeness_check: 'Проверка комплектности товара',
  ready_for_delivery: 'Готовность к передаче клиенту',
};

export interface RenderedMessage {
  title: string;
  body: string;
}

export function renderTemplate(
  event: NotificationEvent,
  data: OrderStageChangedPayload | OrderProgressChangedPayload | OrderReadyPayload,
): RenderedMessage {
  switch (event) {
    case 'order.stage.changed': {
      const p = data as OrderStageChangedPayload;
      const label = STAGE_LABELS[p.newStage] ?? p.newStage;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : (p.productName ?? 'Ваш заказ');
      return {
        title: 'VITTORIA HOME',
        body: `${order}: новый этап — «${label}».`,
      };
    }
    case 'order.progress.changed': {
      const p = data as OrderProgressChangedPayload;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : (p.productName ?? 'Ваш заказ');
      return {
        title: 'VITTORIA HOME',
        body: `${order}: готовность ${p.newPercent}%.`,
      };
    }
    case 'order.ready': {
      const p = data as OrderReadyPayload;
      const order = p.contractNumber ? `Заказ ${p.contractNumber}` : (p.productName ?? 'Ваш заказ');
      return {
        title: 'VITTORIA HOME',
        body: `${order} готов к передаче. Сервисный отдел свяжется с вами.`,
      };
    }
  }
}
```

- [ ] **Step 2.3: Failing unit test for quiet hours**

Create `apps/api/src/notifications/__tests__/notifications.quiet-hours.spec.ts`:
```typescript
import { isQuietHour, deferUntilMorning } from '../notifications.quiet-hours';

describe('isQuietHour', () => {
  it('returns true at 23:30 Moscow time', () => {
    const date = new Date('2026-05-27T20:30:00Z'); // 23:30 MSK (UTC+3)
    expect(isQuietHour(date)).toBe(true);
  });

  it('returns true at 03:00 Moscow time', () => {
    const date = new Date('2026-05-28T00:00:00Z'); // 03:00 MSK
    expect(isQuietHour(date)).toBe(true);
  });

  it('returns false at 12:00 Moscow time', () => {
    const date = new Date('2026-05-27T09:00:00Z'); // 12:00 MSK
    expect(isQuietHour(date)).toBe(false);
  });

  it('returns false exactly at 09:00 Moscow time', () => {
    const date = new Date('2026-05-27T06:00:00Z'); // 09:00 MSK
    expect(isQuietHour(date)).toBe(false);
  });

  it('returns true exactly at 22:00 Moscow time', () => {
    const date = new Date('2026-05-27T19:00:00Z'); // 22:00 MSK
    expect(isQuietHour(date)).toBe(true);
  });
});

describe('deferUntilMorning', () => {
  it('returns delay in ms until 09:00 MSK same day if current is before 09:00', () => {
    const now = new Date('2026-05-27T02:00:00Z'); // 05:00 MSK
    const delay = deferUntilMorning(now);
    // 05:00 → 09:00 = 4 hours
    expect(delay).toBe(4 * 3600 * 1000);
  });

  it('returns delay in ms until next-day 09:00 MSK if current is 22:00+', () => {
    const now = new Date('2026-05-27T20:00:00Z'); // 23:00 MSK
    const delay = deferUntilMorning(now);
    // 23:00 → next 09:00 = 10 hours
    expect(delay).toBe(10 * 3600 * 1000);
  });
});
```

- [ ] **Step 2.4: Run, expect FAIL.**

```bash
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 2.5: Implement `apps/api/src/notifications/notifications.quiet-hours.ts`**

```typescript
const MSK_OFFSET_HOURS = 3;
const QUIET_START_HOUR = 22; // inclusive
const QUIET_END_HOUR = 9;    // exclusive

function mskHour(date: Date): number {
  return (date.getUTCHours() + MSK_OFFSET_HOURS) % 24;
}

export function isQuietHour(date: Date): boolean {
  const h = mskHour(date);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

export function deferUntilMorning(now: Date): number {
  // Compute next 09:00 MSK in UTC ms terms, return diff from `now`.
  const utcMs = now.getTime();
  // Find the UTC instant that corresponds to next 09:00 MSK.
  // 09:00 MSK = 06:00 UTC.
  const targetHourUtc = 6;
  const next = new Date(now);
  next.setUTCHours(targetHourUtc, 0, 0, 0);
  if (next.getTime() <= utcMs) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - utcMs;
}
```

- [ ] **Step 2.6: Run unit tests, expect PASS.**

- [ ] **Step 2.7: Commit**

```bash
git add apps/api/src/notifications
git commit -m "feat(api): notification types, templates, quiet-hours helper"
```

---

## Task 3: PushProvider Interface + DevPushProvider

**Files:**
- Create: `apps/api/src/notifications/push/push.types.ts`
- Create: `apps/api/src/notifications/push/dev-push.provider.ts`
- Create: `apps/api/src/notifications/push/push.module.ts`
- Create: `apps/api/src/notifications/__tests__/dev-push.provider.spec.ts`

- [ ] **Step 3.1: Create `apps/api/src/notifications/push/push.types.ts`**

```typescript
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushMessage {
  token: string;
  platform: 'ios' | 'android';
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  providerMessageId: string;
}

export interface PushProvider {
  send(message: PushMessage): Promise<PushSendResult>;
}
```

- [ ] **Step 3.2: Failing unit test**

Create `apps/api/src/notifications/__tests__/dev-push.provider.spec.ts`:
```typescript
import { Logger } from '@nestjs/common';
import { DevPushProvider } from '../push/dev-push.provider';

describe('DevPushProvider', () => {
  it('logs the message and returns a providerMessageId', async () => {
    const provider = new DevPushProvider();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const res = await provider.send({
      token: 'fcm-abc-123',
      platform: 'android',
      title: 'VITTORIA HOME',
      body: 'Test',
    });
    expect(res.providerMessageId).toMatch(/^dev-push-/);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('android'));
    spy.mockRestore();
  });
});
```

- [ ] **Step 3.3: Run, expect FAIL.**

- [ ] **Step 3.4: Implement `apps/api/src/notifications/push/dev-push.provider.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PushMessage, PushProvider, PushSendResult } from './push.types';

@Injectable()
export class DevPushProvider implements PushProvider {
  private readonly logger = new Logger(DevPushProvider.name);

  async send(message: PushMessage): Promise<PushSendResult> {
    const id = `dev-push-${randomUUID()}`;
    this.logger.log(
      `[DEV-PUSH] platform=${message.platform} token=${message.token.slice(0, 8)}... title="${message.title}" body="${message.body}" id=${id}`,
    );
    return { providerMessageId: id };
  }
}
```

- [ ] **Step 3.5: Run, expect PASS.**

- [ ] **Step 3.6: Create `apps/api/src/notifications/push/push.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DevPushProvider } from './dev-push.provider';
import { PUSH_PROVIDER } from './push.types';

@Module({
  providers: [
    {
      provide: PUSH_PROVIDER,
      useClass: DevPushProvider,
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
```

- [ ] **Step 3.7: Lint + build clean.**

- [ ] **Step 3.8: Commit**

```bash
git add apps/api/src/notifications
git commit -m "feat(api): PushProvider interface and DevPushProvider"
```

---

## Task 4: Dedup Service

**Files:**
- Create: `apps/api/src/notifications/notifications.dedup.service.ts`
- Create: `apps/api/src/notifications/__tests__/notifications.dedup.service.spec.ts`

- [ ] **Step 4.1: Failing unit test**

Create `apps/api/src/notifications/__tests__/notifications.dedup.service.spec.ts`:
```typescript
import { NotificationsDedupService } from '../notifications.dedup.service';

describe('NotificationsDedupService', () => {
  const makeRedis = () => {
    const store = new Map<string, string>();
    return {
      set: jest.fn(async (key: string, value: string, _mode: string, _unit: string, _ttl: number, flag: string) => {
        if (flag === 'NX' && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }),
    };
  };

  it('returns true on first call and false on duplicate within window', async () => {
    const redis = makeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsDedupService({ getClient: () => redis } as any);
    const first = await svc.shouldSend('u1', 'order.stage.changed', 'o1');
    const second = await svc.shouldSend('u1', 'order.stage.changed', 'o1');
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('treats different orders as independent', async () => {
    const redis = makeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsDedupService({ getClient: () => redis } as any);
    await svc.shouldSend('u1', 'order.stage.changed', 'o1');
    const other = await svc.shouldSend('u1', 'order.stage.changed', 'o2');
    expect(other).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run, expect FAIL.**

- [ ] **Step 4.3: Implement `apps/api/src/notifications/notifications.dedup.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const TTL_SEC = 60;

@Injectable()
export class NotificationsDedupService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Returns true if a notification for (userId, event, entityId) was NOT seen in the last TTL_SEC.
   * Returns false if it was — caller should skip sending.
   */
  async shouldSend(userId: string, event: string, entityId: string): Promise<boolean> {
    const key = `notif:dedup:${userId}:${event}:${entityId}`;
    const result = await this.redis.getClient().set(key, '1', 'EX', TTL_SEC, 'NX');
    return result === 'OK';
  }
}
```

- [ ] **Step 4.4: Run, expect PASS.**

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/notifications
git commit -m "feat(api): NotificationsDedupService (Redis SET NX, 60s window)"
```

---

## Task 5: NotificationsService — send entrypoint + Queue

**Files:**
- Create: `apps/api/src/notifications/notifications.service.ts`
- Create: `apps/api/src/notifications/__tests__/notifications.service.spec.ts`
- Modify: `apps/api/src/queues/queue-names.ts`

- [ ] **Step 5.1: Add queue name**

Modify `apps/api/src/queues/queue-names.ts`:
```typescript
export const QUEUE_AMOCRM_INBOUND = 'amocrm-inbound';
export const QUEUE_AMOCRM_OUTBOUND = 'amocrm-outbound';
export const QUEUE_NOTIFICATIONS = 'notifications';
```

- [ ] **Step 5.2: Failing unit test**

Create `apps/api/src/notifications/__tests__/notifications.service.spec.ts`:
```typescript
import { NotificationsService } from '../notifications.service';
import { CHANNEL_MATRIX } from '../notifications.types';
import { isQuietHour, deferUntilMorning } from '../notifications.quiet-hours';

jest.mock('../notifications.quiet-hours', () => ({
  isQuietHour: jest.fn().mockReturnValue(false),
  deferUntilMorning: jest.fn().mockReturnValue(0),
}));

describe('NotificationsService.send (unit)', () => {
  const makeDeps = () => {
    const dedup = { shouldSend: jest.fn().mockResolvedValue(true) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    return { dedup, queue };
  };

  beforeEach(() => {
    (isQuietHour as jest.Mock).mockReturnValue(false);
    (deferUntilMorning as jest.Mock).mockReturnValue(0);
  });

  it('enqueues a notification job with no delay during business hours', async () => {
    const { dedup, queue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.stage.changed', {
      orderId: 'ord-1',
      contractNumber: 'C-1',
      productName: 'Kitchen',
      newStage: 'production',
      oldStage: 'detailing',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.objectContaining({ userId: 'user-1', event: 'order.stage.changed' }),
      expect.objectContaining({ delay: 0 }),
    );
  });

  it('skips when dedup says duplicate', async () => {
    const { dedup, queue } = makeDeps();
    dedup.shouldSend.mockResolvedValue(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.stage.changed', {
      orderId: 'ord-1',
      contractNumber: null,
      productName: null,
      newStage: 'production',
      oldStage: 'detailing',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('defers non-critical events during quiet hours', async () => {
    const { dedup, queue } = makeDeps();
    (isQuietHour as jest.Mock).mockReturnValue(true);
    (deferUntilMorning as jest.Mock).mockReturnValue(7_200_000); // 2h
    expect(CHANNEL_MATRIX['order.stage.changed'].critical).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.stage.changed', {
      orderId: 'ord-1',
      contractNumber: null,
      productName: null,
      newStage: 'production',
      oldStage: 'detailing',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.any(Object),
      expect.objectContaining({ delay: 7_200_000 }),
    );
  });

  it('does NOT defer critical events during quiet hours', async () => {
    const { dedup, queue } = makeDeps();
    (isQuietHour as jest.Mock).mockReturnValue(true);
    expect(CHANNEL_MATRIX['order.ready'].critical).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsService(dedup as any, queue as any);
    await svc.send('user-1', 'order.ready', {
      orderId: 'ord-1',
      contractNumber: 'C-1',
      productName: 'Kitchen',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      expect.any(Object),
      expect.objectContaining({ delay: 0 }),
    );
  });
});
```

- [ ] **Step 5.3: Run, expect FAIL.**

- [ ] **Step 5.4: Implement `apps/api/src/notifications/notifications.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../queues/queue-names';
import { NotificationsDedupService } from './notifications.dedup.service';
import { CHANNEL_MATRIX, type NotificationEvent } from './notifications.types';
import { isQuietHour, deferUntilMorning } from './notifications.quiet-hours';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly dedup: NotificationsDedupService,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async send(
    userId: string,
    event: NotificationEvent,
    data: { orderId: string; [k: string]: unknown },
  ): Promise<void> {
    const isNew = await this.dedup.shouldSend(userId, event, data.orderId);
    if (!isNew) {
      this.logger.debug(`dedup skip: user=${userId} event=${event} order=${data.orderId}`);
      return;
    }

    const matrix = CHANNEL_MATRIX[event];
    const now = new Date();
    const delay = !matrix.critical && isQuietHour(now) ? deferUntilMorning(now) : 0;

    await this.queue.add(
      'dispatch',
      { userId, event, data },
      { delay, jobId: `${userId}:${event}:${data.orderId}:${Date.now()}` },
    );
  }
}
```

- [ ] **Step 5.5: Run, expect PASS** (4 service tests).

- [ ] **Step 5.6: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): NotificationsService.send with dedup and quiet-hours deferral"
```

---

## Task 6: NotificationsProcessor (BullMQ worker)

**Files:**
- Create: `apps/api/src/notifications/jobs/notifications.processor.ts`
- Create: `apps/api/src/notifications/notifications.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 6.1: Create `apps/api/src/notifications/jobs/notifications.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../../queues/queue-names';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.types';
import { PUSH_PROVIDER, type PushProvider } from '../push/push.types';
import { renderTemplate } from '../notifications.templates';
import { CHANNEL_MATRIX, type NotificationEvent } from '../notifications.types';

interface DispatchJob {
  userId: string;
  event: NotificationEvent;
  data: { orderId: string; [k: string]: unknown };
}

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<DispatchJob>): Promise<{ pushSent: number; smsSent: number }> {
    const { userId, event, data } = job.data;
    const matrix = CHANNEL_MATRIX[event];
    const template = renderTemplate(event, data as never);

    let pushSent = 0;
    let smsSent = 0;

    if (matrix.push) {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
      for (const t of tokens) {
        try {
          await this.push.send({
            token: t.token,
            platform: t.platform,
            title: template.title,
            body: template.body,
            data: { event, orderId: data.orderId },
          });
          pushSent++;
        } catch (err) {
          this.logger.warn(`push send failed for user=${userId} device=${t.deviceId}: ${(err as Error).message}`);
        }
      }
    }

    if (matrix.sms) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.phone) {
        try {
          await this.sms.send({ to: user.phone, text: template.body });
          smsSent = 1;
        } catch (err) {
          this.logger.warn(`sms send failed for user=${userId}: ${(err as Error).message}`);
        }
      }
    }

    await this.audit.record({
      actorUserId: null,
      action: 'notification.dispatched',
      entity: 'User',
      entityId: userId,
      after: { event, pushSent, smsSent },
    });

    return { pushSent, smsSent };
  }
}
```

- [ ] **Step 6.2: Create `apps/api/src/notifications/notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsDedupService } from './notifications.dedup.service';
import { NotificationsProcessor } from './jobs/notifications.processor';
import { PushModule } from './push/push.module';
import { SmsModule } from '../sms/sms.module';
import { QUEUE_NOTIFICATIONS } from '../queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    PushModule,
    SmsModule,
  ],
  providers: [NotificationsService, NotificationsDedupService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 6.3: Wire `NotificationsModule` into `apps/api/src/app.module.ts`**

Read the current file. Add the import:
```typescript
import { NotificationsModule } from './notifications/notifications.module';
```

Add `NotificationsModule` to the imports array, after `OrdersModule` (or in a similar logical spot).

- [ ] **Step 6.4: Lint + build clean.**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

- [ ] **Step 6.5: Commit**

```bash
git add apps/api
git commit -m "feat(api): NotificationsProcessor + NotificationsModule wired"
```

---

## Task 7: Push Token Endpoints

**Files:**
- Create: `apps/api/src/notifications/dto/register-push-token.dto.ts`
- Create: `apps/api/src/notifications/push-tokens.controller.ts`
- Create: `apps/api/test/push-tokens.e2e-spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

- [ ] **Step 7.1: Create `apps/api/src/notifications/dto/register-push-token.dto.ts`**

```typescript
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { PushPlatform } from '@prisma/client';

export class RegisterPushTokenDto {
  @IsEnum(PushPlatform)
  platform!: PushPlatform;

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  device_id!: string;
}
```

- [ ] **Step 7.2: Failing e2e**

Create `apps/api/test/push-tokens.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Push Tokens (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  afterEach(async () => {
    await prisma.pushToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it('POST /me/push-tokens stores a new token', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/push-tokens')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ platform: 'ios', token: 'apns-token-12345678', device_id: 'iphone-1' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.platform).toBe('ios');

    const stored = await prisma.pushToken.findMany({ where: { userId: me.id } });
    expect(stored).toHaveLength(1);
  });

  it('POST /me/push-tokens upserts by (userId, device_id)', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    await request(app.getHttpServer())
      .post('/api/v1/me/push-tokens')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ platform: 'ios', token: 'apns-old-token-1234', device_id: 'iphone-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/me/push-tokens')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .send({ platform: 'ios', token: 'apns-new-token-9876', device_id: 'iphone-1' });
    expect(res.status).toBe(201);

    const stored = await prisma.pushToken.findMany({ where: { userId: me.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe('apns-new-token-9876');
  });

  it('DELETE /me/push-tokens/:id removes a token', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const created = await prisma.pushToken.create({
      data: { userId: me.id, platform: 'android', token: 'fcm-token-1234', deviceId: 'pixel-1' },
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/me/push-tokens/${created.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(204);
    const remaining = await prisma.pushToken.findMany({ where: { userId: me.id } });
    expect(remaining).toHaveLength(0);
  });

  it("DELETE /me/push-tokens/:id refuses to delete another user's token", async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });
    const theirs = await prisma.pushToken.create({
      data: { userId: other.id, platform: 'android', token: 'fcm-other-1234', deviceId: 'pixel-2' },
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/me/push-tokens/${theirs.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
    const stillThere = await prisma.pushToken.findUnique({ where: { id: theirs.id } });
    expect(stillThere).not.toBeNull();
  });
});
```

- [ ] **Step 7.3: Run e2e for this spec, expect FAIL** (routes don't exist).

```bash
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/push-tokens.e2e-spec.ts
```

- [ ] **Step 7.4: Implement `apps/api/src/notifications/push-tokens.controller.ts`**

```typescript
import { Controller, Delete, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Body } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('me/push-tokens')
@Roles('client')
export class PushTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushTokenDto,
  ): Promise<{ id: string; platform: string; device_id: string }> {
    const row = await this.prisma.pushToken.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: dto.device_id } },
      update: { token: dto.token, platform: dto.platform },
      create: { userId: user.id, deviceId: dto.device_id, token: dto.token, platform: dto.platform },
    });
    return { id: row.id, platform: row.platform, device_id: row.deviceId };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const result = await this.prisma.pushToken.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) {
      throw new NotFoundException({ code: 'PUSH_TOKEN_NOT_FOUND', message: 'token not found' });
    }
  }
}
```

- [ ] **Step 7.5: Register controller in `NotificationsModule`**

Read `apps/api/src/notifications/notifications.module.ts` and update to include the controller:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsDedupService } from './notifications.dedup.service';
import { NotificationsProcessor } from './jobs/notifications.processor';
import { PushModule } from './push/push.module';
import { SmsModule } from '../sms/sms.module';
import { PushTokensController } from './push-tokens.controller';
import { QUEUE_NOTIFICATIONS } from '../queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
    PushModule,
    SmsModule,
  ],
  controllers: [PushTokensController],
  providers: [NotificationsService, NotificationsDedupService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 7.6: Run e2e, expect PASS** (4 push-tokens tests).

- [ ] **Step 7.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): POST /me/push-tokens and DELETE /me/push-tokens/:id"
```

---

## Task 8: Event Emitter — emit on order.progress.updated

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 8.1: Add `@nestjs/event-emitter`**

In `apps/api/package.json` dependencies:
```json
"@nestjs/event-emitter": "^2.0.4"
```

```bash
pnpm install
```

- [ ] **Step 8.2: Wire `EventEmitterModule` into `AppModule`**

Read `apps/api/src/app.module.ts`. Add the import:
```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
```

Add to the imports array, near `ScheduleModule.forRoot()`:
```typescript
EventEmitterModule.forRoot(),
```

- [ ] **Step 8.3: Emit event from `OrdersService.updateProgress`**

Read `apps/api/src/orders/orders.service.ts`. Add to the top of the file:
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
```

Modify the constructor to inject `EventEmitter2`:
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly audit: AuditService,
  @InjectQueue(QUEUE_AMOCRM_OUTBOUND) private readonly outQueue: Queue,
  private readonly events: EventEmitter2,
) {}
```

At the end of `updateProgress` (after the `outQueue.add` call), append:

```typescript
this.events.emit('order.progress.updated', {
  orderId,
  clientUserId: order.clientUserId,
  before: {
    stage: order.currentStage,
    progressPercent: order.progressPercent,
  },
  after: {
    stage: input.stage ?? order.currentStage,
    progressPercent: input.progressPercent ?? order.progressPercent,
  },
  contractNumber: order.contractNumber,
  productName: order.productName,
});
```

- [ ] **Step 8.4: Update existing unit tests for OrdersService**

Read `apps/api/src/orders/__tests__/orders.service.spec.ts`. The existing `makeDeps()` returns `{ prisma, audit, outQueue }`. Now also need an `events` mock. Update `makeDeps` to:

```typescript
const events = { emit: jest.fn() };
return { prisma, audit, outQueue, events };
```

And update every `new OrdersService(prisma, audit, outQueue)` call to:
```typescript
new OrdersService(prisma, audit as any, outQueue as any, events as any)
```

(Search the file for `new OrdersService(` and update each call. There may be multiple — typically the updateProgress test and the read-method tests.)

In the updateProgress happy-path test, add an assertion:
```typescript
expect(events.emit).toHaveBeenCalledWith(
  'order.progress.updated',
  expect.objectContaining({ orderId: 'ord1' }),
);
```

- [ ] **Step 8.5: Run unit tests, expect PASS.**

```bash
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 8.6: Run e2e — existing tests should still pass (event has no listener yet, just emitted).**

```bash
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 8.7: Lint + build clean.**

- [ ] **Step 8.8: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): emit order.progress.updated via EventEmitter2"
```

---

## Task 9: Listener — bridge event to NotificationsService

**Files:**
- Create: `apps/api/src/notifications/listeners/order-progress.listener.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

- [ ] **Step 9.1: Implement `apps/api/src/notifications/listeners/order-progress.listener.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';

interface OrderProgressUpdatedEvent {
  orderId: string;
  clientUserId: string;
  before: { stage: string; progressPercent: number };
  after: { stage: string; progressPercent: number };
  contractNumber: string | null;
  productName: string | null;
}

@Injectable()
export class OrderProgressListener {
  private readonly logger = new Logger(OrderProgressListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('order.progress.updated')
  async handle(event: OrderProgressUpdatedEvent): Promise<void> {
    const stageChanged = event.before.stage !== event.after.stage;
    const progressDelta = Math.abs(event.after.progressPercent - event.before.progressPercent);

    if (event.after.stage === 'ready_for_delivery' && stageChanged) {
      await this.notifications.send(event.clientUserId, 'order.ready', {
        orderId: event.orderId,
        contractNumber: event.contractNumber,
        productName: event.productName,
      });
      return;
    }

    if (stageChanged) {
      await this.notifications.send(event.clientUserId, 'order.stage.changed', {
        orderId: event.orderId,
        contractNumber: event.contractNumber,
        productName: event.productName,
        newStage: event.after.stage,
        oldStage: event.before.stage,
      });
    } else if (progressDelta >= 10) {
      await this.notifications.send(event.clientUserId, 'order.progress.changed', {
        orderId: event.orderId,
        contractNumber: event.contractNumber,
        productName: event.productName,
        newPercent: event.after.progressPercent,
        oldPercent: event.before.progressPercent,
      });
    }
    // Else: stage unchanged AND delta < 10 — no notification.
  }
}
```

- [ ] **Step 9.2: Register listener in `NotificationsModule.providers`**

Read `apps/api/src/notifications/notifications.module.ts`. Add the import:
```typescript
import { OrderProgressListener } from './listeners/order-progress.listener';
```

Append `OrderProgressListener` to the `providers` array.

- [ ] **Step 9.3: Build clean.**

```bash
pnpm --filter @vittoria/api build
```

(Listener is exercised by the e2e test in Task 10. No dedicated unit test — the dispatch is just glue code; correctness is verified end-to-end.)

- [ ] **Step 9.4: Commit**

```bash
git add apps/api
git commit -m "feat(api): listener bridges order.progress.updated to NotificationsService"
```

---

## Task 10: E2E — Admin PATCH triggers push job in queue

**Files:**
- Create: `apps/api/test/notifications.e2e-spec.ts`

- [ ] **Step 10.1: Create `apps/api/test/notifications.e2e-spec.ts`**

This test asserts the full chain by checking that a job lands in the BullMQ `notifications` queue after an admin PATCH. We don't assert worker execution (that's a separate concern, and BullMQ worker pickup races in Jest were established as flaky in Plan 2).

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { QUEUE_NOTIFICATIONS } from '../src/queues/queue-names';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Notifications pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifQueue: Queue;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notifQueue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    await notifQueue.obliterate({ force: true });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(async () => {
    await notifQueue.obliterate({ force: true });
  });
  afterEach(async () => {
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.pushToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('admin PATCH /admin/orders/:id/progress with stage change enqueues a notification', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 7001, clientUserId: client.id, currentStage: 'detailing', progressPercent: 20 },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'production', progress_percent: 40 });
    expect(res.status).toBe(200);

    // EventEmitter2 is synchronous by default — by the time the HTTP response
    // returns, the listener has called NotificationsService.send and the job
    // is in the queue.
    const counts = await notifQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.delayed ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  it('admin PATCH that only changes progress < 10 does NOT enqueue a notification', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 7002, clientUserId: client.id, currentStage: 'production', progressPercent: 50 },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ progress_percent: 55 });
    expect(res.status).toBe(200);

    const counts = await notifQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.delayed ?? 0);
    expect(total).toBe(0);
  });

  it('admin PATCH that moves to ready_for_delivery enqueues a critical notification', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: {
        amocrmDealId: 7003,
        clientUserId: client.id,
        currentStage: 'completeness_check',
        progressPercent: 95,
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'ready_for_delivery', progress_percent: 100 });
    expect(res.status).toBe(200);

    const jobs = await notifQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    expect(jobs.length).toBeGreaterThan(0);
    // Critical event: delay should be 0 regardless of quiet hours.
    expect(jobs[0]?.opts.delay ?? 0).toBe(0);
  });
});
```

- [ ] **Step 10.2: Run e2e, expect PASS** (3 new tests).

```bash
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/notifications.e2e-spec.ts
```

- [ ] **Step 10.3: Lint + build clean.**

- [ ] **Step 10.4: Commit**

```bash
git add apps/api
git commit -m "test(api): e2e for admin PATCH → notification queue enqueue"
```

---

## Task 11: Smoke + Full Verification + Push

- [ ] **Step 11.1: Run full test suite from root**

```bash
docker exec infra-redis-1 redis-cli FLUSHALL >/dev/null 2>&1
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All packages green. API expected totals: ~36 unit (31 prior + ~5 new — dev-push, dedup, service, quiet-hours, plus updates to orders unit), ~50 e2e (42 prior + 4 push-tokens + 3 notifications + a couple of marginal additions).

- [ ] **Step 11.2: Smoke against a running server**

```bash
pnpm dev:infra
pnpm --filter @vittoria/api dev
```

In another shell:
```bash
# Seed a client and an admin directly via SQL.
docker exec infra-postgres-1 psql -U vittoria -d vittoria_dev -c \
  "INSERT INTO users (id, phone, role, created_at, updated_at) VALUES (gen_random_uuid(), '+79991234567', 'client', NOW(), NOW()) ON CONFLICT DO NOTHING; INSERT INTO users (id, phone, role, created_at, updated_at) VALUES (gen_random_uuid(), NULL, 'admin', NOW(), NOW());"
```

Authenticate the client via SMS-OTP (request-code → read OTP from api log → verify-code) and copy the access_token.

Register a push token:
```bash
curl -X POST http://localhost:3000/api/v1/me/push-tokens \
  -H "Authorization: Bearer <CLIENT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"platform":"ios","token":"apns-fake-token-12345678","device_id":"iphone-smoke-1"}'
```

Expected: 201 with `{ id, platform, device_id }`.

Create an order tied to the client (via Prisma directly or AmoCRM mock seeding). Issue an admin token using a one-off Node REPL or just observe the dev log when the admin authenticates manually. Then PATCH the order's progress:
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/orders/<ORDER_ID>/progress \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"stage":"production","progress_percent":60,"comment":"smoke"}'
```

In the api log, you should see `[DEV-PUSH] platform=ios ... title="VITTORIA HOME" body="..."` confirming the worker dispatched the push to the dev provider.

Stop the dev server and `pnpm dev:infra:down` when done.

- [ ] **Step 11.3: Push**

```bash
git push origin main
```

- [ ] **Step 11.4: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions and confirm the latest run is green.

---

## Definition of Done

Plan 4 is complete when:

- [x] `PushToken` model in Prisma + migration applied.
- [x] `POST /api/v1/me/push-tokens` upserts by (userId, deviceId).
- [x] `DELETE /api/v1/me/push-tokens/:id` deletes only owned tokens (404 for others').
- [x] `NotificationsService.send(userId, event, data)` dedupes (60s) and enqueues to BullMQ.
- [x] `DevPushProvider` is the active push backend; logs to console.
- [x] `OrdersService.updateProgress` emits `order.progress.updated`.
- [x] Listener translates the event into the right notification call:
  - stage change to `ready_for_delivery` → `order.ready` (critical)
  - any other stage change → `order.stage.changed`
  - progress delta ≥ 10 (no stage change) → `order.progress.changed`
- [x] Quiet hours (22:00–09:00 MSK) defer non-critical jobs via BullMQ delay.
- [x] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test` all exit 0.
- [x] GitHub Actions CI green.

After Plan 4 lands, proceed to **Plan 4b: Real push/SMS providers** (FCM/APNs/SMSC.ru) once credentials are available, or to **Plan 5: Chat** if mobile-client UI is the next priority.

---

**End of Plan 4.**
