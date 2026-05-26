import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

describe('RedisService (unit)', () => {
  it('uses REDIS_URL from config', () => {
    const config = { get: jest.fn().mockReturnValue('redis://localhost:6379') } as unknown as ConfigService;
    const svc = new RedisService(config);
    expect(() => svc.onModuleInit()).not.toThrow();
    void svc.onModuleDestroy();
  });
});
