import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { QUEUE_NOTIFICATIONS } from '../src/queues/queue-names';
import { seedUserWithToken } from './helpers/auth-test-helpers';

describe('Notifications pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifQueue: Queue;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notifQueue = app.get<Queue>(getQueueToken(QUEUE_NOTIFICATIONS));
    await notifQueue.obliterate({ force: true });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(async () => {
    await notifQueue.obliterate({ force: true });
  });
  afterEach(async () => {
    await prisma.orderStageHistory.deleteMany();
    await prisma.order.deleteMany();
    await prisma.pushToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('admin PATCH /admin/orders/:id/progress with stage change enqueues a notification', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 7001, clientUserId: client.id, currentStage: 'detailing', progressPercent: 20 },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'production', progress_percent: 40 });
    expect(res.status).toBe(200);

    const counts = await notifQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.delayed ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  it('admin PATCH that only changes progress < 10 does NOT enqueue a notification', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: { amocrmDealId: 7002, clientUserId: client.id, currentStage: 'production', progressPercent: 50 },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ progress_percent: 55 });
    expect(res.status).toBe(200);

    const counts = await notifQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.delayed ?? 0);
    expect(total).toBe(0);
  });

  it('admin PATCH that moves to ready_for_delivery enqueues a critical notification', async () => {
    const admin = await seedUserWithToken(app, { role: 'admin', phone: null });
    const client = await seedUserWithToken(app, { role: 'client' });
    const order = await prisma.order.create({
      data: {
        amocrmDealId: 7003,
        clientUserId: client.id,
        currentStage: 'completeness_check',
        progressPercent: 95,
      },
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/progress`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ stage: 'ready_for_delivery', progress_percent: 100 });
    expect(res.status).toBe(200);

    const jobs = await notifQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0]?.opts.delay ?? 0).toBe(0);
  });
});
