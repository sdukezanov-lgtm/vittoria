import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Partner Orders (e2e)', () => {
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

  it('GET /partner/orders returns only orders where partner_user_id matches the caller', async () => {
    const mePartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const otherPartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });

    await prisma.order.createMany({
      data: [
        { amocrmDealId: 6001, clientUserId: client.id, partnerUserId: mePartner.id, productName: 'Mine' },
        { amocrmDealId: 6002, clientUserId: client.id, partnerUserId: otherPartner.id, productName: 'Not mine' },
        { amocrmDealId: 6003, clientUserId: client.id, partnerUserId: null, productName: 'Unassigned' },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/orders')
      .set('Authorization', `Bearer ${mePartner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name).toBe('Mine');
  });

  it('GET /partner/orders rejects client role with 403', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/orders')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('GET /partner/orders/:id returns 404 for a deal owned by another partner', async () => {
    const mePartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const otherPartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 6101, clientUserId: client.id, partnerUserId: otherPartner.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/partner/orders/${order.id}`)
      .set('Authorization', `Bearer ${mePartner.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /partner/orders/:id returns 200 for owner', async () => {
    const mePartner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 6102, clientUserId: client.id, partnerUserId: mePartner.id },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/partner/orders/${order.id}`)
      .set('Authorization', `Bearer ${mePartner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
  });
});
