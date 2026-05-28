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

describe('Notification Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let notifQueue: Queue;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    notifQueue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
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
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET /admin/notification-templates returns the 4 seeded templates', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(4);
    const events = res.body.rows.map((r: { event: string }) => r.event).sort();
    expect(events).toEqual([
      'chat.reply.received',
      'order.progress.changed',
      'order.ready',
      'order.stage.changed',
    ]);
  });

  it('PATCH updates the body', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .patch('/api/v1/admin/notification-templates/order.ready')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: '{{order}} ГОТОВ!' });
    expect(res.status).toBe(200);
    expect(res.body.body).toBe('{{order}} ГОТОВ!');
    const stored = await prisma.notificationTemplate.findUnique({ where: { event: 'order.ready' } });
    expect(stored?.body).toBe('{{order}} ГОТОВ!');
  });

  it('PATCH unknown event → 404', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const res = await request(app.getHttpServer())
      .patch('/api/v1/admin/notification-templates/bogus.event')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'x' });
    expect(res.status).toBe(404);
  });

  it('GET returns 403 for non-admin', async () => {
    const client = await seedUserWithToken(app, { role: 'client' });
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('regression: admin order PATCH dispatches a job rendered from the (edited) DB template', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 6100, clientUserId: client.id, currentStage: 'detailing', progressPercent: 20, contractNumber: 'C-RGR' },
    });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/notification-templates/order.stage.changed')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'ИЗМЕНЕНО {{order}} → {{stageLabel}}' });

    const patch = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'production', progress_percent: 40 });
    expect(patch.status).toBe(200);

    const jobs = await notifQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    expect(jobs.length).toBeGreaterThan(0);
    expect((jobs[0]?.data as { event?: string }).event).toBe('order.stage.changed');

    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
  });
});
