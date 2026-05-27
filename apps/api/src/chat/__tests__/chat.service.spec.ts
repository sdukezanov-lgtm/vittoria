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

describe('ChatService.sendMessage', () => {
  const makePrisma = (overrides: Record<string, unknown> = {}) => ({
    chat: {
      findUnique: jest.fn().mockResolvedValue({
        id: CHAT_ID,
        orderId: ORDER_ID,
        order: { id: ORDER_ID, clientUserId: CLIENT_ID, contractNumber: 'C-100', productName: 'Kitchen' },
      }),
    },
    message: {
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'msg-new',
        chatId: data.chatId,
        senderUserId: data.senderUserId,
        senderRole: data.senderRole,
        text: data.text,
        attachments: [],
        readAt: null,
        redactedAt: null,
        createdAt: new Date(),
      })),
    },
    ...overrides,
  });

  it('admin sender → triggers notifications.send with preview', async () => {
    const prisma = makePrisma();
    const notifications = { send: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    await svc.sendMessage(
      CHAT_ID,
      { id: ADMIN_ID, role: 'admin' } as never,
      { text: 'Привет, готовы к встрече?' },
    );
    expect(notifications.send).toHaveBeenCalledWith(
      CLIENT_ID,
      'chat.reply.received',
      expect.objectContaining({
        orderId: ORDER_ID,
        chatId: CHAT_ID,
        contractNumber: 'C-100',
        preview: 'Привет, готовы к встрече?',
      }),
    );
  });

  it('admin sender → trims preview to 80 chars without line breaks', async () => {
    const prisma = makePrisma();
    const notifications = { send: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    const longText = 'A'.repeat(200) + '\nB';
    await svc.sendMessage(CHAT_ID, { id: ADMIN_ID, role: 'admin' } as never, { text: longText });
    const payload = notifications.send.mock.calls[0][2];
    expect(payload.preview.length).toBeLessThanOrEqual(80);
    expect(payload.preview).not.toContain('\n');
  });

  it('client sender → does NOT trigger notifications', async () => {
    const prisma = makePrisma();
    const notifications = { send: jest.fn() };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    await svc.sendMessage(
      CHAT_ID,
      { id: CLIENT_ID, role: 'client' } as never,
      { text: 'Здравствуйте' },
    );
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('notifications.send throws → sendMessage still succeeds (message saved)', async () => {
    const prisma = makePrisma();
    const notifications = { send: jest.fn().mockRejectedValue(new Error('queue down')) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    const result = await svc.sendMessage(
      CHAT_ID,
      { id: ADMIN_ID, role: 'admin' } as never,
      { text: 'Test' },
    );
    expect(result.id).toBe('msg-new');
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('client sending into chat not owned → 404', async () => {
    const prisma = makePrisma({
      chat: {
        findUnique: jest.fn().mockResolvedValue({
          id: CHAT_ID,
          orderId: ORDER_ID,
          order: { id: ORDER_ID, clientUserId: 'someone-else', contractNumber: null, productName: null },
        }),
      },
    });
    const notifications = { send: jest.fn() };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const svc = new ChatService(prisma as never, notifications as never, audit as never);
    await expect(
      svc.sendMessage(CHAT_ID, { id: CLIENT_ID, role: 'client' } as never, { text: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('ChatService.markRead', () => {
  it('marks only messages NOT sent by requester, up to cursor created_at', async () => {
    const cursorDate = new Date('2026-05-28T12:00:00Z');
    const prisma = {
      chat: {
        findUnique: jest.fn().mockResolvedValue({
          id: CHAT_ID,
          orderId: ORDER_ID,
          order: { id: ORDER_ID, clientUserId: CLIENT_ID },
        }),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue({ id: 'msg-cursor', chatId: CHAT_ID, createdAt: cursorDate }),
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
    };
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    const out = await svc.markRead(CHAT_ID, { id: CLIENT_ID, role: 'client' } as never, 'msg-cursor');
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        chatId: CHAT_ID,
        createdAt: { lte: cursorDate },
        senderUserId: { not: CLIENT_ID },
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
    expect(out).toEqual({ updated: 4 });
  });

  it('cursor message not found → 404', async () => {
    const prisma = {
      chat: {
        findUnique: jest.fn().mockResolvedValue({
          id: CHAT_ID,
          orderId: ORDER_ID,
          order: { id: ORDER_ID, clientUserId: CLIENT_ID },
        }),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
    };
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    await expect(
      svc.markRead(CHAT_ID, { id: CLIENT_ID, role: 'client' } as never, 'missing'),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

describe('ChatService.listAdminChats', () => {
  it('filters has_unread=true and counts only client-sent unread messages', async () => {
    const prisma = {
      chat: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: CHAT_ID,
            orderId: ORDER_ID,
            order: { id: ORDER_ID, contractNumber: 'C-100' },
            messages: [{ createdAt: new Date('2026-05-28T13:00:00Z') }],
            _count: { messages: 7 },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    const out = await svc.listAdminChats({ has_unread: true, page: 1, page_size: 20 });
    expect(prisma.chat.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { messages: { some: { senderRole: 'client', readAt: null } } },
      skip: 0,
      take: 20,
    }));
    expect(out.rows[0]).toMatchObject({
      chat_id: CHAT_ID,
      order_id: ORDER_ID,
      contract_number: 'C-100',
      unread_count: 7,
    });
    expect(out.total).toBe(1);
  });

  it('without has_unread returns all chats', async () => {
    const prisma = {
      chat: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new ChatService(prisma as never, { send: jest.fn() } as never, { record: jest.fn() } as never);
    await svc.listAdminChats({});
    expect(prisma.chat.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      skip: 0,
      take: 20,
    }));
  });
});
