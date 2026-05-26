import { JwtService } from '@nestjs/jwt';
import { TokensService } from '../tokens.service';

describe('TokensService', () => {
  const config = {
    get: jest.fn((k: string) => {
      if (k === 'JWT_SECRET') return '0123456789012345678901234567890123456789';
      if (k === 'JWT_ACCESS_TTL_SEC') return 900;
      if (k === 'JWT_REFRESH_TTL_SEC') return 2592000;
      throw new Error(k);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const jwt = new JwtService({ secret: '0123456789012345678901234567890123456789' });
  const svc = new TokensService(jwt, config);

  it('issues access + refresh tokens for a user', async () => {
    const out = await svc.issue({ userId: 'u1', role: 'client', jti: 'j1' });
    expect(typeof out.accessToken).toBe('string');
    expect(typeof out.refreshToken).toBe('string');
    const decoded = jwt.verify(out.accessToken);
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('client');
    expect(decoded.jti).toBe('j1');
  });
});
