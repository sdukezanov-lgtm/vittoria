import { AmocrmIdempotencyService } from '../amocrm-idempotency.service';

describe('AmocrmIdempotencyService', () => {
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

  it('returns true on first occurrence and false on duplicate', async () => {
    const redis = makeRedis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AmocrmIdempotencyService({ getClient: () => redis } as any);
    const first = await svc.markIfNew('evt-1');
    const second = await svc.markIfNew('evt-1');
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
