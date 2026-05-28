import axios from 'axios';
import { SmscSmsProvider } from '../smsc-sms.provider';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    SMSC_LOGIN: 'acme',
    SMSC_PASSWORD: 'secret',
    SMSC_SENDER: '',
    SMSC_BASE_URL: 'https://smsc.test',
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

describe('SmscSmsProvider', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('posts to /sys/send.php and returns providerMessageId on success', async () => {
    mockedPost.mockResolvedValue({ data: { id: 12345, cnt: 1 } });
    const provider = new SmscSmsProvider(makeConfig());
    const res = await provider.send({ to: '+79991112233', text: 'Привет' });

    expect(res).toEqual({ providerMessageId: '12345' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toBe('https://smsc.test/sys/send.php');
    // body is URLSearchParams
    const params = body as URLSearchParams;
    expect(params.get('login')).toBe('acme');
    expect(params.get('psw')).toBe('secret');
    expect(params.get('phones')).toBe('+79991112233');
    expect(params.get('mes')).toBe('Привет');
    expect(params.get('fmt')).toBe('3');
    expect(params.get('charset')).toBe('utf-8');
  });

  it('omits sender when SMSC_SENDER is empty', async () => {
    mockedPost.mockResolvedValue({ data: { id: 1, cnt: 1 } });
    const provider = new SmscSmsProvider(makeConfig({ SMSC_SENDER: '' }));
    await provider.send({ to: '+79990000000', text: 'x' });
    const params = mockedPost.mock.calls[0][1] as URLSearchParams;
    expect(params.has('sender')).toBe(false);
  });

  it('includes sender when SMSC_SENDER is set', async () => {
    mockedPost.mockResolvedValue({ data: { id: 1, cnt: 1 } });
    const provider = new SmscSmsProvider(makeConfig({ SMSC_SENDER: 'VITTORIA' }));
    await provider.send({ to: '+79990000000', text: 'x' });
    const params = mockedPost.mock.calls[0][1] as URLSearchParams;
    expect(params.get('sender')).toBe('VITTORIA');
  });

  it('throws on SMSC error response', async () => {
    mockedPost.mockResolvedValue({ data: { error: 'authorize error', error_code: 2 } });
    const provider = new SmscSmsProvider(makeConfig());
    await expect(provider.send({ to: '+79990000000', text: 'x' })).rejects.toThrow(/2/);
  });

  it('propagates transport errors', async () => {
    mockedPost.mockRejectedValue(new Error('ETIMEDOUT'));
    const provider = new SmscSmsProvider(makeConfig());
    await expect(provider.send({ to: '+79990000000', text: 'x' })).rejects.toThrow(/ETIMEDOUT/);
  });
});
