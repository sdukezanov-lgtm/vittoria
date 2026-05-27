import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AmoContact, AmoCrmClient, AmoCustomFieldValue, AmoLead } from './amocrm.types';

@Injectable()
export class AmocrmMockClient implements AmoCrmClient {
  private readonly logger = new Logger(AmocrmMockClient.name);
  private readonly leads = new Map<number, AmoLead>();
  private readonly contacts = new Map<number, AmoContact>();

  seedLead(lead: AmoLead): void {
    this.leads.set(lead.id, lead);
  }

  seedContact(contact: AmoContact): void {
    this.contacts.set(contact.id, contact);
  }

  reset(): void {
    this.leads.clear();
    this.contacts.clear();
  }

  async getLead(id: number): Promise<AmoLead> {
    const lead = this.leads.get(id);
    if (!lead) throw new NotFoundException(`mock lead ${id} not seeded`);
    return structuredClone(lead);
  }

  async getContact(id: number): Promise<AmoContact> {
    const contact = this.contacts.get(id);
    if (!contact) throw new NotFoundException(`mock contact ${id} not seeded`);
    return structuredClone(contact);
  }

  async patchLead(id: number, customFields: AmoCustomFieldValue[]): Promise<void> {
    const lead = this.leads.get(id);
    if (!lead) throw new NotFoundException(`mock lead ${id} not seeded`);
    const existingFields = new Map((lead.custom_fields_values ?? []).map((f) => [f.field_id, f]));
    for (const f of customFields) existingFields.set(f.field_id, f);
    lead.custom_fields_values = Array.from(existingFields.values());
    lead.updated_at = Math.floor(Date.now() / 1000);
    this.logger.log(`[MOCK-AMO] patched lead ${id}: ${JSON.stringify(customFields)}`);
  }

  async listLeadsUpdatedSince(since: Date): Promise<AmoLead[]> {
    const sinceSec = Math.floor(since.getTime() / 1000);
    return Array.from(this.leads.values())
      .filter((l) => l.updated_at >= sinceSec)
      .map((l) => structuredClone(l));
  }
}
