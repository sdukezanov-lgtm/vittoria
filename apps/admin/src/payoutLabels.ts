import type { PayoutStatus } from './api/commissions.api';

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  paid: 'Выплачено',
};

export const PAYOUT_STATUSES: PayoutStatus[] = ['pending', 'approved', 'paid'];
