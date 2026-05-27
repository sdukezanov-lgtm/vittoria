# Plan 3: Orders API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the order domain via HTTP: clients read their own orders (list, detail, history, partner services), admins read all orders and PATCH progress, partners read orders they own. Reuses `OrdersService.updateProgress` from Plan 2, which already drives the AmoCRM outbound and audit pipelines.

**Architecture:** Three NestJS controllers under `apps/api/src/orders/` — `OrdersController` for clients (`/orders`), `AdminOrdersController` (`/admin/orders`), `PartnerOrdersController` (`/partner/orders`). All scoped behind the global `JwtAuthGuard` and `RolesGuard`; ownership is enforced inside the service (queries filter by `clientUserId` / `partnerUserId`). Response shape is converted to spec snake_case via a small mapper, not via class-transformer plugins.

**Tech Stack:**
- Reuses Plan 1 (NestJS 10, Prisma, JWT, RBAC, audit, throttler)
- Reuses Plan 2 (OrdersService.updateProgress, BullMQ outbound queue)
- Adds no new runtime dependencies

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](../specs/2026-05-26-vittoria-home-mvp-design.md) — sections 4 (Order model), 7.3 (client orders endpoints), 7.6 (admin orders endpoints), 7.7 (partner endpoints), 10 (admin/partner views), 16 row #4 (single web panel with roles).

**Out of scope (later plans):**
- Admin/partner email+password authentication → Plan 4 or 5 (Plan 3 e2e tests issue tokens directly via `TokensService` for admin/partner test users).
- Chat endpoints (`/orders/:id/chat`, `/chats/:id/messages`) → Plan 5.
- Notifications on stage change (push/SMS) → Plan 4.
- Admin chats / users / audit-log endpoints → Plan 5.
- Web Admin UI (React) → Plan 5/6.

**Prerequisites for execution:**
- Plan 2 complete (`OrdersService.updateProgress` working, `Order` + `OrderStageHistory` in Prisma).
- Docker Desktop running for e2e (`pnpm dev:infra`).
- 47 prior tests (24 unit + 23 e2e) green on `main`.

---

## File Structure

After this plan completes, `apps/api/src/orders/` looks like this:

```
apps/api/src/orders/
├── orders.module.ts                    ← MODIFY: register controllers
├── orders.service.ts                   ← EXTEND: list/find methods
├── orders.controller.ts                ← NEW: client endpoints
├── admin-orders.controller.ts          ← NEW: admin endpoints
├── partner-orders.controller.ts        ← NEW: partner endpoints
├── orders.mapper.ts                    ← NEW: Prisma Order → DTO (snake_case)
├── dto/
│   ├── update-progress.dto.ts          ← NEW
│   ├── list-orders-query.dto.ts        ← NEW
│   └── order.dto.ts                    ← NEW (response shape contract)
└── __tests__/
    └── orders.service.spec.ts          ← EXTEND with new methods
```

And under `apps/api/test/`:
```
apps/api/test/
├── orders.e2e-spec.ts                  ← NEW: client endpoints
├── admin-orders.e2e-spec.ts            ← NEW: admin endpoints
├── partner-orders.e2e-spec.ts          ← NEW: partner endpoints
└── helpers/
    └── auth-test-helpers.ts            ← NEW: issue tokens for test users
```

**Responsibility split:**
- `orders.service.ts` — DB access + ownership-aware filtering. Returns plain Prisma rows.
- `orders.mapper.ts` — single source of truth for the wire shape (snake_case keys, history items, partner-services array).
- Controllers — argument validation (DTO) + role check (declarative) + call service + mapper. No business logic.
- E2E tests run against a real Postgres via Testcontainers (per the established pattern from Plan 1–2).

---

## Task 1: Order Response Mapper + DTO Types

**Files:**
- Create: `apps/api/src/orders/dto/order.dto.ts`
- Create: `apps/api/src/orders/orders.mapper.ts`
- Create: `apps/api/src/orders/__tests__/orders.mapper.spec.ts`

- [ ] **Step 1.1: Create `apps/api/src/orders/dto/order.dto.ts`**

```typescript
import type { OrderStage } from '@prisma/client';

export interface PartnerServiceItem {
  type: string;
  label?: string;
  date?: string;
  price?: number;
}

export interface OrderResponse {
  id: string;
  amocrm_deal_id: number;
  contract_number: string | null;
  product_name: string | null;
  total_amount: string | null;
  prepayment_amount: string | null;
  balance_due: string | null;
  current_stage: OrderStage;
  progress_percent: number;
  service_phone: string | null;
  last_admin_comment: string | null;
  partner_services: PartnerServiceItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderStageHistoryEntry {
  id: string;
  stage: OrderStage;
  progress_percent: number;
  comment: string | null;
  changed_at: string;
}
```

- [ ] **Step 1.2: Failing unit test**

Create `apps/api/src/orders/__tests__/orders.mapper.spec.ts`:
```typescript
import { OrdersMapper } from '../orders.mapper';
import type { Order, OrderStageHistory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const baseOrder: Order = {
  id: '00000000-0000-0000-0000-000000000001',
  amocrmDealId: 555,
  contractNumber: 'C-42',
  clientUserId: '00000000-0000-0000-0000-0000000000aa',
  partnerUserId: null,
  productName: 'Kitchen #N42',
  totalAmount: new Decimal('120000.00'),
  prepaymentAmount: new Decimal('60000.00'),
  balanceDue: new Decimal('60000.00'),
  currentStage: 'production',
  progressPercent: 55,
  servicePhone: '+78001234567',
  partnerServices: [{ type: 'delivery', label: 'Доставка', date: '2026-06-15', price: 5000 }],
  lastAdminComment: 'On track',
  amocrmSyncedAt: new Date('2026-05-27T10:00:00Z'),
  version: 3,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-27T10:00:00Z'),
};

describe('OrdersMapper.toResponse', () => {
  const mapper = new OrdersMapper();

  it('maps a Prisma Order to snake_case wire shape', () => {
    const dto = mapper.toResponse(baseOrder);
    expect(dto.id).toBe(baseOrder.id);
    expect(dto.amocrm_deal_id).toBe(555);
    expect(dto.contract_number).toBe('C-42');
    expect(dto.product_name).toBe('Kitchen #N42');
    expect(dto.total_amount).toBe('120000');
    expect(dto.prepayment_amount).toBe('60000');
    expect(dto.balance_due).toBe('60000');
    expect(dto.current_stage).toBe('production');
    expect(dto.progress_percent).toBe(55);
    expect(dto.service_phone).toBe('+78001234567');
    expect(dto.last_admin_comment).toBe('On track');
    expect(dto.partner_services).toEqual([
      { type: 'delivery', label: 'Доставка', date: '2026-06-15', price: 5000 },
    ]);
    expect(dto.created_at).toBe('2026-05-01T00:00:00.000Z');
    expect(dto.updated_at).toBe('2026-05-27T10:00:00.000Z');
  });

  it('handles null amounts and missing partner_services', () => {
    const dto = mapper.toResponse({
      ...baseOrder,
      totalAmount: null,
      prepaymentAmount: null,
      balanceDue: null,
      partnerServices: null as never,
    });
    expect(dto.total_amount).toBeNull();
    expect(dto.prepayment_amount).toBeNull();
    expect(dto.balance_due).toBeNull();
    expect(dto.partner_services).toEqual([]);
  });
});

describe('OrdersMapper.toHistoryEntry', () => {
  const mapper = new OrdersMapper();

  it('maps a Prisma OrderStageHistory row', () => {
    const row: OrderStageHistory = {
      id: 'hist1',
      orderId: 'ord1',
      stage: 'detailing',
      progressPercent: 25,
      comment: 'Specs approved',
      changedByUserId: 'admin1',
      changedAt: new Date('2026-05-27T09:00:00Z'),
    };
    const dto = mapper.toHistoryEntry(row);
    expect(dto).toEqual({
      id: 'hist1',
      stage: 'detailing',
      progress_percent: 25,
      comment: 'Specs approved',
      changed_at: '2026-05-27T09:00:00.000Z',
    });
  });
});
```

- [ ] **Step 1.3: Run, expect FAIL.**

```bash
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 1.4: Implement `apps/api/src/orders/orders.mapper.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import type { Order, OrderStageHistory } from '@prisma/client';
import type { OrderResponse, OrderStageHistoryEntry, PartnerServiceItem } from './dto/order.dto';

@Injectable()
export class OrdersMapper {
  toResponse(row: Order): OrderResponse {
    return {
      id: row.id,
      amocrm_deal_id: row.amocrmDealId,
      contract_number: row.contractNumber,
      product_name: row.productName,
      total_amount: row.totalAmount?.toString() ?? null,
      prepayment_amount: row.prepaymentAmount?.toString() ?? null,
      balance_due: row.balanceDue?.toString() ?? null,
      current_stage: row.currentStage,
      progress_percent: row.progressPercent,
      service_phone: row.servicePhone,
      last_admin_comment: row.lastAdminComment,
      partner_services: this.normalizePartnerServices(row.partnerServices),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  toHistoryEntry(row: OrderStageHistory): OrderStageHistoryEntry {
    return {
      id: row.id,
      stage: row.stage,
      progress_percent: row.progressPercent,
      comment: row.comment,
      changed_at: row.changedAt.toISOString(),
    };
  }

  private normalizePartnerServices(raw: unknown): PartnerServiceItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is PartnerServiceItem => typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string');
  }
}
```

- [ ] **Step 1.5: Run, expect PASS** (3 tests).

- [ ] **Step 1.6: Register `OrdersMapper` in `apps/api/src/orders/orders.module.ts`**

Read the current file. Add `OrdersMapper` to `providers` and to `exports`:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_AMOCRM_OUTBOUND })],
  providers: [OrdersService, OrdersMapper],
  exports: [OrdersService, OrdersMapper],
})
export class OrdersModule {}
```

- [ ] **Step 1.7: Lint + build clean.**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

- [ ] **Step 1.8: Commit**

```bash
git add apps/api/src/orders
git commit -m "feat(api): OrdersMapper and snake_case OrderResponse DTO"
```

---

## Task 2: Extend OrdersService with read methods

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/__tests__/orders.service.spec.ts`

- [ ] **Step 2.1: Add new methods to `OrdersService`**

Read the existing file. Add these methods inside the class (after `updateProgress`):

```typescript
async listForClient(clientUserId: string): Promise<Order[]> {
  return this.prisma.order.findMany({
    where: { clientUserId },
    orderBy: { createdAt: 'desc' },
  });
}

async listForPartner(partnerUserId: string): Promise<Order[]> {
  return this.prisma.order.findMany({
    where: { partnerUserId },
    orderBy: { createdAt: 'desc' },
  });
}

async listAll(query: { search?: string; stage?: OrderStage; page?: number; pageSize?: number }): Promise<{ rows: Order[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

  const where: Prisma.OrderWhereInput = {};
  if (query.stage) where.currentStage = query.stage;
  if (query.search) {
    where.OR = [
      { contractNumber: { contains: query.search, mode: 'insensitive' } },
      { productName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await this.prisma.$transaction([
    this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    this.prisma.order.count({ where }),
  ]);

  return { rows, total };
}

async findById(id: string): Promise<Order | null> {
  return this.prisma.order.findUnique({ where: { id } });
}

async findByIdForClient(id: string, clientUserId: string): Promise<Order | null> {
  return this.prisma.order.findFirst({ where: { id, clientUserId } });
}

async findByIdForPartner(id: string, partnerUserId: string): Promise<Order | null> {
  return this.prisma.order.findFirst({ where: { id, partnerUserId } });
}

async getHistory(orderId: string): Promise<OrderStageHistory[]> {
  return this.prisma.orderStageHistory.findMany({
    where: { orderId },
    orderBy: { changedAt: 'desc' },
  });
}
```

Update the file's top imports to include `Order`, `OrderStage`, `OrderStageHistory`, `Prisma`:
```typescript
import type { Order, OrderStage, OrderStageHistory, Prisma } from '@prisma/client';
```

Add this import next to the existing ones (do NOT remove existing imports).

- [ ] **Step 2.2: Add unit tests for the new methods**

In `apps/api/src/orders/__tests__/orders.service.spec.ts`, after the existing `describe('OrdersService.updateProgress ...')` block, append:

```typescript
describe('OrdersService read methods (unit)', () => {
  const makeDeps = () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: 'o1' }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      orderStageHistory: {
        findMany: jest.fn().mockResolvedValue([{ id: 'h1' }]),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const audit = { record: jest.fn() };
    const outQueue = { add: jest.fn() };
    return { prisma, audit, outQueue };
  };

  it('listForClient filters by clientUserId', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (require('../orders.service').OrdersService)(prisma, audit as any, outQueue as any);
    await svc.listForClient('u1');
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { clientUserId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('listAll applies search + stage filters and paginates', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (require('../orders.service').OrdersService)(prisma, audit as any, outQueue as any);
    const result = await svc.listAll({ search: 'kit', stage: 'production', page: 2, pageSize: 5 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ currentStage: 'production', OR: expect.any(Array) }),
      skip: 5,
      take: 5,
    }));
    expect(result.total).toBe(1);
  });

  it('findByIdForClient scopes the lookup', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (require('../orders.service').OrdersService)(prisma, audit as any, outQueue as any);
    await svc.findByIdForClient('o1', 'u1');
    expect(prisma.order.findFirst).toHaveBeenCalledWith({ where: { id: 'o1', clientUserId: 'u1' } });
  });

  it('getHistory orders by changedAt desc', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (require('../orders.service').OrdersService)(prisma, audit as any, outQueue as any);
    await svc.getHistory('o1');
    expect(prisma.orderStageHistory.findMany).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
      orderBy: { changedAt: 'desc' },
    });
  });
});
```

- [ ] **Step 2.3: Run unit tests, expect PASS** (4 new tests, 28 total).

```bash
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 2.4: Lint + build clean.**

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/src/orders
git commit -m "feat(api): OrdersService list/find methods with ownership scoping"
```

---

## Task 3: Auth Test Helper (issue tokens for test users)

**Files:**
- Create: `apps/api/test/helpers/auth-test-helpers.ts`

This helper lets e2e tests create users with arbitrary roles and obtain a valid access token without going through the SMS-OTP flow. Real admin/partner login (email+password) is Plan 4/5; for Plan 3 the contract under test is the orders HTTP surface, not auth.

- [ ] **Step 3.1: Create `apps/api/test/helpers/auth-test-helpers.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TokensService } from '../../src/auth/tokens.service';
import type { UserRole } from '@prisma/client';

export interface SeededUser {
  id: string;
  phone: string | null;
  role: UserRole;
  accessToken: string;
}

export async function seedUserWithToken(
  app: INestApplication,
  opts: { phone?: string | null; role?: UserRole; firstName?: string; lastName?: string } = {},
): Promise<SeededUser> {
  const prisma = app.get(PrismaService);
  const tokens = app.get(TokensService);

  const role: UserRole = opts.role ?? 'client';
  const phone =
    opts.phone === undefined && role === 'client'
      ? `+7999${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
      : (opts.phone ?? null);

  const user = await prisma.user.create({
    data: {
      phone,
      role,
      firstName: opts.firstName,
      lastName: opts.lastName,
    },
  });

  const jti = randomUUID();
  const { accessToken } = await tokens.issue({ userId: user.id, role: user.role, jti });

  return { id: user.id, phone: user.phone, role: user.role, accessToken };
}
```

- [ ] **Step 3.2: Verify it builds**

```bash
pnpm --filter @vittoria/api build
```

(No tests for this helper directly — it's exercised by every e2e in Tasks 4–7.)

- [ ] **Step 3.3: Commit**

```bash
git add apps/api/test/helpers/auth-test-helpers.ts
git commit -m "feat(api): test helper to seed user and issue access token"
```

---

## Task 4: Client GET /orders + GET /orders/:id

**Files:**
- Create: `apps/api/src/orders/orders.controller.ts`
- Create: `apps/api/test/orders.e2e-spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

- [ ] **Step 4.1: Failing e2e**

Create `apps/api/test/orders.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Client Orders (e2e)', () => {
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
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.session.deleteMany();
    await prisma.authCode.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /orders returns only the caller\'s orders', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });

    await prisma.order.createMany({
      data: [
        { amocrmDealId: 1001, clientUserId: me.id, productName: 'My kitchen' },
        { amocrmDealId: 1002, clientUserId: other.id, productName: 'Other kitchen' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('My kitchen');
  });

  it('GET /orders without auth returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  it('GET /orders/:id returns 200 for owner', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 2001, clientUserId: me.id, productName: 'Mine' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
    expect(res.body.amocrm_deal_id).toBe(2001);
  });

  it('GET /orders/:id returns 404 for non-owner', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 2002, clientUserId: other.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4.2: Run e2e, expect FAIL** (route not yet defined → all 4 tests fail with 404 instead of 200/401/404 patterns).

```bash
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 4.3: Implement `apps/api/src/orders/orders.controller.ts`**

```typescript
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import type { OrderResponse } from './dto/order.dto';

@Controller('orders')
@Roles('client')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly mapper: OrdersMapper,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ items: OrderResponse[] }> {
    const rows = await this.orders.listForClient(user.id);
    return { items: rows.map((r) => this.mapper.toResponse(r)) };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    const order = await this.orders.findByIdForClient(id, user.id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return this.mapper.toResponse(order);
  }
}
```

- [ ] **Step 4.4: Register controller in `OrdersModule`**

Update `apps/api/src/orders/orders.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import { OrdersController } from './orders.controller';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_AMOCRM_OUTBOUND })],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersMapper],
  exports: [OrdersService, OrdersMapper],
})
export class OrdersModule {}
```

- [ ] **Step 4.5: Run e2e, expect PASS** (4 client-orders tests pass).

```bash
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 4.6: Lint + build clean.**

- [ ] **Step 4.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): GET /orders and /orders/:id (client, ownership-scoped)"
```

---

## Task 5: Client GET /orders/:id/history + /partner-services

**Files:**
- Modify: `apps/api/src/orders/orders.controller.ts`
- Modify: `apps/api/test/orders.e2e-spec.ts`

- [ ] **Step 5.1: Failing e2e — append two tests to `orders.e2e-spec.ts`**

Inside the `describe('Client Orders ...')` block, append:
```typescript
  it('GET /orders/:id/history returns history entries newest first', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 3001, clientUserId: me.id, currentStage: 'production', progressPercent: 60 },
    });
    await prisma.orderStageHistory.createMany({
      data: [
        { orderId: order.id, stage: 'detailing', progressPercent: 20, changedAt: new Date('2026-05-01T00:00:00Z') },
        { orderId: order.id, stage: 'production', progressPercent: 60, changedAt: new Date('2026-05-10T00:00:00Z') },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/history`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].stage).toBe('production');
    expect(res.body.items[0].progress_percent).toBe(60);
    expect(res.body.items[1].stage).toBe('detailing');
  });

  it('GET /orders/:id/history returns 404 for non-owner', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 3002, clientUserId: other.id } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/history`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /orders/:id/partner-services returns the stored array', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const services = [
      { type: 'delivery', label: 'Доставка', date: '2026-06-15', price: 5000 },
      { type: 'lifting', label: 'Подъём', date: '2026-06-15', price: 3000 },
    ];
    const order = await prisma.order.create({
      data: { amocrmDealId: 4001, clientUserId: me.id, partnerServices: services },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/partner-services`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(services);
  });
```

- [ ] **Step 5.2: Run e2e, expect FAIL** on the three new tests (404 from routing).

- [ ] **Step 5.3: Extend `OrdersController`**

Add two methods inside the class:
```typescript
@Get(':id/history')
async history(
  @CurrentUser() user: AuthUser,
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ items: import('./dto/order.dto').OrderStageHistoryEntry[] }> {
  const order = await this.orders.findByIdForClient(id, user.id);
  if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
  const rows = await this.orders.getHistory(id);
  return { items: rows.map((r) => this.mapper.toHistoryEntry(r)) };
}

@Get(':id/partner-services')
async partnerServices(
  @CurrentUser() user: AuthUser,
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ items: import('./dto/order.dto').PartnerServiceItem[] }> {
  const order = await this.orders.findByIdForClient(id, user.id);
  if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
  return { items: this.mapper.toResponse(order).partner_services };
}
```

The inline `import('./dto/order.dto').XxxxItem` syntax avoids growing the file's top imports for just-the-return-type. If you prefer, add `import type { OrderStageHistoryEntry, PartnerServiceItem } from './dto/order.dto';` at the top and reference them directly.

- [ ] **Step 5.4: Run e2e, expect PASS** (7 client-orders tests total).

- [ ] **Step 5.5: Lint + build clean.**

- [ ] **Step 5.6: Commit**

```bash
git add apps/api
git commit -m "feat(api): GET /orders/:id/history and /orders/:id/partner-services"
```

---

## Task 6: Admin GET /admin/orders + GET /admin/orders/:id

**Files:**
- Create: `apps/api/src/orders/admin-orders.controller.ts`
- Create: `apps/api/src/orders/dto/list-orders-query.dto.ts`
- Create: `apps/api/test/admin-orders.e2e-spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

- [ ] **Step 6.1: Create `apps/api/src/orders/dto/list-orders-query.dto.ts`**

```typescript
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStage } from '@prisma/client';

export class ListOrdersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(OrderStage)
  stage?: OrderStage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}
```

- [ ] **Step 6.2: Failing e2e**

Create `apps/api/test/admin-orders.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Admin Orders (e2e)', () => {
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
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /admin/orders requires admin role (client gets 403)', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/orders returns all orders with pagination meta', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const c2 = await seedUserWithToken(app, { role: 'client' });
    await prisma.order.createMany({
      data: [
        { amocrmDealId: 5001, clientUserId: c1.id, productName: 'A' },
        { amocrmDealId: 5002, clientUserId: c2.id, productName: 'B' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.page_size).toBe(20);
    expect(res.body.total).toBe(2);
  });

  it('GET /admin/orders filters by search and stage', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    await prisma.order.createMany({
      data: [
        { amocrmDealId: 5101, clientUserId: c1.id, productName: 'Kitchen', currentStage: 'production' },
        { amocrmDealId: 5102, clientUserId: c1.id, productName: 'Wardrobe', currentStage: 'detailing' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders?search=kit&stage=production')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('Kitchen');
  });

  it('GET /admin/orders/:id returns any order regardless of owner', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 5201, clientUserId: c1.id } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders/${order.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
  });

  it('GET /admin/orders/:id returns 404 for unknown id', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6.3: Run, expect FAIL** (no routes).

- [ ] **Step 6.4: Implement `apps/api/src/orders/admin-orders.controller.ts`**

```typescript
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import type { OrderResponse } from './dto/order.dto';

interface AdminListResponse {
  items: OrderResponse[];
  page: number;
  page_size: number;
  total: number;
}

@Controller('admin/orders')
@Roles('admin')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly mapper: OrdersMapper,
  ) {}

  @Get()
  async list(@Query() query: ListOrdersQueryDto): Promise<AdminListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const { rows, total } = await this.orders.listAll({
      search: query.search,
      stage: query.stage,
      page,
      pageSize,
    });
    return {
      items: rows.map((r) => this.mapper.toResponse(r)),
      page,
      page_size: pageSize,
      total,
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponse> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return this.mapper.toResponse(order);
  }
}
```

- [ ] **Step 6.5: Register `AdminOrdersController` in `OrdersModule.controllers`**

Update `apps/api/src/orders/orders.module.ts` controllers array to `[OrdersController, AdminOrdersController]`.

- [ ] **Step 6.6: Run e2e, expect PASS** (5 admin-orders tests + 7 client-orders).

- [ ] **Step 6.7: Lint + build clean.**

- [ ] **Step 6.8: Commit**

```bash
git add apps/api
git commit -m "feat(api): GET /admin/orders and /admin/orders/:id with filters"
```

---

## Task 7: Admin PATCH /admin/orders/:id/progress

**Files:**
- Modify: `apps/api/src/orders/admin-orders.controller.ts`
- Create: `apps/api/src/orders/dto/update-progress.dto.ts`
- Modify: `apps/api/test/admin-orders.e2e-spec.ts`

- [ ] **Step 7.1: Create `apps/api/src/orders/dto/update-progress.dto.ts`**

```typescript
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStage } from '@prisma/client';

export class UpdateProgressDto {
  @IsOptional()
  @IsEnum(OrderStage)
  stage?: OrderStage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
```

- [ ] **Step 7.2: Failing e2e — append to `admin-orders.e2e-spec.ts`**

Inside the `describe('Admin Orders ...')` block, append:
```typescript
  it('PATCH /admin/orders/:id/progress updates stage and percent and writes history', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 5301, clientUserId: c1.id, currentStage: 'detailing', progressPercent: 20 },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'production', progress_percent: 60, comment: 'On track' });
    expect(res.status).toBe(200);
    expect(res.body.current_stage).toBe('production');
    expect(res.body.progress_percent).toBe(60);
    expect(res.body.last_admin_comment).toBe('On track');

    const history = await prisma.orderStageHistory.findMany({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0].stage).toBe('production');
    expect(history[0].progressPercent).toBe(60);
    expect(history[0].changedByUserId).toBe(admin.id);
  });

  it('PATCH /admin/orders/:id/progress rejects invalid stage with 400', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 5302, clientUserId: c1.id } });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'not-a-stage' });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/orders/:id/progress requires admin (client gets 403)', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 5303, clientUserId: client.id } });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ progress_percent: 50 });
    expect(res.status).toBe(403);
  });
```

- [ ] **Step 7.3: Run e2e, expect FAIL** on the three new tests.

- [ ] **Step 7.4: Extend `AdminOrdersController`**

Add the necessary imports at the top:
```typescript
import { Body, HttpCode, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { UpdateProgressDto } from './dto/update-progress.dto';
```

Add this method inside the class:
```typescript
@Patch(':id/progress')
@HttpCode(200)
async updateProgress(
  @CurrentUser() user: AuthUser,
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateProgressDto,
): Promise<OrderResponse> {
  const order = await this.orders.findById(id);
  if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

  await this.orders.updateProgress(id, {
    stage: dto.stage,
    progressPercent: dto.progress_percent,
    comment: dto.comment,
    actorUserId: user.id,
  });

  const updated = await this.orders.findById(id);
  return this.mapper.toResponse(updated!);
}
```

- [ ] **Step 7.5: Run e2e, expect PASS** (8 admin-orders tests).

- [ ] **Step 7.6: Lint + build clean.**

- [ ] **Step 7.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): PATCH /admin/orders/:id/progress (admin-only)"
```

---

## Task 8: Partner GET /partner/orders + GET /partner/orders/:id

**Files:**
- Create: `apps/api/src/orders/partner-orders.controller.ts`
- Create: `apps/api/test/partner-orders.e2e-spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`

- [ ] **Step 8.1: Failing e2e**

Create `apps/api/test/partner-orders.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Partner Orders (e2e)', () => {
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
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /partner/orders returns only orders where partner_user_id matches the caller', async () => {
    const mePartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const otherPartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });

    await prisma.order.createMany({
      data: [
        { amocrmDealId: 6001, clientUserId: client.id, partnerUserId: mePartner.id, productName: 'Mine' },
        { amocrmDealId: 6002, clientUserId: client.id, partnerUserId: otherPartner.id, productName: 'Not mine' },
        { amocrmDealId: 6003, clientUserId: client.id, partnerUserId: null, productName: 'Unassigned' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/orders')
      .set('Authorization', `Bearer ${mePartner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('Mine');
  });

  it('GET /partner/orders rejects client role with 403', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/orders')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /partner/orders/:id returns 404 for a deal owned by another partner', async () => {
    const mePartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const otherPartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 6101, clientUserId: client.id, partnerUserId: otherPartner.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/partner/orders/${order.id}`)
      .set('Authorization', `Bearer ${mePartner.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /partner/orders/:id returns 200 for owner', async () => {
    const mePartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 6102, clientUserId: client.id, partnerUserId: mePartner.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/partner/orders/${order.id}`)
      .set('Authorization', `Bearer ${mePartner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
  });
});
```

- [ ] **Step 8.2: Run e2e, expect FAIL.**

- [ ] **Step 8.3: Implement `apps/api/src/orders/partner-orders.controller.ts`**

```typescript
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { OrdersService } from './orders.service';
import { OrdersMapper } from './orders.mapper';
import type { OrderResponse } from './dto/order.dto';

@Controller('partner/orders')
@Roles('partner')
export class PartnerOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly mapper: OrdersMapper,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ items: OrderResponse[] }> {
    const rows = await this.orders.listForPartner(user.id);
    return { items: rows.map((r) => this.mapper.toResponse(r)) };
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    const order = await this.orders.findByIdForPartner(id, user.id);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return this.mapper.toResponse(order);
  }
}
```

- [ ] **Step 8.4: Register controller in `OrdersModule.controllers`** — add `PartnerOrdersController`.

- [ ] **Step 8.5: Run e2e, expect PASS** (4 partner-orders tests).

- [ ] **Step 8.6: Lint + build clean.**

- [ ] **Step 8.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): GET /partner/orders and /partner/orders/:id (partner-only)"
```

---

## Task 9: Ensure HealthController still works under JwtAuthGuard role check chain

`@Roles('client' | 'admin' | 'partner')` is the new pattern across orders controllers. The pre-existing `@Public()` decorator on health and auth endpoints still bypasses both `JwtAuthGuard` and `RolesGuard` (the latter has `if (!required || required.length === 0) return true;` — but `@Public()` short-circuits before that anyway via `JwtAuthGuard.canActivate`).

But there's a subtler issue: `RolesGuard` runs *after* `JwtAuthGuard`. For `@Public()` endpoints, JwtAuthGuard returns `true` without populating `request.user`. Then RolesGuard sees no required roles (no `@Roles` on the handler), so it also returns `true`. Good.

However: if a future controller has `@Public()` AND `@Roles('admin')`, RolesGuard would deny because `user` is undefined. That's the desired behaviour (don't put `@Public` and `@Roles` on the same endpoint).

For Plan 3 there is no such combination. We only need a smoke check that the existing public endpoints still work.

- [ ] **Step 9.1: Add a regression assertion to `apps/api/test/health.e2e-spec.ts`** (read current file first)

Append one more test inside the existing `describe('Health (e2e)')`:
```typescript
  it('GET /healthz is still public under the orders role guards', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
```

If the existing file already has a test with the same name, skip this step. Otherwise add it.

- [ ] **Step 9.2: Run health e2e, expect PASS.**

```bash
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/health.e2e-spec.ts
```

- [ ] **Step 9.3: Commit (if anything was added)**

```bash
git add apps/api/test/health.e2e-spec.ts
git commit -m "test(api): regression check that /healthz stays public"
```

If `git status` shows no changes (because the test already exists), skip the commit.

---

## Task 10: Update `/me` to expose the role to clients (sanity)

The mobile client (Plan 6) will need to know the user's role to decide which screens to render. The existing `GET /api/v1/me` from Plan 1 already returns `role`. Verify with a test and adjust if missing.

- [ ] **Step 10.1: Read `apps/api/src/users/users.controller.ts`** to confirm `GET /me` includes `role` in the response. If yes, no code change needed.

- [ ] **Step 10.2: Append to `apps/api/test/users.e2e-spec.ts`** (inside the existing describe block):
```typescript
  it('GET /me returns the role field', async () => {
    // (reuse the existing login helper / setup pattern in the file)
    // This test only documents the contract — if the field is already there, it just adds a guard.
  });
```

If the file already asserts on `role`, skip this step and Step 10.3 entirely. Otherwise insert a minimal version mirroring an existing test in the file.

- [ ] **Step 10.3: Run users e2e, expect PASS.**

- [ ] **Step 10.4: Commit if any change**

```bash
git add apps/api/test/users.e2e-spec.ts
git commit -m "test(api): /me response includes role field"
```

Skip if nothing changed.

---

## Task 11: Full Verification + Push + CI

- [ ] **Step 11.1: Run full test suite from root**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All packages green. Expected api totals: 28 unit tests, 23+15 = ~38 e2e tests (existing 23 + new client 7 + admin 8 + partner 4 — some count adjustments are normal).

- [ ] **Step 11.2: Smoke test against a running server**

```bash
pnpm dev:infra
pnpm --filter @vittoria/api dev
```

In another shell, seed the same way the e2e does, manually:
```bash
# Create a client user directly so request-code succeeds.
docker exec infra-postgres-1 psql -U vittoria -d vittoria_dev -c \
  "INSERT INTO users (id, phone, role, created_at, updated_at) VALUES (gen_random_uuid(), '+79991234567', 'client', NOW(), NOW()) ON CONFLICT (phone) DO NOTHING;"

# Request code, copy from api log, verify.
curl -X POST http://localhost:3000/api/v1/auth/request-code -H "Content-Type: application/json" -d '{"phone":"+79991234567"}'
# (read OTP from api stdout)
curl -X POST http://localhost:3000/api/v1/auth/verify-code -H "Content-Type: application/json" -d '{"phone":"+79991234567","code":"<OTP>"}'
# Copy access_token. Then:
curl http://localhost:3000/api/v1/orders -H "Authorization: Bearer <ACCESS_TOKEN>"
```

Expected: `{"items":[]}` — empty array because no orders for this user yet.

Stop dev server and `pnpm dev:infra:down` if you're not continuing immediately.

- [ ] **Step 11.3: Push**

```bash
git push origin main
```

- [ ] **Step 11.4: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions and confirm the latest run is green.

---

## Definition of Done

Plan 3 is complete when:

- [x] `GET /api/v1/orders` returns the caller's orders (client only).
- [x] `GET /api/v1/orders/:id` returns 200 for owner, 404 for non-owner.
- [x] `GET /api/v1/orders/:id/history` returns history newest-first; 404 for non-owner.
- [x] `GET /api/v1/orders/:id/partner-services` returns the JSON array.
- [x] `GET /api/v1/admin/orders` admin-only, paginated, filterable by `search` and `stage`.
- [x] `GET /api/v1/admin/orders/:id` admin-only.
- [x] `PATCH /api/v1/admin/orders/:id/progress` admin-only; writes order + history + audit + enqueues outbound (existing `OrdersService.updateProgress`).
- [x] `GET /api/v1/partner/orders` partner-only, scoped to `partnerUserId`.
- [x] `GET /api/v1/partner/orders/:id` partner-only, 404 for a deal owned by another partner.
- [x] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test` all exit 0.
- [x] GitHub Actions CI green.

After Plan 3 lands, proceed to **Plan 4: Notifications** (push + SMS providers, NotificationService triggered by `order.progress.updated` events) — that closes the loop: admin changes stage → client gets a push.

---

**End of Plan 3.**
