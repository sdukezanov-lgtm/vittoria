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
});
