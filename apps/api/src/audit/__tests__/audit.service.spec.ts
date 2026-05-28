import { AuditService } from '../audit.service';

describe('AuditService (unit)', () => {
  it('builds the payload with all fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } } as any;
    const svc = new AuditService(prisma);
    void svc.record({
      actorUserId: 'u1',
      action: 'auth.code.requested',
      entity: 'AuthCode',
      entityId: 'c1',
      after: { phone: '+7' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'u1',
        action: 'auth.code.requested',
        entity: 'AuthCode',
        entityId: 'c1',
      }),
    });
  });
});

describe('AuditService.list', () => {
  it('filters by entity and actor, paginates, orders desc', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new AuditService(prisma as never);
    const res = await svc.list({ entity: 'Order', actor: 'actor-1', page: 1, page_size: 50 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { entity: 'Order', actorUserId: 'actor-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 50,
    }));
    expect(res.total).toBe(1);
  });

  it('lists all when no filters', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new AuditService(prisma as never);
    await svc.list({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
    }));
  });
});
