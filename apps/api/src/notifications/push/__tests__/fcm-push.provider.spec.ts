import axios from 'axios';
import { FcmPushProvider } from '../fcm-push.provider';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    FCM_PROJECT_ID: 'proj',
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

function makeTokenService() {
  return { getAccessToken: jest.fn().mockResolvedValue('test-token') } as never;
}

describe('FcmPushProvider.send', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('sends an android push and returns providerMessageId', async () => {
    mockedPost.mockResolvedValue({ data: { name: 'projects/proj/messages/m1' } });
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    const res = await provider.send({
      token: 'device-abc',
      platform: 'android',
      title: 'VITTORIA HOME',
      body: 'Заказ готов',
      data: { event: 'order.ready', orderId: 'o1' },
    });

    expect(res).toEqual({ providerMessageId: 'projects/proj/messages/m1' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = mockedPost.mock.calls[0];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/proj/messages:send');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
    expect(body.message.token).toBe('device-abc');
    expect(body.message.notification).toEqual({ title: 'VITTORIA HOME', body: 'Заказ готов' });
    expect(body.message.data).toEqual({ event: 'order.ready', orderId: 'o1' });
  });

  it('omits data when message.data is empty', async () => {
    mockedPost.mockResolvedValue({ data: { name: 'projects/proj/messages/m2' } });
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    await provider.send({ token: 'device-abc', platform: 'android', title: 't', body: 'b' });
    const body = mockedPost.mock.calls[0][1];
    expect(body.message.data).toBeUndefined();
  });

  it('throws for ios platform without calling FCM', async () => {
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    await expect(
      provider.send({ token: 'apns-tok', platform: 'ios', title: 't', body: 'b' }),
    ).rejects.toThrow(/Android only/);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('propagates FCM transport errors', async () => {
    mockedPost.mockRejectedValue(new Error('FCM 503'));
    const provider = new FcmPushProvider(makeConfig(), makeTokenService());
    await expect(
      provider.send({ token: 'device-abc', platform: 'android', title: 't', body: 'b' }),
    ).rejects.toThrow(/FCM 503/);
  });
});
