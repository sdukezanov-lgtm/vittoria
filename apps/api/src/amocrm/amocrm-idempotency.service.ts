import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const TTL_SEC = 24 * 3600;

@Injectable()
export class AmocrmIdempotencyService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Returns true if eventId was not seen before (and marks it as seen for TTL_SEC).
   * Returns false if it was already seen.
   */
  async markIfNew(eventId: string): Promise<boolean> {
    const key = `amocrm:event:${eventId}`;
    const result = await this.redis.getClient().set(key, '1', 'EX', TTL_SEC, 'NX');
    return result === 'OK';
  }
}
