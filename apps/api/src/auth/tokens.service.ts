import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.schema';

export interface AccessClaims {
  sub: string;
  role: string;
  jti: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(claims: { userId: string; role: string; jti: string }): Promise<IssuedTokens> {
    const access = await this.jwt.signAsync(
      { sub: claims.userId, role: claims.role, jti: claims.jti } satisfies AccessClaims,
      { expiresIn: `${this.config.get('JWT_ACCESS_TTL_SEC', { infer: true })}s` },
    );
    const refresh = await this.jwt.signAsync(
      { sub: claims.userId, jti: claims.jti, typ: 'refresh' },
      { expiresIn: `${this.config.get('JWT_REFRESH_TTL_SEC', { infer: true })}s` },
    );
    return { accessToken: access, refreshToken: refresh };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token);
  }

  async verifyRefresh(token: string): Promise<{ sub: string; jti: string; typ: 'refresh' }> {
    const claims = await this.jwt.verifyAsync<{ sub: string; jti: string; typ: string }>(token);
    if (claims.typ !== 'refresh') throw new Error('not a refresh token');
    return claims as { sub: string; jti: string; typ: 'refresh' };
  }
}
