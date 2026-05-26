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
