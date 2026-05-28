import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditLog } from '@prisma/client';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
}

export interface ListAuditArgs {
  entity?: string;
  actor?: string;
  page?: number;
  page_size?: number;
}

export interface ListAuditResult {
  rows: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before === undefined ? undefined : (entry.before as object),
        after: entry.after === undefined ? undefined : (entry.after as object),
        requestId: entry.requestId,
      },
    });
  }

  async list(args: ListAuditArgs): Promise<ListAuditResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where: { entity?: string; actorUserId?: string } = {};
    if (args.entity) where.entity = args.entity;
    if (args.actor) where.actorUserId = args.actor;
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, page, page_size: pageSize };
  }
}
