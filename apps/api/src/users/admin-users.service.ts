import { ConflictException, Injectable } from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserArgs {
  phone: string;
  role: 'admin' | 'partner';
  first_name?: string;
  last_name?: string;
}

export interface ListUsersArgs {
  role?: UserRole;
  page?: number;
  page_size?: number;
}

export interface ListUsersResult {
  rows: User[];
  total: number;
  page: number;
  page_size: number;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(args: CreateUserArgs): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { phone: args.phone } });
    if (existing) {
      throw new ConflictException({ code: 'USER_PHONE_EXISTS', message: 'Phone already registered' });
    }
    return this.prisma.user.create({
      data: {
        phone: args.phone,
        role: args.role,
        firstName: args.first_name,
        lastName: args.last_name,
      },
    });
  }

  async listUsers(args: ListUsersArgs): Promise<ListUsersResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where = args.role ? { role: args.role } : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total, page, page_size: pageSize };
  }
}
