import type { OrderStage } from '@prisma/client';

export interface PartnerServiceItem {
  type: string;
  label?: string;
  date?: string;
  price?: number;
}

export interface OrderResponse {
  id: string;
  amocrm_deal_id: number;
  contract_number: string | null;
  product_name: string | null;
  total_amount: string | null;
  prepayment_amount: string | null;
  balance_due: string | null;
  current_stage: OrderStage;
  progress_percent: number;
  service_phone: string | null;
  last_admin_comment: string | null;
  partner_services: PartnerServiceItem[];
  created_at: string;
  updated_at: string;
}

export interface OrderStageHistoryEntry {
  id: string;
  stage: OrderStage;
  progress_percent: number;
  comment: string | null;
  changed_at: string;
}
