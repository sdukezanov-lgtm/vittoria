import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign } from 'node:crypto';
import type { Env } from '../../config/env.schema';
import { base64url } from './jwt.util';

const CACHE_TTL_MS = 50 * 60 * 1000; // refresh well under APNs' 60-min limit

@Injectable()
export class ApnsTokenService {
  private cachedToken: string | null = null;
  private issuedAt = 0;

  constructor(private readonly config: ConfigService<Env, true>) {}

  getProviderToken(): string {
    if (this.cachedToken && Date.now() - this.issuedAt < CACHE_TTL_MS) {
      return this.cachedToken;
    }

    const keyId = this.config.get('APNS_KEY_ID', { infer: true });
    const teamId = this.config.get('APNS_TEAM_ID', { infer: true });
    const privateKey = this.config.get('APNS_PRIVATE_KEY', { infer: true }).replace(/\\n/g, '\n');

    const nowSec = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
    const claims = base64url(JSON.stringify({ iss: teamId, iat: nowSec }));
    const signingInput = `${header}.${claims}`;
    // dsaEncoding 'ieee-p1363' => raw 64-byte R||S signature (JOSE/ES256), NOT DER.
    const signature = base64url(
      sign('SHA256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' }),
    );

    this.cachedToken = `${signingInput}.${signature}`;
    this.issuedAt = Date.now();
    return this.cachedToken;
  }
}
