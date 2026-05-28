import { Injectable } from '@nestjs/common';
import type { PartnerCommission } from '@prisma/client';

export interface CommissionResponse {
  id: string;
  order_id: string;
  partner_user_id: string;
  amount: string;
  payout_status: string;
  paid_at: string | null;
  created_at: string;
}

@Injectable()
export class CommissionsMapper {
  toResponse(c: PartnerCommission): CommissionResponse {
    return {
      id: c.id,
      order_id: c.orderId,
      partner_user_id: c.partnerUserId,
      amount: c.amount.toString(),
      payout_status: c.payoutStatus,
      paid_at: c.paidAt ? c.paidAt.toISOString() : null,
      created_at: c.createdAt.toISOString(),
    };
  }
}
