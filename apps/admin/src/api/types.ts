export type OrderStage =
  | 'preparation_for_production'
  | 'detailing'
  | 'materials_arrival'
  | 'production'
  | 'transfer_to_warehouse'
  | 'completeness_check'
  | 'ready_for_delivery';

export type UserRole = 'client' | 'admin' | 'partner';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  first_name?: string | null;
  last_name?: string | null;
}

export interface VerifyCodeResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string; phone: string; role: UserRole };
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

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

export interface OrdersListResponse {
  items: OrderResponse[];
  page: number;
  page_size: number;
  total: number;
}
