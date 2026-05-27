import { ChatService } from '../chat.service';

const ADMIN_ID = '00000000-0000-0000-0000-00000000aaaa';
const CLIENT_ID = '00000000-0000-0000-0000-00000000bbbb';
const ORDER_ID = '00000000-0000-0000-0000-000000000001';
const CHAT_ID = '00000000-0000-0000-0000-00000000cccc';

describe('ChatService.findOrCreateForOrder', () => {
  const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    order: {
      findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID, clientUserId: CLIENT_ID }),
    },
    chat: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: CHAT_ID, orderId: ORDER_ID, createdAt: new Date() }),
    },
    message: {
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  });

  const baseDeps = () => ({
    notifications: { send: jest.fn() },
    audit: { record: jest.fn().mockResolvedValue(undefined) },
  });

  it('creates a new chat if none exists for the order (admin)', async () => {
    const prisma = makePrisma();
    const { notifications, audit } = baseDeps();
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    const result = await svc.findOrCreateForOrder(ORDER_ID, { id: ADMIN_ID, role: 'admin' } as never);
    expect(prisma.chat.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { orderId: ORDER_ID },
    }));
    expect(result.id).toBe(CHAT_ID);
    expect(result.unread_count).toBe(0);
  });

  it('returns existing chat if one exists (client owner)', async () => {
    const prisma = makePrisma({
      chat: {
        findUnique: jest.fn().mockResolvedValue({ id: CHAT_ID, orderId: ORDER_ID, createdAt: new Date() }),
        create: jest.fn(),
      },
      message: { count: jest.fn().mockResolvedValue(3) },
    });
    const { notifications, audit } = baseDeps();
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    const result = await svc.findOrCreateForOrder(ORDER_ID, { id: CLIENT_ID, role: 'client' } as never);
    expect(prisma.chat.create).not.toHaveBeenCalled();
    expect(result.id).toBe(CHAT_ID);
    expect(result.unread_count).toBe(3);
  });

  it('throws NotFoundException when client requests a non-owned order', async () => {
    const prisma = makePrisma({
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID, clientUserId: 'someone-else' }),
      },
    });
    const { notifications, audit } = baseDeps();
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    await expect(
      svc.findOrCreateForOrder(ORDER_ID, { id: CLIENT_ID, role: 'client' } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws NotFoundException when order does not exist', async () => {
    const prisma = makePrisma({
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const { notifications, audit } = baseDeps();
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    await expect(
      svc.findOrCreateForOrder(ORDER_ID, { id: ADMIN_ID, role: 'admin' } as never),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('ChatService.listMessages', () => {
  const makePrisma = (messageFindMany: jest.Mock) => ({
    chat: {
      findUnique: jest.fn().mockResolvedValue({
        id: CHAT_ID,
        orderId: ORDER_ID,
        order: { id: ORDER_ID, clientUserId: CLIENT_ID },
      }),
    },
    message: {
      findUnique: jest.fn().mockImplementation(async ({ where }) =>
        where.id === 'cursor-msg'
          ? { id: 'cursor-msg', chatId: CHAT_ID, createdAt: new Date('2026-05-28T12:00:00Z') }
          : null,
      ),
      findMany: messageFindMany,
    },
  });

  it('returns messages without cursor, desc by createdAt, capped at default limit 50', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    const prisma = makePrisma(findMany);
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    await svc.listMessages(CHAT_ID, { id: ADMIN_ID, role: 'admin' } as never, {});
    expect(findMany).toHaveBeenCalledWith({
      where: { chatId: CHAT_ID },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('translates before=<id> into createdAt < cursor.createdAt', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma(findMany);
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    await svc.listMessages(CHAT_ID, { id: ADMIN_ID, role: 'admin' } as never, {
      before: 'cursor-msg',
      limit: 10,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { chatId: CHAT_ID, createdAt: { lt: new Date('2026-05-28T12:00:00Z') } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  });

  it('client viewing a chat that does not belong to them → 404', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma(findMany);
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    await expect(
      svc.listMessages(CHAT_ID, { id: 'wrong', role: 'client' } as never, {}),
    ).rejects.toMatchObject({ status: 404 });
  });
});
