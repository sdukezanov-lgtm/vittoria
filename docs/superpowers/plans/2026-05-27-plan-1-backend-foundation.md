# Plan 1: Backend Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core NestJS backend modules — Prisma data layer, SMS-OTP authentication, JWT sessions, RBAC guards, `/me` endpoints, extended `/readyz` health check, audit logging, and rate limiting — so that a mobile client can authenticate and call protected endpoints. Sets the foundation for Plan 2 (AmoCRM sync) and Plan 3 (orders + notifications).

**Architecture:** NestJS monolith with modules organised by domain (`prisma`, `auth`, `users`, `common`, `health`). Prisma 5 as the ORM with explicit migrations under git. JWT (HS256) access tokens with rotating refresh tokens persisted in `sessions`. SMS OTPs hashed with bcrypt and stored in `auth_codes` with TTL. Tests follow TDD; integration tests use Testcontainers for a real Postgres so we never mock the data layer. Throttling on auth endpoints via `@nestjs/throttler`.

**Tech Stack:**
- NestJS 10, TypeScript 5
- Prisma 5 + PostgreSQL 16
- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`
- `bcrypt` (auth-code hashes)
- `@nestjs/throttler` (rate limiting)
- `ioredis` (readiness probes + future pub/sub)
- Jest + Testcontainers (`@testcontainers/postgresql`)
- Existing infra from Plan 0: `infra/docker-compose.dev.yml` with postgres, redis, minio, mailhog
- Existing CI from Plan 0: `.github/workflows/ci.yml` (lint + test matrix)

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](../specs/2026-05-26-vittoria-home-mvp-design.md) — sections 4 (domain model), 5 (AmoCRM — *only `users.amocrm_contact_id` field is added here; sync itself is Plan 2*), 6 (auth + security), 7.1–7.3 (auth and `/me` endpoints), 7.9 (health), 16 (decisions).

**Out of scope (future plans):**
- AmoCRM webhook handling and sync workers → Plan 2
- Orders, stage updates, chat → Plan 3
- Real SMS provider (SMSC.ru/SMS.ru) and push notifications → Plan 3
- WebSocket chat, attachments → Plan 4
- Admin/partner email+password auth → Plan 5

**Prerequisites for execution:**
- Plan 0 complete (skeleton, lint/test/CI green)
- Docker Desktop running (`pnpm dev:infra` starts the local stack)
- For developers on Windows with non-ASCII user-profile paths, `GRADLE_USER_HOME` workaround does NOT apply here (Gradle is Android-only); however the working directory `c:\sad\Vittoriy` IS ASCII, so Prisma and Jest run fine.

---

## File Structure

After this plan completes, `apps/api/` looks like this:

```
apps/api/
├── package.json                              ← deps added
├── tsconfig.json                             ← unchanged
├── nest-cli.json                             ← unchanged
├── jest-e2e.json                             ← unchanged
├── jest.config.ts                            ← NEW (unit tests config)
├── prisma/
│   ├── schema.prisma                         ← NEW
│   └── migrations/
│       └── <timestamp>_init/
│           └── migration.sql
├── src/
│   ├── main.ts                               ← MODIFIED (global pipes, ConfigModule)
│   ├── app.module.ts                         ← MODIFIED (wire modules)
│   ├── config/
│   │   ├── env.schema.ts                     ← NEW (zod schema)
│   │   └── config.module.ts                  ← NEW
│   ├── prisma/
│   │   ├── prisma.module.ts                  ← NEW
│   │   └── prisma.service.ts                 ← NEW
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── public.decorator.ts           ← NEW
│   │   │   ├── roles.decorator.ts            ← NEW
│   │   │   └── current-user.decorator.ts     ← NEW
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts             ← NEW
│   │   │   └── roles.guard.ts                ← NEW
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts      ← NEW (uniform error format)
│   │   └── types/
│   │       └── auth-user.ts                  ← NEW
│   ├── audit/
│   │   ├── audit.module.ts                   ← NEW
│   │   └── audit.service.ts                  ← NEW
│   ├── sms/
│   │   ├── sms.module.ts                     ← NEW
│   │   ├── sms.types.ts                      ← NEW (SmsProvider interface)
│   │   └── dev-sms.provider.ts               ← NEW
│   ├── auth/
│   │   ├── auth.module.ts                    ← NEW
│   │   ├── auth.service.ts                   ← NEW
│   │   ├── auth.controller.ts                ← NEW
│   │   ├── dto/
│   │   │   ├── request-code.dto.ts           ← NEW
│   │   │   ├── verify-code.dto.ts            ← NEW
│   │   │   └── refresh.dto.ts                ← NEW
│   │   ├── jwt.strategy.ts                   ← NEW (passport-jwt)
│   │   └── tokens.service.ts                 ← NEW (access/refresh helpers)
│   ├── users/
│   │   ├── users.module.ts                   ← NEW
│   │   ├── users.service.ts                  ← NEW
│   │   ├── users.controller.ts               ← NEW (/me endpoints)
│   │   └── dto/
│   │       └── update-me.dto.ts              ← NEW
│   ├── redis/
│   │   ├── redis.module.ts                   ← NEW
│   │   └── redis.service.ts                  ← NEW
│   └── health/
│       ├── health.module.ts                  ← MODIFIED (add readyz)
│       └── health.controller.ts              ← MODIFIED (add readyz)
├── test/
│   ├── helpers/
│   │   ├── testcontainers-postgres.ts        ← NEW (TC bootstrap)
│   │   └── app.factory.ts                    ← NEW (e2e Nest app builder)
│   ├── auth.e2e-spec.ts                      ← NEW
│   ├── users.e2e-spec.ts                     ← NEW
│   ├── health.e2e-spec.ts                    ← MODIFIED
│   └── ... (per-module e2e specs added as we go)
└── src/**/__tests__/
    └── *.spec.ts                             ← unit tests collocated with modules
```

**Responsibility split:**
- `config/` — env validation (zod) at boot, fail fast if misconfigured
- `prisma/` — `PrismaService` extends `PrismaClient` and is the only entry point to the database
- `common/` — cross-cutting decorators, guards, filters, types (no business logic)
- `audit/` — append-only audit log writer used by other modules
- `sms/` — provider abstraction; in Plan 3 we add real providers
- `auth/` — SMS-OTP login, JWT issuance, refresh-token rotation, logout
- `users/` — user profile reads/writes, 152-ФЗ consent and delete
- `redis/` — single ioredis client used by readiness probe (future: BullMQ, dedup, pub/sub)
- `health/` — `/healthz` (liveness, unchanged from Plan 0) and `/readyz` (DB + Redis)

---

## Task 1: Add Prisma, Define Schema, Create Initial Migration

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/.env.example`
- Modify: `.gitignore` (add `apps/api/.env`)

- [ ] **Step 1.1: Add Prisma dependencies**

In `apps/api/package.json`, under `"dependencies"` add:
```json
"@prisma/client": "^5.18.0"
```
Under `"devDependencies"` add:
```json
"prisma": "^5.18.0"
```

Then from repo root:
```bash
pnpm install
```

- [ ] **Step 1.2: Create `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = []
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  client
  admin
  partner
}

model User {
  id                    String   @id @default(uuid()) @db.Uuid
  phone                 String?  @unique
  role                  UserRole @default(client)
  firstName             String?  @map("first_name")
  lastName              String?  @map("last_name")
  amocrmContactId       Int?     @unique @map("amocrm_contact_id")
  consentAcceptedAt     DateTime? @map("consent_accepted_at")
  lastLoginAt           DateTime? @map("last_login_at")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  authCodes  AuthCode[]
  sessions   Session[]

  @@map("users")
}

model AuthCode {
  id         String   @id @default(uuid()) @db.Uuid
  phone      String
  codeHash   String   @map("code_hash")
  attempts   Int      @default(0)
  expiresAt  DateTime @map("expires_at")
  consumedAt DateTime? @map("consumed_at")
  createdAt  DateTime @default(now()) @map("created_at")

  user   User?   @relation(fields: [phone], references: [phone])

  @@index([phone, createdAt(sort: Desc)])
  @@map("auth_codes")
}

model Session {
  id              String   @id @default(uuid()) @db.Uuid
  userId          String   @map("user_id") @db.Uuid
  refreshTokenHash String  @map("refresh_token_hash")
  deviceInfo      Json     @default("{}") @map("device_info")
  revokedAt       DateTime? @map("revoked_at")
  expiresAt       DateTime @map("expires_at")
  createdAt       DateTime @default(now()) @map("created_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model AuditLog {
  id            String   @id @default(uuid()) @db.Uuid
  actorUserId   String?  @map("actor_user_id") @db.Uuid
  action        String
  entity        String
  entityId      String   @map("entity_id")
  before        Json?
  after         Json?
  requestId     String?  @map("request_id")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([entity, entityId])
  @@index([actorUserId, createdAt(sort: Desc)])
  @@map("audit_log")
}
```

- [ ] **Step 1.3: Create `apps/api/.env.example`**

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://vittoria:vittoria@localhost:5432/vittoria_dev?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-me-32-chars-minimum
JWT_ACCESS_TTL_SEC=900
JWT_REFRESH_TTL_SEC=2592000
OTP_TTL_SEC=300
OTP_MAX_ATTEMPTS=5
OTP_REQUEST_RATE_LIMIT_PER_MIN=1
```

- [ ] **Step 1.4: Update `.gitignore`**

Append under the `# Env` section in repo-root `.gitignore`:
```
apps/api/.env
```
(The existing `.env` rule is unanchored, so it already ignores root `.env`; this one is explicit for the api subpath.)

- [ ] **Step 1.5: Create the working `.env`**

```bash
cp apps/api/.env.example apps/api/.env
```

- [ ] **Step 1.6: Start local infra**

```bash
pnpm dev:infra
```

Wait for postgres to be healthy:
```bash
docker compose -f infra/docker-compose.dev.yml ps
```

- [ ] **Step 1.7: Generate initial migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name init
cd ../..
```

Expected: `prisma/migrations/<timestamp>_init/migration.sql` is created, schema is applied to Postgres, Prisma Client is generated to `node_modules/.prisma/client`.

- [ ] **Step 1.8: Add Prisma scripts to `apps/api/package.json`**

Inside the `"scripts"` block add:
```json
"prisma:generate": "prisma generate",
"prisma:migrate:dev": "prisma migrate dev",
"prisma:migrate:deploy": "prisma migrate deploy",
"prisma:studio": "prisma studio"
```

Also add at root `package.json` scripts:
```json
"db:migrate": "pnpm --filter @vittoria/api prisma:migrate:dev",
"db:studio": "pnpm --filter @vittoria/api prisma:studio"
```

- [ ] **Step 1.9: Commit**

```bash
git add apps/api/package.json apps/api/prisma apps/api/.env.example .gitignore package.json pnpm-lock.yaml
git commit -m "feat(api): add Prisma with initial schema (users, auth_codes, sessions, audit_log)"
```

---

## Task 2: Config Module with Env Validation

**Files:**
- Create: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/config/config.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/config/__tests__/env.schema.spec.ts`

- [ ] **Step 2.1: Add deps**

In `apps/api/package.json` add to `"dependencies"`:
```json
"@nestjs/config": "^3.2.0",
"zod": "^3.23.0"
```

```bash
pnpm install
```

- [ ] **Step 2.2: Write failing test**

Create `apps/api/src/config/__tests__/env.schema.spec.ts`:
```typescript
import { envSchema } from '../env.schema';

describe('envSchema', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgresql://vittoria:vittoria@localhost:5432/vittoria_dev',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: '0123456789012345678901234567890123456789',
    JWT_ACCESS_TTL_SEC: '900',
    JWT_REFRESH_TTL_SEC: '2592000',
    OTP_TTL_SEC: '300',
    OTP_MAX_ATTEMPTS: '5',
    OTP_REQUEST_RATE_LIMIT_PER_MIN: '1',
  };

  it('parses a valid env', () => {
    const parsed = envSchema.parse(valid);
    expect(parsed.PORT).toBe(3000);
    expect(parsed.JWT_ACCESS_TTL_SEC).toBe(900);
  });

  it('rejects missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => envSchema.parse(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects short JWT_SECRET', () => {
    expect(() => envSchema.parse({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
```

- [ ] **Step 2.3: Add `jest.config.ts` for unit tests**

Create `apps/api/jest.config.ts`:
```typescript
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
```

Add to `apps/api/package.json` scripts:
```json
"test:unit": "jest"
```

Change the existing `"test"` script to run both:
```json
"test": "pnpm test:unit && pnpm test:e2e",
"test:e2e": "jest --config jest-e2e.json"
```

- [ ] **Step 2.4: Run test, expect FAIL**

```bash
pnpm --filter @vittoria/api test:unit
```
Expected: `Cannot find module '../env.schema'`.

- [ ] **Step 2.5: Implement `apps/api/src/config/env.schema.ts`**

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().refine((u) => u.startsWith('postgresql://') || u.startsWith('postgres://'), {
    message: 'DATABASE_URL must be a postgresql URL',
  }),
  REDIS_URL: z.string().url().refine((u) => u.startsWith('redis://'), {
    message: 'REDIS_URL must start with redis://',
  }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive(),
  JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive(),
  OTP_TTL_SEC: z.coerce.number().int().positive(),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive(),
  OTP_REQUEST_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;
```

- [ ] **Step 2.6: Run unit test, expect PASS**

```bash
pnpm --filter @vittoria/api test:unit
```
Expected: 3 passed.

- [ ] **Step 2.7: Create `apps/api/src/config/config.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => envSchema.parse(raw),
    }),
  ],
})
export class ConfigModule {}
```

- [ ] **Step 2.8: Wire into `apps/api/src/app.module.ts`**

Replace content:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 2.9: Use Env in `apps/api/src/main.ts`**

Replace content:
```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  const config = app.get(ConfigService<Env, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap();
```

- [ ] **Step 2.10: Add class-validator + class-transformer for ValidationPipe**

In `apps/api/package.json` deps:
```json
"class-validator": "^0.14.1",
"class-transformer": "^0.5.1"
```

```bash
pnpm install
```

- [ ] **Step 2.11: Run e2e + unit, both must pass**

```bash
pnpm --filter @vittoria/api test
```
Expected: unit (3) + e2e (1 from Plan 0 health test) all green.

- [ ] **Step 2.12: Commit**

```bash
git add apps/api .gitignore pnpm-lock.yaml
git commit -m "feat(api): zod-validated env config and global ValidationPipe"
```

---

## Task 3: PrismaService + PrismaModule + Testcontainers Helper

**Files:**
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/test/helpers/testcontainers-postgres.ts`
- Create: `apps/api/test/helpers/app.factory.ts`
- Create: `apps/api/test/prisma.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 3.1: Add Testcontainers**

In `apps/api/package.json` devDependencies:
```json
"@testcontainers/postgresql": "^10.10.0",
"testcontainers": "^10.10.0"
```

```bash
pnpm install
```

- [ ] **Step 3.2: Create `apps/api/src/prisma/prisma.service.ts`**

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 3.3: Create `apps/api/src/prisma/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3.4: Create `apps/api/test/helpers/testcontainers-postgres.ts`**

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

let started: StartedPostgreSqlContainer | undefined;

export async function startPostgres(): Promise<string> {
  started = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('vittoria_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = started.getConnectionUri();
  process.env.DATABASE_URL = url;

  // Apply migrations.
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../../'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  return url;
}

export async function stopPostgres(): Promise<void> {
  await started?.stop();
  started = undefined;
}
```

- [ ] **Step 3.5: Create `apps/api/test/helpers/app.factory.ts`**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}
```

- [ ] **Step 3.6: Write failing e2e for Prisma connection**

Create `apps/api/test/prisma.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';

describe('PrismaService (e2e)', () => {
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

  it('connects and runs SELECT 1', async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result[0].ok).toBe(1);
  });
});
```

- [ ] **Step 3.7: Run e2e, expect FAIL**

```bash
pnpm --filter @vittoria/api test:e2e
```
Expected: fails because `PrismaModule` isn't in `AppModule` yet.

- [ ] **Step 3.8: Wire `PrismaModule` into `AppModule`**

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 3.9: Run e2e, expect PASS**

```bash
pnpm --filter @vittoria/api test:e2e
```
Expected: both `health` and `prisma` e2e specs pass. First run takes ~30 seconds (Docker image pull + migration).

- [ ] **Step 3.10: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): PrismaService/Module and Testcontainers e2e harness"
```

---

## Task 4: Redis Module + Service

**Files:**
- Create: `apps/api/src/redis/redis.service.ts`
- Create: `apps/api/src/redis/redis.module.ts`
- Create: `apps/api/src/redis/__tests__/redis.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 4.1: Add ioredis**

In `apps/api/package.json` dependencies:
```json
"ioredis": "^5.4.1"
```

```bash
pnpm install
```

- [ ] **Step 4.2: Implement `apps/api/src/redis/redis.service.ts`**

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env.schema';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL', { infer: true });
    this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    this.client.on('error', (err) => this.logger.error('redis error', err));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<'PONG'> {
    return (await this.client.ping()) as 'PONG';
  }
}
```

- [ ] **Step 4.3: Create `apps/api/src/redis/redis.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 4.4: Wire into `AppModule`**

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 4.5: Unit test against in-process behaviour**

Create `apps/api/src/redis/__tests__/redis.service.spec.ts`:
```typescript
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

describe('RedisService (unit)', () => {
  it('uses REDIS_URL from config', () => {
    const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService;
    const svc = new RedisService(config);
    expect(() => svc.onModuleInit()).not.toThrow();
    void svc.onModuleDestroy();
  });
});
```

Run:
```bash
pnpm --filter @vittoria/api test:unit
```
Expected: PASS (existing config tests + new redis unit).

- [ ] **Step 4.6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): RedisService/Module with ioredis"
```

---

## Task 5: Extended /readyz Health Check

**Files:**
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/health/health.module.ts`
- Modify: `apps/api/test/health.e2e-spec.ts`

- [ ] **Step 5.1: Update the e2e spec to require both endpoints**

Replace `apps/api/test/health.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  it('GET /healthz → 200 { status: ok }', async () => {
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz → 200 with db + redis status', async () => {
    const res = await request(app.getHttpServer()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
  });
});
```

- [ ] **Step 5.2: Run, expect `/readyz` test to FAIL** (endpoint not yet defined).

```bash
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 5.3: Implement `/readyz` in `apps/api/src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type Check = 'ok' | 'fail';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz(): Promise<{ status: 'ok' | 'degraded'; checks: { db: Check; redis: Check } }> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { db, redis } };
  }

  private async checkDb(): Promise<Check> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'fail';
    }
  }

  private async checkRedis(): Promise<Check> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      return 'fail';
    }
  }
}
```

`apps/api/src/health/health.module.ts` stays as is (controller-only).

- [ ] **Step 5.4: Run e2e, expect PASS**

```bash
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 5.5: Commit**

```bash
git add apps/api
git commit -m "feat(api): /readyz health check with db and redis probes"
```

---

## Task 6: SmsProvider Interface + DevSmsProvider

**Files:**
- Create: `apps/api/src/sms/sms.types.ts`
- Create: `apps/api/src/sms/dev-sms.provider.ts`
- Create: `apps/api/src/sms/sms.module.ts`
- Create: `apps/api/src/sms/__tests__/dev-sms.provider.spec.ts`

- [ ] **Step 6.1: Define types in `apps/api/src/sms/sms.types.ts`**

```typescript
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsSendResult {
  providerMessageId: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<SmsSendResult>;
}
```

- [ ] **Step 6.2: Failing unit test**

`apps/api/src/sms/__tests__/dev-sms.provider.spec.ts`:
```typescript
import { Logger } from '@nestjs/common';
import { DevSmsProvider } from '../dev-sms.provider';

describe('DevSmsProvider', () => {
  it('logs the message and returns a providerMessageId', async () => {
    const provider = new DevSmsProvider();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const res = await provider.send({ to: '+79991234567', text: 'Your code: 1234' });
    expect(res.providerMessageId).toMatch(/^dev-/);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('+79991234567'));
    spy.mockRestore();
  });
});
```

Run:
```bash
pnpm --filter @vittoria/api test:unit
```
Expected: FAIL (`DevSmsProvider` does not exist).

- [ ] **Step 6.3: Implement `apps/api/src/sms/dev-sms.provider.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SmsMessage, SmsProvider, SmsSendResult } from './sms.types';

@Injectable()
export class DevSmsProvider implements SmsProvider {
  private readonly logger = new Logger(DevSmsProvider.name);

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const id = `dev-${randomUUID()}`;
    this.logger.log(`[DEV-SMS] to=${message.to} text="${message.text}" providerMessageId=${id}`);
    return { providerMessageId: id };
  }
}
```

- [ ] **Step 6.4: Run unit tests, expect PASS**

- [ ] **Step 6.5: `apps/api/src/sms/sms.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DevSmsProvider } from './dev-sms.provider';
import { SMS_PROVIDER } from './sms.types';

@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      useClass: DevSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
```

- [ ] **Step 6.6: Commit**

```bash
git add apps/api
git commit -m "feat(api): SmsProvider interface and DevSmsProvider"
```

---

## Task 7: AuditService

**Files:**
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Create: `apps/api/src/audit/__tests__/audit.service.spec.ts`
- Create: `apps/api/test/audit.e2e-spec.ts`

- [ ] **Step 7.1: Failing unit test**

`apps/api/src/audit/__tests__/audit.service.spec.ts`:
```typescript
import { AuditService } from '../audit.service';

describe('AuditService (unit)', () => {
  it('builds the payload with all fields', () => {
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } } as any;
    const svc = new AuditService(prisma);
    void svc.record({
      actorUserId: 'u1',
      action: 'auth.code.requested',
      entity: 'AuthCode',
      entityId: 'c1',
      after: { phone: '+7' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'u1',
        action: 'auth.code.requested',
        entity: 'AuthCode',
        entityId: 'c1',
      }),
    });
  });
});
```

- [ ] **Step 7.2: Run, expect FAIL.**

- [ ] **Step 7.3: Implement `apps/api/src/audit/audit.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before === undefined ? undefined : (entry.before as object),
        after: entry.after === undefined ? undefined : (entry.after as object),
        requestId: entry.requestId,
      },
    });
  }
}
```

- [ ] **Step 7.4: `apps/api/src/audit/audit.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 7.5: Wire into `AppModule`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, AuditModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 7.6: e2e check that audit writes a row**

`apps/api/test/audit.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuditService (e2e)', () => {
  let app: INestApplication;
  let audit: AuditService;
  let prisma: PrismaService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    audit = app.get(AuditService);
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  it('persists an audit entry', async () => {
    await audit.record({ action: 'test.event', entity: 'Test', entityId: 'x1', after: { ok: true } });
    const rows = await prisma.auditLog.findMany({ where: { entity: 'Test', entityId: 'x1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('test.event');
  });
});
```

Run all tests:
```bash
pnpm --filter @vittoria/api test
```

- [ ] **Step 7.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): AuditService writing append-only entries"
```

---

## Task 8: AuthService — request-code

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/dto/request-code.dto.ts`
- Create: `apps/api/src/auth/__tests__/auth.service.spec.ts`

- [ ] **Step 8.1: Add bcrypt**

`apps/api/package.json` dependencies:
```json
"bcrypt": "^5.1.1"
```
devDependencies:
```json
"@types/bcrypt": "^5.0.2"
```

```bash
pnpm install
```

- [ ] **Step 8.2: DTO `apps/api/src/auth/dto/request-code.dto.ts`**

```typescript
import { IsString, Matches } from 'class-validator';

export class RequestCodeDto {
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'phone must be in E.164 format +7XXXXXXXXXX' })
  phone!: string;
}
```

- [ ] **Step 8.3: Unit test (`AuthService.requestCode`)**

`apps/api/src/auth/__tests__/auth.service.spec.ts`:
```typescript
import { AuthService } from '../auth.service';

const makeDeps = () => {
  const prisma = {
    authCode: {
      create: jest.fn().mockResolvedValue({ id: 'c1', phone: '+79991234567', expiresAt: new Date(Date.now() + 300_000) }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  } as any;
  const sms = { send: jest.fn().mockResolvedValue({ providerMessageId: 'p1' }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = {
    get: jest.fn((k: string) => {
      if (k === 'OTP_TTL_SEC') return 300;
      if (k === 'OTP_REQUEST_RATE_LIMIT_PER_MIN') return 1;
      throw new Error(`unknown key ${k}`);
    }),
  } as any;
  return { prisma, sms, audit, config };
};

describe('AuthService.requestCode (unit)', () => {
  it('creates a hashed code, sends SMS, records audit', async () => {
    const { prisma, sms, audit, config } = makeDeps();
    const svc = new AuthService(prisma, sms, audit, config);

    const res = await svc.requestCode('+79991234567');

    expect(res.retryAfterSec).toBe(60);
    expect(prisma.authCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '+79991234567' }),
      }),
    );
    const createdData = prisma.authCode.create.mock.calls[0][0].data;
    expect(createdData.codeHash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+79991234567', text: expect.stringMatching(/\d{4}/) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.code.requested', entity: 'AuthCode' }),
    );
  });

  it('rejects when a recent code was already issued', async () => {
    const { prisma, sms, audit, config } = makeDeps();
    prisma.authCode.findFirst.mockResolvedValue({
      id: 'c0',
      phone: '+79991234567',
      createdAt: new Date(), // just now
    });

    const svc = new AuthService(prisma, sms, audit, config);
    await expect(svc.requestCode('+79991234567')).rejects.toThrow(/rate/i);
    expect(sms.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8.4: Run, expect FAIL** (AuthService not defined).

- [ ] **Step 8.5: Implement `apps/api/src/auth/auth.service.ts`**

```typescript
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.types';
import type { Env } from '../config/env.schema';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

export interface RequestCodeResult {
  retryAfterSec: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async requestCode(phone: string): Promise<RequestCodeResult> {
    const ttlSec = this.config.get('OTP_TTL_SEC', { infer: true });
    const rateLimitPerMin = this.config.get('OTP_REQUEST_RATE_LIMIT_PER_MIN', { infer: true });

    const recent = await this.prisma.authCode.findFirst({
      where: { phone, createdAt: { gte: new Date(Date.now() - (60 / rateLimitPerMin) * 1000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException({ code: 'AUTH_RATE_LIMITED', message: 'rate limited' });
    }

    const code = String(randomInt(0, 10_000)).padStart(4, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    const created = await this.prisma.authCode.create({
      data: { phone, codeHash, expiresAt },
    });

    await this.sms.send({ to: phone, text: `VITTORIA HOME: ${code}` });

    await this.audit.record({
      action: 'auth.code.requested',
      entity: 'AuthCode',
      entityId: created.id,
      after: { phone },
    });

    return { retryAfterSec: Math.ceil(60 / rateLimitPerMin) };
  }
}
```

- [ ] **Step 8.6: Run, expect PASS** (both unit tests green).

- [ ] **Step 8.7: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): AuthService.requestCode with bcrypt hashing and rate limiting"
```

---

## Task 9: Auth Module + Controller — request-code endpoint (e2e)

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 9.1: Failing e2e**

`apps/api/test/auth.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
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
    await prisma.authCode.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('POST /auth/request-code returns 200 with retry_after_sec and persists an auth code', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/request-code')
      .send({ phone: '+79991234567' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ retry_after_sec: expect.any(Number) });
    const codes = await prisma.authCode.findMany({ where: { phone: '+79991234567' } });
    expect(codes).toHaveLength(1);
  });

  it('POST /auth/request-code rejects malformed phone with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/request-code')
      .send({ phone: '12345' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 9.2: Run, expect FAIL** (controller not defined).

- [ ] **Step 9.3: Implement `apps/api/src/auth/auth.controller.ts`**

```typescript
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-code')
  @HttpCode(200)
  async requestCode(@Body() dto: RequestCodeDto): Promise<{ retry_after_sec: number }> {
    const { retryAfterSec } = await this.auth.requestCode(dto.phone);
    return { retry_after_sec: retryAfterSec };
  }
}
```

- [ ] **Step 9.4: `apps/api/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [SmsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 9.5: Wire into `AppModule`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, AuditModule, AuthModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 9.6: Run, expect PASS**

```bash
pnpm --filter @vittoria/api test
```

- [ ] **Step 9.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): POST /auth/request-code endpoint"
```

---

## Task 10: TokensService + JWT Setup

**Files:**
- Create: `apps/api/src/auth/tokens.service.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/__tests__/tokens.service.spec.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

- [ ] **Step 10.1: Add JWT deps**

```json
"@nestjs/jwt": "^10.2.0",
"@nestjs/passport": "^10.0.3",
"passport": "^0.7.0",
"passport-jwt": "^4.0.1"
```
devDependencies:
```json
"@types/passport-jwt": "^4.0.1"
```

```bash
pnpm install
```

- [ ] **Step 10.2: Failing unit test**

`apps/api/src/auth/__tests__/tokens.service.spec.ts`:
```typescript
import { JwtService } from '@nestjs/jwt';
import { TokensService } from '../tokens.service';

describe('TokensService', () => {
  const config = {
    get: jest.fn((k: string) => {
      if (k === 'JWT_SECRET') return '0123456789012345678901234567890123456789';
      if (k === 'JWT_ACCESS_TTL_SEC') return 900;
      if (k === 'JWT_REFRESH_TTL_SEC') return 2592000;
      throw new Error(k);
    }),
  } as any;
  const jwt = new JwtService({ secret: '0123456789012345678901234567890123456789' });
  const svc = new TokensService(jwt, config);

  it('issues access + refresh tokens for a user', async () => {
    const out = await svc.issue({ userId: 'u1', role: 'client', jti: 'j1' });
    expect(typeof out.accessToken).toBe('string');
    expect(typeof out.refreshToken).toBe('string');
    const decoded = jwt.verify(out.accessToken);
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('client');
    expect(decoded.jti).toBe('j1');
  });
});
```

- [ ] **Step 10.3: Run, expect FAIL.**

- [ ] **Step 10.4: Implement `apps/api/src/auth/tokens.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.schema';

export interface AccessClaims {
  sub: string;
  role: string;
  jti: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(claims: { userId: string; role: string; jti: string }): Promise<IssuedTokens> {
    const access = await this.jwt.signAsync(
      { sub: claims.userId, role: claims.role, jti: claims.jti } satisfies AccessClaims,
      { expiresIn: `${this.config.get('JWT_ACCESS_TTL_SEC', { infer: true })}s` },
    );
    const refresh = await this.jwt.signAsync(
      { sub: claims.userId, jti: claims.jti, typ: 'refresh' },
      { expiresIn: `${this.config.get('JWT_REFRESH_TTL_SEC', { infer: true })}s` },
    );
    return { accessToken: access, refreshToken: refresh };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token);
  }

  async verifyRefresh(token: string): Promise<{ sub: string; jti: string; typ: 'refresh' }> {
    const claims = await this.jwt.verifyAsync<{ sub: string; jti: string; typ: string }>(token);
    if (claims.typ !== 'refresh') throw new Error('not a refresh token');
    return claims as { sub: string; jti: string; typ: 'refresh' };
  }
}
```

- [ ] **Step 10.5: `apps/api/src/auth/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../config/env.schema';
import type { AccessClaims } from './tokens.service';
import type { AuthUser } from '../common/types/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: AccessClaims): AuthUser {
    if (!payload.sub || !payload.role) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub, role: payload.role as AuthUser['role'], jti: payload.jti };
  }
}
```

- [ ] **Step 10.6: Create `apps/api/src/common/types/auth-user.ts`**

```typescript
export interface AuthUser {
  id: string;
  role: 'client' | 'admin' | 'partner';
  jti: string;
}
```

- [ ] **Step 10.7: Update `apps/api/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { JwtStrategy } from './jwt.strategy';
import type { Env } from '../config/env.schema';

@Module({
  imports: [
    SmsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
```

- [ ] **Step 10.8: Run unit + e2e**

```bash
pnpm --filter @vittoria/api test
```
Expected: all green.

- [ ] **Step 10.9: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): JwtModule, TokensService, PassportJwt strategy"
```

---

## Task 11: AuthService — verify-code

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/dto/verify-code.dto.ts`
- Modify: `apps/api/src/auth/__tests__/auth.service.spec.ts` (add verify cases)
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 11.1: DTO `apps/api/src/auth/dto/verify-code.dto.ts`**

```typescript
import { IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @Matches(/^\+7\d{10}$/)
  phone!: string;

  @IsString()
  @Length(4, 4)
  code!: string;

  @IsOptional()
  @IsObject()
  device_info?: Record<string, unknown>;
}
```

- [ ] **Step 11.2: e2e failing test (add to existing auth.e2e-spec.ts)**

Append to `apps/api/test/auth.e2e-spec.ts`:
```typescript
  it('POST /auth/verify-code with correct code returns tokens and creates a user + session', async () => {
    // Seed an auth code directly so we control the value.
    const bcrypt = await import('bcrypt');
    const code = '1234';
    const codeHash = await bcrypt.hash(code, 10);
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/verify-code')
      .send({ phone: '+79991234567', code, device_info: { platform: 'ios' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      user: expect.objectContaining({ phone: '+79991234567', role: 'client' }),
    });

    const users = await prisma.user.findMany({ where: { phone: '+79991234567' } });
    expect(users).toHaveLength(1);
    const sessions = await prisma.session.findMany({ where: { userId: users[0].id } });
    expect(sessions).toHaveLength(1);
  });

  it('POST /auth/verify-code with wrong code returns 400 and increments attempts', async () => {
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await request(app.getHttpServer())
      .post('/auth/verify-code')
      .send({ phone: '+79991234567', code: '9999' });
    expect(res.status).toBe(400);
    const code = await prisma.authCode.findFirst({ where: { phone: '+79991234567' } });
    expect(code?.attempts).toBe(1);
  });
```

- [ ] **Step 11.3: Run, expect FAIL** (endpoint not implemented).

- [ ] **Step 11.4: Extend `AuthService` with `verifyCode`**

Add to `apps/api/src/auth/auth.service.ts`:
```typescript
// imports already present, add:
import { TokensService } from './tokens.service';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

// Inject TokensService in constructor:
//   constructor(..., private readonly tokens: TokensService) {}
// (rewrite full constructor below)

// Add to class body:
async verifyCode(
  phone: string,
  code: string,
  deviceInfo: Record<string, unknown> = {},
): Promise<{ accessToken: string; refreshToken: string; user: { id: string; phone: string; role: string } }> {
  const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
  const refreshTtlSec = this.config.get('JWT_REFRESH_TTL_SEC', { infer: true });

  const authCode = await this.prisma.authCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!authCode) {
    throw new UnauthorizedException({ code: 'AUTH_CODE_INVALID', message: 'invalid or expired code' });
  }
  if (authCode.attempts >= maxAttempts) {
    throw new UnauthorizedException({ code: 'AUTH_CODE_LOCKED', message: 'too many attempts' });
  }

  const bcrypt = await import('bcrypt');
  const ok = await bcrypt.compare(code, authCode.codeHash);

  if (!ok) {
    await this.prisma.authCode.update({
      where: { id: authCode.id },
      data: { attempts: { increment: 1 } },
    });
    throw new UnauthorizedException({ code: 'AUTH_CODE_INVALID', message: 'invalid code' });
  }

  await this.prisma.authCode.update({
    where: { id: authCode.id },
    data: { consumedAt: new Date() },
  });

  const user = await this.prisma.user.upsert({
    where: { phone },
    update: { lastLoginAt: new Date() },
    create: { phone, lastLoginAt: new Date() },
  });

  const jti = randomUUID();
  const { accessToken, refreshToken } = await this.tokens.issue({
    userId: user.id,
    role: user.role,
    jti,
  });

  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await this.prisma.session.create({
    data: {
      id: jti,
      userId: user.id,
      refreshTokenHash: refreshHash,
      deviceInfo: deviceInfo as object,
      expiresAt: new Date(Date.now() + refreshTtlSec * 1000),
    },
  });

  await this.audit.record({
    actorUserId: user.id,
    action: 'auth.code.verified',
    entity: 'User',
    entityId: user.id,
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, phone: user.phone!, role: user.role },
  };
}
```

Rewrite the constructor to include `TokensService`:
```typescript
constructor(
  private readonly prisma: PrismaService,
  @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  private readonly audit: AuditService,
  private readonly config: ConfigService<Env, true>,
  private readonly tokens: TokensService,
) {}
```

- [ ] **Step 11.5: Extend `AuthController`**

`apps/api/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-code')
  @HttpCode(200)
  async requestCode(@Body() dto: RequestCodeDto): Promise<{ retry_after_sec: number }> {
    const { retryAfterSec } = await this.auth.requestCode(dto.phone);
    return { retry_after_sec: retryAfterSec };
  }

  @Post('verify-code')
  @HttpCode(200)
  async verifyCode(@Body() dto: VerifyCodeDto): Promise<{
    access_token: string;
    refresh_token: string;
    user: { id: string; phone: string; role: string };
  }> {
    const result = await this.auth.verifyCode(dto.phone, dto.code, dto.device_info ?? {});
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
    };
  }
}
```

- [ ] **Step 11.6: Run all tests**

```bash
pnpm --filter @vittoria/api test
```

Expected: existing tests still pass, new e2e tests pass.

- [ ] **Step 11.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): POST /auth/verify-code returns access+refresh and creates session"
```

---

## Task 12: AuthService — refresh + logout

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/dto/refresh.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 12.1: DTO `apps/api/src/auth/dto/refresh.dto.ts`**

```typescript
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(20)
  refresh_token!: string;
}
```

- [ ] **Step 12.2: Failing e2e**

Append to `apps/api/test/auth.e2e-spec.ts`:
```typescript
  it('POST /auth/refresh rotates refresh token and revokes the old session', async () => {
    // login via verify-code path
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    const verify = await request(app.getHttpServer())
      .post('/auth/verify-code')
      .send({ phone: '+79991234567', code: '1234' });
    const oldRefresh = verify.body.refresh_token as string;

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: oldRefresh });
    expect(res.status).toBe(200);
    expect(res.body.refresh_token).not.toEqual(oldRefresh);
    expect(typeof res.body.access_token).toBe('string');

    // Reusing the old refresh token must fail.
    const reuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: oldRefresh });
    expect(reuse.status).toBe(401);
  });

  it('POST /auth/logout revokes the session', async () => {
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    const verify = await request(app.getHttpServer())
      .post('/auth/verify-code')
      .send({ phone: '+79991234567', code: '1234' });
    const access = verify.body.access_token as string;
    const refresh = verify.body.refresh_token as string;

    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .send();
    expect(res.status).toBe(204);

    const reuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: refresh });
    expect(reuse.status).toBe(401);
  });
```

- [ ] **Step 12.3: Extend AuthService**

Add to `apps/api/src/auth/auth.service.ts`:
```typescript
async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshTtlSec = this.config.get('JWT_REFRESH_TTL_SEC', { infer: true });

  let claims;
  try {
    claims = await this.tokens.verifyRefresh(refreshToken);
  } catch {
    throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'invalid refresh token' });
  }

  const session = await this.prisma.session.findUnique({ where: { id: claims.jti } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedException({ code: 'REFRESH_REVOKED', message: 'session revoked' });
  }
  const bcrypt = await import('bcrypt');
  const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
  if (!matches) {
    // Possible token reuse — revoke session as safety measure.
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'invalid refresh token' });
  }

  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const newJti = randomUUID();
  const issued = await this.tokens.issue({ userId: user.id, role: user.role, jti: newJti });
  const newHash = await bcrypt.hash(issued.refreshToken, 10);

  await this.prisma.$transaction([
    this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    this.prisma.session.create({
      data: {
        id: newJti,
        userId: user.id,
        refreshTokenHash: newHash,
        deviceInfo: session.deviceInfo as object,
        expiresAt: new Date(Date.now() + refreshTtlSec * 1000),
      },
    }),
  ]);

  return { accessToken: issued.accessToken, refreshToken: issued.refreshToken };
}

async logout(sessionId: string): Promise<void> {
  await this.prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}
```

- [ ] **Step 12.4: Extend Controller**

`apps/api/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RequestCodeDto } from './dto/request-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { RefreshDto } from './dto/refresh.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-code')
  @HttpCode(200)
  async requestCode(@Body() dto: RequestCodeDto): Promise<{ retry_after_sec: number }> {
    const { retryAfterSec } = await this.auth.requestCode(dto.phone);
    return { retry_after_sec: retryAfterSec };
  }

  @Post('verify-code')
  @HttpCode(200)
  async verifyCode(@Body() dto: VerifyCodeDto): Promise<{
    access_token: string;
    refresh_token: string;
    user: { id: string; phone: string; role: string };
  }> {
    const result = await this.auth.verifyCode(dto.phone, dto.code, dto.device_info ?? {});
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto): Promise<{ access_token: string; refresh_token: string }> {
    const result = await this.auth.refresh(dto.refresh_token);
    return { access_token: result.accessToken, refresh_token: result.refreshToken };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'))
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.jti);
  }
}
```

(Note: `CurrentUser` decorator is built in Task 13. We declare its import here so the order of task application matters — execute Task 12 and Task 13 together if doing strict TDD; otherwise temporarily inline `@Req() req: Request` and read `req.user`.)

- [ ] **Step 12.5: Create the `CurrentUser` decorator (preview of Task 13)**

`apps/api/src/common/decorators/current-user.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
```

- [ ] **Step 12.6: Run all tests**

```bash
pnpm --filter @vittoria/api test
```

Expected: all green.

- [ ] **Step 12.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): refresh-token rotation, logout, and CurrentUser decorator"
```

---

## Task 13: Public Decorator + Global JwtAuthGuard

**Files:**
- Create: `apps/api/src/common/decorators/public.decorator.ts`
- Create: `apps/api/src/common/guards/jwt-auth.guard.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/auth/auth.controller.ts` (mark public endpoints)
- Modify: `apps/api/src/health/health.controller.ts` (mark public)

- [ ] **Step 13.1: `apps/api/src/common/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 13.2: `apps/api/src/common/guards/jwt-auth.guard.ts`**

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

- [ ] **Step 13.3: Register globally in `AppModule`**

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, AuditModule, AuthModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
```

- [ ] **Step 13.4: Mark public endpoints**

In `apps/api/src/auth/auth.controller.ts`, decorate the three unauthenticated endpoints with `@Public()`:
```typescript
import { Public } from '../common/decorators/public.decorator';

// add @Public() above the methods:
//   requestCode, verifyCode, refresh
```

In `apps/api/src/health/health.controller.ts`, add `@Public()` to `healthz` and `readyz`.

Update the import in both controllers.

- [ ] **Step 13.5: Add e2e for guard behavior**

Append to `apps/api/test/auth.e2e-spec.ts`:
```typescript
  it('protected endpoint without Authorization → 401', async () => {
    const res = await request(app.getHttpServer()).post('/auth/logout').send();
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 13.6: Run tests**

```bash
pnpm --filter @vittoria/api test
```

Expected: all green; protected endpoint test 401.

- [ ] **Step 13.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): global JwtAuthGuard with @Public() opt-out"
```

---

## Task 14: Roles Guard + Roles Decorator

**Files:**
- Create: `apps/api/src/common/decorators/roles.decorator.ts`
- Create: `apps/api/src/common/guards/roles.guard.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/common/guards/__tests__/roles.guard.spec.ts`

- [ ] **Step 14.1: `apps/api/src/common/decorators/roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<AuthUser['role']>) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 14.2: Failing unit test**

`apps/api/src/common/guards/__tests__/roles.guard.spec.ts`:
```typescript
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';

const makeCtx = (user: { role: string } | undefined, requiredRoles?: string[]) => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
  return { reflector, ctx };
};

describe('RolesGuard', () => {
  it('passes when no role metadata is set', () => {
    const { reflector, ctx } = makeCtx({ role: 'client' }, undefined);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when user role is allowed', () => {
    const { reflector, ctx } = makeCtx({ role: 'admin' }, ['admin']);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when role does not match', () => {
    const { reflector, ctx } = makeCtx({ role: 'client' }, ['admin']);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(ctx)).toBe(false);
  });
});
```

- [ ] **Step 14.3: Run, expect FAIL.**

- [ ] **Step 14.4: `apps/api/src/common/guards/roles.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Array<AuthUser['role']>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    return !!user && required.includes(user.role);
  }
}
```

- [ ] **Step 14.5: Register globally (after JwtAuthGuard so the user is populated first)**

```typescript
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  // ...imports...
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 14.6: Run unit tests, expect PASS.**

- [ ] **Step 14.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): RolesGuard and @Roles() decorator"
```

---

## Task 15: Users Module — /me endpoints

**Files:**
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.module.ts`
- Create: `apps/api/src/users/dto/update-me.dto.ts`
- Create: `apps/api/test/users.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 15.1: DTO `apps/api/src/users/dto/update-me.dto.ts`**

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}
```

- [ ] **Step 15.2: `apps/api/src/users/users.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  update(
    id: string,
    patch: { first_name?: string; last_name?: string },
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: patch.first_name,
        lastName: patch.last_name,
      },
    });
  }

  recordConsent(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { consentAcceptedAt: new Date() },
    });
  }

  async anonymize(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.user.update({
        where: { id },
        data: {
          phone: null,
          firstName: 'Удалённый пользователь',
          lastName: null,
        },
      });
    });
  }
}
```

- [ ] **Step 15.3: `apps/api/src/users/users.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.users.findById(user.id);
    return {
      id: u.id,
      phone: u.phone,
      role: u.role,
      first_name: u.firstName,
      last_name: u.lastName,
      consent_accepted_at: u.consentAcceptedAt,
    };
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    const u = await this.users.update(user.id, dto);
    return {
      id: u.id,
      phone: u.phone,
      role: u.role,
      first_name: u.firstName,
      last_name: u.lastName,
    };
  }

  @Post('consent')
  @HttpCode(204)
  async consent(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.recordConsent(user.id);
  }

  @Delete()
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.anonymize(user.id);
  }
}
```

- [ ] **Step 15.4: `apps/api/src/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

Wire into `AppModule`:
```typescript
// add UsersModule to imports
```

- [ ] **Step 15.5: e2e `apps/api/test/users.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (/me) (e2e)', () => {
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
    await prisma.authCode.deleteMany();
    await prisma.user.deleteMany();
  });

  async function login(phone = '+79991234567'): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.authCode.create({
      data: { phone, codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    const res = await request(app.getHttpServer())
      .post('/auth/verify-code')
      .send({ phone, code: '1234' });
    return {
      accessToken: res.body.access_token,
      refreshToken: res.body.refresh_token,
      userId: res.body.user.id,
    };
  }

  it('GET /me returns the current user', async () => {
    const { accessToken } = await login();
    const res = await request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+79991234567', role: 'client' });
  });

  it('PATCH /me updates first_name / last_name', async () => {
    const { accessToken } = await login();
    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ first_name: 'Иван', last_name: 'Иванов' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ first_name: 'Иван', last_name: 'Иванов' });
  });

  it('POST /me/consent → 204 and sets consent_accepted_at', async () => {
    const { accessToken, userId } = await login();
    const res = await request(app.getHttpServer())
      .post('/me/consent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();
    expect(res.status).toBe(204);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.consentAcceptedAt).toBeInstanceOf(Date);
  });

  it('DELETE /me anonymizes and revokes sessions', async () => {
    const { accessToken, userId } = await login();
    const res = await request(app.getHttpServer())
      .delete('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();
    expect(res.status).toBe(204);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.phone).toBeNull();
    expect(u.firstName).toBe('Удалённый пользователь');
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
  });
});
```

- [ ] **Step 15.6: Run all tests**

```bash
pnpm --filter @vittoria/api test
```

- [ ] **Step 15.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): /me endpoints (GET, PATCH, consent, anonymize)"
```

---

## Task 16: Rate Limiting on Auth Endpoints + Final Verification

**Files:**
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/test/auth.e2e-spec.ts` (add throttling test)

- [ ] **Step 16.1: Add `@nestjs/throttler`**

`apps/api/package.json` dependencies:
```json
"@nestjs/throttler": "^6.0.0"
```

```bash
pnpm install
```

- [ ] **Step 16.2: Register throttler in `AppModule`**

`apps/api/src/app.module.ts`:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// add to imports:
ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 60 }]),
// add to providers (after JwtAuthGuard and RolesGuard):
{ provide: APP_GUARD, useClass: ThrottlerGuard },
```

- [ ] **Step 16.3: Tighter throttle on auth endpoints**

`apps/api/src/auth/auth.controller.ts` — annotate sensitive endpoints:
```typescript
import { Throttle } from '@nestjs/throttler';

// above requestCode:
@Throttle({ default: { limit: 5, ttl: 60_000 } })
// above verifyCode:
@Throttle({ default: { limit: 10, ttl: 60_000 } })
```

- [ ] **Step 16.4: Add a throttling e2e test**

Append to `apps/api/test/auth.e2e-spec.ts`:
```typescript
  it('POST /auth/request-code is rate-limited at the throttler', async () => {
    // Hit it 6 times in quick succession with different phones to bypass per-phone rate limit.
    // The throttler is per-IP, so all 6 share the same IP in test (loopback).
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const phone = `+7999000000${i}`;
      const res = await request(app.getHttpServer()).post('/auth/request-code').send({ phone });
      results.push(res.status);
    }
    // First 5 should be 200, the 6th should be 429.
    expect(results.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(results[5]).toBe(429);
  });
```

- [ ] **Step 16.5: Run all tests**

```bash
pnpm --filter @vittoria/api test
```

- [ ] **Step 16.6: Run root verification**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

All commands must exit 0.

- [ ] **Step 16.7: Smoke-run dev server with real infra**

```bash
pnpm dev:infra
pnpm --filter @vittoria/api dev
```

In another terminal:
```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
curl -X POST http://localhost:3000/auth/request-code -H "Content-Type: application/json" -d '{"phone":"+79991234567"}'
```

Expected:
- `/healthz` → `{"status":"ok"}`
- `/readyz` → `{"status":"ok","checks":{"db":"ok","redis":"ok"}}`
- `/auth/request-code` → `{"retry_after_sec":60}` (and the dev SMS provider logs the OTP to the console — copy it).

Read the OTP from the api log and:
```bash
curl -X POST http://localhost:3000/auth/verify-code \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+79991234567\",\"code\":\"<the-otp-from-logs>\"}"
```

Expected: `{"access_token":"...","refresh_token":"...","user":{...}}`.

Stop the server (Ctrl+C) and infra (`pnpm dev:infra:down`).

- [ ] **Step 16.8: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): throttler for auth endpoints, plan-1 verification"
```

- [ ] **Step 16.9: Push to remote**

```bash
git push origin main
```

Verify CI is green at https://github.com/sdukezanov-lgtm/vittoria/actions.

---

## Definition of Done

Plan 1 is complete when:

- [x] Prisma schema with `users`, `auth_codes`, `sessions`, `audit_log` is migrated.
- [x] `pnpm install --frozen-lockfile` succeeds.
- [x] `pnpm lint` and `pnpm test` exit 0 (unit + e2e with Testcontainers).
- [x] `GET /healthz` → 200 `{status:'ok'}`.
- [x] `GET /readyz` → 200 with both `db:ok` and `redis:ok`.
- [x] `POST /auth/request-code` issues an OTP, hashes it with bcrypt, rate-limits.
- [x] `POST /auth/verify-code` returns access + refresh tokens, creates user + session.
- [x] `POST /auth/refresh` rotates refresh tokens, rejects reuse.
- [x] `POST /auth/logout` revokes the current session.
- [x] `GET /me`, `PATCH /me`, `POST /me/consent`, `DELETE /me` all work with JWT auth.
- [x] Throttler returns 429 after the configured limit.
- [x] GitHub Actions CI matrix is green.

After Plan 1 lands, proceed to **Plan 2: AmoCRM Sync** (webhook listener, BullMQ workers, custom-field mapping, failsafe pull, conflict resolution).

---

**End of Plan 1.**
