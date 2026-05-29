import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { SmsRuProvider } from '../smsru-sms.provider';

jest.mock('axios');

function configStub(): ConfigService {
  const values: Record<string, string> = { SMS_RU_API_ID: 'api-123', SMS_RU_BASE_URL: 'https://sms.ru' };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('SmsRuProvider', () => {
  beforeEach(() => jest.resetAllMocks());

  it('sends and returns the sms_id on status OK', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { status: 'OK', status_code: 100, sms: { '79990000000': { status: 'OK', status_code: 100, sms_id: 'X-1' } } },
    });
    const provider = new SmsRuProvider(configStub());
    const res = await provider.send({ to: '79990000000', text: 'hi' });
    expect(res.providerMessageId).toBe('X-1');
    const [url, body] = (axios.post as jest.Mock).mock.calls[0];
    expect(url).toContain('https://sms.ru/sms/send');
    const params = body as URLSearchParams;
    expect(params.get('api_id')).toBe('api-123');
    expect(params.get('to')).toBe('79990000000');
    expect(params.get('msg')).toBe('hi');
    expect(params.get('json')).toBe('1');
  });

  it('throws on ERROR status', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { status: 'ERROR', status_code: 200, status_text: 'bad' } });
    const provider = new SmsRuProvider(configStub());
    await expect(provider.send({ to: '79990000000', text: 'hi' })).rejects.toThrow(/SMS\.ru/);
  });
});
