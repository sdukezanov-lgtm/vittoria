import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';

type Check = 'ok' | 'fail';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('readyz')
  async readyz(): Promise<{ status: 'ok' | 'degraded'; checks: { db: Check; redis: Check } }> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { db, redis } };
  }

  private async checkDb(): Promise<Check> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'fail';
    }
  }

  private async checkRedis(): Promise<Check> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      return 'fail';
    }
  }
}
