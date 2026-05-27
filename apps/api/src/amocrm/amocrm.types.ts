export const AMOCRM_CLIENT = Symbol('AMOCRM_CLIENT');

export type AmoCustomFieldValueType = 'number' | 'string' | 'select';

export interface AmoCustomFieldValue {
  field_id: number;
  values: Array<{ value: string | number | boolean }>;
}

export interface AmoContact {
  id: number;
  name?: string | null;
  custom_fields_values?: AmoCustomFieldValue[] | null;
  phone?: string | null;
}

export interface AmoLead {
  id: number;
  name?: string | null;
  status_id?: number | null;
  pipeline_id?: number | null;
  updated_at: number;
  custom_fields_values?: AmoCustomFieldValue[] | null;
  _embedded?: {
    contacts?: Array<{ id: number }>;
  };
}

export interface AmoWebhookEvent {
  event_id: string;
  event_type: 'lead.add' | 'lead.update' | 'contact.update';
  entity_id: number;
  occurred_at: number;
}

export interface AmoCrmClient {
  getLead(id: number): Promise<AmoLead>;
  getContact(id: number): Promise<AmoContact>;
  patchLead(id: number, customFields: AmoCustomFieldValue[]): Promise<void>;
  listLeadsUpdatedSince(since: Date): Promise<AmoLead[]>;
}
