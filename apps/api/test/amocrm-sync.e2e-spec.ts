import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { AmocrmSyncService } from '../src/amocrm/amocrm-sync.service';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

describe('AmocrmSyncService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;
  let sync: AmocrmSyncService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get(AmocrmMockClient);
    sync = app.get(AmocrmSyncService);
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

  it('creates a User and an Order from AmoCRM lead+contact', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead());

    const orderId = await sync.syncDealById(555);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.amocrmDealId).toBe(555);
    expect(order.currentStage).toBe('production');
    expect(order.progressPercent).toBe(40);

    const user = await prisma.user.findUniqueOrThrow({ where: { phone: '+79991234567' } });
    expect(user.amocrmContactId).toBe(777);
  });

  it('updates an existing Order on second sync (idempotent)', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead({ custom_fields_values: [{ field_id: 1002, values: [{ value: 20 }] }] }));
    await sync.syncDealById(555);

    mock.seedLead(sampleLead({ custom_fields_values: [{ field_id: 1002, values: [{ value: 75 }] }] }));
    await sync.syncDealById(555);

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0].progressPercent).toBe(75);
    expect(orders[0].version).toBe(1); // incremented once
  });
});
