import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.types';
import type { Env } from '../config/env.schema';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

export interface RequestCodeResult {
  retryAfterSec: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async requestCode(phone: string): Promise<RequestCodeResult> {
    const ttlSec = this.config.get('OTP_TTL_SEC', { infer: true });
    const rateLimitPerMin = this.config.get('OTP_REQUEST_RATE_LIMIT_PER_MIN', { infer: true });

    const recent = await this.prisma.authCode.findFirst({
      where: { phone, createdAt: { gte: new Date(Date.now() - (60 / rateLimitPerMin) * 1000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException({ code: 'AUTH_RATE_LIMITED', message: 'rate limited' });
    }

    const code = String(randomInt(0, 10_000)).padStart(4, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    // Ensure a user record exists for this phone before creating the auth code
    // (auth_codes.phone has a FK to users.phone)
    await this.prisma.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });

    const created = await this.prisma.authCode.create({
      data: { phone, codeHash, expiresAt },
    });

    await this.sms.send({ to: phone, text: `VITTORIA HOME: ${code}` });

    await this.audit.record({
      action: 'auth.code.requested',
      entity: 'AuthCode',
      entityId: created.id,
      after: { phone },
    });

    return { retryAfterSec: Math.ceil(60 / rateLimitPerMin) };
  }
}
