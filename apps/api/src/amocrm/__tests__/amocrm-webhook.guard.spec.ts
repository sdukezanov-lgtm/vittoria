import { createHmac } from 'node:crypto';
import { AmocrmWebhookGuard } from '../amocrm-webhook.guard';
import type { AmocrmConfig } from '../amocrm.config';

const makeCtx = (rawBody: Buffer, headers: Record<string, string>, ip = '127.0.0.1') => ({
  switchToHttp: () => ({
    getRequest: () => ({ rawBody, headers, ip }),
  }),
});

const secret = 'test-webhook-secret-32-chars-xxxxxxx';
const sign = (body: Buffer) => createHmac('sha256', secret).update(body).digest('hex');

const makeConfig = (overrides: Partial<AmocrmConfig> = {}): AmocrmConfig =>
  ({
    webhookSecret: secret,
    webhookIpAllowlist: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('AmocrmWebhookGuard', () => {
  it('passes when HMAC matches and IP allowlist is empty', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const guard = new AmocrmWebhookGuard(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx(body, { 'x-signature': sign(body) }) as any;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when HMAC is wrong', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const guard = new AmocrmWebhookGuard(makeConfig());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx(body, { 'x-signature': 'deadbeef' }) as any;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies when IP is not in allowlist', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const guard = new AmocrmWebhookGuard(makeConfig({ webhookIpAllowlist: ['10.0.0.1'] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx(body, { 'x-signature': sign(body) }, '127.0.0.1') as any;
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('allows when IP is in allowlist', () => {
    const body = Buffer.from(JSON.stringify({ ok: true }));
    const guard = new AmocrmWebhookGuard(makeConfig({ webhookIpAllowlist: ['127.0.0.1'] }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = makeCtx(body, { 'x-signature': sign(body) }, '127.0.0.1') as any;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
