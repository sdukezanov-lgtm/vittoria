import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { QUEUE_NOTIFICATIONS } from '../src/queues/queue-names';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Chat notifications pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifQueue: Queue;
  let redis: RedisService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    notifQueue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    await notifQueue.obliterate({ force: true });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(async () => {
    await notifQueue.obliterate({ force: true });
    const client = redis.getClient();
    const keys = await client.keys('notif:dedup:*');
    if (keys.length > 0) await client.del(...keys);
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

  const prepare = async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const order = await prisma.order.create({
      data: {
        amocrmDealId: 9001 + Math.floor(Math.random() * 999),
        clientUserId: client.id,
        currentStage: 'production',
        progressPercent: 50,
        contractNumber: 'C-NOTIF',
      },
    });
    const { body: chat } = await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}/chat`)
      .set('Authorization', `Bearer ${client.accessToken}`);
    return { client, admin, order, chat };
  };

  it('admin POST a message → enqueues chat.reply.received notification', async () => {
    const { admin, chat } = await prepare();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ text: 'Здравствуйте' });
    expect(res.status).toBe(201);

    const jobs = await notifQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    expect(jobs.length).toBeGreaterThan(0);
    const jobData = jobs[0]?.data as { event?: string };
    expect(jobData?.event).toBe('chat.reply.received');
  });

  it('client POST a message → notifications queue stays empty', async () => {
    const { client, chat } = await prepare();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({ text: 'Привет' });
    expect(res.status).toBe(201);

    const counts = await notifQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.delayed ?? 0);
    expect(total).toBe(0);
  });

  it('two admin POSTs in <60s → only one notification enqueued (dedup)', async () => {
    const { admin, chat } = await prepare();

    await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ text: 'first' });
    await request(app.getHttpServer())
      .post(`/api/v1/chats/${chat.id}/messages`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ text: 'second' });

    const jobs = await notifQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    expect(jobs.length).toBe(1);
  });
});
