import { AmocrmWebhookGuard } from '../amocrm-webhook.guard';
import type { AmocrmConfig } from '../amocrm.config';

const secret = 'test-webhook-secret-32-chars-xxxxxxx';

const makeCtx = (query: Record<string, unknown>, ip = '127.0.0.1') => ({
  switchToHttp: () => ({
    getRequest: () => ({ query, ip }),
  }),
});

const makeConfig = (overrides: Partial<AmocrmConfig> = {}): AmocrmConfig =>
  ({
    webhookSecret: secret,
    webhookIpAllowlist: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('AmocrmWebhookGuard', () => {
  it('passes when the URL token matches the secret', () => {
    const guard = new AmocrmWebhookGuard(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(guard.canActivate(makeCtx({ token: secret }) as any)).toBe(true);
  });

  it('denies when the token is wrong', () => {
    const guard = new AmocrmWebhookGuard(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(guard.canActivate(makeCtx({ token: 'nope' }) as any)).toBe(false);
  });

  it('denies when the token is missing', () => {
    const guard = new AmocrmWebhookGuard(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(guard.canActivate(makeCtx({}) as any)).toBe(false);
  });

  it('denies when an IP allowlist is set and the request IP is not in it (token still correct)', () => {
    const guard = new AmocrmWebhookGuard(makeConfig({ webhookIpAllowlist: ['10.0.0.1'] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(guard.canActivate(makeCtx({ token: secret }, '127.0.0.1') as any)).toBe(false);
  });

  it('passes when the IP is in the allowlist and the token matches', () => {
    const guard = new AmocrmWebhookGuard(makeConfig({ webhookIpAllowlist: ['127.0.0.1'] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(guard.canActivate(makeCtx({ token: secret }, '127.0.0.1') as any)).toBe(true);
  });
});
