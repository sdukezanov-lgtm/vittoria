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
