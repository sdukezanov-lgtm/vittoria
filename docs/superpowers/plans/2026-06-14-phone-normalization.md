# Phone Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make login work for all clients regardless of how their phone is stored/typed, by normalizing every phone to canonical E.164 `+7XXXXXXXXXX` at all code boundaries and migrating existing prod data.

**Architecture:** One pure utility `normalizePhone(raw) -> string | null` is the single source of truth. It is applied at every write boundary (amoCRM sync, admin user creation) and at the login read boundary (auth service), and login DTOs are relaxed to accept common formats. A one-time idempotent SQL migration normalizes the 546 existing prod users, merging the single known collision and leaving 3 foreign/malformed numbers untouched.

**Tech Stack:** NestJS, Prisma (PostgreSQL), class-validator, Jest (unit + testcontainers e2e).

**Spec:** `docs/superpowers/specs/2026-06-14-phone-normalization-design.md`

---

## File Structure

- **Create** `apps/api/src/common/phone.ts` — the `normalizePhone` utility (one responsibility: RU phone → E.164 or null).
- **Create** `apps/api/src/common/__tests__/phone.spec.ts` — unit tests for the utility.
- **Modify** `apps/api/src/auth/dto/request-code.dto.ts`, `apps/api/src/auth/dto/verify-code.dto.ts` — relax phone validation.
- **Modify** `apps/api/src/auth/auth.service.ts` — normalize phone at the top of `requestCode`/`verifyCode`.
- **Modify** `apps/api/src/users/admin-users.service.ts` — normalize phone in `createUser`.
- **Modify** `apps/api/src/amocrm/amocrm-sync.service.ts` — normalize phone before user upsert.
- **Modify** `apps/api/test/auth.e2e-spec.ts` — add forgiving-format login tests.
- **Modify** `apps/api/src/auth/__tests__/auth.service.spec.ts` — add normalization unit test.
- **Create** `apps/api/prisma/migrations/<timestamp>_normalize_existing_phones/migration.sql` — data migration.

**Normalization algorithm (shared contract — implement identically in TS util and SQL migration):**
1. `null`/empty → `null`.
2. Let `hadPlus` = trimmed input starts with `+`. Let `d` = digits only (strip everything non-digit).
3. If `hadPlus`: return `+`+`d` **only if** `d` matches `^7\d{10}$` (i.e. `+7` and 10 more digits); otherwise `null` (foreign `+992…`, or malformed `+7981972536` which is `+` with only 10 digits).
4. Else (no `+`): `8\d{10}` → `+7`+last10; `7\d{10}` → `+`+`d`; exactly `\d{10}` → `+7`+`d`; otherwise `null`.

---

## Task 1: `normalizePhone` utility

**Files:**
- Create: `apps/api/src/common/phone.ts`
- Test: `apps/api/src/common/__tests__/phone.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/__tests__/phone.spec.ts`:

```ts
import { normalizePhone } from '../phone';

describe('normalizePhone', () => {
  it('keeps canonical +7XXXXXXXXXX unchanged', () => {
    expect(normalizePhone('+79991234567')).toBe('+79991234567');
  });

  it('converts 8XXXXXXXXXX to +7XXXXXXXXXX', () => {
    expect(normalizePhone('89991234567')).toBe('+79991234567');
  });

  it('converts 7XXXXXXXXXX (no plus) to +7XXXXXXXXXX', () => {
    expect(normalizePhone('79991234567')).toBe('+79991234567');
  });

  it('converts a bare 10-digit number to +7XXXXXXXXXX', () => {
    expect(normalizePhone('9991234567')).toBe('+79991234567');
  });

  it('strips spaces, parens and dashes', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('8 999 123 45 67')).toBe('+79991234567');
  });

  it('returns null for foreign numbers', () => {
    expect(normalizePhone('+992927077539')).toBeNull();
    expect(normalizePhone('+3197010206674')).toBeNull();
  });

  it('returns null for a + number that is not +7 + 10 digits (malformed)', () => {
    expect(normalizePhone('+7981972536')).toBeNull(); // +7 then only 9 more digits
  });

  it('returns null for empty / too short / garbage', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('hello')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/common/__tests__/phone.spec.ts`
Expected: FAIL — `Cannot find module '../phone'`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/api/src/common/phone.ts`:

```ts
/**
 * Normalize a Russian phone number to canonical E.164 `+7XXXXXXXXXX`.
 * Returns null when the input cannot be safely normalized (foreign, malformed, empty).
 *
 * Rules:
 *  - If the input had a leading `+`, it is only valid as `+7` followed by 10 digits;
 *    anything else (e.g. +992…, or +7 with the wrong digit count) → null.
 *  - Without a `+`: `8`+10 digits, `7`+10 digits, or exactly 10 digits → `+7XXXXXXXXXX`.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hadPlus = raw.trim().startsWith('+');
  const d = raw.replace(/\D/g, '');

  if (hadPlus) {
    return /^7\d{10}$/.test(d) ? `+${d}` : null;
  }
  if (/^8\d{10}$/.test(d)) return `+7${d.slice(1)}`;
  if (/^7\d{10}$/.test(d)) return `+${d}`;
  if (/^\d{10}$/.test(d)) return `+7${d}`;
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/common/__tests__/phone.spec.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/phone.ts apps/api/src/common/__tests__/phone.spec.ts
git commit -m "feat(phone): add normalizePhone utility (RU -> E.164 +7)"
```

---

## Task 2: Forgiving login — relax DTOs and normalize in auth service

**Files:**
- Modify: `apps/api/src/auth/dto/request-code.dto.ts`
- Modify: `apps/api/src/auth/dto/verify-code.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/__tests__/auth.service.spec.ts`, `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Write the failing unit test**

Add to `apps/api/src/auth/__tests__/auth.service.spec.ts` inside `describe('AuthService.requestCode (unit)', …)`:

```ts
  it('normalizes the phone before lookup and SMS (8XXX -> +7XXX)', async () => {
    const { prisma, sms, audit, config, tokens } = makeDeps();
    const svc = new AuthService(prisma, sms, audit, config, tokens);

    await svc.requestCode('89991234567');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '+79991234567' } });
    expect(prisma.authCode.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+79991234567' }) }),
    );
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+79991234567' }),
    );
  });

  it('throws BadRequest for an unnormalizable phone', async () => {
    const { prisma, sms, audit, config, tokens } = makeDeps();
    const svc = new AuthService(prisma, sms, audit, config, tokens);
    await expect(svc.requestCode('+992927077539')).rejects.toThrow(/invalid phone/i);
    expect(sms.send).not.toHaveBeenCalled();
  });
```

Note: `makeDeps()` already mocks `prisma.user.findUnique` to return a user; it does not currently assert the argument, so the new `toHaveBeenCalledWith` is the new behavior under test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/auth/__tests__/auth.service.spec.ts`
Expected: FAIL — `findUnique` called with `{ where: { phone: '89991234567' } }` (not normalized), and the BadRequest test fails because the unnormalizable phone is not yet rejected.

- [ ] **Step 3: Implement normalization in auth.service.ts**

In `apps/api/src/auth/auth.service.ts`, add the import near the other imports:

```ts
import { normalizePhone } from '../common/phone';
```

Change the `requestCode` signature + first lines. Replace:

```ts
  async requestCode(phone: string): Promise<RequestCodeResult> {
    const ttlSec = this.config.get('OTP_TTL_SEC', { infer: true });
```

with:

```ts
  async requestCode(rawPhone: string): Promise<RequestCodeResult> {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      throw new BadRequestException({ code: 'AUTH_PHONE_INVALID', message: 'invalid phone number' });
    }
    const ttlSec = this.config.get('OTP_TTL_SEC', { infer: true });
```

Change the `verifyCode` signature + first lines. Replace:

```ts
  async verifyCode(
    phone: string,
    code: string,
    deviceInfo: Record<string, unknown> = {},
  ): Promise<{ accessToken: string; refreshToken: string; user: { id: string; phone: string; role: string } }> {
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
```

with:

```ts
  async verifyCode(
    rawPhone: string,
    code: string,
    deviceInfo: Record<string, unknown> = {},
  ): Promise<{ accessToken: string; refreshToken: string; user: { id: string; phone: string; role: string } }> {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      throw new BadRequestException({ code: 'AUTH_PHONE_INVALID', message: 'invalid phone number' });
    }
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
```

(`BadRequestException` is already imported at the top of the file. The rest of both methods already use the local `phone`, so no further changes are needed.)

- [ ] **Step 4: Relax the DTOs**

Replace the entire contents of `apps/api/src/auth/dto/request-code.dto.ts` with:

```ts
import { IsString, Length } from 'class-validator';

export class RequestCodeDto {
  // Accept any plausibly-phone-shaped input; the service normalizes it to E.164
  // (+7XXXXXXXXXX) and rejects anything that cannot be normalized.
  @IsString()
  @Length(10, 20, { message: 'phone is required' })
  phone!: string;
}
```

Replace the entire contents of `apps/api/src/auth/dto/verify-code.dto.ts` with:

```ts
import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @Length(10, 20, { message: 'phone is required' })
  phone!: string;

  @IsString()
  @Length(4, 4)
  code!: string;

  @IsOptional()
  @IsObject()
  device_info?: Record<string, unknown>;
}
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `cd apps/api && pnpm exec jest src/auth/__tests__/auth.service.spec.ts`
Expected: PASS (existing 3 tests + 2 new tests all green).

- [ ] **Step 6: Add forgiving-format e2e tests**

Add to `apps/api/test/auth.e2e-spec.ts` (inside the `describe('Auth (e2e)', …)` block, alongside the other `it(...)` cases):

```ts
  it('POST /auth/request-code accepts 8XXX format and finds the +7 user', async () => {
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone: '89991234567' });
    expect(res.status).toBe(200);
    const codes = await prisma.authCode.findMany({ where: { phone: '+79991234567' } });
    expect(codes).toHaveLength(1);
  });

  it('POST /auth/request-code with a foreign number returns 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone: '+992927077539' });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 7: Run the auth e2e suite to verify it passes**

Run: `cd apps/api && pnpm test:e2e -- auth.e2e-spec.ts`
Expected: PASS — all existing auth e2e tests plus the 2 new ones. (Existing `'rejects malformed phone with 400'` sending `'12345'` still 400 via `@Length(10,20)`.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(auth): forgiving phone input — normalize to +7 before lookup"
```

---

## Task 3: Normalize on write — amoCRM sync and admin user creation

**Files:**
- Modify: `apps/api/src/amocrm/amocrm-sync.service.ts`
- Modify: `apps/api/src/users/admin-users.service.ts`
- Test: `apps/api/src/users/__tests__/admin-users.service.spec.ts`

- [ ] **Step 1: Write the failing unit test for admin user creation**

Add to `apps/api/src/users/__tests__/admin-users.service.spec.ts` a test that creating a user with an `8XXX` phone stores it as `+7XXX`. Match the existing mock style in that file; the assertion is:

```ts
  it('normalizes the phone to +7 on create', async () => {
    // Arrange: findUnique returns null (no existing user), create echoes its input.
    prisma.user.findUnique = jest.fn().mockResolvedValue(null);
    prisma.user.create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', ...data }));
    const svc = new AdminUsersService(prisma);

    await svc.createUser({ phone: '89991234567', role: 'admin' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: '+79991234567' } });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+79991234567' }) }),
    );
  });
```

If the file does not already build a `prisma` mock + `AdminUsersService` instance, add the same minimal mock pattern used by the sibling tests in that file (a `prisma` object with `user.findUnique`/`user.create` jest mocks, then `new AdminUsersService(prisma as any)`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec jest src/users/__tests__/admin-users.service.spec.ts`
Expected: FAIL — `findUnique`/`create` called with `'89991234567'`, not `'+79991234567'`.

- [ ] **Step 3: Implement normalization in admin-users.service.ts**

In `apps/api/src/users/admin-users.service.ts`, add the import:

```ts
import { normalizePhone } from '../common/phone';
```

Replace the body of `createUser` so it normalizes first and rejects unnormalizable input:

```ts
  async createUser(args: CreateUserArgs): Promise<User> {
    const phone = normalizePhone(args.phone);
    if (!phone) {
      throw new ConflictException({ code: 'USER_PHONE_INVALID', message: 'invalid phone number' });
    }
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException({ code: 'USER_PHONE_EXISTS', message: 'Phone already registered' });
    }
    return this.prisma.user.create({
      data: {
        phone,
        role: args.role,
        firstName: args.first_name,
        lastName: args.last_name,
      },
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec jest src/users/__tests__/admin-users.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Normalize phone in amoCRM sync**

In `apps/api/src/amocrm/amocrm-sync.service.ts`, add the import:

```ts
import { normalizePhone } from '../common/phone';
```

Replace this block (currently lines ~32-40):

```ts
    const contact = await this.client.getContact(patch.amocrmContactId);
    if (!contact.phone) {
      throw new Error(`AmoCRM contact ${contact.id} has no phone`);
    }

    const client = await this.prisma.user.upsert({
      where: { phone: contact.phone },
      update: { firstName: contact.name ?? undefined, amocrmContactId: contact.id },
      create: { phone: contact.phone, firstName: contact.name ?? undefined, amocrmContactId: contact.id },
    });
```

with (normalize when possible; fall back to the raw value for foreign/malformed so the user is still created and the order still links):

```ts
    const contact = await this.client.getContact(patch.amocrmContactId);
    if (!contact.phone) {
      throw new Error(`AmoCRM contact ${contact.id} has no phone`);
    }
    const phone = normalizePhone(contact.phone) ?? contact.phone;

    const client = await this.prisma.user.upsert({
      where: { phone },
      update: { firstName: contact.name ?? undefined, amocrmContactId: contact.id },
      create: { phone, firstName: contact.name ?? undefined, amocrmContactId: contact.id },
    });
```

- [ ] **Step 6: Run the amoCRM sync e2e to verify nothing regressed**

Run: `cd apps/api && pnpm test:e2e -- amocrm-sync.e2e-spec.ts`
Expected: PASS. (If a fixture in that spec asserts a non-`+7` phone is stored verbatim, update the expectation to the normalized `+7` form — the contact phone now round-trips through `normalizePhone`.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/amocrm/amocrm-sync.service.ts apps/api/src/users
git commit -m "feat(users,amocrm): normalize phone to +7 on write paths"
```

---

## Task 4: Data migration — normalize existing phones (idempotent)

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_normalize_existing_phones/migration.sql`

- [ ] **Step 1: Scaffold an empty SQL migration**

Run (creates the migration directory without applying it):

```bash
cd apps/api && pnpm exec prisma migrate dev --create-only --name normalize_existing_phones
```

Expected: a new folder `prisma/migrations/<timestamp>_normalize_existing_phones/` containing an (empty or no-op) `migration.sql`.

- [ ] **Step 2: Write the migration SQL**

Replace the contents of the new `migration.sql` with:

```sql
-- Normalize all user phones to canonical E.164 +7XXXXXXXXXX, merging duplicates that
-- collapse to the same number and leaving foreign/malformed numbers untouched.
-- Idempotent: a second run is a no-op (already-canonical rows are unchanged, no collisions remain).

-- Session-local normalization function mirroring apps/api/src/common/phone.ts.
CREATE FUNCTION pg_temp.norm_ru(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN left(btrim(raw), 1) = '+' THEN
      CASE WHEN regexp_replace(raw, '\D', '', 'g') ~ '^7[0-9]{10}$'
           THEN '+' || regexp_replace(raw, '\D', '', 'g')
           ELSE NULL END
    WHEN regexp_replace(raw, '\D', '', 'g') ~ '^8[0-9]{10}$'
      THEN '+7' || substring(regexp_replace(raw, '\D', '', 'g') from 2)
    WHEN regexp_replace(raw, '\D', '', 'g') ~ '^7[0-9]{10}$'
      THEN '+' || regexp_replace(raw, '\D', '', 'g')
    WHEN regexp_replace(raw, '\D', '', 'g') ~ '^[0-9]{10}$'
      THEN '+7' || regexp_replace(raw, '\D', '', 'g')
    ELSE NULL
  END
$$;

-- Phase 0: drop ephemeral OTP codes (they reference users.phone and are short-lived anyway).
DELETE FROM auth_codes;

-- Phase 1: merge users that normalize to the same phone.
-- Survivor per group = the row already in canonical form if present, else the earliest created.
CREATE TEMP TABLE phone_merge_map AS
WITH norm AS (
  SELECT id, phone, created_at, pg_temp.norm_ru(phone) AS np
  FROM users
  WHERE pg_temp.norm_ru(phone) IS NOT NULL
),
grp AS (
  SELECT np,
         (ARRAY_AGG(id ORDER BY (phone = np) DESC, created_at ASC))[1] AS survivor_id,
         ARRAY_AGG(id) AS ids
  FROM norm
  GROUP BY np
  HAVING COUNT(*) > 1
)
SELECT g.survivor_id, u AS loser_id
FROM grp g, UNNEST(g.ids) AS u
WHERE u <> g.survivor_id;

-- Reassign every reference from losers to survivors before deleting the loser rows.
UPDATE orders o SET client_user_id = m.survivor_id
  FROM phone_merge_map m WHERE o.client_user_id = m.loser_id;
UPDATE orders o SET partner_user_id = m.survivor_id
  FROM phone_merge_map m WHERE o.partner_user_id = m.loser_id;
UPDATE messages x SET sender_user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.sender_user_id = m.loser_id;
UPDATE attachments x SET uploader_user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.uploader_user_id = m.loser_id;
UPDATE partner_commissions x SET partner_user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.partner_user_id = m.loser_id;
UPDATE sessions x SET user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.user_id = m.loser_id;
-- push_tokens has UNIQUE(user_id, device_id); losers' device tokens are regenerated on next
-- app login, so drop them rather than risk a unique conflict on reassignment.
DELETE FROM push_tokens x USING phone_merge_map m WHERE x.user_id = m.loser_id;

DELETE FROM users x USING phone_merge_map m WHERE x.id = m.loser_id;

DROP TABLE phone_merge_map;

-- Phase 2: normalize the remaining users (skip unnormalizable; no-op for already-canonical).
UPDATE users
SET phone = pg_temp.norm_ru(phone)
WHERE pg_temp.norm_ru(phone) IS NOT NULL
  AND phone <> pg_temp.norm_ru(phone);
```

- [ ] **Step 3: Apply the migration locally and verify it runs cleanly**

Run: `cd apps/api && pnpm exec prisma migrate dev`
Expected: the migration applies with no error against the local dev DB (empty or seeded). On an empty DB every statement is a no-op.

- [ ] **Step 4: Verify idempotency**

Re-run against the same DB:

Run: `cd apps/api && pnpm exec prisma migrate deploy`
Expected: "No pending migrations" (already applied). To prove the SQL itself is idempotent, manually re-execute the body once more and confirm it succeeds with no rows changed — e.g. seed two users `'+79167724547'` and `'9167724547'`, run the Phase-1/Phase-2 SQL twice, and confirm: after the first run one user remains as `+79167724547` owning both orders, and the second run changes nothing.

- [ ] **Step 5: Run the full e2e suite (migration runs on a fresh container)**

Run: `cd apps/api && pnpm test:e2e`
Expected: PASS. The testcontainers helper runs `prisma migrate deploy`, so the new migration executes against a fresh DB and must not error.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations
git commit -m "feat(db): migration to normalize existing user phones to +7 (idempotent, merges collision)"
```

---

## Task 5: Deploy to prod and verify

> Runs against the live VPS `89.23.116.71`. Server access, the SSH runner (`remote.py`), and exact compose commands are in `c:\sad\vittoria-deploy\DEPLOY-STATE.md`. The api image's start command runs `prisma migrate deploy` before booting, so deploying the new image applies the migration automatically.

- [ ] **Step 1: Back up the prod database first**

On the VPS: `docker compose ... exec -T postgres pg_dump -U vittoria vittoria > /root/vittoria-backup-pre-phone-normalize.sql` and confirm the file is non-empty.

- [ ] **Step 2: Capture the before-state phone distribution**

Run the format-bucket query (the same one used during design) and record the counts (expect ~224 `8XXX`, 98 `7XXX`, 24 ten-digit, 197 canonical, 3 unnormalizable) plus the collision pair `+79167724547` / `9167724547`.

- [ ] **Step 3: Ship the new code and rebuild api**

Deliver the committed changes to `/opt/vittoria` (git archive of HEAD, per the existing deploy flow) and rebuild + recreate api:
`docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --build api`
The container start runs `prisma migrate deploy`, applying `normalize_existing_phones`.

- [ ] **Step 4: Verify the migration applied and api is healthy**

- `docker compose ... logs api` shows the migration applied and `Nest application successfully started`, no errors.
- `curl https://api.vittoria-home.ru/api/v1/readyz` → `{"status":"ok",...}`.

- [ ] **Step 5: Verify the data**

Re-run the format-bucket query. Expected: only `already +7XXXXXXXXXX (ok)` (≈ 197 + 346 − 1 merged = 542) and `OTHER/unnormalizable` (3) remain; zero `8XXX`/`7XXX`/`10-digit`. Confirm the collision is gone: exactly one user `+79167724547` owning both former orders, and the `9167724547` row deleted.

- [ ] **Step 6: Verify a real login end-to-end in a non-canonical format**

Pick one real client whose phone was stored as `8XXX` (now `+7XXX`). With their consent (or the admin `+79679788884`), `POST /auth/request-code` typing the `8XXX` form → expect HTTP 200, SMS delivered, then `verify-code` → tokens. This proves a previously-locked-out format now works.

- [ ] **Step 7: Update deploy docs/memory**

Mark phone normalization done in `docs/superpowers/RESUME-deploy.md` and the private `DEPLOY-STATE.md`; note the prod DB backup path.

---

## Self-Review

- **Spec coverage:** util (Task 1) ✓ · forgiving login + DTO relax + service normalize (Task 2) ✓ · normalize on amoCRM sync + admin create (Task 3) ✓ · migration normalizing 346, merging the 1 collision, leaving 3 unnormalizable, idempotent (Task 4) ✓ · YAGNI (no libphonenumber, no UI/display changes, no international login) — respected, nothing added. Deploy + verify (Task 5) ✓.
- **Placeholders:** none — every step has concrete code/SQL/commands. `<timestamp>` in the migration path is filled by Prisma when scaffolding (Task 4 Step 1).
- **Type/contract consistency:** `normalizePhone(raw: string | null | undefined): string | null` used identically in auth.service, admin-users.service, amocrm-sync.service; the TS algorithm and the SQL `pg_temp.norm_ru` implement the same 4 rules (incl. the `hadPlus` distinction so `+7981972536` stays unnormalizable). Error code `AUTH_PHONE_INVALID` (auth) and `USER_PHONE_INVALID` (admin) are new and self-consistent.
