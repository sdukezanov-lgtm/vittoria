# Backend Gap B: Chat Attachments (S3/MinIO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let chat participants upload image/PDF attachments (≤10 MB) to S3-compatible storage (MinIO in dev), attach them to messages, and read them back via short-lived presigned URLs (spec §6.7, §7.4). No ClamAV (deferred — note only).

**Architecture:** A `StorageModule`/`StorageService` wrapping `@aws-sdk/client-s3` (put + presigned GET, lazily ensures the bucket). A new `Attachment` table tracks uploaded objects and their link to a message. `POST /chats/:id/attachments` (multipart) validates access + magic-byte mime + size, uploads, and returns `{ attachment_id, object_key }`. `POST /chats/:id/messages` accepts optional `attachment_ids` and embeds `{object_key, mime, size}` into `message.attachments`. The message mapper presigns each attachment into a `url` (TTL 10 min).

**Tech Stack:** NestJS 10, Prisma 5, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (already installed), Jest unit + Testcontainers e2e (against the running MinIO at localhost:9000).

**Single-file test command:** `pnpm --filter @vittoria/api exec jest <pattern>`

---

### Task 1: env + StorageService + StorageModule

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Create: `apps/api/src/storage/storage.service.ts`
- Create: `apps/api/src/storage/storage.module.ts`
- Test: `apps/api/src/storage/__tests__/storage.service.spec.ts`

Note: `apps/api/package.json` + `pnpm-lock.yaml` already gained `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (include them in this task's commit).

- [ ] **Step 1: Add env vars** in `apps/api/src/config/env.schema.ts` inside the `z.object`:
```ts
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('ru-central1'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('vittoria-chat'),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform((v) => v === '1' || v.toLowerCase() === 'true'),
  S3_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(600),
```

- [ ] **Step 2: Write the failing test** — `apps/api/src/storage/__tests__/storage.service.spec.ts`:
```ts
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage.service';

const sendMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ __type: 'put', input })),
  HeadBucketCommand: jest.fn().mockImplementation((input) => ({ __type: 'head', input })),
  CreateBucketCommand: jest.fn().mockImplementation((input) => ({ __type: 'create', input })),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/get'),
}));

function config(): ConfigService {
  const v: Record<string, unknown> = {
    S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'ru-central1', S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin', S3_BUCKET: 'vittoria-chat', S3_FORCE_PATH_STYLE: true, S3_PRESIGN_TTL_SEC: 600,
  };
  return { get: (k: string) => v[k] } as unknown as ConfigService;
}

describe('StorageService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('putObject uploads with key, body, contentType', async () => {
    sendMock.mockResolvedValue({});
    const svc = new StorageService(config());
    await svc.putObject('chats/c1/file.jpg', Buffer.from('x'), 'image/jpeg');
    const putCall = sendMock.mock.calls.find((c) => c[0].__type === 'put');
    expect(putCall).toBeTruthy();
    expect(putCall![0].input).toMatchObject({ Bucket: 'vittoria-chat', Key: 'chats/c1/file.jpg', ContentType: 'image/jpeg' });
  });

  it('getPresignedUrl returns a signed url', async () => {
    const svc = new StorageService(config());
    const url = await svc.getPresignedUrl('chats/c1/file.jpg');
    expect(url).toBe('https://signed.example/get');
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `pnpm --filter @vittoria/api exec jest storage/__tests__/storage.service`.

- [ ] **Step 4: Implement.**
`apps/api/src/storage/storage.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env.schema';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly presignTtl: number;
  private bucketReady = false;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.presignTtl = config.get('S3_PRESIGN_TTL_SEC', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (err) {
        this.logger.warn(`ensureBucket: ${(err as Error).message}`);
      }
    }
    this.bucketReady = true;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getPresignedUrl(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.presignTtl,
    });
  }
}
```
`apps/api/src/storage/storage.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm --filter @vittoria/api exec jest storage/__tests__/storage.service`.

- [ ] **Step 6: Commit**
```bash
git add apps/api/package.json apps/api/src/config/env.schema.ts apps/api/src/storage/ ../../pnpm-lock.yaml
git commit -m "feat(api): StorageService (S3/MinIO put + presigned GET) + env"
```
(If `../../pnpm-lock.yaml` path errors, run `git add -A -- ':/pnpm-lock.yaml'` or `git add pnpm-lock.yaml` from repo root.)

---

### Task 2: Attachment Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via prisma

- [ ] **Step 1: Add the model** to `apps/api/prisma/schema.prisma` (after the `Message` model). Also add the relation field to `Message` and `User`:
```prisma
model Attachment {
  id             String   @id @default(uuid()) @db.Uuid
  chatId         String   @map("chat_id") @db.Uuid
  uploaderUserId String   @map("uploader_user_id") @db.Uuid
  messageId      String?  @map("message_id") @db.Uuid
  objectKey      String   @map("object_key")
  mime           String
  size           Int
  createdAt      DateTime @default(now()) @map("created_at")

  chat     Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  uploader User     @relation(fields: [uploaderUserId], references: [id])
  message  Message? @relation(fields: [messageId], references: [id], onDelete: SetNull)

  @@index([chatId])
  @@index([messageId])
  @@map("attachments")
}
```
Add to `model Chat` relations: `attachments Attachment[]`. Add to `model Message` relations: `attachments Attachment[]`. Add to `model User` relations: `uploadedAttachments Attachment[]`.

- [ ] **Step 2: Create the migration** (Docker Postgres must be up):
```bash
pnpm --filter @vittoria/api exec prisma migrate dev --name add_attachments --create-only
```
Then apply: `pnpm --filter @vittoria/api exec prisma migrate dev` (or `prisma migrate deploy`). Confirm a new folder under `apps/api/prisma/migrations/` was created and `prisma generate` ran.

- [ ] **Step 3: Verify** the client compiles: `pnpm --filter @vittoria/api build` → clean.

- [ ] **Step 4: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(api): Attachment model + migration"
```

---

### Task 3: magic-byte mime sniffer

**Files:**
- Create: `apps/api/src/storage/mime-sniff.ts`
- Test: `apps/api/src/storage/__tests__/mime-sniff.spec.ts`

- [ ] **Step 1: Write the failing test** — `apps/api/src/storage/__tests__/mime-sniff.spec.ts`:
```ts
import { sniffMime } from '../mime-sniff';

describe('sniffMime', () => {
  it('detects JPEG', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
  });
  it('detects PNG', () => {
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });
  it('detects PDF', () => {
    expect(sniffMime(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf');
  });
  it('returns null for unknown bytes', () => {
    expect(sniffMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @vittoria/api exec jest storage/__tests__/mime-sniff`.

- [ ] **Step 3: Implement** `apps/api/src/storage/mime-sniff.ts`:
```ts
/** Detect a small allow-list of attachment MIME types by magic bytes. Returns null if unknown. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return null;
}
```

- [ ] **Step 4: Run, expect PASS** — `pnpm --filter @vittoria/api exec jest storage/__tests__/mime-sniff`.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/storage/mime-sniff.ts apps/api/src/storage/__tests__/mime-sniff.spec.ts
git commit -m "feat(api): magic-byte mime sniffer for attachments"
```

---

### Task 4: Chat wiring (upload endpoint + message linking + presigned mapper)

**Files:**
- Modify: `apps/api/src/chat/dto/send-message.dto.ts`
- Modify: `apps/api/src/chat/chat.service.ts`
- Modify: `apps/api/src/chat/chat.mapper.ts`
- Modify: `apps/api/src/chat/chat.controller.ts`
- Modify: `apps/api/src/chat/chat.module.ts`
- Test: `apps/api/src/chat/__tests__/chat.attachments.spec.ts`

- [ ] **Step 1: Write the failing test** — `apps/api/src/chat/__tests__/chat.attachments.spec.ts`. This unit-tests `ChatService` attachment behavior with mocked Prisma + StorageService:
```ts
import { ChatService } from '../chat.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth-user';

function makeService(prisma: Partial<PrismaService>, storage: Partial<StorageService>) {
  const notifications = { send: jest.fn() } as unknown as NotificationsService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return new ChatService(prisma as PrismaService, notifications, audit, storage as StorageService);
}

const admin: AuthUser = { id: 'admin-1', role: 'admin' };

describe('ChatService attachments', () => {
  it('createAttachment stores the object and persists a row', async () => {
    const chat = { id: 'c1', orderId: 'o1', order: { clientUserId: 'cli-1' } };
    const created = { id: 'att-1', objectKey: 'chats/c1/x.jpg' };
    const prisma = {
      chat: { findUnique: jest.fn().mockResolvedValue(chat) },
      attachment: { create: jest.fn().mockResolvedValue(created) },
    } as unknown as PrismaService;
    const storage = { putObject: jest.fn().mockResolvedValue(undefined) } as unknown as StorageService;
    const svc = makeService(prisma, storage);

    const res = await svc.createAttachment('c1', admin, { buffer: Buffer.from([0xff, 0xd8, 0xff]), size: 3, mime: 'image/jpeg' });

    expect(storage.putObject).toHaveBeenCalled();
    expect(res).toEqual({ attachment_id: 'att-1', object_key: 'chats/c1/x.jpg' });
  });

  it('rejects an attachment that is too large', async () => {
    const chat = { id: 'c1', orderId: 'o1', order: { clientUserId: 'cli-1' } };
    const prisma = { chat: { findUnique: jest.fn().mockResolvedValue(chat) } } as unknown as PrismaService;
    const storage = { putObject: jest.fn() } as unknown as StorageService;
    const svc = makeService(prisma, storage);
    await expect(
      svc.createAttachment('c1', admin, { buffer: Buffer.alloc(11 * 1024 * 1024), size: 11 * 1024 * 1024, mime: 'image/jpeg' }),
    ).rejects.toThrow();
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm --filter @vittoria/api exec jest chat/__tests__/chat.attachments`.

- [ ] **Step 3: Implement the changes.**
**3a. `send-message.dto.ts`** — make text optional, add attachment_ids:
```ts
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  attachment_ids?: string[];
}
```
**3b. `chat.service.ts`** — add `StorageService` to the constructor (inject), and add methods. Constructor becomes `constructor(prisma, notifications, audit, private readonly storage: StorageService)`. Add:
```ts
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

async createAttachment(
  chatId: string,
  requester: AuthUser,
  file: { buffer: Buffer; size: number; mime: string },
): Promise<{ attachment_id: string; object_key: string }> {
  await this.assertChatAccess(chatId, requester);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestException({ code: 'ATTACHMENT_TOO_LARGE', message: 'Max 10 MB' });
  }
  const objectKey = `chats/${chatId}/${randomUUID()}`;
  await this.storage.putObject(objectKey, file.buffer, file.mime);
  const row = await this.prisma.attachment.create({
    data: { chatId, uploaderUserId: requester.id, objectKey, mime: file.mime, size: file.size },
  });
  return { attachment_id: row.id, object_key: row.objectKey };
}
```
Import `BadRequestException` from `@nestjs/common` and `randomUUID` from `node:crypto`. Then in `sendMessage`, accept attachments: change the signature to also accept `attachmentIds?: string[]`; before creating the message, resolve attachments:
```ts
// inside sendMessage, after assertChatAccess:
const attachmentIds = args.attachmentIds ?? [];
if (!args.text && attachmentIds.length === 0) {
  throw new BadRequestException({ code: 'MESSAGE_EMPTY', message: 'text or attachments required' });
}
let attachmentsJson: { object_key: string; mime: string; size: number }[] = [];
if (attachmentIds.length > 0) {
  const atts = await this.prisma.attachment.findMany({
    where: { id: { in: attachmentIds }, chatId, uploaderUserId: requester.id, messageId: null },
  });
  if (atts.length !== attachmentIds.length) {
    throw new BadRequestException({ code: 'ATTACHMENT_INVALID', message: 'unknown or already-linked attachment' });
  }
  attachmentsJson = atts.map((a) => ({ object_key: a.objectKey, mime: a.mime, size: a.size }));
}
```
Update `SendMessageArgs` to `{ text?: string; attachmentIds?: string[] }`. Pass `text: args.text ?? null` and `attachments: attachmentsJson` into `prisma.message.create`. After creating the message, if attachmentIds present, `await this.prisma.attachment.updateMany({ where: { id: { in: attachmentIds } }, data: { messageId: message.id } });`. Keep the existing notify logic (use `args.text` for preview; if no text use 'Вложение').
**3c. `chat.mapper.ts`** — make presigning available: inject `StorageService`, change `toMessageResponse` to async and presign each attachment:
```ts
async toMessageResponse(m: Message): Promise<MessageResponse> {
  const raw = Array.isArray(m.attachments) ? (m.attachments as Array<{ object_key: string; mime: string; size: number }>) : [];
  const attachments = await Promise.all(
    raw.map(async (a) => ({ ...a, url: await this.storage.getPresignedUrl(a.object_key) })),
  );
  return { /* same fields */, attachments };
}
```
Make `ChatMapper` `@Injectable()` with `constructor(private readonly storage: StorageService) {}`. Update the `MessageResponse.attachments` type to `Array<{ object_key: string; mime: string; size: number; url: string }>`.
**3d. `chat.controller.ts`** — update the two message endpoints to `await` the now-async mapper (`await this.mapper.toMessageResponse(...)`, and for listMessages `await Promise.all(msgs.map((m) => this.mapper.toMessageResponse(m)))`). Pass `attachmentIds: dto.attachment_ids` into `sendMessage`. Add the upload endpoint:
```ts
@Post('chats/:id/attachments')
@UseInterceptors(FileInterceptor('file'))
async uploadAttachment(
  @CurrentUser() user: AuthUser,
  @Param('id', ParseUUIDPipe) chatId: string,
  @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
): Promise<{ attachment_id: string; object_key: string }> {
  if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'file is required' });
  const mime = sniffMime(file.buffer);
  if (!mime) throw new BadRequestException({ code: 'UNSUPPORTED_TYPE', message: 'unsupported file type' });
  return this.chat.createAttachment(chatId, user, { buffer: file.buffer, size: file.size, mime });
}
```
Imports: `Post, UseInterceptors, UploadedFile, BadRequestException` from `@nestjs/common`; `FileInterceptor` from `@nestjs/platform-express`; `sniffMime` from `../storage/mime-sniff`.
**3e. `chat.module.ts`** — add `StorageModule` to `imports`.

- [ ] **Step 4: Run, expect PASS** — `pnpm --filter @vittoria/api exec jest chat/__tests__/chat.attachments` AND the existing `chat/__tests__/chat.service` (fix any breakage from the async mapper / new constructor arg — the existing chat.service.spec constructs ChatService and may need the StorageService arg; update that spec's construction to pass a `{ getPresignedUrl: jest.fn(), putObject: jest.fn() } as unknown as StorageService`).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/chat/
git commit -m "feat(api): chat attachments (upload endpoint, message linking, presigned URLs)"
```

---

### Task 5: e2e (real MinIO) + full gates

**Files:**
- Test: `apps/api/test/chat-attachments.e2e-spec.ts`

- [ ] **Step 1: Write the e2e** — `apps/api/test/chat-attachments.e2e-spec.ts`. Uses the real app (createTestApp) + Testcontainers Postgres + the running MinIO (localhost:9000, default env). Seed a client + an order + its chat, upload a tiny JPEG, then send a message referencing it and read it back:
```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { seedUserWithToken } from './helpers/auth-test-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Chat attachments (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  it('uploads an attachment and returns it on the message with a presigned url', async () => {
    const prisma = app.get(PrismaService);
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: Math.floor(Math.random() * 1e9), clientUserId: client.id, currentStage: 'production', progressPercent: 0, partnerServices: [] },
    });
    const chat = await prisma.chat.create({ data: { orderId: order.id } });

    const up = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/attachments`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .attach('file', JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(up.status).toBe(201);
    expect(up.body.attachment_id).toBeTruthy();

    const send = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: 'фото', attachment_ids: [up.body.attachment_id] });
    expect(send.status).toBe(201);
    expect(send.body.attachments).toHaveLength(1);
    expect(send.body.attachments[0].url).toContain('http');
  }, 60_000);
});
```
(Adjust the order `create` data to match required non-null Order columns if the test fails on a missing field — `amocrmDealId`, `clientUserId`, `currentStage`, `progressPercent`, `partnerServices` are the required ones.)

- [ ] **Step 2: Run the e2e** — `pnpm --filter @vittoria/api exec jest --config jest-e2e.json chat-attachments` (Docker Postgres + MinIO must be up). Expect PASS. If MinIO bucket errors occur, StorageService.ensureBucket creates it on first put.

- [ ] **Step 3: Full backend gates** — `pnpm --filter @vittoria/api test:unit` (all pass), `pnpm --filter @vittoria/api test:e2e` (all pass), `pnpm --filter @vittoria/api build` (clean), `pnpm --filter @vittoria/api lint` (clean).

- [ ] **Step 4: Commit**
```bash
git add apps/api/test/chat-attachments.e2e-spec.ts
git commit -m "test(api): e2e chat attachment upload + message link (MinIO)"
```

---

## Self-Review

- S3 put + presigned GET + bucket bootstrap → Task 1 (StorageService). ✓
- Attachment persistence model → Task 2. ✓
- Magic-byte mime allow-list (jpg/png/gif/webp/pdf) → Task 3. ✓
- Upload endpoint (multipart, size+mime validation, access check) → Task 4 (controller + service). ✓
- Message linking + presigned URLs in responses → Task 4 (service + mapper). ✓
- Real MinIO e2e → Task 5. ✓
- ClamAV deferred (no AV in env) — documented, not implemented. (acceptable MVP gap) ✓
- 10 MB limit, ≤5 attachments per message → Task 4 (MAX_ATTACHMENT_BYTES, ArrayMaxSize). ✓
