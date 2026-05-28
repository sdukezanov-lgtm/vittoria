import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// Short window: long enough to collapse amoCRM webhook redeliveries of the same
// event (retries arrive within minutes), short enough that a genuinely distinct
// later update to the same entity is not suppressed (and the 15-min failsafe sync
// cron reconciles anything missed inside the window).
const TTL_SEC = 10 * 60;

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
