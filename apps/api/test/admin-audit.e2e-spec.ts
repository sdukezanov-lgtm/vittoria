import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Admin Audit Log (e2e)', () => {
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
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /admin/audit-log returns records, filtered by entity', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    await prisma.auditLog.create({ data: { action: 'order.progress.updated', entity: 'Order', entityId: 'o1' } });
    await prisma.auditLog.create({ data: { action: 'chat.message.sent', entity: 'Message', entityId: 'm1' } });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-log?entity=Order')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r: { entity: string }) => r.entity === 'Order')).toBe(true);
    expect(res.body.rows[0].action).toBe('order.progress.updated');
  });

  it('GET /admin/audit-log returns 403 for non-admin', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-log')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });
});
