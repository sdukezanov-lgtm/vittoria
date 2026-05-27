import { OrdersMapper } from '../orders.mapper';
import type { Order, OrderStageHistory } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const baseOrder: Order = {
  id: '00000000-0000-0000-0000-000000000001',
  amocrmDealId: 555,
  contractNumber: 'C-42',
  clientUserId: '00000000-0000-0000-0000-0000000000aa',
  partnerUserId: null,
  productName: 'Kitchen #N42',
  totalAmount: new Decimal('120000.00'),
  prepaymentAmount: new Decimal('60000.00'),
  balanceDue: new Decimal('60000.00'),
  currentStage: 'production',
  progressPercent: 55,
  servicePhone: '+78001234567',
  partnerServices: [{ type: 'delivery', label: 'Доставка', date: '2026-06-15', price: 5000 }],
  lastAdminComment: 'On track',
  amocrmSyncedAt: new Date('2026-05-27T10:00:00Z'),
  version: 3,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-27T10:00:00Z'),
};

describe('OrdersMapper.toResponse', () => {
  const mapper = new OrdersMapper();

  it('maps a Prisma Order to snake_case wire shape', () => {
    const dto = mapper.toResponse(baseOrder);
    expect(dto.id).toBe(baseOrder.id);
    expect(dto.amocrm_deal_id).toBe(555);
    expect(dto.contract_number).toBe('C-42');
    expect(dto.product_name).toBe('Kitchen #N42');
    expect(dto.total_amount).toBe('120000');
    expect(dto.prepayment_amount).toBe('60000');
    expect(dto.balance_due).toBe('60000');
    expect(dto.current_stage).toBe('production');
    expect(dto.progress_percent).toBe(55);
    expect(dto.service_phone).toBe('+78001234567');
    expect(dto.last_admin_comment).toBe('On track');
    expect(dto.partner_services).toEqual([
      { type: 'delivery', label: 'Доставка', date: '2026-06-15', price: 5000 },
    ]);
    expect(dto.created_at).toBe('2026-05-01T00:00:00.000Z');
    expect(dto.updated_at).toBe('2026-05-27T10:00:00.000Z');
  });

  it('handles null amounts and missing partner_services', () => {
    const dto = mapper.toResponse({
      ...baseOrder,
      totalAmount: null,
      prepaymentAmount: null,
      balanceDue: null,
      partnerServices: null as never,
    });
    expect(dto.total_amount).toBeNull();
    expect(dto.prepayment_amount).toBeNull();
    expect(dto.balance_due).toBeNull();
    expect(dto.partner_services).toEqual([]);
  });
});

describe('OrdersMapper.toHistoryEntry', () => {
  const mapper = new OrdersMapper();

  it('maps a Prisma OrderStageHistory row', () => {
    const row: OrderStageHistory = {
      id: 'hist1',
      orderId: 'ord1',
      stage: 'detailing',
      progressPercent: 25,
      comment: 'Specs approved',
      changedByUserId: 'admin1',
      changedAt: new Date('2026-05-27T09:00:00Z'),
    };
    const dto = mapper.toHistoryEntry(row);
    expect(dto).toEqual({
      id: 'hist1',
      stage: 'detailing',
      progress_percent: 25,
      comment: 'Specs approved',
      changed_at: '2026-05-27T09:00:00.000Z',
    });
  });
});
