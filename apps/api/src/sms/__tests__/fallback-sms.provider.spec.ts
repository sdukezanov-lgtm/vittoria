import { FallbackSmsProvider } from '../fallback-sms.provider';
import type { SmsProvider } from '../sms.types';

function provider(impl: SmsProvider['send']): SmsProvider {
  return { send: impl };
}

describe('FallbackSmsProvider', () => {
  it('uses the primary when it succeeds (fallback not called)', async () => {
    const fallbackSend = jest.fn();
    const sut = new FallbackSmsProvider(
      provider(async () => ({ providerMessageId: 'p-1' })),
      provider(fallbackSend),
    );
    const res = await sut.send({ to: '79990000000', text: 'hi' });
    expect(res.providerMessageId).toBe('p-1');
    expect(fallbackSend).not.toHaveBeenCalled();
  });

  it('falls back when the primary throws', async () => {
    const sut = new FallbackSmsProvider(
      provider(async () => { throw new Error('primary down'); }),
      provider(async () => ({ providerMessageId: 'f-1' })),
    );
    const res = await sut.send({ to: '79990000000', text: 'hi' });
    expect(res.providerMessageId).toBe('f-1');
  });

  it('rethrows when both fail', async () => {
    const sut = new FallbackSmsProvider(
      provider(async () => { throw new Error('primary down'); }),
      provider(async () => { throw new Error('fallback down'); }),
    );
    await expect(sut.send({ to: '79990000000', text: 'hi' })).rejects.toThrow(/fallback down/);
  });
});
