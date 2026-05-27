import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TokensService } from '../../src/auth/tokens.service';
import type { UserRole } from '@prisma/client';

export interface SeededUser {
  id: string;
  phone: string | null;
  role: UserRole;
  accessToken: string;
}

export async function seedUserWithToken(
  app: INestApplication,
  opts: { phone?: string | null; role?: UserRole; firstName?: string; lastName?: string } = {},
): Promise<SeededUser> {
  const prisma = app.get(PrismaService);
  const tokens = app.get(TokensService);

  const role: UserRole = opts.role ?? 'client';
  const phone =
    opts.phone === undefined && role === 'client'
      ? `+7999${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
      : (opts.phone ?? null);

  const user = await prisma.user.create({
    data: {
      phone,
      role,
      firstName: opts.firstName,
      lastName: opts.lastName,
    },
  });

  const jti = randomUUID();
  const { accessToken } = await tokens.issue({ userId: user.id, role: user.role, jti });

  return { id: user.id, phone: user.phone, role: user.role, accessToken };
}
