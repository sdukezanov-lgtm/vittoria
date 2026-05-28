import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Commissions (e2e)', () => {
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
    await prisma.partnerCommission.deleteMany();
    await prisma.order.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  const seedOrder = async (clientId: string, dealId = 6001) =>
    prisma.order.create({
      data: { amocrmDealId: dealId, clientUserId: clientId, currentStage: 'production', progressPercent: 50 },
    });

  it('admin POST → PATCH(paid) sets paid_at; partner sees only own', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const partner = await seedUserWithToken(app, { role: 'partner', phone: '+79990001122' });
    const order = await seedOrder(client.id);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/commissions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ order_id: order.id, partner_user_id: partner.id, amount: 5000 });
    expect(created.status).toBe(201);
    expect(created.body.payout_status).toBe('pending');
    expect(created.body.amount).toBe('5000');

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/admin/commissions/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ payout_status: 'paid' });
    expect(patched.status).toBe(200);
    expect(patched.body.payout_status).toBe('paid');
    expect(patched.body.paid_at).not.toBeNull();

    const partnerView = await request(app.getHttpServer())
      .get('/api/v1/partner/commissions')
      .set('Authorization', `Bearer ${partner.accessToken}`);
    expect(partnerView.status).toBe(200);
    expect(partnerView.body.rows).toHaveLength(1);
    expect(partnerView.body.rows[0].partner_user_id).toBe(partner.id);
  });

  it('partner does not see other partners commissions', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const p1 = await seedUserWithToken(app, { role: 'partner', phone: '+79990002233' });
    const p2 = await seedUserWithToken(app, { role: 'partner', phone: '+79990003344' });
    const order = await seedOrder(client.id, 6002);
    await prisma.partnerCommission.create({
      data: { orderId: order.id, partnerUserId: p1.id, amount: 1000 },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/commissions')
      .set('Authorization', `Bearer ${p2.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
  });

  it('admin POST with non-partner user_id → 400', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await seedOrder(client.id, 6003);
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/commissions')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ order_id: order.id, partner_user_id: client.id, amount: 5000 });
    expect(res.status).toBe(400);
  });

  it('GET /partner/commissions returns 403 for admin', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .get('/api/v1/partner/commissions')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('POST /admin/commissions returns 403 for partner', async () => {
    const partner = await seedUserWithToken(app, { role: 'partner', phone: '+79990004455' });
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/commissions')
      .set('Authorization', `Bearer ${partner.accessToken}`)
      .send({ order_id: '00000000-0000-0000-0000-000000000001', partner_user_id: partner.id, amount: 100 });
    expect(res.status).toBe(403);
  });
});
