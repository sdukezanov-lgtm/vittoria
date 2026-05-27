import type { AmoContact, AmoLead } from '../../src/amocrm/amocrm.types';

export const sampleContact: AmoContact = {
  id: 777,
  name: 'Ivan Ivanov',
  phone: '+79991234567',
  custom_fields_values: null,
};

export const sampleLead = (overrides: Partial<AmoLead> = {}): AmoLead => ({
  id: 555,
  name: 'Kitchen #N42',
  updated_at: Math.floor(Date.now() / 1000),
  _embedded: { contacts: [{ id: sampleContact.id }] },
  custom_fields_values: [
    { field_id: 1001, values: [{ value: 'production' }] },
    { field_id: 1002, values: [{ value: 40 }] },
    { field_id: 1003, values: [{ value: 'Initial sync' }] },
    { field_id: 1004, values: [{ value: 50000 }] },
  ],
  ...overrides,
});
