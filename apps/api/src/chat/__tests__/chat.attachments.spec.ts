import { ChatService } from '../chat.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { StorageService } from '../../storage/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/types/auth-user';

function makeService(prisma: Partial<PrismaService>, storage: Partial<StorageService>) {
  const notifications = { send: jest.fn() } as unknown as NotificationsService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return new ChatService(prisma as PrismaService, notifications, audit, storage as StorageService);
}

const admin: AuthUser = { id: 'admin-1', role: 'admin', jti: 'test-jti' };

describe('ChatService attachments', () => {
  it('createAttachment stores the object and persists a row', async () => {
    const chat = { id: 'c1', orderId: 'o1', order: { clientUserId: 'cli-1' } };
    const created = { id: 'att-1', objectKey: 'chats/c1/x.jpg' };
    const prisma = {
      chat: { findUnique: jest.fn().mockResolvedValue(chat) },
      attachment: { create: jest.fn().mockResolvedValue(created) },
    } as unknown as PrismaService;
    const storage = { putObject: jest.fn().mockResolvedValue(undefined) } as unknown as StorageService;
    const svc = makeService(prisma, storage);

    const res = await svc.createAttachment('c1', admin, { buffer: Buffer.from([0xff, 0xd8, 0xff]), size: 3, mime: 'image/jpeg' });

    expect(storage.putObject).toHaveBeenCalled();
    expect(res).toEqual({ attachment_id: 'att-1', object_key: 'chats/c1/x.jpg' });
  });

  it('rejects an attachment that is too large', async () => {
    const chat = { id: 'c1', orderId: 'o1', order: { clientUserId: 'cli-1' } };
    const prisma = { chat: { findUnique: jest.fn().mockResolvedValue(chat) } } as unknown as PrismaService;
    const storage = { putObject: jest.fn() } as unknown as StorageService;
    const svc = makeService(prisma, storage);
    await expect(
      svc.createAttachment('c1', admin, { buffer: Buffer.alloc(11 * 1024 * 1024), size: 11 * 1024 * 1024, mime: 'image/jpeg' }),
    ).rejects.toThrow();
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
