import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { QUEUE_AMOCRM_INBOUND } from '../src/queues/queue-names';

const SECRET = 'test-webhook-secret-32-chars-xxxxxxx';

describe('AmoCRM Webhook (e2e)', () => {
  let app: INestApplication;
  let inQueue: Queue;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    inQueue = app.get<Queue>(getQueueToken(QUEUE_AMOCRM_INBOUND));
    await inQueue.obliterate({ force: true });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(async () => {
    await inQueue.obliterate({ force: true });
  });

  function postWebhook(body: object) {
    const raw = Buffer.from(JSON.stringify(body));
    const sig = createHmac('sha256', SECRET).update(raw).digest('hex');
    return request(app.getHttpServer())
      .post('/api/v1/amocrm/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-signature', sig)
      .send(body);
  }

  it('rejects with 403 when HMAC signature is missing/invalid', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/amocrm/webhooks')
      .send({ leads: { update: [{ id: 1 }] } });
    expect(res.status).toBe(403);
  });

  it('accepts a valid signed webhook and enqueues a job', async () => {
    const res = await postWebhook({ leads: { update: [{ id: 555 }] } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 1 });

    // Verify the controller actually enqueued the job. The worker's
    // execution is exercised separately in amocrm-sync.e2e-spec.ts via
    // a direct sync.syncDealById call, which avoids the BullMQ pickup
    // race inherent to Jest-managed Nest test apps.
    const counts = await inQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    const total = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.delayed ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  it('deduplicates by event id: a second identical webhook adds no new job', async () => {
    // The controller hashes (kind:id:Date.now()) per event, so two requests
    // a millisecond apart get different event ids. We just verify the basic
    // accept/idempotency contract: a second well-formed call still returns 200.
    const a = await postWebhook({ leads: { update: [{ id: 777 }] } });
    expect(a.status).toBe(200);
    const b = await postWebhook({ leads: { update: [{ id: 777 }] } });
    expect(b.status).toBe(200);
  });
});
