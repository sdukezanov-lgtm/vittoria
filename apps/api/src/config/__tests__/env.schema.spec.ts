import { envSchema } from '../env.schema';

describe('envSchema', () => {
  const valid = {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgresql://vittoria:vittoria@localhost:5432/vittoria_dev',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: '0123456789012345678901234567890123456789',
    JWT_ACCESS_TTL_SEC: '900',
    JWT_REFRESH_TTL_SEC: '2592000',
    OTP_TTL_SEC: '300',
    OTP_MAX_ATTEMPTS: '5',
    OTP_REQUEST_RATE_LIMIT_PER_MIN: '1',
  };

  it('parses a valid env', () => {
    const parsed = envSchema.parse(valid);
    expect(parsed.PORT).toBe(3000);
    expect(parsed.JWT_ACCESS_TTL_SEC).toBe(900);
  });

  it('rejects missing DATABASE_URL', () => {
    const rest = { ...valid } as Partial<typeof valid>;
    delete rest.DATABASE_URL;
    expect(() => envSchema.parse(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects short JWT_SECRET', () => {
    expect(() => envSchema.parse({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('defaults SMS_PROVIDER_MODE to dev with empty SMSC credentials', () => {
    const parsed = envSchema.parse({ ...valid });
    expect(parsed.SMS_PROVIDER_MODE).toBe('dev');
    expect(parsed.SMSC_LOGIN).toBe('');
    expect(parsed.SMSC_BASE_URL).toBe('https://smsc.ru');
  });

  it('accepts smsc mode with SMSC credentials', () => {
    const parsed = envSchema.parse({
      ...valid,
      SMS_PROVIDER_MODE: 'smsc',
      SMSC_LOGIN: 'acme',
      SMSC_PASSWORD: 'secret',
    });
    expect(parsed.SMS_PROVIDER_MODE).toBe('smsc');
    expect(parsed.SMSC_LOGIN).toBe('acme');
  });

  it('rejects smsc mode without SMSC credentials', () => {
    expect(() =>
      envSchema.parse({ ...valid, SMS_PROVIDER_MODE: 'smsc' }),
    ).toThrow(/SMSC/);
  });

  it('defaults PUSH_PROVIDER_MODE to dev with empty FCM credentials', () => {
    const parsed = envSchema.parse({ ...valid });
    expect(parsed.PUSH_PROVIDER_MODE).toBe('dev');
    expect(parsed.FCM_PROJECT_ID).toBe('');
  });

  it('accepts real push mode with FCM credentials', () => {
    const parsed = envSchema.parse({
      ...valid,
      PUSH_PROVIDER_MODE: 'real',
      FCM_PROJECT_ID: 'proj',
      FCM_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    expect(parsed.PUSH_PROVIDER_MODE).toBe('real');
    expect(parsed.FCM_PROJECT_ID).toBe('proj');
  });

  it('rejects real push mode without FCM credentials', () => {
    expect(() =>
      envSchema.parse({ ...valid, PUSH_PROVIDER_MODE: 'real' }),
    ).toThrow(/FCM/);
  });
});
