import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  // amoCRM authenticates via a secret in the URL (?token=...) and POSTs
  // application/x-www-form-urlencoded; supertest .type('form') serializes the
  // nested object with bracket notation (leads[update][0][id]=...), matching amoCRM.
  function postWebhook(body: object, token: string = SECRET) {
    return request(app.getHttpServer())
      .post(`/api/v1/amocrm/webhooks?token=${encodeURIComponent(token)}`)
      .type('form')
      .send(body);
  }

  it('rejects with 403 when the URL token is missing or wrong', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/v1/amocrm/webhooks')
      .type('form')
      .send({ leads: { update: [{ id: 1 }] } });
    expect(missing.status).toBe(403);

    const wrong = await postWebhook({ leads: { update: [{ id: 1 }] } }, 'wrong-token');
    expect(wrong.status).toBe(403);
  });

  it('accepts a valid webhook (status/stage change) and enqueues a job', async () => {
    // Per-run-unique id: the controller dedups deterministically by (kind:id)
    // with a Redis TTL, so a fixed id would be deduped on a re-run within the window.
    const id = Math.floor(Math.random() * 1e9);
    // amoCRM reports a stage change under leads[status].
    const res = await postWebhook({ leads: { status: [{ id, status_id: 86164758, pipeline_id: 10959102 }] } });
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
    // The controller hashes (kind:id) deterministically, so a redelivery of the
    // same event within the idempotency window is dropped (accepted: 0). Use a
    // per-run-unique id so the Redis dedup key is fresh on every test run.
    const id = Date.now() % 1_000_000;
    const a = await postWebhook({ leads: { update: [{ id }] } });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ accepted: 1 });
    const b = await postWebhook({ leads: { update: [{ id }] } });
    expect(b.status).toBe(200);
    expect(b.body).toEqual({ accepted: 0 });
  });
});
