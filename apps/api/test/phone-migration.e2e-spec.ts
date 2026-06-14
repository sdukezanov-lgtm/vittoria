import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';

/**
 * Data-logic test for the one-time phone-normalization migration
 * (20260614120000_normalize_existing_phones).
 *
 * The testcontainers helper already ran `prisma migrate deploy` at startup, so the
 * migration applied cleanly against an empty DB (a no-op there). Here we seed REAL
 * rows and re-run the migration's BODY to prove merge + normalize + idempotency.
 *
 * The migration depends on a SINGLE Postgres session (a `pg_temp` function plus a
 * TEMP table that span multiple statements), so it cannot be run as many independent
 * pooled queries. The `pg` package is not available, so we use a Prisma INTERACTIVE
 * transaction — which holds ONE connection for the whole callback — and replay each
 * statement on that connection via `tx.$executeRawUnsafe`. `pg_temp` therefore
 * persists across statements exactly as it does in a real `migrate deploy`.
 */

const MIGRATION_SQL_PATH = resolve(
  __dirname,
  '../prisma/migrations/20260614120000_normalize_existing_phones/migration.sql',
);

/**
 * Split the migration SQL into top-level statements, respecting `$$ ... $$`
 * dollar-quoting (so the CREATE FUNCTION body is kept as a single statement) and
 * stripping `--` line comments. Splits on semicolons that are NOT inside a
 * dollar-quoted block.
 */
function splitSqlStatements(sql: string): string[] {
  // Strip full-line `--` comments to avoid a stray `;` inside a comment confusing us.
  const cleaned = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements: string[] = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (cleaned.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i += 1; // consume second '$'
      continue;
    }
    if (ch === ';' && !inDollar) {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

async function runMigrationBody(prisma: PrismaClient): Promise<void> {
  const sql = readFileSync(MIGRATION_SQL_PATH, 'utf8');
  const statements = splitSqlStatements(sql);
  // One interactive transaction = one pinned connection, so pg_temp survives across
  // the statements within this run (exactly as in a real `migrate deploy` session).
  await prisma.$transaction(
    async (tx) => {
      // Test-harness only: a real `migrate deploy` runs each migration in its OWN fresh
      // backend session, so pg_temp is always empty at the start. When we replay the body
      // twice in this single test process, Prisma's pool may hand back a backend whose
      // session-local pg_temp.norm_ru still exists from the previous run, which would make
      // the body's `CREATE FUNCTION` collide (42723). Dropping it first reproduces the
      // clean-session precondition without touching the migration SQL or its data logic.
      await tx.$executeRawUnsafe('DROP FUNCTION IF EXISTS pg_temp.norm_ru(text)');
      for (const stmt of statements) {
        await tx.$executeRawUnsafe(stmt);
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

describe('Phone normalization migration (data logic, e2e)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = await startPostgres();
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopPostgres();
  });

  beforeEach(async () => {
    // Clean slate across the FK graph (children first).
    await prisma.$executeRawUnsafe('DELETE FROM partner_commissions');
    await prisma.$executeRawUnsafe('DELETE FROM attachments');
    await prisma.$executeRawUnsafe('DELETE FROM messages');
    await prisma.$executeRawUnsafe('DELETE FROM chats');
    await prisma.$executeRawUnsafe('DELETE FROM order_stage_history');
    await prisma.$executeRawUnsafe('DELETE FROM push_tokens');
    await prisma.$executeRawUnsafe('DELETE FROM sessions');
    await prisma.$executeRawUnsafe('DELETE FROM auth_codes');
    await prisma.$executeRawUnsafe('DELETE FROM orders');
    await prisma.$executeRawUnsafe('DELETE FROM users');
  });

  // Insert a user with a raw phone string, bypassing any app-level normalization.
  async function seedUser(id: string, phone: string, createdAt: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO users (id, phone, role, created_at, updated_at)
       VALUES ($1::uuid, $2, 'client', $3::timestamp, $3::timestamp)`,
      id,
      phone,
      createdAt,
    );
  }

  // Minimal order owned by a given client user; amocrm_deal_id must be unique.
  async function seedOrder(id: string, clientUserId: string, dealId: number): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO orders (id, amocrm_deal_id, client_user_id, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, NOW(), NOW())`,
      id,
      dealId,
      clientUserId,
    );
  }

  // Minimal session owned by a given user (proves the non-orders reassignment path).
  async function seedSession(id: string, userId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at)
       VALUES ($1::uuid, $2::uuid, 'x', NOW() + interval '1 day', NOW())`,
      id,
      userId,
    );
  }

  it('normalizes, merges collisions, leaves foreign untouched, and is idempotent', async () => {
    // --- ids ---
    const U_CANON = '00000000-0000-0000-0000-000000000001';
    const U_8XXX = '00000000-0000-0000-0000-000000000002';
    const U_7XXX = '00000000-0000-0000-0000-000000000003';
    const U_BARE = '00000000-0000-0000-0000-000000000004';
    const U_FOREIGN = '00000000-0000-0000-0000-000000000005';
    const U_COLLIDE_CANON = '00000000-0000-0000-0000-000000000006'; // +79167724547 (survivor)
    const U_COLLIDE_BARE = '00000000-0000-0000-0000-000000000007'; //  9167724547 (loser)
    const U_PLUS_BAD = '00000000-0000-0000-0000-000000000008'; // +7981972536 (plus + wrong length)

    const O_SURVIVOR = '10000000-0000-0000-0000-000000000001';
    const O_LOSER = '10000000-0000-0000-0000-000000000002';
    const S_LOSER = '20000000-0000-0000-0000-000000000001'; // session owned by the loser

    // --- seed ---
    await seedUser(U_CANON, '+79991234567', '2024-01-01T00:00:00Z');
    await seedUser(U_8XXX, '89991234560', '2024-01-02T00:00:00Z');
    await seedUser(U_7XXX, '79991234561', '2024-01-03T00:00:00Z');
    await seedUser(U_BARE, '9991234562', '2024-01-04T00:00:00Z');
    await seedUser(U_FOREIGN, '+992927077539', '2024-01-05T00:00:00Z');
    // '+' with the wrong digit count: must be left untouched (the spec's called-out edge case).
    await seedUser(U_PLUS_BAD, '+7981972536', '2024-01-05T12:00:00Z');
    // Collision pair: canonical row created LATER than the bare row to prove the
    // survivor is chosen by canonical-form-first (not by created_at).
    await seedUser(U_COLLIDE_BARE, '9167724547', '2024-01-06T00:00:00Z');
    await seedUser(U_COLLIDE_CANON, '+79167724547', '2024-01-07T00:00:00Z');

    // Each collision user owns exactly one order.
    await seedOrder(O_SURVIVOR, U_COLLIDE_CANON, 90001);
    await seedOrder(O_LOSER, U_COLLIDE_BARE, 90002);
    // The loser also owns a session — proves a non-orders reference is reassigned (not
    // cascade-deleted) when the loser row is removed.
    await seedSession(S_LOSER, U_COLLIDE_BARE);

    // --- run #1 ---
    await runMigrationBody(prisma);

    // Phones normalized.
    const phoneOf = async (id: string): Promise<string | null> => {
      const rows = await prisma.$queryRawUnsafe<{ phone: string | null }[]>(
        `SELECT phone FROM users WHERE id = $1::uuid`,
        id,
      );
      return rows.length ? rows[0].phone : null;
    };

    expect(await phoneOf(U_CANON)).toBe('+79991234567'); // unchanged
    expect(await phoneOf(U_8XXX)).toBe('+79991234560'); // 8XXX -> +7
    expect(await phoneOf(U_7XXX)).toBe('+79991234561'); // 7XXX -> +7
    expect(await phoneOf(U_BARE)).toBe('+79991234562'); // bare 10 -> +7
    expect(await phoneOf(U_FOREIGN)).toBe('+992927077539'); // foreign UNCHANGED
    expect(await phoneOf(U_PLUS_BAD)).toBe('+7981972536'); // +-with-wrong-length UNCHANGED

    // Collision merged: survivor is the canonical row; loser row is gone.
    expect(await phoneOf(U_COLLIDE_CANON)).toBe('+79167724547');
    expect(await phoneOf(U_COLLIDE_BARE)).toBeNull(); // deleted

    // Exactly one user holds +79167724547.
    const collideUsers = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM users WHERE phone = '+79167724547'`,
    );
    expect(collideUsers).toHaveLength(1);
    expect(collideUsers[0].id).toBe(U_COLLIDE_CANON);

    // BOTH orders now point to the survivor (loser's order was reassigned, not deleted).
    const ownerOf = async (orderId: string): Promise<string> => {
      const rows = await prisma.$queryRawUnsafe<{ client_user_id: string }[]>(
        `SELECT client_user_id FROM orders WHERE id = $1::uuid`,
        orderId,
      );
      return rows[0].client_user_id;
    };
    expect(await ownerOf(O_SURVIVOR)).toBe(U_COLLIDE_CANON);
    expect(await ownerOf(O_LOSER)).toBe(U_COLLIDE_CANON);

    // The loser's session was reassigned to the survivor (not cascade-deleted with the loser).
    const sessRows = await prisma.$queryRawUnsafe<{ user_id: string }[]>(
      `SELECT user_id FROM sessions WHERE id = $1::uuid`,
      S_LOSER,
    );
    expect(sessRows).toHaveLength(1);
    expect(sessRows[0].user_id).toBe(U_COLLIDE_CANON);

    // Total user count: started with 8, merged 1 away -> 7.
    const countAfter1 = await prisma.user.count();
    expect(countAfter1).toBe(7);

    // Snapshot the full user set for an exact idempotency comparison.
    const snapshot = async (): Promise<{ id: string; phone: string | null }[]> =>
      prisma.$queryRawUnsafe<{ id: string; phone: string | null }[]>(
        `SELECT id, phone FROM users ORDER BY id`,
      );
    const after1 = await snapshot();
    const orders1 = await prisma.$queryRawUnsafe<{ id: string; client_user_id: string }[]>(
      `SELECT id, client_user_id FROM orders ORDER BY id`,
    );

    // --- run #2: idempotency. Must not throw and must change nothing. ---
    await expect(runMigrationBody(prisma)).resolves.toBeUndefined();

    const after2 = await snapshot();
    const orders2 = await prisma.$queryRawUnsafe<{ id: string; client_user_id: string }[]>(
      `SELECT id, client_user_id FROM orders ORDER BY id`,
    );

    expect(after2).toEqual(after1);
    expect(orders2).toEqual(orders1);
    expect(await prisma.user.count()).toBe(7);
  }, 120_000);
});
