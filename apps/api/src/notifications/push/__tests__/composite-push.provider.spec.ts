import { CompositePushProvider } from '../composite-push.provider';
import type { PushMessage } from '../push.types';

function makeProvider(id: string) {
  return { send: jest.fn().mockResolvedValue({ providerMessageId: id }) };
}

const base: Omit<PushMessage, 'platform'> = { token: 't', title: 'x', body: 'y' };

describe('CompositePushProvider.send', () => {
  it('routes ios to apns', async () => {
    const fcm = makeProvider('fcm');
    const apns = makeProvider('apns');
    const composite = new CompositePushProvider(fcm as never, apns as never);
    const res = await composite.send({ ...base, platform: 'ios' });
    expect(res.providerMessageId).toBe('apns');
    expect(apns.send).toHaveBeenCalledTimes(1);
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('routes android to fcm', async () => {
    const fcm = makeProvider('fcm');
    const apns = makeProvider('apns');
    const composite = new CompositePushProvider(fcm as never, apns as never);
    const res = await composite.send({ ...base, platform: 'android' });
    expect(res.providerMessageId).toBe('fcm');
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(apns.send).not.toHaveBeenCalled();
  });
});
