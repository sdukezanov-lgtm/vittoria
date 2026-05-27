import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Chat (e2e)', () => {
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
    await prisma.message.deleteMany();
    await prisma.chat.deleteMany();
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.pushToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  const seedOrder = async (clientId: string, dealId = 8001) =>
    prisma.order.create({
      data: {
        amocrmDealId: dealId,
        clientUserId: clientId,
        currentStage: 'production',
        progressPercent: 40,
        contractNumber: `C-${dealId}`,
      },
    });

  it('GET /orders/:id/chat creates a chat for client owner and is idempotent', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await seedOrder(client.id);

    const res1 = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body.id).toBeDefined();
    expect(res1.body.order_id).toBe(order.id);
    expect(res1.body.unread_count).toBe(0);

    const res2 = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(res1.body.id);
  });

  it("GET /orders/:id/chat returns 404 for non-owner client", async () => {
    const owner = await seedUserWithToken(app, { role: 'client' });
    const intruder = await seedUserWithToken(app, { role: 'client' });
    const order = await seedOrder(owner.id, 8002);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${intruder.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('GET /orders/:id/chat returns 403 for partner', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const partner = await seedUserWithToken(app, { role: 'partner', phone: null });
    const order = await seedOrder(client.id, 8003);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${partner.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('POST /chats/:id/messages stores text from client and admin', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const order = await seedOrder(client.id, 8004);
    const { body: chat } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);

    const r1 = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: 'Здравствуйте' });
    expect(r1.status).toBe(201);
    expect(r1.body.sender_role).toBe('client');

    const r2 = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ text: 'Добрый день!' });
    expect(r2.status).toBe(201);
    expect(r2.body.sender_role).toBe('admin');
  });

  it('POST /chats/:id/messages rejects empty text with 400', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await seedOrder(client.id, 8005);
    const { body: chat } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: '' });
    expect(res.status).toBe(400);
  });

  it('GET /chats/:id/messages applies before=<id> cursor', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await seedOrder(client.id, 8006);
    const { body: chat } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);

    const m1 = await prisma.message.create({
      data: { chatId: chat.id, senderUserId: client.id, senderRole: 'client', text: 'one',
              createdAt: new Date('2026-05-28T10:00:00Z') },
    });
    const m2 = await prisma.message.create({
      data: { chatId: chat.id, senderUserId: client.id, senderRole: 'client', text: 'two',
              createdAt: new Date('2026-05-28T11:00:00Z') },
    });
    await prisma.message.create({
      data: { chatId: chat.id, senderUserId: client.id, senderRole: 'client', text: 'three',
              createdAt: new Date('2026-05-28T12:00:00Z') },
    });

    const all = await request(app.getHttpServer())
      .get(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(all.status).toBe(200);
    expect(all.body.rows).toHaveLength(3);

    const partial = await request(app.getHttpServer())
      .get(`/api/v1/chats/${chat.id}/messages?before=${m2.id}`)
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(partial.status).toBe(200);
    expect(partial.body.rows).toHaveLength(1);
    expect(partial.body.rows[0].id).toBe(m1.id);
  });

  it('PATCH /chats/:id/read marks only foreign messages, is idempotent', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const order = await seedOrder(client.id, 8007);
    const { body: chat } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);

    const own = await prisma.message.create({
      data: { chatId: chat.id, senderUserId: client.id, senderRole: 'client', text: 'mine' },
    });
    const foreign = await prisma.message.create({
      data: { chatId: chat.id, senderUserId: admin.id, senderRole: 'admin', text: 'theirs' },
    });

    const r1 = await request(app.getHttpServer())
      .patch(`/api/v1/chats/${chat.id}/read`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ up_to_message_id: foreign.id });
    expect(r1.status).toBe(200);
    expect(r1.body.updated).toBe(1);

    const r2 = await request(app.getHttpServer())
      .patch(`/api/v1/chats/${chat.id}/read`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ up_to_message_id: foreign.id });
    expect(r2.body.updated).toBe(0);

    const ownAfter = await prisma.message.findUnique({ where: { id: own.id } });
    expect(ownAfter?.readAt).toBeNull();
    const foreignAfter = await prisma.message.findUnique({ where: { id: foreign.id } });
    expect(foreignAfter?.readAt).not.toBeNull();
  });

  it('GET /admin/chats?has_unread=true lists only chats with unread client messages', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const c1 = await seedUserWithToken(app, { role: 'client' });
    const c2 = await seedUserWithToken(app, { role: 'client' });
    const o1 = await seedOrder(c1.id, 8008);
    const o2 = await seedOrder(c2.id, 8009);
    const { body: chat1 } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${o1.id}/chat`)
      .set('Authorization', `Bearer ${c1.accessToken}`);
    const { body: chat2 } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${o2.id}/chat`)
      .set('Authorization', `Bearer ${c2.accessToken}`);

    await prisma.message.create({
      data: { chatId: chat1.id, senderUserId: c1.id, senderRole: 'client', text: 'hi' },
    });
    await prisma.message.create({
      data: { chatId: chat2.id, senderUserId: admin.id, senderRole: 'admin', text: 'hi' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/chats?has_unread=true')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].chat_id).toBe(chat1.id);
    expect(res.body.rows[0].unread_count).toBe(1);
  });

  it('GET /admin/chats returns 403 for client', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/chats')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });
});
