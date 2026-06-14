import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    throttlerStorage = app.get(ThrottlerStorage) as ThrottlerStorageService;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  afterEach(async () => {
    await prisma.authCode.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    // Reset throttler in-memory counters so each test starts with a clean slate.
    throttlerStorage?.storage?.clear();
  });

  it('POST /auth/request-code returns 200 with retry_after_sec and persists an auth code', async () => {
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone: '+79991234567' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ retry_after_sec: expect.any(Number) });
    const codes = await prisma.authCode.findMany({ where: { phone: '+79991234567' } });
    expect(codes).toHaveLength(1);
  });

  it('POST /auth/request-code rejects malformed phone with 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone: '12345' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/verify-code with correct code returns tokens and creates a user + session', async () => {
    // Seed an auth code directly so we control the value.
    const bcrypt = await import('bcrypt');
    const code = '1234';
    const codeHash = await bcrypt.hash(code, 10);
    // Ensure user exists (FK requirement for auth_codes.phone)
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
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

  it('POST /auth/verify-code with wrong code returns 401 and increments attempts', async () => {
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone: '+79991234567', code: '9999' });
    expect(res.status).toBe(401);
    const c = await prisma.authCode.findFirst({ where: { phone: '+79991234567' } });
    expect(c?.attempts).toBe(1);
  });

  it('POST /auth/refresh rotates refresh token and revokes the old session', async () => {
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone: '+79991234567', code: '1234' });
    const oldRefresh = verify.body.refresh_token as string;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: oldRefresh });
    expect(res.status).toBe(200);
    expect(res.body.refresh_token).not.toEqual(oldRefresh);
    expect(typeof res.body.access_token).toBe('string');

    // Reusing the old refresh token must fail.
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: oldRefresh });
    expect(reuse.status).toBe(401);
  });

  it('POST /auth/logout revokes the session', async () => {
    const bcrypt = await import('bcrypt');
    const codeHash = await bcrypt.hash('1234', 10);
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
    await prisma.authCode.create({
      data: { phone: '+79991234567', codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone: '+79991234567', code: '1234' });
    const access = verify.body.access_token as string;
    const refresh = verify.body.refresh_token as string;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .send();
    expect(res.status).toBe(204);

    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refresh });
    expect(reuse.status).toBe(401);
  });

  it('protected endpoint without Authorization → 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/logout').send();
    expect(res.status).toBe(401);
  });

  it('POST /auth/request-code is rate-limited at the throttler', async () => {
    for (let i = 0; i < 6; i++) {
      await prisma.user.upsert({
        where: { phone: `+7999000000${i}` },
        update: {},
        create: { phone: `+7999000000${i}` },
      });
    }
    // Hit it 6 times in quick succession with different phones to bypass per-phone rate limit.
    // The throttler is per-IP, so all 6 share the same IP in test (loopback).
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const phone = `+7999000000${i}`;
      const res = await request(app.getHttpServer()).post('/api/v1/auth/request-code').send({ phone });
      results.push(res.status);
    }
    // First 5 should be 200, the 6th should be 429.
    expect(results.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(results[5]).toBe(429);
  });

  it('POST /auth/request-code returns 404 for unregistered phone', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-code')
      .send({ phone: '+78880000001' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AUTH_PHONE_NOT_REGISTERED');
  });

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
});
