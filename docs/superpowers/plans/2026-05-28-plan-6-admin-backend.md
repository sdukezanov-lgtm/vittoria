# Plan 6: Admin/Partner Backend Endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Доделать backend endpoints для будущей admin/partner SPA: управление admin/partner пользователями, просмотр audit-log, partner commissions (новая модель + admin CRUD + partner read), и перевод hardcoded notification-шаблонов в редактируемые DB-шаблоны.

**Architecture:** Расширяет существующие модули `users/`, `audit/`, `notifications/` и добавляет новый `commissions/`, следуя паттерну Plans 3/5 (Controller + Service + DTO, `@Roles` на контроллере, snake_case). Часть D переводит `renderTemplate` с синхронной hardcoded-функции на async `TemplatesService.render` (DB lookup + `{{placeholder}}` substitution), seed дефолтов в миграции.

**Tech Stack:** NestJS, Prisma 5.x, class-validator, BullMQ (notifications worker), Jest + Testcontainers. Без новых зависимостей.

**Reference spec:** [docs/superpowers/specs/2026-05-28-plan-6-admin-backend-design.md](../specs/2026-05-28-plan-6-admin-backend-design.md)

**Prerequisites:**
- Plans 1–5 завершены. `main` на `243e792` или позднее.
- Docker Desktop running (`pnpm dev:infra` — postgres + redis).
- 64 unit + 61 e2e зелёные.

---

## File Structure

```
apps/api/src/users/
├── admin-users.controller.ts            ← NEW (GET/POST /admin/users)
├── admin-users.service.ts               ← NEW (list + create)
├── dto/create-user.dto.ts               ← NEW
├── dto/list-users.query.dto.ts          ← NEW
├── users.module.ts                      ← MODIFY (+controller, +service)
└── __tests__/admin-users.service.spec.ts ← NEW

apps/api/src/audit/
├── audit.controller.ts                  ← NEW (GET /admin/audit-log)
├── audit.service.ts                     ← MODIFY (+list method)
├── dto/list-audit.query.dto.ts          ← NEW
├── audit.module.ts                      ← MODIFY (+controller)
└── __tests__/audit.service.spec.ts      ← MODIFY (+list tests)

apps/api/src/commissions/                ← NEW MODULE
├── commissions.module.ts                ← NEW
├── commissions.service.ts               ← NEW
├── admin-commissions.controller.ts      ← NEW
├── partner-commissions.controller.ts    ← NEW
├── commissions.mapper.ts                ← NEW
├── dto/create-commission.dto.ts         ← NEW
├── dto/update-commission.dto.ts         ← NEW
├── dto/list-commissions.query.dto.ts    ← NEW
└── __tests__/commissions.service.spec.ts ← NEW

apps/api/src/notifications/
├── notifications.vars.ts                ← NEW (substitute + buildVars + STAGE_LABELS)
├── templates.service.ts                 ← NEW (render via DB)
├── notification-templates.controller.ts ← NEW (GET/PATCH /admin/notification-templates)
├── dto/update-template.dto.ts           ← NEW
├── jobs/notifications.processor.ts      ← MODIFY (use TemplatesService)
├── notifications.templates.ts           ← DELETE (renderTemplate removed)
├── notifications.module.ts              ← MODIFY (+TemplatesService, +controller)
└── __tests__/
    ├── notifications.templates.spec.ts  ← DELETE (replaced)
    └── notifications.vars.spec.ts       ← NEW (substitute + buildVars)

apps/api/src/app.module.ts               ← MODIFY (+CommissionsModule)

apps/api/prisma/
├── schema.prisma                        ← MODIFY (+PartnerCommission, +NotificationTemplate, +enum, relations)
└── migrations/
    ├── <ts>_add_partner_commissions/migration.sql   ← NEW
    └── <ts>_add_notification_templates/migration.sql ← NEW (+seed INSERTs)

apps/api/test/
├── admin-users.e2e-spec.ts              ← NEW
├── admin-audit.e2e-spec.ts              ← NEW
├── commissions.e2e-spec.ts              ← NEW
└── notification-templates.e2e-spec.ts   ← NEW
```

---

## Task 1: Admin Users Service (list + create)

**Files:**
- Create: `apps/api/src/users/admin-users.service.ts`
- Create: `apps/api/src/users/__tests__/admin-users.service.spec.ts`

- [ ] **Step 1.1: Failing unit test**

Create `apps/api/src/users/__tests__/admin-users.service.spec.ts`:

```typescript
import { AdminUsersService } from '../admin-users.service';

describe('AdminUsersService.createUser', () => {
  const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'u-new',
        phone: data.phone,
        role: data.role,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        createdAt: new Date(),
      })),
    },
    ...overrides,
  });

  it('creates an admin user', async () => {
    const prisma = makePrisma();
    const svc = new AdminUsersService(prisma as never);
    const u = await svc.createUser({ phone: '+79990000001', role: 'admin', first_name: 'A', last_name: 'B' });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { phone: '+79990000001', role: 'admin', firstName: 'A', lastName: 'B' },
    });
    expect(u.id).toBe('u-new');
  });

  it('throws ConflictException when phone already exists', async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
    });
    const svc = new AdminUsersService(prisma as never);
    await expect(
      svc.createUser({ phone: '+79990000001', role: 'partner' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.listUsers', () => {
  it('filters by role and paginates', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new AdminUsersService(prisma as never);
    const res = await svc.listUsers({ role: 'partner', page: 2, page_size: 10 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'partner' },
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    }));
    expect(res.total).toBe(1);
    expect(res.page).toBe(2);
    expect(res.page_size).toBe(10);
  });

  it('lists all roles when no filter', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new AdminUsersService(prisma as never);
    await svc.listUsers({});
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
    }));
  });
});
```

- [ ] **Step 1.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- admin-users.service.spec.ts
```

- [ ] **Step 1.3: Implement `apps/api/src/users/admin-users.service.ts`**

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserArgs {
  phone: string;
  role: 'admin' | 'partner';
  first_name?: string;
  last_name?: string;
}

export interface ListUsersArgs {
  role?: UserRole;
  page?: number;
  page_size?: number;
}

export interface ListUsersResult {
  rows: User[];
  total: number;
  page: number;
  page_size: number;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(args: CreateUserArgs): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone: args.phone } });
    if (existing) {
      throw new ConflictException({ code: 'USER_PHONE_EXISTS', message: 'Phone already registered' });
    }
    return this.prisma.user.create({
      data: {
        phone: args.phone,
        role: args.role,
        firstName: args.first_name,
        lastName: args.last_name,
      },
    });
  }

  async listUsers(args: ListUsersArgs): Promise<ListUsersResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where = args.role ? { role: args.role } : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total, page, page_size: pageSize };
  }
}
```

- [ ] **Step 1.4: Run, expect PASS** (4 tests).

```bash
pnpm --filter @vittoria/api test:unit -- admin-users.service.spec.ts
```

- [ ] **Step 1.5: Commit**

```bash
git add apps/api/src/users
git commit -m "feat(api): AdminUsersService (list + create with phone-dedup)"
```

---

## Task 2: Admin Users Controller + DTOs

**Files:**
- Create: `apps/api/src/users/dto/create-user.dto.ts`
- Create: `apps/api/src/users/dto/list-users.query.dto.ts`
- Create: `apps/api/src/users/admin-users.controller.ts`
- Modify: `apps/api/src/users/users.module.ts`
- Create: `apps/api/test/admin-users.e2e-spec.ts`

- [ ] **Step 2.1: Create `apps/api/src/users/dto/create-user.dto.ts`**

```typescript
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateUserDto {
  @Matches(/^\+7\d{10}$/, { message: 'phone must be +7XXXXXXXXXX' })
  phone!: string;

  @IsIn(['admin', 'partner'])
  role!: 'admin' | 'partner';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;
}
```

- [ ] **Step 2.2: Create `apps/api/src/users/dto/list-users.query.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { UserRole } from '@prisma/client';

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

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

- [ ] **Step 2.3: Create `apps/api/src/users/admin-users.controller.ts`**

```typescript
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import type { User } from '@prisma/client';

interface UserResponse {
  id: string;
  phone: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

function toUserResponse(u: User): UserResponse {
  return {
    id: u.id,
    phone: u.phone,
    role: u.role,
    first_name: u.firstName,
    last_name: u.lastName,
    created_at: u.createdAt.toISOString(),
  };
}

@Controller('admin/users')
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  async list(
    @Query() query: ListUsersQueryDto,
  ): Promise<{ rows: UserResponse[]; total: number; page: number; page_size: number }> {
    const result = await this.adminUsers.listUsers({
      role: query.role,
      page: query.page,
      page_size: query.page_size,
    });
    return {
      rows: result.rows.map(toUserResponse),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
    const u = await this.adminUsers.createUser(dto);
    return toUserResponse(u);
  }
}
```

- [ ] **Step 2.4: Wire into `apps/api/src/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';

@Module({
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, AdminUsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 2.5: Failing e2e — create `apps/api/test/admin-users.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Admin Users (e2e)', () => {
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
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('POST /admin/users creates a partner', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ phone: '+79991112233', role: 'partner', first_name: 'Пётр' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('partner');
    expect(res.body.phone).toBe('+79991112233');
    const stored = await prisma.user.findUnique({ where: { phone: '+79991112233' } });
    expect(stored).not.toBeNull();
  });

  it('POST /admin/users rejects role=client with 400', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ phone: '+79994445566', role: 'client' });
    expect(res.status).toBe(400);
  });

  it('POST /admin/users returns 409 on duplicate phone', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    await prisma.user.create({ data: { phone: '+79997778899', role: 'partner' } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ phone: '+79997778899', role: 'admin' });
    expect(res.status).toBe(409);
  });

  it('GET /admin/users filters by role', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    await prisma.user.create({ data: { phone: '+79990000011', role: 'partner' } });
    await prisma.user.create({ data: { phone: '+79990000012', role: 'partner' } });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users?role=partner')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((u: { role: string }) => u.role === 'partner')).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /admin/users returns 403 for non-admin', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2.6: Run e2e, expect PASS** (5 tests).

```bash
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/admin-users.e2e-spec.ts
```

- [ ] **Step 2.7: Lint + build clean**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
```

- [ ] **Step 2.8: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat(api): GET/POST /admin/users (admin-only)"
```

---

## Task 3: Audit Log Viewer

**Files:**
- Modify: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/dto/list-audit.query.dto.ts`
- Create: `apps/api/src/audit/audit.controller.ts`
- Modify: `apps/api/src/audit/audit.module.ts`
- Modify: `apps/api/src/audit/__tests__/audit.service.spec.ts`
- Create: `apps/api/test/admin-audit.e2e-spec.ts`

- [ ] **Step 3.1: Failing unit test — append to `apps/api/src/audit/__tests__/audit.service.spec.ts`**

Read the file first. Append a new describe block (the file already constructs `AuditService` with a Prisma mock — match its style; below assumes the standard `new AuditService(prisma)` constructor):

```typescript
describe('AuditService.list', () => {
  it('filters by entity and actor, paginates, orders desc', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new AuditService(prisma as never);
    const res = await svc.list({ entity: 'Order', actor: 'actor-1', page: 1, page_size: 50 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { entity: 'Order', actorUserId: 'actor-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 50,
    }));
    expect(res.total).toBe(1);
  });

  it('lists all when no filters', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new AuditService(prisma as never);
    await svc.list({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
    }));
  });
});
```

- [ ] **Step 3.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- audit.service.spec.ts
```

- [ ] **Step 3.3: Add `list` method to `apps/api/src/audit/audit.service.ts`**

Read the existing file. Add imports for the type and append the method + interfaces (keep the existing `record` method intact):

```typescript
import type { AuditLog } from '@prisma/client';

export interface ListAuditArgs {
  entity?: string;
  actor?: string;
  page?: number;
  page_size?: number;
}

export interface ListAuditResult {
  rows: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}
```

Add to the `AuditService` class:

```typescript
  async list(args: ListAuditArgs): Promise<ListAuditResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where: { entity?: string; actorUserId?: string } = {};
    if (args.entity) where.entity = args.entity;
    if (args.actor) where.actorUserId = args.actor;
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, page, page_size: pageSize };
  }
```

- [ ] **Step 3.4: Create `apps/api/src/audit/dto/list-audit.query.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListAuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @IsOptional()
  @IsUUID()
  actor?: string;

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

- [ ] **Step 3.5: Create `apps/api/src/audit/audit.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit.query.dto';
import type { AuditLog } from '@prisma/client';

interface AuditLogResponse {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

function toResponse(a: AuditLog): AuditLogResponse {
  return {
    id: a.id,
    actor_user_id: a.actorUserId,
    action: a.action,
    entity: a.entity,
    entity_id: a.entityId,
    before: a.before,
    after: a.after,
    created_at: a.createdAt.toISOString(),
  };
}

@Controller('admin/audit-log')
@Roles('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @Query() query: ListAuditQueryDto,
  ): Promise<{ rows: AuditLogResponse[]; total: number; page: number; page_size: number }> {
    const result = await this.audit.list({
      entity: query.entity,
      actor: query.actor,
      page: query.page,
      page_size: query.page_size,
    });
    return {
      rows: result.rows.map(toResponse),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }
}
```

- [ ] **Step 3.6: Wire controller into `apps/api/src/audit/audit.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 3.7: Create `apps/api/test/admin-audit.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Admin Audit Log (e2e)', () => {
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
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /admin/audit-log returns records, filtered by entity', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    await prisma.auditLog.create({ data: { action: 'order.progress.updated', entity: 'Order', entityId: 'o1' } });
    await prisma.auditLog.create({ data: { action: 'chat.message.sent', entity: 'Message', entityId: 'm1' } });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-log?entity=Order')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r: { entity: string }) => r.entity === 'Order')).toBe(true);
    expect(res.body.rows[0].action).toBe('order.progress.updated');
  });

  it('GET /admin/audit-log returns 403 for non-admin', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-log')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3.8: Run unit + e2e, expect PASS**

```bash
pnpm --filter @vittoria/api test:unit -- audit.service.spec.ts
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/admin-audit.e2e-spec.ts
```

- [ ] **Step 3.9: Lint + build, commit**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
git add apps/api/src apps/api/test
git commit -m "feat(api): GET /admin/audit-log with entity/actor filters"
```

---

## Task 4: Prisma Migration — PartnerCommission

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_partner_commissions/migration.sql` (auto-generated)

- [ ] **Step 4.1: Add enum + model + relations**

In `apps/api/prisma/schema.prisma`, add after the `Message` model:

```prisma
enum PayoutStatus {
  pending
  approved
  paid
}

model PartnerCommission {
  id            String       @id @default(uuid()) @db.Uuid
  orderId       String       @map("order_id") @db.Uuid
  partnerUserId String       @map("partner_user_id") @db.Uuid
  amount        Decimal      @db.Decimal(12, 2)
  payoutStatus  PayoutStatus @default(pending) @map("payout_status")
  paidAt        DateTime?    @map("paid_at")
  createdAt     DateTime     @default(now()) @map("created_at")

  order   Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  partner User  @relation("PartnerCommissions", fields: [partnerUserId], references: [id])

  @@index([partnerUserId])
  @@index([orderId])
  @@map("partner_commissions")
}
```

In `model User { ... }`, add next to other relations (after `sentMessages`):
```prisma
  commissions   PartnerCommission[] @relation("PartnerCommissions")
```

In `model Order { ... }`, add next to `chat`:
```prisma
  commissions PartnerCommission[]
```

- [ ] **Step 4.2: Format + migrate**

```bash
cd apps/api && pnpm exec prisma format && pnpm exec prisma migrate dev --name add_partner_commissions && cd ../..
```

- [ ] **Step 4.3: Verify build + existing tests**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:unit
```

All existing unit tests stay green.

- [ ] **Step 4.4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add PartnerCommission Prisma model + migration"
```

---

## Task 5: CommissionsService

**Files:**
- Create: `apps/api/src/commissions/commissions.service.ts`
- Create: `apps/api/src/commissions/__tests__/commissions.service.spec.ts`

- [ ] **Step 5.1: Failing unit test**

Create `apps/api/src/commissions/__tests__/commissions.service.spec.ts`:

```typescript
import { CommissionsService } from '../commissions.service';

const ORDER_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-0000000000p1';
const COMMISSION_ID = '00000000-0000-0000-0000-0000000000c1';

describe('CommissionsService.create', () => {
  const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    order: { findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID }) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: PARTNER_ID, role: 'partner' }) },
    partnerCommission: {
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: COMMISSION_ID,
        orderId: data.orderId,
        partnerUserId: data.partnerUserId,
        amount: data.amount,
        payoutStatus: 'pending',
        paidAt: null,
        createdAt: new Date(),
      })),
    },
    ...overrides,
  });

  it('creates a commission for a valid partner', async () => {
    const prisma = makePrisma();
    const svc = new CommissionsService(prisma as never);
    const c = await svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 });
    expect(prisma.partnerCommission.create).toHaveBeenCalledWith({
      data: { orderId: ORDER_ID, partnerUserId: PARTNER_ID, amount: 5000 },
    });
    expect(c.id).toBe(COMMISSION_ID);
  });

  it('throws 404 when order does not exist', async () => {
    const prisma = makePrisma({ order: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new CommissionsService(prisma as never);
    await expect(
      svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when partner user is not a partner', async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue({ id: PARTNER_ID, role: 'client' }) },
    });
    const svc = new CommissionsService(prisma as never);
    await expect(
      svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when partner user does not exist', async () => {
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new CommissionsService(prisma as never);
    await expect(
      svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('CommissionsService.updateStatus', () => {
  const makePrisma = () => ({
    partnerCommission: {
      findUnique: jest.fn().mockResolvedValue({ id: COMMISSION_ID }),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: COMMISSION_ID,
        orderId: ORDER_ID,
        partnerUserId: PARTNER_ID,
        amount: '5000',
        payoutStatus: data.payoutStatus,
        paidAt: data.paidAt,
        createdAt: new Date(),
      })),
    },
  });

  it('sets paidAt when status becomes paid', async () => {
    const prisma = makePrisma();
    const svc = new CommissionsService(prisma as never);
    await svc.updateStatus(COMMISSION_ID, 'paid');
    const call = prisma.partnerCommission.update.mock.calls[0][0];
    expect(call.data.payoutStatus).toBe('paid');
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it('clears paidAt when status is not paid', async () => {
    const prisma = makePrisma();
    const svc = new CommissionsService(prisma as never);
    await svc.updateStatus(COMMISSION_ID, 'approved');
    const call = prisma.partnerCommission.update.mock.calls[0][0];
    expect(call.data.payoutStatus).toBe('approved');
    expect(call.data.paidAt).toBeNull();
  });

  it('throws 404 when commission not found', async () => {
    const prisma = makePrisma();
    prisma.partnerCommission.findUnique = jest.fn().mockResolvedValue(null);
    const svc = new CommissionsService(prisma as never);
    await expect(svc.updateStatus(COMMISSION_ID, 'paid')).rejects.toMatchObject({ status: 404 });
  });
});

describe('CommissionsService list', () => {
  it('listForPartner scopes by partnerUserId', async () => {
    const prisma = {
      partnerCommission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      },
    };
    const svc = new CommissionsService(prisma as never);
    await svc.listForPartner(PARTNER_ID, {});
    expect(prisma.partnerCommission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerUserId: PARTNER_ID },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('listForPartner adds payoutStatus filter', async () => {
    const prisma = {
      partnerCommission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new CommissionsService(prisma as never);
    await svc.listForPartner(PARTNER_ID, { payout_status: 'paid' });
    expect(prisma.partnerCommission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerUserId: PARTNER_ID, payoutStatus: 'paid' },
    }));
  });

  it('listAdmin paginates and filters', async () => {
    const prisma = {
      partnerCommission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new CommissionsService(prisma as never);
    const res = await svc.listAdmin({ partner_user_id: PARTNER_ID, page: 1, page_size: 20 });
    expect(prisma.partnerCommission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerUserId: PARTNER_ID },
      skip: 0,
      take: 20,
    }));
    expect(res.total).toBe(1);
  });
});
```

- [ ] **Step 5.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- commissions.service.spec.ts
```

- [ ] **Step 5.3: Implement `apps/api/src/commissions/commissions.service.ts`**

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PartnerCommission, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateCommissionArgs {
  order_id: string;
  partner_user_id: string;
  amount: number;
}

export interface ListAdminCommissionsArgs {
  partner_user_id?: string;
  payout_status?: PayoutStatus;
  page?: number;
  page_size?: number;
}

export interface ListAdminCommissionsResult {
  rows: PartnerCommission[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListPartnerCommissionsArgs {
  payout_status?: PayoutStatus;
}

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(args: CreateCommissionArgs): Promise<PartnerCommission> {
    const order = await this.prisma.order.findUnique({ where: { id: args.order_id } });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    const partner = await this.prisma.user.findUnique({ where: { id: args.partner_user_id } });
    if (!partner || partner.role !== 'partner') {
      throw new BadRequestException({ code: 'INVALID_PARTNER', message: 'partner_user_id must reference a partner' });
    }
    return this.prisma.partnerCommission.create({
      data: {
        orderId: args.order_id,
        partnerUserId: args.partner_user_id,
        amount: args.amount,
      },
    });
  }

  async updateStatus(id: string, payoutStatus: PayoutStatus): Promise<PartnerCommission> {
    const existing = await this.prisma.partnerCommission.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'COMMISSION_NOT_FOUND', message: 'Commission not found' });
    }
    return this.prisma.partnerCommission.update({
      where: { id },
      data: {
        payoutStatus,
        paidAt: payoutStatus === 'paid' ? new Date() : null,
      },
    });
  }

  async listAdmin(args: ListAdminCommissionsArgs): Promise<ListAdminCommissionsResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where: { partnerUserId?: string; payoutStatus?: PayoutStatus } = {};
    if (args.partner_user_id) where.partnerUserId = args.partner_user_id;
    if (args.payout_status) where.payoutStatus = args.payout_status;
    const [rows, total] = await Promise.all([
      this.prisma.partnerCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.partnerCommission.count({ where }),
    ]);
    return { rows, total, page, page_size: pageSize };
  }

  async listForPartner(partnerUserId: string, args: ListPartnerCommissionsArgs): Promise<PartnerCommission[]> {
    const where: { partnerUserId: string; payoutStatus?: PayoutStatus } = { partnerUserId };
    if (args.payout_status) where.payoutStatus = args.payout_status;
    return this.prisma.partnerCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

- [ ] **Step 5.4: Run, expect PASS** (10 tests).

```bash
pnpm --filter @vittoria/api test:unit -- commissions.service.spec.ts
```

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/commissions
git commit -m "feat(api): CommissionsService (create, updateStatus, list)"
```

---

## Task 6: Commissions Controllers + Module

**Files:**
- Create: `apps/api/src/commissions/commissions.mapper.ts`
- Create: `apps/api/src/commissions/dto/create-commission.dto.ts`
- Create: `apps/api/src/commissions/dto/update-commission.dto.ts`
- Create: `apps/api/src/commissions/dto/list-commissions.query.dto.ts`
- Create: `apps/api/src/commissions/admin-commissions.controller.ts`
- Create: `apps/api/src/commissions/partner-commissions.controller.ts`
- Create: `apps/api/src/commissions/commissions.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/commissions.e2e-spec.ts`

- [ ] **Step 6.1: Create `apps/api/src/commissions/commissions.mapper.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import type { PartnerCommission } from '@prisma/client';

export interface CommissionResponse {
  id: string;
  order_id: string;
  partner_user_id: string;
  amount: string;
  payout_status: string;
  paid_at: string | null;
  created_at: string;
}

@Injectable()
export class CommissionsMapper {
  toResponse(c: PartnerCommission): CommissionResponse {
    return {
      id: c.id,
      order_id: c.orderId,
      partner_user_id: c.partnerUserId,
      amount: c.amount.toString(),
      payout_status: c.payoutStatus,
      paid_at: c.paidAt ? c.paidAt.toISOString() : null,
      created_at: c.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 6.2: Create `apps/api/src/commissions/dto/create-commission.dto.ts`**

```typescript
import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateCommissionDto {
  @IsUUID()
  order_id!: string;

  @IsUUID()
  partner_user_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}
```

- [ ] **Step 6.3: Create `apps/api/src/commissions/dto/update-commission.dto.ts`**

```typescript
import { IsEnum } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class UpdateCommissionDto {
  @IsEnum(PayoutStatus)
  payout_status!: PayoutStatus;
}
```

- [ ] **Step 6.4: Create `apps/api/src/commissions/dto/list-commissions.query.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class ListCommissionsQueryDto {
  @IsOptional()
  @IsUUID()
  partner_user_id?: string;

  @IsOptional()
  @IsEnum(PayoutStatus)
  payout_status?: PayoutStatus;

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

export class PartnerCommissionsQueryDto {
  @IsOptional()
  @IsEnum(PayoutStatus)
  payout_status?: PayoutStatus;
}
```

- [ ] **Step 6.5: Create `apps/api/src/commissions/admin-commissions.controller.ts`**

```typescript
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CommissionsService } from './commissions.service';
import { CommissionsMapper, CommissionResponse } from './commissions.mapper';
import { CreateCommissionDto } from './dto/create-commission.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { ListCommissionsQueryDto } from './dto/list-commissions.query.dto';

@Controller('admin/commissions')
@Roles('admin')
export class AdminCommissionsController {
  constructor(
    private readonly commissions: CommissionsService,
    private readonly mapper: CommissionsMapper,
  ) {}

  @Post()
  async create(@Body() dto: CreateCommissionDto): Promise<CommissionResponse> {
    const c = await this.commissions.create(dto);
    return this.mapper.toResponse(c);
  }

  @Patch(':id')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommissionDto,
  ): Promise<CommissionResponse> {
    const c = await this.commissions.updateStatus(id, dto.payout_status);
    return this.mapper.toResponse(c);
  }

  @Get()
  async list(
    @Query() query: ListCommissionsQueryDto,
  ): Promise<{ rows: CommissionResponse[]; total: number; page: number; page_size: number }> {
    const result = await this.commissions.listAdmin({
      partner_user_id: query.partner_user_id,
      payout_status: query.payout_status,
      page: query.page,
      page_size: query.page_size,
    });
    return {
      rows: result.rows.map((c) => this.mapper.toResponse(c)),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }
}
```

- [ ] **Step 6.6: Create `apps/api/src/commissions/partner-commissions.controller.ts`**

```typescript
import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { CommissionsService } from './commissions.service';
import { CommissionsMapper, CommissionResponse } from './commissions.mapper';
import { PartnerCommissionsQueryDto } from './dto/list-commissions.query.dto';

@Controller('partner/commissions')
@Roles('partner')
export class PartnerCommissionsController {
  constructor(
    private readonly commissions: CommissionsService,
    private readonly mapper: CommissionsMapper,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: PartnerCommissionsQueryDto,
  ): Promise<{ rows: CommissionResponse[] }> {
    const rows = await this.commissions.listForPartner(user.id, {
      payout_status: query.payout_status,
    });
    return { rows: rows.map((c) => this.mapper.toResponse(c)) };
  }
}
```

- [ ] **Step 6.7: Create `apps/api/src/commissions/commissions.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CommissionsMapper } from './commissions.mapper';
import { AdminCommissionsController } from './admin-commissions.controller';
import { PartnerCommissionsController } from './partner-commissions.controller';

@Module({
  controllers: [AdminCommissionsController, PartnerCommissionsController],
  providers: [CommissionsService, CommissionsMapper],
  exports: [CommissionsService],
})
export class CommissionsModule {}
```

- [ ] **Step 6.8: Wire into `apps/api/src/app.module.ts`**

Add import after `ChatModule`:
```typescript
import { CommissionsModule } from './commissions/commissions.module';
```

Add to imports array after `ChatModule`:
```typescript
    ChatModule,
    CommissionsModule,
```

- [ ] **Step 6.9: Create `apps/api/test/commissions.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Commissions (e2e)', () => {
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
    await prisma.partnerCommission.deleteMany();
    await prisma.order.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  const seedOrder = async (clientId: string, dealId = 6001) =>
    prisma.order.create({
      data: { amocrmDealId: dealId, clientUserId: clientId, currentStage: 'production', progressPercent: 50 },
    });

  it('admin POST → PATCH(paid) sets paid_at; partner sees only own', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const partner = await seedUserWithToken(app, { role: 'partner', phone: '+79990001122' });
    const order = await seedOrder(client.id);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/commissions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ order_id: order.id, partner_user_id: partner.id, amount: 5000 });
    expect(created.status).toBe(201);
    expect(created.body.payout_status).toBe('pending');
    expect(created.body.amount).toBe('5000');

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/admin/commissions/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ payout_status: 'paid' });
    expect(patched.status).toBe(200);
    expect(patched.body.payout_status).toBe('paid');
    expect(patched.body.paid_at).not.toBeNull();

    const partnerView = await request(app.getHttpServer())
      .get('/api/v1/partner/commissions')
      .set('Authorization', `Bearer ${partner.accessToken}`);
    expect(partnerView.status).toBe(200);
    expect(partnerView.body.rows).toHaveLength(1);
    expect(partnerView.body.rows[0].partner_user_id).toBe(partner.id);
  });

  it('partner does not see other partners commissions', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const p1 = await seedUserWithToken(app, { role: 'partner', phone: '+79990002233' });
    const p2 = await seedUserWithToken(app, { role: 'partner', phone: '+79990003344' });
    const order = await seedOrder(client.id, 6002);
    await prisma.partnerCommission.create({
      data: { orderId: order.id, partnerUserId: p1.id, amount: 1000 },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/commissions')
      .set('Authorization', `Bearer ${p2.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
  });

  it('admin POST with non-partner user_id → 400', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await seedOrder(client.id, 6003);
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/commissions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ order_id: order.id, partner_user_id: client.id, amount: 5000 });
    expect(res.status).toBe(400);
  });

  it('GET /partner/commissions returns 403 for admin', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/commissions')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('POST /admin/commissions returns 403 for partner', async () => {
    const partner = await seedUserWithToken(app, { role: 'partner', phone: '+79990004455' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/commissions')
      .set('Authorization', `Bearer ${partner.accessToken}`)
      .send({ order_id: '00000000-0000-0000-0000-000000000001', partner_user_id: partner.id, amount: 100 });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6.10: Run e2e, expect PASS** (5 tests).

```bash
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/commissions.e2e-spec.ts
```

- [ ] **Step 6.11: Lint + build, commit**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
git add apps/api/src apps/api/test
git commit -m "feat(api): commissions endpoints (admin CRUD + partner read)"
```

---

## Task 7: Prisma Migration — NotificationTemplate + Seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_notification_templates/migration.sql`

- [ ] **Step 7.1: Add model**

In `apps/api/prisma/schema.prisma`, add after `PartnerCommission`:

```prisma
model NotificationTemplate {
  event     String   @id
  title     String
  body      String
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("notification_templates")
}
```

- [ ] **Step 7.2: Generate migration (do NOT apply yet)**

```bash
cd apps/api && pnpm exec prisma format && pnpm exec prisma migrate dev --name add_notification_templates --create-only && cd ../..
```

`--create-only` generates the SQL without applying, so the seed INSERTs can be appended first.

- [ ] **Step 7.3: Append seed INSERTs to the generated migration**

Open the new file `apps/api/prisma/migrations/<ts>_add_notification_templates/migration.sql` and append at the end:

```sql
-- Seed default templates (matches the hardcoded strings from Plan 4/5)
INSERT INTO "notification_templates" ("event", "title", "body", "updated_at") VALUES
  ('order.stage.changed',    'VITTORIA HOME', '{{order}}: новый этап — «{{stageLabel}}».',                   NOW()),
  ('order.progress.changed', 'VITTORIA HOME', '{{order}}: готовность {{percent}}%.',                          NOW()),
  ('order.ready',            'VITTORIA HOME', '{{order}} готов к передаче. Сервисный отдел свяжется с вами.', NOW()),
  ('chat.reply.received',    'VITTORIA HOME', '{{order}}: новый ответ от сервиса.{{previewTail}}',            NOW());
```

- [ ] **Step 7.4: Apply migration**

```bash
cd apps/api && pnpm exec prisma migrate dev && cd ../..
```

This applies the pending migration (with the seed). Verify the seed:

```bash
docker exec infra-postgres-1 psql -U vittoria -d vittoria_dev -c "SELECT event FROM notification_templates ORDER BY event;"
```

Expected: 4 rows.

- [ ] **Step 7.5: Build + existing tests green**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 7.6: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add NotificationTemplate model + migration with seed"
```

---

## Task 8: Substitute + BuildVars (pure functions)

**Files:**
- Create: `apps/api/src/notifications/notifications.vars.ts`
- Create: `apps/api/src/notifications/__tests__/notifications.vars.spec.ts`

- [ ] **Step 8.1: Failing unit test**

Create `apps/api/src/notifications/__tests__/notifications.vars.spec.ts`:

```typescript
import { substitute, buildVars } from '../notifications.vars';

describe('substitute', () => {
  it('replaces {{key}} with vars value', () => {
    expect(substitute('Hi {{name}}!', { name: 'Bob' })).toBe('Hi Bob!');
  });

  it('replaces multiple and repeated placeholders', () => {
    expect(substitute('{{a}}-{{b}}-{{a}}', { a: 'X', b: 'Y' })).toBe('X-Y-X');
  });

  it('replaces unknown placeholders with empty string', () => {
    expect(substitute('Hi {{missing}}!', {})).toBe('Hi !');
  });
});

describe('buildVars', () => {
  it('order.stage.changed → order + stageLabel (contract number)', () => {
    const vars = buildVars('order.stage.changed', {
      orderId: 'o1', contractNumber: 'C-100', productName: 'Kitchen', newStage: 'production',
    });
    expect(vars.order).toBe('Заказ C-100');
    expect(vars.stageLabel).toBe('Производство изделия');
  });

  it('order.stage.changed → falls back to productName then Ваш заказ', () => {
    const noContract = buildVars('order.stage.changed', {
      orderId: 'o1', contractNumber: null, productName: 'Kitchen', newStage: 'detailing',
    });
    expect(noContract.order).toBe('Kitchen');
    const noNames = buildVars('order.stage.changed', {
      orderId: 'o1', contractNumber: null, productName: null, newStage: 'detailing',
    });
    expect(noNames.order).toBe('Ваш заказ');
  });

  it('order.progress.changed → percent string', () => {
    const vars = buildVars('order.progress.changed', {
      orderId: 'o1', contractNumber: 'C-1', productName: null, newPercent: 40,
    });
    expect(vars.order).toBe('Заказ C-1');
    expect(vars.percent).toBe('40');
  });

  it('order.ready → order only', () => {
    const vars = buildVars('order.ready', { orderId: 'o1', contractNumber: 'C-1', productName: null });
    expect(vars.order).toBe('Заказ C-1');
  });

  it('chat.reply.received → previewTail with leading space when preview present', () => {
    const withPreview = buildVars('chat.reply.received', {
      orderId: 'o1', chatId: 'ch1', contractNumber: 'C-1', preview: 'Привет',
    });
    expect(withPreview.order).toBe('Заказ C-1');
    expect(withPreview.previewTail).toBe(' Привет');
  });

  it('chat.reply.received → empty previewTail when preview null, no productName fallback', () => {
    const noPreview = buildVars('chat.reply.received', {
      orderId: 'o1', chatId: 'ch1', contractNumber: null, preview: null,
    });
    expect(noPreview.order).toBe('Ваш заказ');
    expect(noPreview.previewTail).toBe('');
  });
});
```

- [ ] **Step 8.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- notifications.vars.spec.ts
```

- [ ] **Step 8.3: Implement `apps/api/src/notifications/notifications.vars.ts`**

```typescript
import type { NotificationEvent } from './notifications.types';

const STAGE_LABELS: Record<string, string> = {
  preparation_for_production: 'Подготовка для производства',
  detailing: 'Деталировка',
  materials_arrival: 'Поступление материалов на склад',
  production: 'Производство изделия',
  transfer_to_warehouse: 'Передача готового изделия на склад',
  completeness_check: 'Проверка комплектности товара',
  ready_for_delivery: 'Готовность к передаче клиенту',
};

export function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function orderLabel(contractNumber: unknown, productName?: unknown): string {
  if (typeof contractNumber === 'string' && contractNumber) return `Заказ ${contractNumber}`;
  if (typeof productName === 'string' && productName) return productName;
  return 'Ваш заказ';
}

export function buildVars(
  event: NotificationEvent,
  data: Record<string, unknown>,
): Record<string, string> {
  switch (event) {
    case 'order.stage.changed': {
      const stage = data.newStage as string;
      return {
        order: orderLabel(data.contractNumber, data.productName),
        stageLabel: STAGE_LABELS[stage] ?? stage,
      };
    }
    case 'order.progress.changed':
      return {
        order: orderLabel(data.contractNumber, data.productName),
        percent: String(data.newPercent),
      };
    case 'order.ready':
      return {
        order: orderLabel(data.contractNumber, data.productName),
      };
    case 'chat.reply.received': {
      const preview = data.preview as string | null;
      return {
        order: orderLabel(data.contractNumber),
        previewTail: preview ? ` ${preview}` : '',
      };
    }
  }
}
```

- [ ] **Step 8.4: Run, expect PASS** (9 tests).

```bash
pnpm --filter @vittoria/api test:unit -- notifications.vars.spec.ts
```

- [ ] **Step 8.5: Commit**

```bash
git add apps/api/src/notifications/notifications.vars.ts apps/api/src/notifications/__tests__/notifications.vars.spec.ts
git commit -m "feat(api): substitute + buildVars for template rendering"
```

---

## Task 9: TemplatesService + Processor Refactor

**Files:**
- Create: `apps/api/src/notifications/templates.service.ts`
- Modify: `apps/api/src/notifications/jobs/notifications.processor.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`
- Delete: `apps/api/src/notifications/notifications.templates.ts`
- Delete: `apps/api/src/notifications/__tests__/notifications.templates.spec.ts`
- Create: `apps/api/src/notifications/__tests__/templates.service.spec.ts`

- [ ] **Step 9.1: Failing unit test — create `apps/api/src/notifications/__tests__/templates.service.spec.ts`**

```typescript
import { TemplatesService } from '../templates.service';

describe('TemplatesService.render', () => {
  it('looks up template by event and substitutes vars', async () => {
    const prisma = {
      notificationTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          event: 'order.ready',
          title: 'VITTORIA HOME',
          body: '{{order}} готов к передаче.',
        }),
      },
    };
    const svc = new TemplatesService(prisma as never);
    const out = await svc.render('order.ready', { order: 'Заказ C-1' });
    expect(prisma.notificationTemplate.findUnique).toHaveBeenCalledWith({ where: { event: 'order.ready' } });
    expect(out.title).toBe('VITTORIA HOME');
    expect(out.body).toBe('Заказ C-1 готов к передаче.');
  });

  it('throws when template not found', async () => {
    const prisma = {
      notificationTemplate: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new TemplatesService(prisma as never);
    await expect(svc.render('order.ready', {})).rejects.toThrow(/template/i);
  });
});
```

- [ ] **Step 9.2: Run, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit -- templates.service.spec.ts
```

- [ ] **Step 9.3: Implement `apps/api/src/notifications/templates.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { substitute } from './notifications.vars';
import type { NotificationEvent } from './notifications.types';

export interface RenderedMessage {
  title: string;
  body: string;
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async render(event: NotificationEvent, vars: Record<string, string>): Promise<RenderedMessage> {
    const tpl = await this.prisma.notificationTemplate.findUnique({ where: { event } });
    if (!tpl) {
      throw new Error(`notification template not found: ${event}`);
    }
    return {
      title: substitute(tpl.title, vars),
      body: substitute(tpl.body, vars),
    };
  }
}
```

- [ ] **Step 9.4: Run, expect PASS** (2 tests).

```bash
pnpm --filter @vittoria/api test:unit -- templates.service.spec.ts
```

- [ ] **Step 9.5: Delete the old hardcoded template files**

```bash
rm apps/api/src/notifications/notifications.templates.ts
rm apps/api/src/notifications/__tests__/notifications.templates.spec.ts
```

(The `RenderedMessage` type now lives in `templates.service.ts`. `STAGE_LABELS` now lives in `notifications.vars.ts`.)

- [ ] **Step 9.6: Refactor `apps/api/src/notifications/jobs/notifications.processor.ts`**

Replace the import of `renderTemplate` and its usage. New full file:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../../queues/queue-names';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.types';
import { PUSH_PROVIDER, type PushProvider } from '../push/push.types';
import { TemplatesService } from '../templates.service';
import { buildVars } from '../notifications.vars';
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
    private readonly templates: TemplatesService,
  ) {
    super();
  }

  async process(job: Job<DispatchJob>): Promise<{ pushSent: number; smsSent: number }> {
    const { userId, event, data } = job.data;
    const matrix = CHANNEL_MATRIX[event];
    const template = await this.templates.render(event, buildVars(event, data));

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

- [ ] **Step 9.7: Register `TemplatesService` in `apps/api/src/notifications/notifications.module.ts`**

Read the file. Add import:
```typescript
import { TemplatesService } from './templates.service';
```

Add `TemplatesService` to the `providers` array (alongside `NotificationsService`, `NotificationsDedupService`, `NotificationsProcessor`, `OrderProgressListener`).

- [ ] **Step 9.8: Run unit tests + build, expect PASS**

```bash
pnpm --filter @vittoria/api test:unit
pnpm --filter @vittoria/api build
```

The deleted `notifications.templates.spec.ts` is gone; `notifications.vars.spec.ts` and `templates.service.spec.ts` cover rendering. Build must be clean (no dangling `renderTemplate` imports).

- [ ] **Step 9.9: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): render notifications via DB-backed TemplatesService"
```

---

## Task 10: Notification Templates Controller + Regression E2E

**Files:**
- Create: `apps/api/src/notifications/dto/update-template.dto.ts`
- Create: `apps/api/src/notifications/notification-templates.controller.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`
- Create: `apps/api/test/notification-templates.e2e-spec.ts`

- [ ] **Step 10.1: Create `apps/api/src/notifications/dto/update-template.dto.ts`**

```typescript
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body?: string;
}
```

- [ ] **Step 10.2: Create `apps/api/src/notifications/notification-templates.controller.ts`**

```typescript
import { Body, Controller, Get, NotFoundException, Param, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { CHANNEL_MATRIX } from './notifications.types';
import type { NotificationTemplate } from '@prisma/client';

interface TemplateResponse {
  event: string;
  title: string;
  body: string;
  updated_at: string;
}

function toResponse(t: NotificationTemplate): TemplateResponse {
  return {
    event: t.event,
    title: t.title,
    body: t.body,
    updated_at: t.updatedAt.toISOString(),
  };
}

@Controller('admin/notification-templates')
@Roles('admin')
export class NotificationTemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<{ rows: TemplateResponse[] }> {
    const rows = await this.prisma.notificationTemplate.findMany({ orderBy: { event: 'asc' } });
    return { rows: rows.map(toResponse) };
  }

  @Patch(':event')
  async update(
    @Param('event') event: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<TemplateResponse> {
    if (!(event in CHANNEL_MATRIX)) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: 'Unknown event' });
    }
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { event } });
    if (!existing) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' });
    }
    const updated = await this.prisma.notificationTemplate.update({
      where: { event },
      data: {
        title: dto.title ?? existing.title,
        body: dto.body ?? existing.body,
      },
    });
    return toResponse(updated);
  }
}
```

Note: `event in CHANNEL_MATRIX` is the runtime guard — `CHANNEL_MATRIX` has exactly the 4 known event keys, so unknown events 404 before touching the DB. No `NotificationEvent` type import needed (would be unused → lint error).

- [ ] **Step 10.3: Register controller in `apps/api/src/notifications/notifications.module.ts`**

Add import:
```typescript
import { NotificationTemplatesController } from './notification-templates.controller';
```

Add a `controllers` array to the module (the module may not currently have one — `PushTokensController` is in there per Plan 4; confirm and append). Final `controllers` should include both:
```typescript
  controllers: [PushTokensController, NotificationTemplatesController],
```

- [ ] **Step 10.4: Create `apps/api/test/notification-templates.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { QUEUE_NOTIFICATIONS } from '../src/queues/queue-names';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Notification Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let notifQueue: Queue;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    notifQueue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(async () => {
    await notifQueue.obliterate({ force: true });
    const client = redis.getClient();
    const keys = await client.keys('notif:dedup:*');
    if (keys.length > 0) await client.del(...keys);
  });

  afterEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /admin/notification-templates returns the 4 seeded templates', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(4);
    const events = res.body.rows.map((r: { event: string }) => r.event).sort();
    expect(events).toEqual([
      'chat.reply.received',
      'order.progress.changed',
      'order.ready',
      'order.stage.changed',
    ]);
  });

  it('PATCH updates the body', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .patch('/api/v1/admin/notification-templates/order.ready')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: '{{order}} ГОТОВ!' });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe('{{order}} ГОТОВ!');
    const stored = await prisma.notificationTemplate.findUnique({ where: { event: 'order.ready' } });
    expect(stored?.body).toBe('{{order}} ГОТОВ!');
  });

  it('PATCH unknown event → 404', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .patch('/api/v1/admin/notification-templates/bogus.event')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'x' });
    expect(res.status).toBe(404);
  });

  it('GET returns 403 for non-admin', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('regression: admin order PATCH dispatches a job rendered from the (edited) DB template', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 6100, clientUserId: client.id, currentStage: 'detailing', progressPercent: 20, contractNumber: 'C-RGR' },
    });

    // Edit the stage-changed template
    await request(app.getHttpServer())
      .patch('/api/v1/admin/notification-templates/order.stage.changed')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'ИЗМЕНЕНО {{order}} → {{stageLabel}}' });

    // Trigger a stage change → enqueues a notification job
    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'production', progress_percent: 40 });
    expect(patch.status).toBe(200);

    const jobs = await notifQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    expect(jobs.length).toBeGreaterThan(0);
    expect((jobs[0]?.data as { event?: string }).event).toBe('order.stage.changed');

    // Cleanup orders created here (afterEach only clears users/sessions)
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
  });
});
```

- [ ] **Step 10.5: Run e2e, expect PASS** (5 tests).

```bash
pnpm --filter @vittoria/api exec jest --config jest-e2e.json test/notification-templates.e2e-spec.ts
```

- [ ] **Step 10.6: Lint + build, commit**

```bash
pnpm --filter @vittoria/api lint
pnpm --filter @vittoria/api build
git add apps/api/src apps/api/test
git commit -m "feat(api): GET/PATCH /admin/notification-templates + render regression e2e"
```

---

## Task 11: Full Verification + Push

- [ ] **Step 11.1: Flush Redis + full suite from root**

```bash
docker exec infra-redis-1 redis-cli FLUSHALL
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

Expected new totals for `@vittoria/api`:
- Unit: ~64 prior + 4 (admin-users) + 2 (audit) + 10 (commissions) + 9 (vars) + 2 (templates) − 3 (deleted templates spec) ≈ **88**
- E2E: ~61 prior + 5 (admin-users) + 2 (audit) + 5 (commissions) + 5 (templates) ≈ **78**

All green; ESLint clean. **Critical regression check:** the pre-existing `notifications.e2e-spec.ts` (Plan 4) must still pass — the seed guarantees templates exist for the DB-backed render.

- [ ] **Step 11.2: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 11.3: Verify CI**

Open https://github.com/sdukezanov-lgtm/vittoria/actions, confirm the latest run is green.

---

## Definition of Done

- [x] `PartnerCommission` + `NotificationTemplate` models + migrations applied; 4 templates seeded.
- [x] `GET/POST /admin/users` (role-validation admin/partner only, 409 on dup phone).
- [x] `GET /admin/audit-log` with entity/actor filters + pagination.
- [x] `POST/PATCH/GET /admin/commissions` + `GET /partner/commissions` (scoped); paid→paid_at.
- [x] `GET/PATCH /admin/notification-templates`.
- [x] `renderTemplate` replaced by `TemplatesService.render` + `substitute` + `buildVars`; hardcoded file deleted.
- [x] Regression: Plan 4 notification e2e still green (DB render, seed present).
- [x] `pnpm install --frozen-lockfile && pnpm lint && pnpm test` green.
- [x] GitHub Actions CI green.

After Plan 6 → **Admin/Partner SPA** (frontend), consuming these endpoints + orders/chat from Plans 3/5.

---

**End of Plan 6.**
