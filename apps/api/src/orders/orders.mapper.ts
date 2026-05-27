import { Injectable } from '@nestjs/common';
import type { Order, OrderStageHistory } from '@prisma/client';
import type { OrderResponse, OrderStageHistoryEntry, PartnerServiceItem } from './dto/order.dto';

@Injectable()
export class OrdersMapper {
  toResponse(row: Order): OrderResponse {
    return {
      id: row.id,
      amocrm_deal_id: row.amocrmDealId,
      contract_number: row.contractNumber,
      product_name: row.productName,
      total_amount: row.totalAmount?.toString() ?? null,
      prepayment_amount: row.prepaymentAmount?.toString() ?? null,
      balance_due: row.balanceDue?.toString() ?? null,
      current_stage: row.currentStage,
      progress_percent: row.progressPercent,
      service_phone: row.servicePhone,
      last_admin_comment: row.lastAdminComment,
      partner_services: this.normalizePartnerServices(row.partnerServices),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  toHistoryEntry(row: OrderStageHistory): OrderStageHistoryEntry {
    return {
      id: row.id,
      stage: row.stage,
      progress_percent: row.progressPercent,
      comment: row.comment,
      changed_at: row.changedAt.toISOString(),
    };
  }

  private normalizePartnerServices(raw: unknown): PartnerServiceItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is PartnerServiceItem => typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string');
  }
}
