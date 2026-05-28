import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PartnerCommission, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateCommissionArgs {
  order_id: string;
  partner_user_id: string;
  amount: number;
}

export interface ListAdminCommissionsArgs {
  partner_user_id?: string;
  payout_status?: PayoutStatus;
  page?: number;
  page_size?: number;
}

export interface ListAdminCommissionsResult {
  rows: PartnerCommission[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListPartnerCommissionsArgs {
  payout_status?: PayoutStatus;
}

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(args: CreateCommissionArgs): Promise<PartnerCommission> {
    const order = await this.prisma.order.findUnique({ where: { id: args.order_id } });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    const partner = await this.prisma.user.findUnique({ where: { id: args.partner_user_id } });
    if (!partner || partner.role !== 'partner') {
      throw new BadRequestException({ code: 'INVALID_PARTNER', message: 'partner_user_id must reference a partner' });
    }
    return this.prisma.partnerCommission.create({
      data: {
        orderId: args.order_id,
        partnerUserId: args.partner_user_id,
        amount: args.amount,
      },
    });
  }

  async updateStatus(id: string, payoutStatus: PayoutStatus): Promise<PartnerCommission> {
    const existing = await this.prisma.partnerCommission.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({ code: 'COMMISSION_NOT_FOUND', message: 'Commission not found' });
    }
    return this.prisma.partnerCommission.update({
      where: { id },
      data: {
        payoutStatus,
        paidAt: payoutStatus === 'paid' ? new Date() : null,
      },
    });
  }

  async listAdmin(args: ListAdminCommissionsArgs): Promise<ListAdminCommissionsResult> {
    const page = Math.max(1, args.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, args.page_size ?? 20));
    const where: { partnerUserId?: string; payoutStatus?: PayoutStatus } = {};
    if (args.partner_user_id) where.partnerUserId = args.partner_user_id;
    if (args.payout_status) where.payoutStatus = args.payout_status;
    const [rows, total] = await Promise.all([
      this.prisma.partnerCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.partnerCommission.count({ where }),
    ]);
    return { rows, total, page, page_size: pageSize };
  }

  async listForPartner(partnerUserId: string, args: ListPartnerCommissionsArgs): Promise<PartnerCommission[]> {
    const where: { partnerUserId: string; payoutStatus?: PayoutStatus } = { partnerUserId };
    if (args.payout_status) where.payoutStatus = args.payout_status;
    return this.prisma.partnerCommission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
