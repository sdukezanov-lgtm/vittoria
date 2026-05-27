import { OrdersService } from '../orders.service';

describe('OrdersService.updateProgress (unit)', () => {
  const makeDeps = () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord1',
          amocrmDealId: 555,
          currentStage: 'detailing',
          progressPercent: 10,
          lastAdminComment: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      orderStageHistory: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const outQueue = { add: jest.fn().mockResolvedValue({}) };
    return { prisma, audit, outQueue };
  };

  it('updates order, writes history, enqueues outbound job', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new OrdersService(prisma, audit as any, outQueue as any);
    await svc.updateProgress('ord1', { stage: 'production', progressPercent: 50, actorUserId: 'admin1' });

    expect(prisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ord1' },
      data: expect.objectContaining({ currentStage: 'production', progressPercent: 50 }),
    }));
    expect(prisma.orderStageHistory.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'order.progress.updated' }));
    expect(outQueue.add).toHaveBeenCalledWith(
      'push',
      expect.objectContaining({ amocrmDealId: 555, stage: 'production', progressPercent: 50 }),
      expect.any(Object),
    );
  });
});

describe('OrdersService read methods (unit)', () => {
  const makeDeps = () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: 'o1' }]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      orderStageHistory: {
        findMany: jest.fn().mockResolvedValue([{ id: 'h1' }]),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const audit = { record: jest.fn() };
    const outQueue = { add: jest.fn() };
    return { prisma, audit, outQueue };
  };

  it('listForClient filters by clientUserId', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new OrdersService(prisma, audit as any, outQueue as any);
    await svc.listForClient('u1');
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { clientUserId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('listAll applies search + stage filters and paginates', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new OrdersService(prisma, audit as any, outQueue as any);
    const result = await svc.listAll({ search: 'kit', stage: 'production', page: 2, pageSize: 5 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ currentStage: 'production', OR: expect.any(Array) }),
      skip: 5,
      take: 5,
    }));
    expect(result.total).toBe(1);
  });

  it('findByIdForClient scopes the lookup', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new OrdersService(prisma, audit as any, outQueue as any);
    await svc.findByIdForClient('o1', 'u1');
    expect(prisma.order.findFirst).toHaveBeenCalledWith({ where: { id: 'o1', clientUserId: 'u1' } });
  });

  it('getHistory orders by changedAt desc', async () => {
    const { prisma, audit, outQueue } = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new OrdersService(prisma, audit as any, outQueue as any);
    await svc.getHistory('o1');
    expect(prisma.orderStageHistory.findMany).toHaveBeenCalledWith({
      where: { orderId: 'o1' },
      orderBy: { changedAt: 'desc' },
    });
  });
});
