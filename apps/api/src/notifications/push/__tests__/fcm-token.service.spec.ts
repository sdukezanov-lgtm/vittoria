import axios from 'axios';
import { generateKeyPairSync } from 'node:crypto';
import { FcmTokenService } from '../fcm-token.service';

jest.mock('axios');
const mockedPost = axios.post as jest.Mock;

// Generate a real RSA keypair so JWT signing actually works (no crypto mocking).
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    FCM_PROJECT_ID: 'proj',
    FCM_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: privatePem,
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

describe('FcmTokenService.getAccessToken', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('signs a JWT and exchanges it for an access token', async () => {
    mockedPost.mockResolvedValue({ data: { access_token: 'ya29.test', expires_in: 3600 } });
    const svc = new FcmTokenService(makeConfig());
    const token = await svc.getAccessToken();

    expect(token).toBe('ya29.test');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockedPost.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const params = body as URLSearchParams;
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = params.get('assertion') as string;
    // JWT has 3 dot-separated segments
    expect(assertion.split('.')).toHaveLength(3);
  });

  it('caches the token across calls (one token exchange)', async () => {
    mockedPost.mockResolvedValue({ data: { access_token: 'ya29.cached', expires_in: 3600 } });
    const svc = new FcmTokenService(makeConfig());
    const t1 = await svc.getAccessToken();
    const t2 = await svc.getAccessToken();
    expect(t1).toBe('ya29.cached');
    expect(t2).toBe('ya29.cached');
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('propagates token-exchange transport errors', async () => {
    mockedPost.mockRejectedValue(new Error('ECONNREFUSED'));
    const svc = new FcmTokenService(makeConfig());
    await expect(svc.getAccessToken()).rejects.toThrow(/ECONNREFUSED/);
  });
});
