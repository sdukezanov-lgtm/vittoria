import { AmocrmMapper } from '../amocrm-mapper';
import type { AmoFieldIds } from '../amocrm.config';
import type { AmoLead } from '../amocrm.types';

const fieldIds: AmoFieldIds = {
  stage: 1001,
  progress: 1002,
  adminComment: 1003,
  prepayment: 1004,
  partnerUserId: 1005,
  partnerServices: 1006,
};

describe('AmocrmMapper.leadToOrderPatch', () => {
  const mapper = new AmocrmMapper();

  const baseLead: AmoLead = {
    id: 555,
    name: 'Kitchen #N42',
    updated_at: 1748390000,
    _embedded: { contacts: [{ id: 777 }] },
    custom_fields_values: [
      { field_id: 1001, values: [{ value: 'production' }] },
      { field_id: 1002, values: [{ value: 65 }] },
      { field_id: 1003, values: [{ value: 'On track' }] },
      { field_id: 1004, values: [{ value: 50000 }] },
      { field_id: 1006, values: [{ value: '[{"type":"delivery","price":5000}]' }] },
    ],
  };

  it('maps recognized fields and ignores unknown field_ids', () => {
    const patch = mapper.leadToOrderPatch(baseLead, fieldIds);
    expect(patch.amocrmDealId).toBe(555);
    expect(patch.productName).toBe('Kitchen #N42');
    expect(patch.currentStage).toBe('production');
    expect(patch.progressPercent).toBe(65);
    expect(patch.lastAdminComment).toBe('On track');
    expect(patch.prepaymentAmount).toBe(50000);
    expect(patch.partnerServices).toEqual([{ type: 'delivery', price: 5000 }]);
    expect(patch.amocrmContactId).toBe(777);
  });

  it('throws if currentStage value is not a known OrderStage', () => {
    const bad: AmoLead = { ...baseLead, custom_fields_values: [{ field_id: 1001, values: [{ value: 'sold' }] }] };
    expect(() => mapper.leadToOrderPatch(bad, fieldIds)).toThrow(/OrderStage/);
  });

  it('clamps progressPercent to 0..100', () => {
    const high: AmoLead = { ...baseLead, custom_fields_values: [{ field_id: 1002, values: [{ value: 250 }] }] };
    expect(mapper.leadToOrderPatch(high, fieldIds).progressPercent).toBe(100);
    const low: AmoLead = { ...baseLead, custom_fields_values: [{ field_id: 1002, values: [{ value: -5 }] }] };
    expect(mapper.leadToOrderPatch(low, fieldIds).progressPercent).toBe(0);
  });
});

describe('AmocrmMapper.orderToCustomFields', () => {
  const mapper = new AmocrmMapper();

  it('produces custom_fields_values for editable fields only', () => {
    const fields = mapper.orderToCustomFields(
      {
        currentStage: 'production',
        progressPercent: 65,
        lastAdminComment: 'Updated by admin',
      },
      fieldIds,
    );
    expect(fields).toEqual([
      { field_id: 1001, values: [{ value: 'production' }] },
      { field_id: 1002, values: [{ value: 65 }] },
      { field_id: 1003, values: [{ value: 'Updated by admin' }] },
    ]);
  });

  it('omits undefined fields', () => {
    const fields = mapper.orderToCustomFields({ progressPercent: 10 }, fieldIds);
    expect(fields).toEqual([{ field_id: 1002, values: [{ value: 10 }] }]);
  });
});
