import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const TTL_SEC = 60;

@Injectable()
export class NotificationsDedupService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Returns true if a notification for (userId, event, entityId) was NOT seen in the last TTL_SEC.
   * Returns false if it was — caller should skip sending.
   */
  async shouldSend(userId: string, event: string, entityId: string): Promise<boolean> {
    const key = `notif:dedup:${userId}:${event}:${entityId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.redis.getClient() as any).set(key, '1', 'EX', 'sec', TTL_SEC, 'NX');
    return result === 'OK';
  }
}
