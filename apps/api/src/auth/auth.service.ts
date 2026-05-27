import { Inject, Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.types';
import type { Env } from '../config/env.schema';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'node:crypto';
import { TokensService } from './tokens.service';

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
    private readonly tokens: TokensService,
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

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new NotFoundException({
        code: 'AUTH_PHONE_NOT_REGISTERED',
        message: 'phone is not registered',
      });
    }

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

  async verifyCode(
    phone: string,
    code: string,
    deviceInfo: Record<string, unknown> = {},
  ): Promise<{ accessToken: string; refreshToken: string; user: { id: string; phone: string; role: string } }> {
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    const refreshTtlSec = this.config.get('JWT_REFRESH_TTL_SEC', { infer: true });

    const authCode = await this.prisma.authCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!authCode) {
      throw new UnauthorizedException({ code: 'AUTH_CODE_INVALID', message: 'invalid or expired code' });
    }
    if (authCode.attempts >= maxAttempts) {
      throw new UnauthorizedException({ code: 'AUTH_CODE_LOCKED', message: 'too many attempts' });
    }

    const ok = await bcrypt.compare(code, authCode.codeHash);

    if (!ok) {
      await this.prisma.authCode.update({
        where: { id: authCode.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({ code: 'AUTH_CODE_INVALID', message: 'invalid code' });
    }

    await this.prisma.authCode.update({
      where: { id: authCode.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: { lastLoginAt: new Date() },
      create: { phone, lastLoginAt: new Date() },
    });

    const jti = randomUUID();
    const { accessToken, refreshToken } = await this.tokens.issue({
      userId: user.id,
      role: user.role,
      jti,
    });

    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.session.create({
      data: {
        id: jti,
        userId: user.id,
        refreshTokenHash: refreshHash,
        deviceInfo: deviceInfo as object,
        expiresAt: new Date(Date.now() + refreshTtlSec * 1000),
      },
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'auth.code.verified',
      entity: 'User',
      entityId: user.id,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, phone: user.phone!, role: user.role },
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshTtlSec = this.config.get('JWT_REFRESH_TTL_SEC', { infer: true });

    let claims;
    try {
      claims = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'invalid refresh token' });
    }

    const session = await this.prisma.session.findUnique({ where: { id: claims.jti } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'REFRESH_REVOKED', message: 'session revoked' });
    }
    const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!matches) {
      // Possible token reuse — revoke session as safety measure.
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException({ code: 'REFRESH_INVALID', message: 'invalid refresh token' });
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    const newJti = randomUUID();
    const issued = await this.tokens.issue({ userId: user.id, role: user.role, jti: newJti });
    const newHash = await bcrypt.hash(issued.refreshToken, 10);

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.create({
        data: {
          id: newJti,
          userId: user.id,
          refreshTokenHash: newHash,
          deviceInfo: session.deviceInfo as object,
          expiresAt: new Date(Date.now() + refreshTtlSec * 1000),
        },
      }),
    ]);

    return { accessToken: issued.accessToken, refreshToken: issued.refreshToken };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
