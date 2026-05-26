import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';
import type { Env } from '../../config/env.schema';

describe('RedisService (unit)', () => {
  it('uses REDIS_URL from config', () => {
    const config = {
      get: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService<Env, true>;
    const svc = new RedisService(config);
    expect(() => svc.onModuleInit()).not.toThrow();
    void svc.onModuleDestroy();
  });
});
