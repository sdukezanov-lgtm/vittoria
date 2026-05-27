import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Client Orders (e2e)', () => {
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
    await prisma.authCode.deleteMany();
    await prisma.user.deleteMany();
  });

  it("GET /orders returns only the caller's orders", async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });

    await prisma.order.createMany({
      data: [
        { amocrmDealId: 1001, clientUserId: me.id, productName: 'My kitchen' },
        { amocrmDealId: 1002, clientUserId: other.id, productName: 'Other kitchen' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('My kitchen');
  });

  it('GET /orders without auth returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  it('GET /orders/:id returns 200 for owner', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 2001, clientUserId: me.id, productName: 'Mine' },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
    expect(res.body.amocrm_deal_id).toBe(2001);
  });

  it('GET /orders/:id returns 404 for non-owner', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 2002, clientUserId: other.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /orders/:id/history returns history entries newest first', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 3001, clientUserId: me.id, currentStage: 'production', progressPercent: 60 },
    });
    await prisma.orderStageHistory.createMany({
      data: [
        { orderId: order.id, stage: 'detailing', progressPercent: 20, changedAt: new Date('2026-05-01T00:00:00Z') },
        { orderId: order.id, stage: 'production', progressPercent: 60, changedAt: new Date('2026-05-10T00:00:00Z') },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/history`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].stage).toBe('production');
    expect(res.body.items[0].progress_percent).toBe(60);
    expect(res.body.items[1].stage).toBe('detailing');
  });

  it('GET /orders/:id/history returns 404 for non-owner', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const other = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({ data: { amocrmDealId: 3002, clientUserId: other.id } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/history`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /orders/:id/partner-services returns the stored array', async () => {
    const me = await seedUserWithToken(app, { role: 'client' });
    const services = [
      { type: 'delivery', label: 'Доставка', date: '2026-06-15', price: 5000 },
      { type: 'lifting', label: 'Подъём', date: '2026-06-15', price: 3000 },
    ];
    const order = await prisma.order.create({
      data: { amocrmDealId: 4001, clientUserId: me.id, partnerServices: services },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/partner-services`)
      .set('Authorization', `Bearer ${me.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(services);
  });
});
