import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.factory';
import { startPostgres, stopPostgres } from './helpers/testcontainers-postgres';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuditService (e2e)', () => {
  let app: INestApplication;
  let audit: AuditService;
  let prisma: PrismaService;

  beforeAll(async () => {
    await startPostgres();
    app = await createTestApp();
    audit = app.get(AuditService);
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopPostgres();
  });

  it('persists an audit entry', async () => {
    await audit.record({ action: 'test.event', entity: 'Test', entityId: 'x1', after: { ok: true } });
    const rows = await prisma.auditLog.findMany({ where: { entity: 'Test', entityId: 'x1' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('test.event');
  });
});
