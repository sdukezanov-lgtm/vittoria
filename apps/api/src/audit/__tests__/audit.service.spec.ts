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
