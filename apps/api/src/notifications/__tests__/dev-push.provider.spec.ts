import { Logger } from '@nestjs/common';
import { DevPushProvider } from '../push/dev-push.provider';

describe('DevPushProvider', () => {
  it('logs the message and returns a providerMessageId', async () => {
    const provider = new DevPushProvider();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const res = await provider.send({
      token: 'fcm-abc-123',
      platform: 'android',
      title: 'VITTORIA HOME',
      body: 'Test',
    });
    expect(res.providerMessageId).toMatch(/^dev-push-/);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('android'));
    spy.mockRestore();
  });
});
