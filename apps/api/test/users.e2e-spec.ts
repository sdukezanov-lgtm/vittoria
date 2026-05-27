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
    await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });
    await prisma.authCode.create({
      data: { phone, codeHash, expiresAt: new Date(Date.now() + 60_000) },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-code')
      .send({ phone, code: '1234' });
    return {
      accessToken: res.body.access_token,
      refreshToken: res.body.refresh_token,
      userId: res.body.user.id,
    };
  }

  it('GET /me returns the current user', async () => {
    const { accessToken } = await login();
    const res = await request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: '+79991234567', role: 'client' });
  });

  it('PATCH /me updates first_name / last_name', async () => {
    const { accessToken } = await login();
    const res = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ first_name: 'Иван', last_name: 'Иванов' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ first_name: 'Иван', last_name: 'Иванов' });
  });

  it('POST /me/consent → 204 and sets consent_accepted_at', async () => {
    const { accessToken, userId } = await login();
    const res = await request(app.getHttpServer())
      .post('/api/v1/me/consent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();
    expect(res.status).toBe(204);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.consentAcceptedAt).toBeInstanceOf(Date);
  });

  it('DELETE /me anonymizes and revokes sessions', async () => {
    const { accessToken, userId } = await login();
    const res = await request(app.getHttpServer())
      .delete('/api/v1/me')
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
