import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Admin Orders (e2e)', () => {
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
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /admin/orders requires admin role (client gets 403)', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /admin/orders returns all orders with pagination meta', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const c2 = await seedUserWithToken(app, { role: 'client' });
    await prisma.order.createMany({
      data: [
        { amocrmDealId: 5001, clientUserId: c1.id, productName: 'A' },
        { amocrmDealId: 5002, clientUserId: c2.id, productName: 'B' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.page).toBe(1);
    expect(res.body.page_size).toBe(20);
    expect(res.body.total).toBe(2);
  });

  it('GET /admin/orders filters by search and stage', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    await prisma.order.createMany({
      data: [
        { amocrmDealId: 5101, clientUserId: c1.id, productName: 'Kitchen', currentStage: 'production' },
        { amocrmDealId: 5102, clientUserId: c1.id, productName: 'Wardrobe', currentStage: 'detailing' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders?search=kit&stage=production')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('Kitchen');
  });

  it('GET /admin/orders/:id returns any order regardless of owner', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 5201, clientUserId: c1.id } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders/${order.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
  });

  it('GET /admin/orders/:id returns 404 for unknown id', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /admin/orders/:id/progress updates stage and percent and writes history', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 5301, clientUserId: c1.id, currentStage: 'detailing', progressPercent: 20 },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'production', progress_percent: 60, comment: 'On track' });
    expect(res.status).toBe(200);
    expect(res.body.current_stage).toBe('production');
    expect(res.body.progress_percent).toBe(60);
    expect(res.body.last_admin_comment).toBe('On track');

    const history = await prisma.orderStageHistory.findMany({ where: { orderId: order.id } });
    expect(history).toHaveLength(1);
    expect(history[0].stage).toBe('production');
    expect(history[0].progressPercent).toBe(60);
    expect(history[0].changedByUserId).toBe(admin.id);
  });

  it('PATCH /admin/orders/:id/progress rejects invalid stage with 400', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 5302, clientUserId: c1.id } });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'not-a-stage' });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/orders/:id/progress requires admin (client gets 403)', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 5303, clientUserId: client.id } });
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ progress_percent: 50 });
    expect(res.status).toBe(403);
  });
});
