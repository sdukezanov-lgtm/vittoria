import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

const SECRET = 'test-webhook-secret-32-chars-xxxxxxx';

describe('AmoCRM Webhook (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get(AmocrmMockClient);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  beforeEach(() => mock.reset());
  afterEach(async () => {
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
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

  it('accepts a valid signed webhook and processes it via the queue', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead());

    const res = await postWebhook({ leads: { update: [{ id: 555 }] } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 1 });

    // Wait for queue to process. BullMQ workers run in the same process.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0].amocrmDealId).toBe(555);
  });
});
