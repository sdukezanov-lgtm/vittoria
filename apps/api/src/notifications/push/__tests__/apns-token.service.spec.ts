import { generateKeyPairSync } from 'node:crypto';
import { ApnsTokenService } from '../apns-token.service';

// Real EC P-256 keypair so ES256 signing actually works (no crypto mocking).
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

function makeConfig(overrides: Record<string, string> = {}) {
  const map: Record<string, string> = {
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM456',
    APNS_PRIVATE_KEY: privatePem,
    ...overrides,
  };
  return { get: (key: string) => map[key] } as never;
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

describe('ApnsTokenService.getProviderToken', () => {
  it('builds an ES256 JWT with kid header and iss/iat claims', () => {
    const svc = new ApnsTokenService(makeConfig());
    const token = svc.getProviderToken();
    const [headerSeg, claimsSeg, sigSeg] = token.split('.');
    expect([headerSeg, claimsSeg, sigSeg]).toHaveLength(3);

    const header = decodeSegment(headerSeg);
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });

    const claims = decodeSegment(claimsSeg);
    expect(claims.iss).toBe('TEAM456');
    expect(typeof claims.iat).toBe('number');
  });

  it('caches the token (same token on second call within window)', () => {
    const svc = new ApnsTokenService(makeConfig());
    const t1 = svc.getProviderToken();
    const t2 = svc.getProviderToken();
    // ES256 (ECDSA) signatures are non-deterministic — identical tokens prove the cache,
    // not coincidental re-signing.
    expect(t1).toBe(t2);
  });
});
