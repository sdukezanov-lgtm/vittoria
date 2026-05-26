import { AuthService } from '../auth.service';

const makeDeps = () => {
  const prisma = {
    authCode: {
      create: jest.fn().mockResolvedValue({ id: 'c1', phone: '+79991234567', expiresAt: new Date(Date.now() + 300_000) }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const sms = { send: jest.fn().mockResolvedValue({ providerMessageId: 'p1' }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  const config = {
    get: jest.fn((k: string) => {
      if (k === 'OTP_TTL_SEC') return 300;
      if (k === 'OTP_REQUEST_RATE_LIMIT_PER_MIN') return 1;
      throw new Error(`unknown key ${k}`);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { prisma, sms, audit, config };
};

describe('AuthService.requestCode (unit)', () => {
  it('creates a hashed code, sends SMS, records audit', async () => {
    const { prisma, sms, audit, config } = makeDeps();
    const svc = new AuthService(prisma, sms, audit, config);

    const res = await svc.requestCode('+79991234567');

    expect(res.retryAfterSec).toBe(60);
    expect(prisma.authCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '+79991234567' }),
      }),
    );
    const createdData = prisma.authCode.create.mock.calls[0][0].data;
    expect(createdData.codeHash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+79991234567', text: expect.stringMatching(/\d{4}/) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.code.requested', entity: 'AuthCode' }),
    );
  });

  it('rejects when a recent code was already issued', async () => {
    const { prisma, sms, audit, config } = makeDeps();
    prisma.authCode.findFirst.mockResolvedValue({
      id: 'c0',
      phone: '+79991234567',
      createdAt: new Date(), // just now
    });

    const svc = new AuthService(prisma, sms, audit, config);
    await expect(svc.requestCode('+79991234567')).rejects.toThrow(/rate/i);
    expect(sms.send).not.toHaveBeenCalled();
  });
});
