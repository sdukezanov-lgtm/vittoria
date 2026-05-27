import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  update(
    id: string,
    patch: { first_name?: string; last_name?: string },
  ) {
    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: patch.first_name,
        lastName: patch.last_name,
      },
    });
  }

  recordConsent(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { consentAcceptedAt: new Date() },
    });
  }

  async anonymize(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { phone: true } });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (user.phone) {
        await tx.authCode.deleteMany({ where: { phone: user.phone } });
      }
      await tx.user.update({
        where: { id },
        data: {
          phone: null,
          firstName: 'Удалённый пользователь',
          lastName: null,
        },
      });
    });
  }
}
