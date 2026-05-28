import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';
import axios from 'axios';
import type { Env } from '../../config/env.schema';
import { base64url } from './jwt.util';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const EXPIRY_BUFFER_MS = 60_000;

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class FcmTokenService {
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.expiresAt - EXPIRY_BUFFER_MS) {
      return this.cachedToken;
    }

    const clientEmail = this.config.get('FCM_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FCM_PRIVATE_KEY', { infer: true }).replace(/\\n/g, '\n');

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
    );
    const signingInput = `${header}.${claims}`;
    const signature = base64url(createSign('RSA-SHA256').update(signingInput).sign(privateKey));
    const jwt = `${signingInput}.${signature}`;

    const params = new URLSearchParams();
    params.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.set('assertion', jwt);

    const res = await axios.post<TokenResponse>(TOKEN_URL, params, {
      timeout: 10_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.cachedToken = res.data.access_token;
    this.expiresAt = Date.now() + res.data.expires_in * 1000;
    return this.cachedToken;
  }
}
