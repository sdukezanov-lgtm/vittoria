import { CommissionsService } from '../commissions.service';

const ORDER_ID = '00000000-0000-0000-0000-000000000001';
const PARTNER_ID = '00000000-0000-0000-0000-0000000000p1';
const COMMISSION_ID = '00000000-0000-0000-0000-0000000000c1';

describe('CommissionsService.create', () => {
  const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    order: { findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID }) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: PARTNER_ID, role: 'partner' }) },
    partnerCommission: {
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: COMMISSION_ID,
        orderId: data.orderId,
        partnerUserId: data.partnerUserId,
        amount: data.amount,
        payoutStatus: 'pending',
        paidAt: null,
        createdAt: new Date(),
      })),
    },
    ...overrides,
  });

  it('creates a commission for a valid partner', async () => {
    const prisma = makePrisma();
    const svc = new CommissionsService(prisma as never);
    const c = await svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 });
    expect(prisma.partnerCommission.create).toHaveBeenCalledWith({
      data: { orderId: ORDER_ID, partnerUserId: PARTNER_ID, amount: 5000 },
    });
    expect(c.id).toBe(COMMISSION_ID);
  });

  it('throws 404 when order does not exist', async () => {
    const prisma = makePrisma({ order: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new CommissionsService(prisma as never);
    await expect(
      svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when partner user is not a partner', async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue({ id: PARTNER_ID, role: 'client' }) },
    });
    const svc = new CommissionsService(prisma as never);
    await expect(
      svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when partner user does not exist', async () => {
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new CommissionsService(prisma as never);
    await expect(
      svc.create({ order_id: ORDER_ID, partner_user_id: PARTNER_ID, amount: 5000 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('CommissionsService.updateStatus', () => {
  const makePrisma = () => ({
    partnerCommission: {
      findUnique: jest.fn().mockResolvedValue({ id: COMMISSION_ID }),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: COMMISSION_ID,
        orderId: ORDER_ID,
        partnerUserId: PARTNER_ID,
        amount: '5000',
        payoutStatus: data.payoutStatus,
        paidAt: data.paidAt,
        createdAt: new Date(),
      })),
    },
  });

  it('sets paidAt when status becomes paid', async () => {
    const prisma = makePrisma();
    const svc = new CommissionsService(prisma as never);
    await svc.updateStatus(COMMISSION_ID, 'paid');
    const call = prisma.partnerCommission.update.mock.calls[0][0];
    expect(call.data.payoutStatus).toBe('paid');
    expect(call.data.paidAt).toBeInstanceOf(Date);
  });

  it('clears paidAt when status is not paid', async () => {
    const prisma = makePrisma();
    const svc = new CommissionsService(prisma as never);
    await svc.updateStatus(COMMISSION_ID, 'approved');
    const call = prisma.partnerCommission.update.mock.calls[0][0];
    expect(call.data.payoutStatus).toBe('approved');
    expect(call.data.paidAt).toBeNull();
  });

  it('throws 404 when commission not found', async () => {
    const prisma = makePrisma();
    prisma.partnerCommission.findUnique = jest.fn().mockResolvedValue(null);
    const svc = new CommissionsService(prisma as never);
    await expect(svc.updateStatus(COMMISSION_ID, 'paid')).rejects.toMatchObject({ status: 404 });
  });
});

describe('CommissionsService list', () => {
  it('listForPartner scopes by partnerUserId', async () => {
    const prisma = {
      partnerCommission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      },
    };
    const svc = new CommissionsService(prisma as never);
    await svc.listForPartner(PARTNER_ID, {});
    expect(prisma.partnerCommission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerUserId: PARTNER_ID },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('listForPartner adds payoutStatus filter', async () => {
    const prisma = {
      partnerCommission: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new CommissionsService(prisma as never);
    await svc.listForPartner(PARTNER_ID, { payout_status: 'paid' });
    expect(prisma.partnerCommission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerUserId: PARTNER_ID, payoutStatus: 'paid' },
    }));
  });

  it('listAdmin paginates and filters', async () => {
    const prisma = {
      partnerCommission: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new CommissionsService(prisma as never);
    const res = await svc.listAdmin({ partner_user_id: PARTNER_ID, page: 1, page_size: 20 });
    expect(prisma.partnerCommission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerUserId: PARTNER_ID },
      skip: 0,
      take: 20,
    }));
    expect(res.total).toBe(1);
  });
});
