import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { PrismaService } from '../src/prisma/prisma.service';
import { AmocrmMockClient } from '../src/amocrm/amocrm-mock.client';
import { AMOCRM_CLIENT } from '../src/amocrm/amocrm.types';
import { AmocrmFailsafeService } from '../src/amocrm/amocrm-failsafe.service';
import { sampleContact, sampleLead } from './helpers/amocrm-fixtures';

describe('AmocrmFailsafeService (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mock: AmocrmMockClient;
  let failsafe: AmocrmFailsafeService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mock = app.get<AmocrmMockClient>(AMOCRM_CLIENT);
    failsafe = app.get(AmocrmFailsafeService);
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

  it('pulls updated leads and syncs each one', async () => {
    mock.seedContact(sampleContact);
    mock.seedLead(sampleLead());

    const result = await failsafe.run();
    expect(result.checked).toBe(1);
    expect(result.synced).toBe(1);

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
  });
});
