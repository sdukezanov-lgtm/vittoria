import { NotificationsDedupService } from '../notifications.dedup.service';

describe('NotificationsDedupService', () => {
  const makeRedis = () => {
    const store = new Map<string, string>();
    return {
      set: jest.fn(async (key: string, value: string, _mode: string, _ttl: number, flag: string) => {
        if (flag === 'NX' && store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }),
    };
  };

  it('returns true on first call and false on duplicate within window', async () => {
    const redis = makeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsDedupService({ getClient: () => redis } as any);
    const first = await svc.shouldSend('u1', 'order.stage.changed', 'o1');
    const second = await svc.shouldSend('u1', 'order.stage.changed', 'o1');
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('treats different orders as independent', async () => {
    const redis = makeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new NotificationsDedupService({ getClient: () => redis } as any);
    await svc.shouldSend('u1', 'order.stage.changed', 'o1');
    const other = await svc.shouldSend('u1', 'order.stage.changed', 'o2');
    expect(other).toBe(true);
  });
});
