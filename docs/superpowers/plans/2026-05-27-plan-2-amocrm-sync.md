# Plan 2: AmoCRM Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AmoCRM the source of truth for users and deals: receive webhooks from AmoCRM, mirror state into Postgres, push admin-side edits back to AmoCRM, and reconcile via a periodic failsafe pull. Closes the auto-create-user technical debt from Plan 1.

**Architecture:** A new `amocrm` NestJS module wraps an AmoCRM HTTP client (interface + Mock implementation for dev/test, real implementation gated by env). BullMQ (Redis-backed) powers two queues — `amocrm-inbound` (webhook events → upsert in our DB) and `amocrm-outbound` (admin-side changes → PATCH AmoCRM). Webhooks are received over HTTPS, validated via HMAC + IP allowlist, deduplicated via Redis SET (24h TTL), and enqueued. A 15-minute cron job pulls leads updated since the last sync to catch missed webhooks. Conflicts (concurrent webhook vs outbound write) resolve in favour of the local change.

**Tech Stack:**
- `bullmq` (Redis 5 backend) + `@nestjs/bullmq` for queues/workers
- `@nestjs/schedule` for cron (failsafe pull)
- `axios` for AmoCRM HTTP client
- `nock` for HTTP mocking in tests
- Existing Prisma + Postgres for persistence (Plan 1)
- Existing AuditService for inbound/outbound audit trail
- Reuses `infra/docker-compose.dev.yml` Redis (Plan 0)

**Reference spec:** [docs/superpowers/specs/2026-05-26-vittoria-home-mvp-design.md](../specs/2026-05-26-vittoria-home-mvp-design.md) — sections 4 (Order, OrderStageHistory schema), 5 (full AmoCRM flow), 16 row #3 (AmoCRM source of truth).

**Out of scope (later plans):**
- Order chat / messages → Plan 4
- Notifications (push/SMS) on stage change → Plan 3
- Admin UI for orders → Plan 5 (web admin)
- AmoCRM real-credentials wiring → done by the operator with `.env` once integration is built

**Prerequisites for execution:**
- Plan 1 complete (auth, /me, prisma, redis, audit modules — all on `origin/main`)
- Docker Desktop running for `pnpm dev:infra`
- A test-only AmoCRM webhook secret can be a string in `.env.test` — no real AmoCRM credentials needed in this plan

---

## File Structure

After this plan completes, the relevant `apps/api/` tree is:

```
apps/api/
├── prisma/
│   ├── schema.prisma                              ← MODIFIED (add Order, OrderStageHistory + amocrm fields on User)
│   └── migrations/<ts>_add_orders/migration.sql   ← NEW
├── src/
│   ├── amocrm/
│   │   ├── amocrm.module.ts                       ← NEW
│   │   ├── amocrm.types.ts                        ← NEW (interfaces: AmoCrmClient, AmoLead, AmoContact, AmoWebhookPayload, AmoCrmCustomFields mapping)
│   │   ├── amocrm.config.ts                       ← NEW (env keys: AMOCRM_BASE_URL, AMOCRM_ACCESS_TOKEN, AMOCRM_WEBHOOK_SECRET, AMOCRM_FIELD_IDS)
│   │   ├── amocrm-http.client.ts                  ← NEW (axios-based real client)
│   │   ├── amocrm-mock.client.ts                  ← NEW (in-memory mock for dev/test)
│   │   ├── amocrm-mapper.ts                       ← NEW (AmoLead+AmoContact → Order+User DTO; reverse for outbound)
│   │   ├── amocrm-webhook.controller.ts           ← NEW (POST /amocrm/webhooks, public, HMAC-checked)
│   │   ├── amocrm-webhook.guard.ts                ← NEW (HMAC + IP allowlist)
│   │   ├── amocrm-idempotency.service.ts          ← NEW (Redis SET event_id dedupe)
│   │   ├── amocrm-sync.service.ts                 ← NEW (syncDealById; upsert Order)
│   │   ├── amocrm-failsafe.service.ts             ← NEW (cron pull)
│   │   ├── jobs/
│   │   │   ├── amocrm-inbound.processor.ts        ← NEW (BullMQ worker for inbound queue)
│   │   │   └── amocrm-outbound.processor.ts      ← NEW (BullMQ worker for outbound queue)
│   │   └── __tests__/
│   │       ├── amocrm-mapper.spec.ts              ← NEW
│   │       ├── amocrm-idempotency.service.spec.ts ← NEW
│   │       └── amocrm-webhook.guard.spec.ts       ← NEW
│   ├── orders/
│   │   ├── orders.module.ts                       ← NEW
│   │   ├── orders.service.ts                      ← NEW (updateProgress, used by admin in Plan 3)
│   │   └── __tests__/orders.service.spec.ts       ← NEW
│   ├── queues/
│   │   ├── queues.module.ts                       ← NEW (BullMQ root + queue registrations)
│   │   └── queue-names.ts                         ← NEW (constants)
│   ├── config/
│   │   └── env.schema.ts                          ← MODIFIED (add AMOCRM_* keys)
│   ├── auth/
│   │   └── auth.service.ts                        ← MODIFIED (close TD: phone must exist in users)
│   └── app.module.ts                              ← MODIFIED (wire AmocrmModule, OrdersModule, QueuesModule, ScheduleModule)
├── test/
│   ├── amocrm-webhook.e2e-spec.ts                 ← NEW
│   ├── amocrm-inbound.e2e-spec.ts                 ← NEW
│   ├── amocrm-outbound.e2e-spec.ts                ← NEW
│   ├── amocrm-failsafe.e2e-spec.ts                ← NEW
│   ├── auth.e2e-spec.ts                           ← MODIFIED (phone-not-found test)
│   └── helpers/
│       └── amocrm-fixtures.ts                     ← NEW (sample webhook payloads, lead JSON)
└── docs/
    └── amocrm-fields.md                           ← NEW (root /docs, custom field ID mapping doc)
```

**Responsibility split:**
- `amocrm/` — everything that knows about AmoCRM's API shape (HTTP client, custom-field IDs, webhook payload schema, mapper between AmoCRM models and our Prisma models).
- `orders/` — our own domain logic for orders (mutate stage/progress, query own DB). Knows nothing about AmoCRM directly — calls `AmocrmSyncService` to push changes outbound.
- `queues/` — generic BullMQ setup (connection, queue registration). Workers live next to their domain (`amocrm/jobs`).
- `config/` — env keys added centrally so zod validates them at boot.

---

## Task 1: Extend Prisma Schema — Order, OrderStageHistory

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_orders/migration.sql`

- [ ] **Step 1.1: Add `OrderStage` enum and models to `apps/api/prisma/schema.prisma`**

Append BEFORE the `model AuditLog` block (keep models in alphabetical-ish order — User, AuthCode, Session, Order, OrderStageHistory, AuditLog):

```prisma
enum OrderStage {
  preparation_for_production
  detailing
  materials_arrival
  production
  transfer_to_warehouse
  completeness_check
  ready_for_delivery
}

model Order {
  id                  String     @id @default(uuid()) @db.Uuid
  amocrmDealId        Int        @unique @map("amocrm_deal_id")
  contractNumber      String?    @map("contract_number")
  clientUserId        String     @map("client_user_id") @db.Uuid
  partnerUserId       String?    @map("partner_user_id") @db.Uuid
  productName         String?    @map("product_name")
  totalAmount         Decimal?   @map("total_amount") @db.Decimal(12, 2)
  prepaymentAmount    Decimal?   @map("prepayment_amount") @db.Decimal(12, 2)
  balanceDue          Decimal?   @map("balance_due") @db.Decimal(12, 2)
  currentStage        OrderStage @default(preparation_for_production) @map("current_stage")
  progressPercent     Int        @default(0) @map("progress_percent")
  servicePhone        String?    @map("service_phone")
  partnerServices     Json       @default("[]") @map("partner_services")
  lastAdminComment    String?    @map("last_admin_comment")
  amocrmSyncedAt      DateTime?  @map("amocrm_synced_at")
  version             Int        @default(0)
  createdAt           DateTime   @default(now()) @map("created_at")
  updatedAt           DateTime   @updatedAt @map("updated_at")

  client   User                  @relation("ClientOrders", fields: [clientUserId], references: [id], onDelete: Cascade)
  partner  User?                 @relation("PartnerOrders", fields: [partnerUserId], references: [id], onDelete: SetNull)
  history  OrderStageHistory[]

  @@index([clientUserId])
  @@index([partnerUserId])
  @@map("orders")
}

model OrderStageHistory {
  id                String     @id @default(uuid()) @db.Uuid
  orderId           String     @map("order_id") @db.Uuid
  stage             OrderStage
  progressPercent   Int        @map("progress_percent")
  comment           String?
  changedByUserId   String?    @map("changed_by_user_id") @db.Uuid
  changedAt         DateTime   @default(now()) @map("changed_at")

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId, changedAt(sort: Desc)])
  @@map("order_stage_history")
}
```

- [ ] **Step 1.2: Add reverse relations to `User` model**

In the existing `model User` block, add inside the relations area:

```prisma
  clientOrders   Order[] @relation("ClientOrders")
  partnerOrders  Order[] @relation("PartnerOrders")
```

- [ ] **Step 1.3: Run `prisma format`**

```bash
cd apps/api && pnpm exec prisma format && cd ../..
```

- [ ] **Step 1.4: Create the migration**

```bash
cd apps/api && pnpm exec prisma migrate dev --name add_orders && cd ../..
```

Expected: new directory `apps/api/prisma/migrations/<ts>_add_orders/` with `migration.sql` creating `orders`, `order_stage_history` tables and the `OrderStage` enum.

- [ ] **Step 1.5: Verify build clean and existing tests still pass**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:unit
```

Both must exit 0. (`prisma generate` runs as part of postinstall but won't re-run here; running `build` re-emits TypeScript types that include the new `Order` and `OrderStageHistory` Prisma models.)

- [ ] **Step 1.6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add Order and OrderStageHistory to Prisma schema"
```

---

## Task 2: Add AmoCRM Env Keys to Config Schema

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/.env.test`
- Modify: `apps/api/.env` (developer-only, not committed)

- [ ] **Step 2.1: Update `apps/api/src/config/env.schema.ts`**

Add inside the `z.object({ ... })` block, after `OTP_REQUEST_RATE_LIMIT_PER_MIN`:

```typescript
  AMOCRM_BASE_URL: z.string().url().default('https://example.amocrm.ru'),
  AMOCRM_ACCESS_TOKEN: z.string().default('dev-mock-token'),
  AMOCRM_WEBHOOK_SECRET: z.string().min(16, 'AMOCRM_WEBHOOK_SECRET must be at least 16 chars').default('dev-webhook-secret-change-me'),
  AMOCRM_WEBHOOK_IP_ALLOWLIST: z.string().default(''),
  AMOCRM_CLIENT_MODE: z.enum(['mock', 'http']).default('mock'),
  AMOCRM_FAILSAFE_CRON: z.string().default('*/15 * * * *'),
  AMOCRM_FIELD_STAGE_ID: z.coerce.number().int().positive().default(1001),
  AMOCRM_FIELD_PROGRESS_ID: z.coerce.number().int().positive().default(1002),
  AMOCRM_FIELD_ADMIN_COMMENT_ID: z.coerce.number().int().positive().default(1003),
  AMOCRM_FIELD_PREPAYMENT_ID: z.coerce.number().int().positive().default(1004),
  AMOCRM_FIELD_PARTNER_USER_ID: z.coerce.number().int().positive().default(1005),
  AMOCRM_FIELD_PARTNER_SERVICES_ID: z.coerce.number().int().positive().default(1006),
```

- [ ] **Step 2.2: Update `apps/api/.env.example`**

Append:
```env
AMOCRM_BASE_URL=https://yourdomain.amocrm.ru
AMOCRM_ACCESS_TOKEN=replace-me
AMOCRM_WEBHOOK_SECRET=replace-me-32-chars-min
AMOCRM_WEBHOOK_IP_ALLOWLIST=
AMOCRM_CLIENT_MODE=mock
AMOCRM_FAILSAFE_CRON=*/15 * * * *
AMOCRM_FIELD_STAGE_ID=1001
AMOCRM_FIELD_PROGRESS_ID=1002
AMOCRM_FIELD_ADMIN_COMMENT_ID=1003
AMOCRM_FIELD_PREPAYMENT_ID=1004
AMOCRM_FIELD_PARTNER_USER_ID=1005
AMOCRM_FIELD_PARTNER_SERVICES_ID=1006
```

- [ ] **Step 2.3: Update `apps/api/.env.test`**

Append (using mock mode and deterministic IDs):
```env
AMOCRM_BASE_URL=https://test.amocrm.ru
AMOCRM_ACCESS_TOKEN=test-token
AMOCRM_WEBHOOK_SECRET=test-webhook-secret-32-chars-xxxxxxx
AMOCRM_WEBHOOK_IP_ALLOWLIST=
AMOCRM_CLIENT_MODE=mock
AMOCRM_FAILSAFE_CRON=*/15 * * * *
AMOCRM_FIELD_STAGE_ID=1001
AMOCRM_FIELD_PROGRESS_ID=1002
AMOCRM_FIELD_ADMIN_COMMENT_ID=1003
AMOCRM_FIELD_PREPAYMENT_ID=1004
AMOCRM_FIELD_PARTNER_USER_ID=1005
AMOCRM_FIELD_PARTNER_SERVICES_ID=1006
```

- [ ] **Step 2.4: Update developer's `apps/api/.env`** (not committed)

Same values as `.env.test` — copy them in. The `.gitignore` already covers this file.

- [ ] **Step 2.5: Update env schema unit test**

In `apps/api/src/config/__tests__/env.schema.spec.ts`, update the `valid` object to include all new AMOCRM keys (you can leave them undefined to use defaults — schema has defaults — and the test still passes). Verify the existing 3 tests still pass:

```bash
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 2.6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add AmoCRM env config keys"
```

---

## Task 3: AmoCRM Types and Custom Field Mapping Document

**Files:**
- Create: `apps/api/src/amocrm/amocrm.types.ts`
- Create: `apps/api/src/amocrm/amocrm.config.ts`
- Create: `docs/amocrm-fields.md`

- [ ] **Step 3.1: Create `apps/api/src/amocrm/amocrm.types.ts`**

```typescript
export const AMOCRM_CLIENT = Symbol('AMOCRM_CLIENT');

export type AmoCustomFieldValueType = 'number' | 'string' | 'select';

export interface AmoCustomFieldValue {
  field_id: number;
  values: Array<{ value: string | number | boolean }>;
}

export interface AmoContact {
  id: number;
  name?: string | null;
  custom_fields_values?: AmoCustomFieldValue[] | null;
  phone?: string | null; // resolved by the client from contacts/<id>?with=phones
}

export interface AmoLead {
  id: number;
  name?: string | null;
  status_id?: number | null;
  pipeline_id?: number | null;
  updated_at: number; // unix seconds
  custom_fields_values?: AmoCustomFieldValue[] | null;
  _embedded?: {
    contacts?: Array<{ id: number }>;
  };
}

export interface AmoWebhookEvent {
  event_id: string; // we read from AmoCRM payload or HMAC body
  event_type: 'lead.add' | 'lead.update' | 'contact.update';
  entity_id: number;
  occurred_at: number;
}

export interface AmoCrmClient {
  getLead(id: number): Promise<AmoLead>;
  getContact(id: number): Promise<AmoContact>;
  patchLead(id: number, customFields: AmoCustomFieldValue[]): Promise<void>;
  listLeadsUpdatedSince(since: Date): Promise<AmoLead[]>;
}
```

- [ ] **Step 3.2: Create `apps/api/src/amocrm/amocrm.config.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

export interface AmoFieldIds {
  stage: number;
  progress: number;
  adminComment: number;
  prepayment: number;
  partnerUserId: number;
  partnerServices: number;
}

@Injectable()
export class AmocrmConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get baseUrl(): string {
    return this.config.get('AMOCRM_BASE_URL', { infer: true });
  }

  get accessToken(): string {
    return this.config.get('AMOCRM_ACCESS_TOKEN', { infer: true });
  }

  get webhookSecret(): string {
    return this.config.get('AMOCRM_WEBHOOK_SECRET', { infer: true });
  }

  get webhookIpAllowlist(): string[] {
    const raw = this.config.get('AMOCRM_WEBHOOK_IP_ALLOWLIST', { infer: true });
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  get mode(): 'mock' | 'http' {
    return this.config.get('AMOCRM_CLIENT_MODE', { infer: true });
  }

  get failsafeCron(): string {
    return this.config.get('AMOCRM_FAILSAFE_CRON', { infer: true });
  }

  get fieldIds(): AmoFieldIds {
    return {
      stage: this.config.get('AMOCRM_FIELD_STAGE_ID', { infer: true }),
      progress: this.config.get('AMOCRM_FIELD_PROGRESS_ID', { infer: true }),
      adminComment: this.config.get('AMOCRM_FIELD_ADMIN_COMMENT_ID', { infer: true }),
      prepayment: this.config.get('AMOCRM_FIELD_PREPAYMENT_ID', { infer: true }),
      partnerUserId: this.config.get('AMOCRM_FIELD_PARTNER_USER_ID', { infer: true }),
      partnerServices: this.config.get('AMOCRM_FIELD_PARTNER_SERVICES_ID', { infer: true }),
    };
  }
}
```

- [ ] **Step 3.3: Create `docs/amocrm-fields.md`**

```markdown
# AmoCRM Custom Field Mapping

The VITTORIA HOME backend reads from / writes to a small set of custom fields on AmoCRM **leads** (sales / deals). These IDs are environment-specific — replace the placeholders with the real numeric IDs from your AmoCRM account (Settings → Account → Field IDs panel).

| Env var | DB column | Type in AmoCRM | Direction | Notes |
|---|---|---|---|---|
| `AMOCRM_FIELD_STAGE_ID` | `orders.current_stage` | select (7 options) | bidirectional | Select options must match the 7 `OrderStage` enum values exactly. |
| `AMOCRM_FIELD_PROGRESS_ID` | `orders.progress_percent` | number | bidirectional | 0..100 integer. |
| `AMOCRM_FIELD_ADMIN_COMMENT_ID` | `orders.last_admin_comment` | text | bidirectional | Free text. |
| `AMOCRM_FIELD_PREPAYMENT_ID` | `orders.prepayment_amount` | number | inbound | We do not write this back. |
| `AMOCRM_FIELD_PARTNER_USER_ID` | `orders.partner_user_id` | number | inbound | Our internal user UUID is stored as a string in AmoCRM — see note below. |
| `AMOCRM_FIELD_PARTNER_SERVICES_ID` | `orders.partner_services` | text (JSON) | inbound | Serialized JSON array; see spec section 10.3 for format. |

## Partner user reference

`AMOCRM_FIELD_PARTNER_USER_ID` is intentionally stored as a string in AmoCRM (UUIDs aren't valid AmoCRM numbers). The inbound sync resolves it to a User UUID via `prisma.user.findUnique({ where: { id } })`. If not found, the order is created without a partner.

## Lead → Order field mapping (top-level)

| AmoCRM field | DB column |
|---|---|
| `lead.name` | `orders.product_name` |
| `lead.custom_fields_values[contract_number]`* | `orders.contract_number` |
| `lead.price` | `orders.total_amount` |
| `lead._embedded.contacts[0].id` | resolved to `users.amocrm_contact_id` → `orders.client_user_id` |

*If you store `contract_number` in a custom field, add an env var following the pattern above. For Plan 2 we read it from `lead.name` if not configured.

## Discovering field IDs in your AmoCRM account

1. Log into AmoCRM as an admin.
2. Settings → Pipelines → click on the pipeline → Fields tab.
3. Each custom field has a numeric ID shown next to its name.
4. Copy the IDs into your `.env` (production) or `.env.test` (CI).
```

- [ ] **Step 3.4: Commit**

```bash
git add apps/api/src/amocrm docs/amocrm-fields.md
git commit -m "feat(api): AmoCRM types, config wrapper, and field mapping doc"
```

---

## Task 4: AmoCRM Mapper (lead ↔ order)

**Files:**
- Create: `apps/api/src/amocrm/amocrm-mapper.ts`
- Create: `apps/api/src/amocrm/__tests__/amocrm-mapper.spec.ts`

- [ ] **Step 4.1: Failing unit test**

`apps/api/src/amocrm/__tests__/amocrm-mapper.spec.ts`:
```typescript
import { AmocrmMapper } from '../amocrm-mapper';
import type { AmoFieldIds } from '../amocrm.config';
import type { AmoLead } from '../amocrm.types';

const fieldIds: AmoFieldIds = {
  stage: 1001,
  progress: 1002,
  adminComment: 1003,
  prepayment: 1004,
  partnerUserId: 1005,
  partnerServices: 1006,
};

describe('AmocrmMapper.leadToOrderPatch', () => {
  const mapper = new AmocrmMapper();

  const baseLead: AmoLead = {
    id: 555,
    name: 'Kitchen #N42',
    updated_at: 1748390000,
    _embedded: { contacts: [{ id: 777 }] },
    custom_fields_values: [
      { field_id: 1001, values: [{ value: 'production' }] },
      { field_id: 1002, values: [{ value: 65 }] },
      { field_id: 1003, values: [{ value: 'On track' }] },
      { field_id: 1004, values: [{ value: 50000 }] },
      { field_id: 1006, values: [{ value: '[{"type":"delivery","price":5000}]' }] },
    ],
  };

  it('maps recognized fields and ignores unknown field_ids', () => {
    const patch = mapper.leadToOrderPatch(baseLead, fieldIds);
    expect(patch.amocrmDealId).toBe(555);
    expect(patch.productName).toBe('Kitchen #N42');
    expect(patch.currentStage).toBe('production');
    expect(patch.progressPercent).toBe(65);
    expect(patch.lastAdminComment).toBe('On track');
    expect(patch.prepaymentAmount).toBe(50000);
    expect(patch.partnerServices).toEqual([{ type: 'delivery', price: 5000 }]);
    expect(patch.amocrmContactId).toBe(777);
  });

  it('throws if currentStage value is not a known OrderStage', () => {
    const bad: AmoLead = { ...baseLead, custom_fields_values: [{ field_id: 1001, values: [{ value: 'sold' }] }] };
    expect(() => mapper.leadToOrderPatch(bad, fieldIds)).toThrow(/OrderStage/);
  });

  it('clamps progressPercent to 0..100', () => {
    const high: AmoLead = { ...baseLead, custom_fields_values: [{ field_id: 1002, values: [{ value: 250 }] }] };
    expect(mapper.leadToOrderPatch(high, fieldIds).progressPercent).toBe(100);
    const low: AmoLead = { ...baseLead, custom_fields_values: [{ field_id: 1002, values: [{ value: -5 }] }] };
    expect(mapper.leadToOrderPatch(low, fieldIds).progressPercent).toBe(0);
  });
});

describe('AmocrmMapper.orderToCustomFields', () => {
  const mapper = new AmocrmMapper();

  it('produces custom_fields_values for editable fields only', () => {
    const fields = mapper.orderToCustomFields(
      {
        currentStage: 'production',
        progressPercent: 65,
        lastAdminComment: 'Updated by admin',
      },
      fieldIds,
    );
    expect(fields).toEqual([
      { field_id: 1001, values: [{ value: 'production' }] },
      { field_id: 1002, values: [{ value: 65 }] },
      { field_id: 1003, values: [{ value: 'Updated by admin' }] },
    ]);
  });

  it('omits undefined fields', () => {
    const fields = mapper.orderToCustomFields({ progressPercent: 10 }, fieldIds);
    expect(fields).toEqual([{ field_id: 1002, values: [{ value: 10 }] }]);
  });
});
```

- [ ] **Step 4.2: Run, expect FAIL.**

```bash
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 4.3: Implement `apps/api/src/amocrm/amocrm-mapper.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import type { AmoLead, AmoCustomFieldValue } from './amocrm.types';
import type { AmoFieldIds } from './amocrm.config';

const VALID_STAGES = new Set([
  'preparation_for_production',
  'detailing',
  'materials_arrival',
  'production',
  'transfer_to_warehouse',
  'completeness_check',
  'ready_for_delivery',
]);

export interface OrderPatch {
  amocrmDealId: number;
  amocrmContactId?: number;
  productName?: string;
  currentStage?: string;
  progressPercent?: number;
  lastAdminComment?: string;
  prepaymentAmount?: number;
  partnerServices?: unknown;
  partnerAmocrmUserId?: string;
}

@Injectable()
export class AmocrmMapper {
  leadToOrderPatch(lead: AmoLead, fieldIds: AmoFieldIds): OrderPatch {
    const fields = lead.custom_fields_values ?? [];
    const byId = new Map(fields.map((f) => [f.field_id, f]));

    const patch: OrderPatch = { amocrmDealId: lead.id };

    if (lead.name) patch.productName = lead.name;

    const stage = this.readString(byId, fieldIds.stage);
    if (stage !== undefined) {
      if (!VALID_STAGES.has(stage)) {
        throw new Error(`Invalid OrderStage from AmoCRM lead ${lead.id}: "${stage}"`);
      }
      patch.currentStage = stage;
    }

    const progressRaw = this.readNumber(byId, fieldIds.progress);
    if (progressRaw !== undefined) {
      patch.progressPercent = Math.max(0, Math.min(100, Math.round(progressRaw)));
    }

    const comment = this.readString(byId, fieldIds.adminComment);
    if (comment !== undefined) patch.lastAdminComment = comment;

    const prepayment = this.readNumber(byId, fieldIds.prepayment);
    if (prepayment !== undefined) patch.prepaymentAmount = prepayment;

    const partner = this.readString(byId, fieldIds.partnerUserId);
    if (partner) patch.partnerAmocrmUserId = partner;

    const partnerServicesRaw = this.readString(byId, fieldIds.partnerServices);
    if (partnerServicesRaw !== undefined) {
      try {
        patch.partnerServices = JSON.parse(partnerServicesRaw);
      } catch {
        // Ignore malformed JSON — leave existing value untouched.
      }
    }

    const contactId = lead._embedded?.contacts?.[0]?.id;
    if (typeof contactId === 'number') patch.amocrmContactId = contactId;

    return patch;
  }

  orderToCustomFields(
    order: { currentStage?: string; progressPercent?: number; lastAdminComment?: string },
    fieldIds: AmoFieldIds,
  ): AmoCustomFieldValue[] {
    const result: AmoCustomFieldValue[] = [];
    if (order.currentStage !== undefined) {
      result.push({ field_id: fieldIds.stage, values: [{ value: order.currentStage }] });
    }
    if (order.progressPercent !== undefined) {
      result.push({ field_id: fieldIds.progress, values: [{ value: order.progressPercent }] });
    }
    if (order.lastAdminComment !== undefined) {
      result.push({ field_id: fieldIds.adminComment, values: [{ value: order.lastAdminComment }] });
    }
    return result;
  }

  private readString(byId: Map<number, AmoCustomFieldValue>, id: number): string | undefined {
    const v = byId.get(id)?.values?.[0]?.value;
    if (v === undefined || v === null) return undefined;
    return String(v);
  }

  private readNumber(byId: Map<number, AmoCustomFieldValue>, id: number): number | undefined {
    const v = byId.get(id)?.values?.[0]?.value;
    if (v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
}
```

- [ ] **Step 4.4: Run unit, expect PASS.**

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/amocrm
git commit -m "feat(api): AmocrmMapper for lead↔order field translation"
```

---

## Task 5: AmoCRM HTTP Client + Mock + Module

**Files:**
- Create: `apps/api/src/amocrm/amocrm-http.client.ts`
- Create: `apps/api/src/amocrm/amocrm-mock.client.ts`
- Create: `apps/api/src/amocrm/amocrm.module.ts`

- [ ] **Step 5.1: Add axios**

In `apps/api/package.json` dependencies:
```json
"axios": "^1.7.0"
```

Run:
```bash
pnpm install
```

- [ ] **Step 5.2: Implement `apps/api/src/amocrm/amocrm-http.client.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { AmocrmConfig } from './amocrm.config';
import type { AmoContact, AmoCrmClient, AmoCustomFieldValue, AmoLead } from './amocrm.types';

@Injectable()
export class AmocrmHttpClient implements AmoCrmClient {
  private readonly logger = new Logger(AmocrmHttpClient.name);
  private readonly axios: AxiosInstance;

  constructor(config: AmocrmConfig) {
    this.axios = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      timeout: 10_000,
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
  }

  async getLead(id: number): Promise<AmoLead> {
    const res = await this.axios.get<AmoLead>(`/api/v4/leads/${id}`, {
      params: { with: 'contacts' },
    });
    return res.data;
  }

  async getContact(id: number): Promise<AmoContact> {
    const res = await this.axios.get<{ id: number; name?: string; custom_fields_values?: AmoCustomFieldValue[] }>(
      `/api/v4/contacts/${id}`,
    );
    const data = res.data;
    const phoneField = data.custom_fields_values?.find((f) =>
      f.values.some((v) => typeof v.value === 'string' && /^\+?\d{10,}$/.test(v.value as string)),
    );
    const phoneValue = phoneField?.values[0]?.value;
    return {
      id: data.id,
      name: data.name ?? null,
      custom_fields_values: data.custom_fields_values ?? null,
      phone: typeof phoneValue === 'string' ? phoneValue : null,
    };
  }

  async patchLead(id: number, customFields: AmoCustomFieldValue[]): Promise<void> {
    await this.axios.patch(`/api/v4/leads/${id}`, { custom_fields_values: customFields });
  }

  async listLeadsUpdatedSince(since: Date): Promise<AmoLead[]> {
    const fromSec = Math.floor(since.getTime() / 1000);
    const res = await this.axios.get<{ _embedded?: { leads?: AmoLead[] } }>(`/api/v4/leads`, {
      params: { 'filter[updated_at][from]': fromSec, with: 'contacts', limit: 250 },
    });
    return res.data._embedded?.leads ?? [];
  }
}
```

- [ ] **Step 5.3: Implement `apps/api/src/amocrm/amocrm-mock.client.ts`**

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AmoContact, AmoCrmClient, AmoCustomFieldValue, AmoLead } from './amocrm.types';

@Injectable()
export class AmocrmMockClient implements AmoCrmClient {
  private readonly logger = new Logger(AmocrmMockClient.name);
  private readonly leads = new Map<number, AmoLead>();
  private readonly contacts = new Map<number, AmoContact>();

  // Public seeding API for tests/dev.
  seedLead(lead: AmoLead): void {
    this.leads.set(lead.id, lead);
  }

  seedContact(contact: AmoContact): void {
    this.contacts.set(contact.id, contact);
  }

  reset(): void {
    this.leads.clear();
    this.contacts.clear();
  }

  async getLead(id: number): Promise<AmoLead> {
    const lead = this.leads.get(id);
    if (!lead) throw new NotFoundException(`mock lead ${id} not seeded`);
    return structuredClone(lead);
  }

  async getContact(id: number): Promise<AmoContact> {
    const contact = this.contacts.get(id);
    if (!contact) throw new NotFoundException(`mock contact ${id} not seeded`);
    return structuredClone(contact);
  }

  async patchLead(id: number, customFields: AmoCustomFieldValue[]): Promise<void> {
    const lead = this.leads.get(id);
    if (!lead) throw new NotFoundException(`mock lead ${id} not seeded`);
    const existingFields = new Map((lead.custom_fields_values ?? []).map((f) => [f.field_id, f]));
    for (const f of customFields) existingFields.set(f.field_id, f);
    lead.custom_fields_values = Array.from(existingFields.values());
    lead.updated_at = Math.floor(Date.now() / 1000);
    this.logger.log(`[MOCK-AMO] patched lead ${id}: ${JSON.stringify(customFields)}`);
  }

  async listLeadsUpdatedSince(since: Date): Promise<AmoLead[]> {
    const sinceSec = Math.floor(since.getTime() / 1000);
    return Array.from(this.leads.values())
      .filter((l) => l.updated_at >= sinceSec)
      .map((l) => structuredClone(l));
  }
}
```

- [ ] **Step 5.4: Implement `apps/api/src/amocrm/amocrm.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AmocrmConfig } from './amocrm.config';
import { AmocrmHttpClient } from './amocrm-http.client';
import { AmocrmMockClient } from './amocrm-mock.client';
import { AmocrmMapper } from './amocrm-mapper';
import { AMOCRM_CLIENT } from './amocrm.types';

@Module({
  providers: [
    AmocrmConfig,
    AmocrmMapper,
    AmocrmMockClient,
    AmocrmHttpClient,
    {
      provide: AMOCRM_CLIENT,
      inject: [AmocrmConfig, AmocrmMockClient, AmocrmHttpClient],
      useFactory: (cfg: AmocrmConfig, mock: AmocrmMockClient, http: AmocrmHttpClient) =>
        cfg.mode === 'mock' ? mock : http,
    },
  ],
  exports: [AMOCRM_CLIENT, AmocrmConfig, AmocrmMapper, AmocrmMockClient],
})
export class AmocrmModule {}
```

- [ ] **Step 5.5: Wire into `apps/api/src/app.module.ts`** — add `AmocrmModule` to imports (after `AuthModule`):

```typescript
import { AmocrmModule } from './amocrm/amocrm.module';
// ...
imports: [..., AuthModule, AmocrmModule, UsersModule, ...]
```

- [ ] **Step 5.6: Verify build clean and tests pass**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:unit
```

- [ ] **Step 5.7: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): AmocrmModule with mock + http clients (mode-switchable)"
```

---

## Task 6: BullMQ Queues Setup

**Files:**
- Create: `apps/api/src/queues/queue-names.ts`
- Create: `apps/api/src/queues/queues.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 6.1: Add BullMQ deps**

In `apps/api/package.json` dependencies:
```json
"bullmq": "^5.12.0",
"@nestjs/bullmq": "^11.0.0",
"@nestjs/schedule": "^4.1.0"
```

Run:
```bash
pnpm install
```

- [ ] **Step 6.2: Create `apps/api/src/queues/queue-names.ts`**

```typescript
export const QUEUE_AMOCRM_INBOUND = 'amocrm-inbound';
export const QUEUE_AMOCRM_OUTBOUND = 'amocrm-outbound';
```

- [ ] **Step 6.3: Create `apps/api/src/queues/queues.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { Env } from '../config/env.schema';
import { QUEUE_AMOCRM_INBOUND, QUEUE_AMOCRM_OUTBOUND } from './queue-names';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 24 * 3600, count: 1000 },
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_AMOCRM_INBOUND }, { name: QUEUE_AMOCRM_OUTBOUND }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
```

- [ ] **Step 6.4: Wire `QueuesModule` and `ScheduleModule` into `AppModule`**

`apps/api/src/app.module.ts` — add:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { QueuesModule } from './queues/queues.module';
// ...
imports: [
  // ... existing modules ...
  ScheduleModule.forRoot(),
  QueuesModule,
  // ...
],
```

Order: place `ScheduleModule.forRoot()` and `QueuesModule` AFTER `ConfigModule` (they read env), BEFORE feature modules that depend on queues.

- [ ] **Step 6.5: Verify build clean**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:unit
```

(The Redis container from `pnpm dev:infra` must be up for AppModule to bootstrap during unit tests — but unit tests don't bootstrap AppModule, so this passes regardless.)

- [ ] **Step 6.6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): BullMQ queues for amocrm-inbound/outbound + ScheduleModule"
```

---

## Task 7: AmocrmIdempotencyService

**Files:**
- Create: `apps/api/src/amocrm/amocrm-idempotency.service.ts`
- Create: `apps/api/src/amocrm/__tests__/amocrm-idempotency.service.spec.ts`
- Modify: `apps/api/src/amocrm/amocrm.module.ts`

- [ ] **Step 7.1: Failing unit test**

`apps/api/src/amocrm/__tests__/amocrm-idempotency.service.spec.ts`:
```typescript
import { AmocrmIdempotencyService } from '../amocrm-idempotency.service';

describe('AmocrmIdempotencyService', () => {
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

  it('returns true on first occurrence and false on duplicate', async () => {
    const redis = makeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AmocrmIdempotencyService({ getClient: () => redis } as any);
    const first = await svc.markIfNew('evt-1');
    const second = await svc.markIfNew('evt-1');
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
```

- [ ] **Step 7.2: Run, expect FAIL.**

- [ ] **Step 7.3: Implement `apps/api/src/amocrm/amocrm-idempotency.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const TTL_SEC = 24 * 3600;

@Injectable()
export class AmocrmIdempotencyService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Returns true if eventId was not seen before (and marks it as seen for TTL_SEC).
   * Returns false if it was already seen.
   */
  async markIfNew(eventId: string): Promise<boolean> {
    const key = `amocrm:event:${eventId}`;
    const result = await this.redis.getClient().set(key, '1', 'EX', TTL_SEC, 'NX');
    return result === 'OK';
  }
}
```

- [ ] **Step 7.4: Run unit, expect PASS.**

- [ ] **Step 7.5: Register in `AmocrmModule`** — add `AmocrmIdempotencyService` to `providers` and `exports` arrays.

- [ ] **Step 7.6: Commit**

```bash
git add apps/api
git commit -m "feat(api): AmocrmIdempotencyService (Redis SET NX, 24h TTL)"
```

---

## Task 8: AmoCRM Webhook Guard (HMAC + IP Allowlist)

**Files:**
- Create: `apps/api/src/amocrm/amocrm-webhook.guard.ts`
- Create: `apps/api/src/amocrm/__tests__/amocrm-webhook.guard.spec.ts`

- [ ] **Step 8.1: Failing unit test**

`apps/api/src/amocrm/__tests__/amocrm-webhook.guard.spec.ts`:
```typescript
import { createHmac } from 'node:crypto';
import { AmocrmWebhookGuard } from '../amocrm-webhook.guard';
import type { AmocrmConfig } from '../amocrm.config';

const makeCtx = (rawBody: Buffer, headers: Record<string, string>, ip = '127.0.0.1') => ({
  switchToHttp: () => ({
    getRequest: () => ({ rawBody, headers, ip }),
  }),
});

const secret = 'test-webhook-secret-32-chars-xxxxxxx';
const sign = (body: Buffer) => createHmac('sha256', secret).update(body).digest('hex');

const makeConfig = (overrides: Partial<AmocrmConfig> = {}): AmocrmConfig =>
  ({
    webhookSecret: secret,
    webhookIpAllowlist: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('AmocrmWebhookGuard', () => {
  it('passes when HMAC matches and IP allowlist is empty', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guard = new AmocrmWebhookGuard(makeConfig());
    const ctx = makeCtx(body, { 'x-signature': sign(body) }) as any;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when HMAC is wrong', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guard = new AmocrmWebhookGuard(makeConfig());
    const ctx = makeCtx(body, { 'x-signature': 'deadbeef' }) as any;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies when IP is not in allowlist', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const guard = new AmocrmWebhookGuard(makeConfig({ webhookIpAllowlist: ['10.0.0.1'] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx(body, { 'x-signature': sign(body) }, '127.0.0.1') as any;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows when IP is in allowlist', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const guard = new AmocrmWebhookGuard(makeConfig({ webhookIpAllowlist: ['127.0.0.1'] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx(body, { 'x-signature': sign(body) }, '127.0.0.1') as any;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
```

- [ ] **Step 8.2: Run, expect FAIL.**

- [ ] **Step 8.3: Implement `apps/api/src/amocrm/amocrm-webhook.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AmocrmConfig } from './amocrm.config';

@Injectable()
export class AmocrmWebhookGuard implements CanActivate {
  private readonly logger = new Logger(AmocrmWebhookGuard.name);

  constructor(private readonly config: AmocrmConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
    }>();

    const allowlist = this.config.webhookIpAllowlist;
    if (allowlist.length > 0) {
      const ip = req.ip ?? '';
      if (!allowlist.includes(ip)) {
        this.logger.warn(`webhook from ${ip} not in allowlist`);
        return false;
      }
    }

    const provided = (req.headers['x-signature'] ?? req.headers['x-amocrm-signature']) as string | undefined;
    if (!provided || !req.rawBody) {
      this.logger.warn('missing signature or rawBody');
      return false;
    }

    const expected = createHmac('sha256', this.config.webhookSecret).update(req.rawBody).digest('hex');
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
```

- [ ] **Step 8.4: Run unit, expect PASS.**

- [ ] **Step 8.5: Register guard in `AmocrmModule`** — add `AmocrmWebhookGuard` to `providers` and `exports`.

- [ ] **Step 8.6: Wire `rawBody` parsing in `apps/api/src/main.ts`**

Replace `main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Capture raw body for HMAC verification of webhooks.
  app.use(
    json({
      verify: (req: { rawBody?: Buffer }, _res, buf: Buffer) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1');
  const config = app.get(ConfigService<Env, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap();
```

Also update `apps/api/test/helpers/app.factory.ts` to install the same rawBody middleware:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(
    json({
      verify: (req: { rawBody?: Buffer }, _res, buf: Buffer) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}
```

- [ ] **Step 8.7: Verify build + all e2e still pass**

```bash
pnpm --filter @vittoria/api build
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 8.8: Commit**

```bash
git add apps/api
git commit -m "feat(api): AmocrmWebhookGuard (HMAC + IP allowlist) and rawBody capture"
```

---

## Task 9: AmocrmSyncService — syncDealById

**Files:**
- Create: `apps/api/src/amocrm/amocrm-sync.service.ts`
- Create: `apps/api/test/amocrm-sync.e2e-spec.ts`
- Modify: `apps/api/src/amocrm/amocrm.module.ts`
- Create: `apps/api/test/helpers/amocrm-fixtures.ts`

- [ ] **Step 9.1: Create `apps/api/test/helpers/amocrm-fixtures.ts`**

```typescript
import type { AmoContact, AmoLead } from '../../src/amocrm/amocrm.types';

export const sampleContact: AmoContact = {
  id: 777,
  name: 'Ivan Ivanov',
  phone: '+79991234567',
  custom_fields_values: null,
};

export const sampleLead = (overrides: Partial<AmoLead> = {}): AmoLead => ({
  id: 555,
  name: 'Kitchen #N42',
  updated_at: Math.floor(Date.now() / 1000),
  _embedded: { contacts: [{ id: sampleContact.id }] },
  custom_fields_values: [
    { field_id: 1001, values: [{ value: 'production' }] },
    { field_id: 1002, values: [{ value: 40 }] },
    { field_id: 1003, values: [{ value: 'Initial sync' }] },
    { field_id: 1004, values: [{ value: 50000 }] },
  ],
  ...overrides,
});
```

- [ ] **Step 9.2: Implement `apps/api/src/amocrm/amocrm-sync.service.ts`**

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AmocrmConfig } from './amocrm.config';
import { AmocrmMapper } from './amocrm-mapper';
import { AMOCRM_CLIENT, type AmoCrmClient } from './amocrm.types';

@Injectable()
export class AmocrmSyncService {
  private readonly logger = new Logger(AmocrmSyncService.name);

  constructor(
    @Inject(AMOCRM_CLIENT) private readonly client: AmoCrmClient,
    private readonly prisma: PrismaService,
    private readonly mapper: AmocrmMapper,
    private readonly config: AmocrmConfig,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pull a lead + its primary contact from AmoCRM and upsert User + Order.
   * Returns the resulting Order id.
   */
  async syncDealById(amocrmDealId: number): Promise<string> {
    const lead = await this.client.getLead(amocrmDealId);
    const patch = this.mapper.leadToOrderPatch(lead, this.config.fieldIds);

    if (!patch.amocrmContactId) {
      throw new Error(`AmoCRM lead ${amocrmDealId} has no contact`);
    }
    const contact = await this.client.getContact(patch.amocrmContactId);
    if (!contact.phone) {
      throw new Error(`AmoCRM contact ${contact.id} has no phone`);
    }

    const client = await this.prisma.user.upsert({
      where: { phone: contact.phone },
      update: { firstName: contact.name ?? undefined, amocrmContactId: contact.id },
      create: { phone: contact.phone, firstName: contact.name ?? undefined, amocrmContactId: contact.id },
    });

    const existing = await this.prisma.order.findUnique({ where: { amocrmDealId } });

    const data = {
      contractNumber: existing?.contractNumber ?? null,
      productName: patch.productName ?? null,
      currentStage: (patch.currentStage as never) ?? undefined,
      progressPercent: patch.progressPercent ?? 0,
      lastAdminComment: patch.lastAdminComment ?? null,
      prepaymentAmount: patch.prepaymentAmount ?? null,
      partnerServices: (patch.partnerServices as object) ?? [],
      amocrmSyncedAt: new Date(),
    };

    const order = existing
      ? await this.prisma.order.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.order.create({
          data: {
            amocrmDealId,
            clientUserId: client.id,
            currentStage: (patch.currentStage as never) ?? 'preparation_for_production',
            progressPercent: patch.progressPercent ?? 0,
            productName: patch.productName ?? null,
            prepaymentAmount: patch.prepaymentAmount ?? null,
            lastAdminComment: patch.lastAdminComment ?? null,
            partnerServices: (patch.partnerServices as object) ?? [],
            amocrmSyncedAt: new Date(),
          },
        });

    await this.audit.record({
      action: existing ? 'amocrm.order.updated' : 'amocrm.order.created',
      entity: 'Order',
      entityId: order.id,
      after: { amocrmDealId, stage: order.currentStage, progress: order.progressPercent },
    });

    return order.id;
  }
}
```

- [ ] **Step 9.3: Register `AmocrmSyncService` in `AmocrmModule`** — add to `providers` and `exports`.

- [ ] **Step 9.4: Create `apps/api/test/amocrm-sync.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { AmocrmSyncService } from '../src/amocrm/amocrm-sync.service';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

describe('AmocrmSyncService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;
  let sync: AmocrmSyncService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get(AmocrmMockClient);
    sync = app.get(AmocrmSyncService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(() => mock.reset());
  afterEach(async () => {
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  it('creates a User and an Order from AmoCRM lead+contact', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead());

    const orderId = await sync.syncDealById(555);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.amocrmDealId).toBe(555);
    expect(order.currentStage).toBe('production');
    expect(order.progressPercent).toBe(40);

    const user = await prisma.user.findUniqueOrThrow({ where: { phone: '+79991234567' } });
    expect(user.amocrmContactId).toBe(777);
  });

  it('updates an existing Order on second sync (idempotent)', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead({ custom_fields_values: [{ field_id: 1002, values: [{ value: 20 }] }] }));
    await sync.syncDealById(555);

    mock.seedLead(sampleLead({ custom_fields_values: [{ field_id: 1002, values: [{ value: 75 }] }] }));
    await sync.syncDealById(555);

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0].progressPercent).toBe(75);
    expect(orders[0].version).toBe(1); // incremented once
  });
});
```

- [ ] **Step 9.5: Run e2e**

```bash
pnpm --filter @vittoria/api test:e2e
```

Expected: all suites pass, including 2 new tests in `amocrm-sync.e2e-spec.ts`.

- [ ] **Step 9.6: Commit**

```bash
git add apps/api
git commit -m "feat(api): AmocrmSyncService.syncDealById with User + Order upsert"
```

---

## Task 10: Inbound Webhook Controller + Processor

**Files:**
- Create: `apps/api/src/amocrm/amocrm-webhook.controller.ts`
- Create: `apps/api/src/amocrm/jobs/amocrm-inbound.processor.ts`
- Create: `apps/api/test/amocrm-webhook.e2e-spec.ts`
- Modify: `apps/api/src/amocrm/amocrm.module.ts`

- [ ] **Step 10.1: Create `apps/api/src/amocrm/amocrm-webhook.controller.ts`**

```typescript
import { Body, Controller, HttpCode, Inject, Logger, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { QUEUE_AMOCRM_INBOUND } from '../queues/queue-names';
import { AmocrmWebhookGuard } from './amocrm-webhook.guard';
import { AmocrmIdempotencyService } from './amocrm-idempotency.service';
import { createHash } from 'node:crypto';

interface AmoWebhookBody {
  leads?: { add?: Array<{ id: number }>; update?: Array<{ id: number }> };
  contacts?: { update?: Array<{ id: number }> };
}

@Controller('amocrm')
export class AmocrmWebhookController {
  private readonly logger = new Logger(AmocrmWebhookController.name);

  constructor(
    @InjectQueue(QUEUE_AMOCRM_INBOUND) private readonly queue: Queue,
    private readonly idempotency: AmocrmIdempotencyService,
  ) {}

  @Public()
  @UseGuards(AmocrmWebhookGuard)
  @Throttle({ global: { limit: 300, ttl: 60_000 } })
  @Post('webhooks')
  @HttpCode(200)
  async receive(@Body() body: AmoWebhookBody): Promise<{ accepted: number }> {
    const events: Array<{ kind: string; id: number }> = [];

    for (const lead of body.leads?.add ?? []) events.push({ kind: 'lead.add', id: lead.id });
    for (const lead of body.leads?.update ?? []) events.push({ kind: 'lead.update', id: lead.id });
    for (const c of body.contacts?.update ?? []) events.push({ kind: 'contact.update', id: c.id });

    let accepted = 0;
    for (const ev of events) {
      const eventId = createHash('sha256').update(`${ev.kind}:${ev.id}:${Date.now()}`).digest('hex').slice(0, 32);
      const isNew = await this.idempotency.markIfNew(eventId);
      if (!isNew) continue;
      await this.queue.add('process', { kind: ev.kind, entityId: ev.id, eventId }, { jobId: eventId });
      accepted++;
    }

    return { accepted };
  }
}
```

- [ ] **Step 10.2: Create `apps/api/src/amocrm/jobs/amocrm-inbound.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_AMOCRM_INBOUND } from '../../queues/queue-names';
import { AmocrmSyncService } from '../amocrm-sync.service';

interface InboundJob {
  kind: 'lead.add' | 'lead.update' | 'contact.update';
  entityId: number;
  eventId: string;
}

@Processor(QUEUE_AMOCRM_INBOUND)
export class AmocrmInboundProcessor extends WorkerHost {
  private readonly logger = new Logger(AmocrmInboundProcessor.name);

  constructor(private readonly sync: AmocrmSyncService) {
    super();
  }

  async process(job: Job<InboundJob>): Promise<{ orderId?: string }> {
    const { kind, entityId } = job.data;
    this.logger.log(`process ${kind} ${entityId} (job ${job.id})`);

    if (kind === 'lead.add' || kind === 'lead.update') {
      const orderId = await this.sync.syncDealById(entityId);
      return { orderId };
    }

    // contact.update — re-sync any leads referencing this contact (best-effort, rely on failsafe).
    return {};
  }
}
```

- [ ] **Step 10.3: Register controller + processor in `AmocrmModule`** and add `BullModule.registerQueue` re-export.

Update `apps/api/src/amocrm/amocrm.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AmocrmConfig } from './amocrm.config';
import { AmocrmHttpClient } from './amocrm-http.client';
import { AmocrmMockClient } from './amocrm-mock.client';
import { AmocrmMapper } from './amocrm-mapper';
import { AmocrmIdempotencyService } from './amocrm-idempotency.service';
import { AmocrmWebhookGuard } from './amocrm-webhook.guard';
import { AmocrmWebhookController } from './amocrm-webhook.controller';
import { AmocrmSyncService } from './amocrm-sync.service';
import { AmocrmInboundProcessor } from './jobs/amocrm-inbound.processor';
import { AMOCRM_CLIENT } from './amocrm.types';
import { QUEUE_AMOCRM_INBOUND, QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_AMOCRM_INBOUND }, { name: QUEUE_AMOCRM_OUTBOUND }),
  ],
  controllers: [AmocrmWebhookController],
  providers: [
    AmocrmConfig,
    AmocrmMapper,
    AmocrmMockClient,
    AmocrmHttpClient,
    AmocrmIdempotencyService,
    AmocrmWebhookGuard,
    AmocrmSyncService,
    AmocrmInboundProcessor,
    {
      provide: AMOCRM_CLIENT,
      inject: [AmocrmConfig, AmocrmMockClient, AmocrmHttpClient],
      useFactory: (cfg: AmocrmConfig, mock: AmocrmMockClient, http: AmocrmHttpClient) =>
        cfg.mode === 'mock' ? mock : http,
    },
  ],
  exports: [AMOCRM_CLIENT, AmocrmConfig, AmocrmMapper, AmocrmMockClient, AmocrmSyncService],
})
export class AmocrmModule {}
```

- [ ] **Step 10.4: Create `apps/api/test/amocrm-webhook.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

const SECRET = 'test-webhook-secret-32-chars-xxxxxxx';

describe('AmoCRM Webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get(AmocrmMockClient);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(() => mock.reset());
  afterEach(async () => {
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  function postWebhook(body: object) {
    const raw = Buffer.from(JSON.stringify(body));
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
    return request(app.getHttpServer())
      .post('/api/v1/amocrm/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-signature', sig)
      .send(body);
  }

  it('rejects with 403 when HMAC signature is missing/invalid', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/amocrm/webhooks')
      .send({ leads: { update: [{ id: 1 }] } });
    expect(res.status).toBe(403);
  });

  it('accepts a valid signed webhook and processes it via the queue', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead());

    const res = await postWebhook({ leads: { update: [{ id: 555 }] } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 1 });

    // Wait for queue to process. BullMQ in test mode runs workers in the same process.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0].amocrmDealId).toBe(555);
  });
});
```

- [ ] **Step 10.5: Run e2e** — both suites pass.

```bash
pnpm --filter @vittoria/api test:e2e
```

- [ ] **Step 10.6: Commit**

```bash
git add apps/api
git commit -m "feat(api): AmoCRM webhook endpoint + inbound BullMQ processor"
```

---

## Task 11: OrdersService + Outbound Processor

**Files:**
- Create: `apps/api/src/orders/orders.service.ts`
- Create: `apps/api/src/orders/orders.module.ts`
- Create: `apps/api/src/amocrm/jobs/amocrm-outbound.processor.ts`
- Create: `apps/api/src/orders/__tests__/orders.service.spec.ts`
- Create: `apps/api/test/amocrm-outbound.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/amocrm/amocrm.module.ts`

- [ ] **Step 11.1: Implement `apps/api/src/orders/orders.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';
import type { OrderStage } from '@prisma/client';

export interface UpdateProgressInput {
  stage?: OrderStage;
  progressPercent?: number;
  comment?: string;
  actorUserId?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_AMOCRM_OUTBOUND) private readonly outQueue: Queue,
  ) {}

  async updateProgress(orderId: string, input: UpdateProgressInput): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (input.stage !== undefined) data.currentStage = input.stage;
    if (input.progressPercent !== undefined) {
      data.progressPercent = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
    }
    if (input.comment !== undefined) data.lastAdminComment = input.comment;

    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data }),
      this.prisma.orderStageHistory.create({
        data: {
          orderId,
          stage: input.stage ?? order.currentStage,
          progressPercent: input.progressPercent ?? order.progressPercent,
          comment: input.comment ?? null,
          changedByUserId: input.actorUserId ?? null,
        },
      }),
    ]);

    await this.audit.record({
      actorUserId: input.actorUserId ?? null,
      action: 'order.progress.updated',
      entity: 'Order',
      entityId: orderId,
      before: {
        stage: order.currentStage,
        progress: order.progressPercent,
        comment: order.lastAdminComment,
      },
      after: input,
    });

    await this.outQueue.add(
      'push',
      {
        orderId,
        amocrmDealId: order.amocrmDealId,
        stage: input.stage,
        progressPercent: input.progressPercent,
        comment: input.comment,
      },
      { jobId: `${orderId}:${Date.now()}` },
    );
  }
}
```

- [ ] **Step 11.2: Implement `apps/api/src/orders/orders.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { QUEUE_AMOCRM_OUTBOUND } from '../queues/queue-names';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_AMOCRM_OUTBOUND })],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
```

Add `OrdersModule` to `apps/api/src/app.module.ts` imports (after `AmocrmModule`).

- [ ] **Step 11.3: Implement `apps/api/src/amocrm/jobs/amocrm-outbound.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_AMOCRM_OUTBOUND } from '../../queues/queue-names';
import { AmocrmMapper } from '../amocrm-mapper';
import { AmocrmConfig } from '../amocrm.config';
import { AMOCRM_CLIENT, type AmoCrmClient } from '../amocrm.types';

interface OutboundJob {
  orderId: string;
  amocrmDealId: number;
  stage?: string;
  progressPercent?: number;
  comment?: string;
}

@Processor(QUEUE_AMOCRM_OUTBOUND)
export class AmocrmOutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(AmocrmOutboundProcessor.name);

  constructor(
    @Inject(AMOCRM_CLIENT) private readonly client: AmoCrmClient,
    private readonly mapper: AmocrmMapper,
    private readonly config: AmocrmConfig,
  ) {
    super();
  }

  async process(job: Job<OutboundJob>): Promise<void> {
    const { amocrmDealId, stage, progressPercent, comment } = job.data;
    const fields = this.mapper.orderToCustomFields(
      { currentStage: stage, progressPercent, lastAdminComment: comment },
      this.config.fieldIds,
    );
    if (fields.length === 0) {
      this.logger.warn(`outbound job ${job.id} has no fields to push`);
      return;
    }
    await this.client.patchLead(amocrmDealId, fields);
    this.logger.log(`pushed deal=${amocrmDealId} fields=${fields.length}`);
  }
}
```

Register `AmocrmOutboundProcessor` in `AmocrmModule.providers`.

- [ ] **Step 11.4: Unit test for OrdersService**

`apps/api/src/orders/__tests__/orders.service.spec.ts`:
```typescript
import { OrdersService } from '../orders.service';

describe('OrdersService.updateProgress (unit)', () => {
  const makeDeps = () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord1',
          amocrmDealId: 555,
          currentStage: 'detailing',
          progressPercent: 10,
          lastAdminComment: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      orderStageHistory: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const outQueue = { add: jest.fn().mockResolvedValue({}) };
    return { prisma, audit, outQueue };
  };

  it('updates order, writes history, enqueues outbound job', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new OrdersService(prisma, audit as any, outQueue as any);
    await svc.updateProgress('ord1', { stage: 'production', progressPercent: 50, actorUserId: 'admin1' });

    expect(prisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord1' },
      data: expect.objectContaining({ currentStage: 'production', progressPercent: 50 }),
    }));
    expect(prisma.orderStageHistory.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'order.progress.updated' }));
    expect(outQueue.add).toHaveBeenCalledWith(
      'push',
      expect.objectContaining({ amocrmDealId: 555, stage: 'production', progressPercent: 50 }),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 11.5: E2E test for outbound**

`apps/api/test/amocrm-outbound.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { AmocrmSyncService } from '../src/amocrm/amocrm-sync.service';
import { OrdersService } from '../src/orders/orders.service';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

describe('AmoCRM Outbound (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;
  let sync: AmocrmSyncService;
  let orders: OrdersService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get(AmocrmMockClient);
    sync = app.get(AmocrmSyncService);
    orders = app.get(OrdersService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(() => mock.reset());
  afterEach(async () => {
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  it('admin updateProgress pushes a PATCH to AmoCRM (mock)', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead({ custom_fields_values: [{ field_id: 1002, values: [{ value: 10 }] }] }));
    const orderId = await sync.syncDealById(555);

    await orders.updateProgress(orderId, { stage: 'production', progressPercent: 80, comment: 'On track' });

    // Wait for outbound queue to drain.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const patchedLead = await mock.getLead(555);
    const stageField = patchedLead.custom_fields_values!.find((f) => f.field_id === 1001);
    const progressField = patchedLead.custom_fields_values!.find((f) => f.field_id === 1002);
    const commentField = patchedLead.custom_fields_values!.find((f) => f.field_id === 1003);
    expect(stageField?.values[0].value).toBe('production');
    expect(progressField?.values[0].value).toBe(80);
    expect(commentField?.values[0].value).toBe('On track');
  });
});
```

- [ ] **Step 11.6: Run all tests**

```bash
pnpm --filter @vittoria/api test
```

- [ ] **Step 11.7: Commit**

```bash
git add apps/api
git commit -m "feat(api): OrdersService + outbound BullMQ processor"
```

---

## Task 12: Failsafe Cron Pull

**Files:**
- Create: `apps/api/src/amocrm/amocrm-failsafe.service.ts`
- Create: `apps/api/test/amocrm-failsafe.e2e-spec.ts`
- Modify: `apps/api/src/amocrm/amocrm.module.ts`

- [ ] **Step 12.1: Implement `apps/api/src/amocrm/amocrm-failsafe.service.ts`**

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AmocrmConfig } from './amocrm.config';
import { AMOCRM_CLIENT, type AmoCrmClient } from './amocrm.types';
import { AmocrmSyncService } from './amocrm-sync.service';

@Injectable()
export class AmocrmFailsafeService {
  private readonly logger = new Logger(AmocrmFailsafeService.name);
  private lastSync = new Date(Date.now() - 30 * 60_000); // 30 min ago on cold start

  constructor(
    @Inject(AMOCRM_CLIENT) private readonly client: AmoCrmClient,
    private readonly prisma: PrismaService,
    private readonly sync: AmocrmSyncService,
    private readonly config: AmocrmConfig,
  ) {}

  /** Polls AmoCRM for any leads updated since the last sync, re-syncs them. */
  @Cron(CronExpression.EVERY_15_MINUTES, { name: 'amocrm-failsafe' })
  async run(): Promise<{ checked: number; synced: number }> {
    const since = this.lastSync;
    this.lastSync = new Date();
    const leads = await this.client.listLeadsUpdatedSince(since);
    let synced = 0;
    for (const lead of leads) {
      try {
        await this.sync.syncDealById(lead.id);
        synced++;
      } catch (err) {
        this.logger.warn(`failsafe: failed to sync deal ${lead.id}: ${(err as Error).message}`);
      }
    }
    if (leads.length > 0) this.logger.log(`failsafe: checked=${leads.length}, synced=${synced}`);
    return { checked: leads.length, synced };
  }
}
```

- [ ] **Step 12.2: Register `AmocrmFailsafeService`** in `AmocrmModule.providers` and `exports`.

- [ ] **Step 12.3: E2E test** — directly invoke `.run()` (bypasses cron schedule).

`apps/api/test/amocrm-failsafe.e2e-spec.ts`:
```typescript
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { AmocrmFailsafeService } from '../src/amocrm/amocrm-failsafe.service';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

describe('AmocrmFailsafeService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;
  let failsafe: AmocrmFailsafeService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get(AmocrmMockClient);
    failsafe = app.get(AmocrmFailsafeService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(() => mock.reset());
  afterEach(async () => {
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  it('pulls updated leads and syncs each one', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead());

    const result = await failsafe.run();
    expect(result.checked).toBe(1);
    expect(result.synced).toBe(1);

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
  });
});
```

- [ ] **Step 12.4: Run e2e**

- [ ] **Step 12.5: Commit**

```bash
git add apps/api
git commit -m "feat(api): AmocrmFailsafeService cron with 15-min lead pull"
```

---

## Task 13: Close Auth Tech Debt — phone must exist

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/src/auth/__tests__/auth.service.spec.ts`

Plan 1 had an accepted deviation: `requestCode` upserted a User if none existed (because the AmoCRM source did not yet exist). Now AmoCRM owns user creation, so this must be tightened: if phone is not in `users`, return 404 with `AUTH_PHONE_NOT_REGISTERED`.

- [ ] **Step 13.1: Modify `requestCode` in `auth.service.ts`**

Find the section in `requestCode` that contains `prisma.user.upsert({ where: { phone }, ... })` (added in Plan 1 Task 9 deviation) and REPLACE it with:

```typescript
const user = await this.prisma.user.findUnique({ where: { phone } });
if (!user) {
  throw new NotFoundException({
    code: 'AUTH_PHONE_NOT_REGISTERED',
    message: 'phone is not registered',
  });
}
```

Also add `NotFoundException` to the imports from `@nestjs/common`.

- [ ] **Step 13.2: Update existing e2e tests in `auth.e2e-spec.ts`**

Every test that calls `POST /auth/request-code` with `+79991234567` must first ensure the User exists. Insert at the start of every such test (or use a shared `beforeEach`):

```typescript
await prisma.user.upsert({
  where: { phone: '+79991234567' },
  update: {},
  create: { phone: '+79991234567' },
});
```

Specifically affected tests:
- `POST /auth/request-code returns 200 with retry_after_sec and persists an auth code`
- `POST /auth/request-code is rate-limited at the throttler` — the 6 different phones must all exist; add upserts inside the loop OR change strategy to a single phone over-quota (refactor decision: add a helper that seeds 6 users).

Refactor the throttle test to seed 6 users first:
```typescript
it('POST /auth/request-code is rate-limited at the throttler', async () => {
  for (let i = 0; i < 6; i++) {
    await prisma.user.upsert({
      where: { phone: `+7999000000${i}` },
      update: {},
      create: { phone: `+7999000000${i}` },
    });
  }
  // ... rest unchanged
});
```

Also note: `POST /auth/request-code rejects malformed phone with 400` does NOT need a user (validation happens before service call).

- [ ] **Step 13.3: Add a positive test for unregistered phone**

Append to `auth.e2e-spec.ts`:
```typescript
  it('POST /auth/request-code returns 404 for unregistered phone', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone: '+78880000001' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AUTH_PHONE_NOT_REGISTERED');
  });
```

- [ ] **Step 13.4: Update `auth.service.spec.ts`**

In the happy-path test for `requestCode`, mock `prisma.user.findUnique` to return a user object (instead of expecting an upsert). Verify the call.

In a new test, mock `prisma.user.findUnique` to return null and expect the service to throw `NotFoundException`:
```typescript
it('throws when phone is not registered', async () => {
  const { prisma, sms, audit, config, tokens } = makeDeps();
  prisma.user.findUnique = jest.fn().mockResolvedValue(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new AuthService(prisma, sms, audit, config, tokens);
  await expect(svc.requestCode('+78880000001')).rejects.toThrow(/registered/i);
  expect(sms.send).not.toHaveBeenCalled();
});
```

Remove `prisma.user.upsert` from `makeDeps` and replace it with `prisma.user.findUnique` returning a user.

- [ ] **Step 13.5: Run all tests**

```bash
pnpm --filter @vittoria/api test
```

All previous tests pass with the new behaviour, plus the new 404 test.

- [ ] **Step 13.6: Commit**

```bash
git add apps/api
git commit -m "fix(api): requestCode requires phone to exist (closes Plan 1 TD)"
```

---

## Task 14: Smoke Test the Full Flow + Final Verification

This task runs end-to-end checks against a live dev server using the AmoCRM mock client. No new code.

- [ ] **Step 14.1: Start infra and api**

```bash
pnpm dev:infra
pnpm --filter @vittoria/api dev
```

Wait for `application is running on: http://[::1]:3000`.

- [ ] **Step 14.2: Seed mock AmoCRM data via a one-off script**

For convenience, run a quick interactive Node REPL (or write a temp file you delete after) to seed the mock. Or: write a temp test script under `apps/api/scripts/seed-mock.ts`:

```typescript
// apps/api/scripts/seed-mock.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const mock = app.get(AmocrmMockClient);
  mock.seedContact({ id: 777, name: 'Test User', phone: '+79991234567', custom_fields_values: null });
  mock.seedLead({
    id: 555,
    name: 'Kitchen #N42',
    updated_at: Math.floor(Date.now() / 1000),
    _embedded: { contacts: [{ id: 777 }] },
    custom_fields_values: [{ field_id: 1001, values: [{ value: 'production' }] }],
  });
  console.log('seeded');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Don't commit this script** — it's a one-off smoke aid. Add `apps/api/scripts/` to `.gitignore` if you want to keep it locally.

Run:
```bash
pnpm --filter @vittoria/api exec ts-node scripts/seed-mock.ts
```

(Actually this seeding pattern won't work because the seeding process and the api process are different — the mock map lives in memory. Replace this step with a curl that hits the webhook endpoint after the api has been told to seed via a temporary internal endpoint, OR skip the smoke test of the inbound path and rely on e2e tests.)

**Simpler smoke check** — verify the new endpoints exist and the auth path still works:

```bash
# Add a user manually via prisma:
pnpm --filter @vittoria/api exec prisma db execute --file=/dev/stdin <<'SQL'
INSERT INTO users (id, phone, role, created_at, updated_at)
VALUES (gen_random_uuid(), '+79991234567', 'client', NOW(), NOW())
ON CONFLICT (phone) DO NOTHING;
SQL
```

```bash
curl -X POST http://localhost:3000/api/v1/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79991234567"}'
```

Expected: `{"retry_after_sec":3600}` (after Plan 2: now phone must exist — succeeds because we just inserted the user).

```bash
curl -X POST http://localhost:3000/api/v1/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"+78880000001"}'
```

Expected: 404 with body `{"error":{"code":"AUTH_PHONE_NOT_REGISTERED","message":"phone is not registered"},"request_id":"..."}`.

- [ ] **Step 14.3: Run full test suite**

```bash
pnpm --filter @vittoria/api test
```

Expected: all unit + e2e tests pass.

- [ ] **Step 14.4: Run root verification**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

- [ ] **Step 14.5: Stop dev server and infra**

```bash
pnpm dev:infra:down
```

- [ ] **Step 14.6: Push to remote and verify CI**

```bash
git push origin main
```

Open https://github.com/sdukezanov-lgtm/vittoria/actions, wait for the workflow run to complete, confirm green.

---

## Definition of Done

Plan 2 is complete when:

- [x] Prisma `Order` and `OrderStageHistory` models migrated.
- [x] AmoCRM webhook endpoint `POST /api/v1/amocrm/webhooks` accepts signed payloads, deduplicates by event ID, enqueues to `amocrm-inbound`.
- [x] `AmocrmInboundProcessor` syncs a lead+contact into Order+User.
- [x] `OrdersService.updateProgress` writes locally, records history + audit, enqueues outbound.
- [x] `AmocrmOutboundProcessor` PATCHes the AmoCRM lead.
- [x] `AmocrmFailsafeService` cron pulls leads updated in the last 30 min and re-syncs.
- [x] `requestCode` rejects unregistered phones with 404 `AUTH_PHONE_NOT_REGISTERED` (Plan 1 TD closed).
- [x] Mock client passes all e2e tests; HTTP client compiled but not exercised in CI.
- [x] `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test` all exit 0.
- [x] GitHub Actions CI matrix is green.

After Plan 2 lands, proceed to **Plan 3: Orders + Chat + Notifications** (admin endpoints for the orders flow, push/SMS, prognosis of partner services rendered, chat module).

---

**End of Plan 2.**
