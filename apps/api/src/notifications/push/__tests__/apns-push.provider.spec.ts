import { ApnsPushProvider } from '../apns-push.provider';

function makeConfig(overrides: Record<string, unknown> = {}) {
  const map: Record<string, unknown> = {
    APNS_BUNDLE_ID: 'app.vittoria.client',
    APNS_USE_SANDBOX: false,
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

function makeTokenService() {
  return { getProviderToken: jest.fn().mockReturnValue('tok') } as never;
}

function makeHttp2(response: { status: number; apnsId: string | null; body: string }) {
  return { post: jest.fn().mockResolvedValue(response) };
}

describe('ApnsPushProvider.send', () => {
  it('sends an ios push to prod host and returns apnsId', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'apns-1', body: '' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    const res = await provider.send({
      token: 'ios-device',
      platform: 'ios',
      title: 'VITTORIA HOME',
      body: 'Заказ готов',
      data: { event: 'order.ready', orderId: 'o1' },
    });

    expect(res).toEqual({ providerMessageId: 'apns-1' });
    expect(http2.post).toHaveBeenCalledTimes(1);
    const [host, deviceToken, headers, payload] = http2.post.mock.calls[0];
    expect(host).toBe('api.push.apple.com');
    expect(deviceToken).toBe('ios-device');
    expect(headers.authorization).toBe('bearer tok');
    expect(headers['apns-topic']).toBe('app.vittoria.client');
    expect(headers['apns-push-type']).toBe('alert');
    expect(payload.aps.alert).toEqual({ title: 'VITTORIA HOME', body: 'Заказ готов' });
    expect(payload.event).toBe('order.ready');
    expect(payload.orderId).toBe('o1');
  });

  it('uses sandbox host when APNS_USE_SANDBOX is true', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'apns-2', body: '' });
    const provider = new ApnsPushProvider(
      makeConfig({ APNS_USE_SANDBOX: true }),
      makeTokenService(),
      http2 as never,
    );
    await provider.send({ token: 't', platform: 'ios', title: 'x', body: 'y' });
    expect(http2.post.mock.calls[0][0]).toBe('api.sandbox.push.apple.com');
  });

  it('omits custom data when message.data is empty (only aps)', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'a', body: '' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    await provider.send({ token: 't', platform: 'ios', title: 'x', body: 'y' });
    const payload = http2.post.mock.calls[0][3];
    expect(Object.keys(payload)).toEqual(['aps']);
  });

  it('throws for android platform without calling http2', async () => {
    const http2 = makeHttp2({ status: 200, apnsId: 'a', body: '' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    await expect(
      provider.send({ token: 't', platform: 'android', title: 'x', body: 'y' }),
    ).rejects.toThrow(/iOS only/);
    expect(http2.post).not.toHaveBeenCalled();
  });

  it('throws with APNs reason on non-200 status', async () => {
    const http2 = makeHttp2({ status: 400, apnsId: null, body: '{"reason":"BadDeviceToken"}' });
    const provider = new ApnsPushProvider(makeConfig(), makeTokenService(), http2 as never);
    await expect(
      provider.send({ token: 't', platform: 'ios', title: 'x', body: 'y' }),
    ).rejects.toThrow(/BadDeviceToken/);
  });
});
