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
      .post('/auth/verify-code')
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
    await prisma.user.upsert({
      where: { phone: '+79991234567' },
      update: {},
      create: { phone: '+79991234567' },
    });
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
});
